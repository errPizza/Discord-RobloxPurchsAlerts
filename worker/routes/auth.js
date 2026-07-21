import { OWNER_EMAIL } from "../config.js";
import { clearLoginFailures, createAuthSession, createEmailUser, deleteAuthSession, ensureLegacyUser, getAuthSession, getUserByEmail, isLoginLocked, recordLoginFailure } from "../database/database.js";
import { beginOAuth, finishOAuth, OAuthError, oauthCookie, oauthProviders } from "../services/oauth.js";
import { dummyPasswordCheck, hashPassword, passwordRequirements, verifyPassword } from "../services/password.js";
import { randomToken, sha256Hex } from "../utils/crypto.js";
import { consumeRateLimit, isSameOriginMutation, rateLimited, readJsonBody, validationError } from "../services/security.js";
import { turnstileSiteKey, verifyTurnstile } from "../services/turnstile.js";
import { json } from "../utils/response.js";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(request, name) {

  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));

  return match ? match[1] : null;
}

function sessionCookieName(request) {

  return `${new URL(request.url).protocol === "https:" ? "__Host-" : ""}agm_session`;
}

function sessionCookie(request, value, maxAge = SESSION_MAX_AGE, name = sessionCookieName(request)) {

  const secure = new URL(request.url).protocol === "https:";

  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax`;
}

function accounts(env) {

  if (!env.ACCOUNT_CONFIG) return [];

  try {
    const config = JSON.parse(env.ACCOUNT_CONFIG);

    return Array.isArray(config) ? config : config.accounts || [];
  } catch { return []; }
}

function normalizedEmail(value) {

  const email = String(value || "").trim().toLowerCase();

  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function publicUser(user) {

  const email = normalizedEmail(user?.email);
  const role = user?.role === "admin" ? "admin" : "member";

  return {
    email,
    role,
    displayName: user?.display_name ?? user?.displayName ?? null,
    isAdmin: role === "admin",
    isOwner: email === OWNER_EMAIL,
  };
}

async function userAgentHash(request) {

  return sha256Hex(request.headers.get("User-Agent") || "");
}

async function sessionHeaders(request, user, env) {

  if (!env.DB || !user?.id) throw new Error("No fue posible crear una sesión persistente.");

  const token = randomToken(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;

  await createAuthSession(env, {
    tokenHash: await sha256Hex(token),
    userId: user.id,
    userAgentHash: await userAgentHash(request),
    expiresAt,
  });

  const headers = new Headers();

  headers.append("Set-Cookie", sessionCookie(request, token));
  if (sessionCookieName(request) !== "agm_session") headers.append("Set-Cookie", sessionCookie(request, "", 0, "agm_session"));

  return headers;
}

export async function getSession(request, env) {

  if (!env.DB) return null;

  const token = readCookie(request, sessionCookieName(request)) || readCookie(request, "agm_session");

  if (!token || token.length > 256) return null;

  try { return await getAuthSession(env, await sha256Hex(token), await userAgentHash(request)); }
  catch (error) {
    console.error("[SESSION_READ]", error instanceof Error ? error.message : "unknown_error");

    return null;
  }
}

export async function requireAdmin(request, env) {

  const session = await getSession(request, env);

  return session?.role === "admin" ? session : null;
}

export async function requireOwner(request, env) {

  const session = await requireAdmin(request, env);

  return normalizedEmail(session?.email) === OWNER_EMAIL ? session : null;
}

function oauthErrorRedirect(request, provider, error) {

  const destination = new URL("/login", request.url);

  destination.searchParams.set("auth_error", error instanceof OAuthError ? error.code : "oauth_failed");

  const headers = new Headers({ Location: destination.toString() });

  headers.append("Set-Cookie", oauthCookie(request, provider, "", 0));

  return new Response(null, { status: 302, headers });
}

async function oauthCallback(request, env, provider) {

  try {
    const user = await finishOAuth(request, env, provider);
    const destination = new URL(user.role === "admin" ? "/dashboard" : "/", request.url);
    const headers = new Headers({ Location: destination.toString() });

    const session = await sessionHeaders(request, user, env);
    const sessionCookies = typeof session.getSetCookie === "function" ? session.getSetCookie() : [session.get("Set-Cookie")].filter(Boolean);

    for (const cookie of sessionCookies) headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", oauthCookie(request, provider, "", 0));

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("OAuth callback failed", provider, error);

    return oauthErrorRedirect(request, provider, error);
  }
}

async function signup(request, env) {

  let credentials;

  try { credentials = (await readJsonBody(request, 8192)).data; } catch (error) { return validationError(error, "Datos de registro inválidos."); }

  const email = normalizedEmail(credentials.email);
  const password = String(credentials.password || "");
  const passwordConfirmation = String(credentials.passwordConfirmation || "");

  if (!email) return json({ error: "Introduce un correo válido." }, { status: 400 });
  if (password !== passwordConfirmation) return json({ error: "Las contraseñas no coinciden." }, { status: 400 });
  if (!(await verifyTurnstile(request, env, credentials.turnstileToken, "signup"))) return json({ error: "No fue posible verificar que eres una persona. Recarga el reto e inténtalo de nuevo." }, { status: 400 });

  const passwordError = passwordRequirements(password, email);

  if (passwordError) return json({ error: passwordError }, { status: 400 });
  if (await getUserByEmail(env, email)) return json({ error: "No fue posible crear la cuenta con esos datos." }, { status: 409 });

  try {
    const user = await createEmailUser(env, email, await hashPassword(password, env.PASSWORD_PEPPER));

    return json({ user: publicUser(user) }, { status: 201, headers: await sessionHeaders(request, user, env) });
  } catch (error) {
    console.error("Signup failed", error);

    return json({ error: "No fue posible crear la cuenta con esos datos." }, { status: 409 });
  }
}

async function login(request, env) {

  let credentials;

  try { credentials = (await readJsonBody(request, 8192)).data; } catch (error) { return validationError(error, "Datos de acceso inválidos."); }

  const email = normalizedEmail(credentials.email);
  const password = String(credentials.password || "");
  const identifierHash = await sha256Hex(email || "invalid-email");

  if (env.DB && await isLoginLocked(env, identifierHash)) {
    await dummyPasswordCheck(password, env.PASSWORD_PEPPER || "");

    return json({ error: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo." }, { status: 429, headers: { "Retry-After": "900" } });
  }

  if (!(await verifyTurnstile(request, env, credentials.turnstileToken, "login"))) return json({ error: "No fue posible verificar que eres una persona. Recarga el reto e inténtalo de nuevo." }, { status: 400 });

  let account = env.DB && email ? await getUserByEmail(env, email) : null;
  const legacyAccount = !account ? accounts(env).find((item) => normalizedEmail(item.email) === email) : null;

  if (legacyAccount && env.DB) account = await ensureLegacyUser(env, { ...legacyAccount, email });

  const storedHash = account?.passwordHash ?? account?.password_hash;
  const isValid = Boolean(email && password && storedHash && await verifyPassword(password, storedHash, env.PASSWORD_PEPPER || ""));

  if (!storedHash) await dummyPasswordCheck(password, env.PASSWORD_PEPPER || "");

  if (!isValid) {
    if (env.DB) await recordLoginFailure(env, identifierHash);

    return json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  if (env.DB) await clearLoginFailures(env, identifierHash);

  const user = { ...account, email, role: account.role === "admin" ? "admin" : "member" };

  return json({ user: publicUser(user) }, { headers: await sessionHeaders(request, user, env) });
}

export async function handleAuth(request, env, pathname) {

  const sensitiveRoute = ["/api/auth/login", "/api/auth/signup", "/api/auth/logout"].includes(pathname);

  if (sensitiveRoute && !isSameOriginMutation(request)) return json({ error: "Origen de la petición no permitido." }, { status: 403 });

  const limitedRoute = pathname === "/api/auth/login" || pathname === "/api/auth/signup" || /^\/api\/auth\/oauth\/(google|discord)$/.test(pathname);

  if (limitedRoute && !(await consumeRateLimit(env.AUTH_RATE_LIMITER, request, pathname))) return rateLimited();

  if (pathname === "/api/auth/session" && request.method === "GET") {
    const session = await getSession(request, env);

    return json({ user: session ? publicUser(session) : { isAdmin: false, isOwner: false } });
  }

  if (pathname === "/api/auth/providers" && request.method === "GET") return json({ providers: oauthProviders(env), turnstileSiteKey: turnstileSiteKey(env) });
  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const token = readCookie(request, sessionCookieName(request)) || readCookie(request, "agm_session");

    if (token && env.DB) await deleteAuthSession(env, await sha256Hex(token));

    const headers = new Headers();

    headers.append("Set-Cookie", sessionCookie(request, "", 0));
    if (sessionCookieName(request) !== "agm_session") headers.append("Set-Cookie", sessionCookie(request, "", 0, "agm_session"));

    return json({ success: true }, { headers });
  }
  if (pathname === "/api/auth/signup" && request.method === "POST") return signup(request, env);
  if (pathname === "/api/auth/login" && request.method === "POST") return login(request, env);

  const callbackMatch = pathname.match(/^\/api\/auth\/oauth\/(google|discord)\/callback$/);

  if (callbackMatch && request.method === "GET") return oauthCallback(request, env, callbackMatch[1]);

  const startMatch = pathname.match(/^\/api\/auth\/oauth\/(google|discord)$/);

  if (startMatch && request.method === "GET") {
    try { return await beginOAuth(request, env, startMatch[1]); } catch (error) { return oauthErrorRedirect(request, startMatch[1], error); }
  }

  return null;
}
