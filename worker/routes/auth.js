import { OWNER_EMAIL } from "../config.js";
import { createEmailUser, getUserByEmail, getUserById } from "../database/database.js";
import { beginOAuth, finishOAuth, OAuthError, oauthCookie, oauthProviders } from "../services/oauth.js";
import { hashPassword, passwordRequirements, verifyPassword } from "../services/password.js";
import { base64Url, bytesFromBase64Url, hmacSha256, safeEqual } from "../utils/crypto.js";
import { json } from "../utils/response.js";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function readCookie(request, name) {

  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));

  return match ? match[1] : null;
}

function sessionCookie(value, maxAge = SESSION_MAX_AGE) {

  return `agm_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
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

async function sessionToken(user, secret) {

  if (!secret) throw new Error("SESSION_SECRET no está configurado.");

  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    id: user.id || null,
    email: normalizedEmail(user.email),
    role: user.role === "admin" ? "admin" : "member",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  })));

  return `${payload}.${await hmacSha256(payload, secret)}`;
}

async function sessionHeaders(user, env) {

  return { "Set-Cookie": sessionCookie(await sessionToken(user, env.SESSION_SECRET)) };
}

export async function getSession(request, env) {

  if (!env.SESSION_SECRET) return null;

  const token = readCookie(request, "agm_session");

  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");

  if (!safeEqual(signature, await hmacSha256(payload, env.SESSION_SECRET))) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload)));

    if (session.exp <= Math.floor(Date.now() / 1000)) return null;

    if (session.id && env.DB) {
      const currentUser = await getUserById(env, session.id);

      if (!currentUser) return null;

      return { ...session, ...currentUser };
    }

    return session;
  } catch { return null; }
}

export async function requireAdmin(request, env) {

  const session = await getSession(request, env);

  return session?.role === "admin" ? session : null;
}

export async function requireOwner(request, env) {

  const session = await requireAdmin(request, env);

  return normalizedEmail(session?.email) === OWNER_EMAIL ? session : null;
}

function oauthErrorRedirect(request, error) {

  const destination = new URL("/login", request.url);

  destination.searchParams.set("auth_error", error instanceof OAuthError ? error.code : "oauth_failed");

  const headers = new Headers({ Location: destination.toString() });

  headers.append("Set-Cookie", oauthCookie("", 0));

  return new Response(null, { status: 302, headers });
}

async function oauthCallback(request, env, provider) {

  try {
    const user = await finishOAuth(request, env, provider);
    const destination = new URL(user.role === "admin" ? "/dashboard" : "/", request.url);
    const headers = new Headers({ Location: destination.toString() });

    headers.append("Set-Cookie", sessionCookie(await sessionToken(user, env.SESSION_SECRET)));
    headers.append("Set-Cookie", oauthCookie("", 0));

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("OAuth callback failed", provider, error);

    return oauthErrorRedirect(request, error);
  }
}

async function signup(request, env) {

  let credentials;

  try { credentials = await request.json(); } catch { return json({ error: "Datos de registro inválidos." }, { status: 400 }); }

  const email = normalizedEmail(credentials.email);
  const password = String(credentials.password || "");
  const passwordConfirmation = String(credentials.passwordConfirmation || "");

  if (!email) return json({ error: "Introduce un correo válido." }, { status: 400 });
  if (password !== passwordConfirmation) return json({ error: "Las contraseñas no coinciden." }, { status: 400 });

  const passwordError = passwordRequirements(password, email);

  if (passwordError) return json({ error: passwordError }, { status: 400 });
  if (await getUserByEmail(env, email)) return json({ error: "No fue posible crear la cuenta con esos datos." }, { status: 409 });

  try {
    const user = await createEmailUser(env, email, await hashPassword(password, env.PASSWORD_PEPPER));

    return json({ user: publicUser(user) }, { status: 201, headers: await sessionHeaders(user, env) });
  } catch (error) {
    console.error("Signup failed", error);

    return json({ error: "No fue posible crear la cuenta con esos datos." }, { status: 409 });
  }
}

async function login(request, env) {

  let credentials;

  try { credentials = await request.json(); } catch { return json({ error: "Datos de acceso inválidos." }, { status: 400 }); }

  const email = normalizedEmail(credentials.email);
  const password = String(credentials.password || "");
  let account = accounts(env).find((item) => normalizedEmail(item.email) === email);

  if (!account && env.DB && email) account = await getUserByEmail(env, email);

  const storedHash = account?.passwordHash ?? account?.password_hash;
  const isValid = Boolean(email && password && storedHash && await verifyPassword(password, storedHash, env.PASSWORD_PEPPER || ""));

  if (!isValid) return json({ error: "Correo o contraseña incorrectos." }, { status: 401 });

  const user = { ...account, email, role: account.role === "admin" ? "admin" : "member" };

  return json({ user: publicUser(user) }, { headers: await sessionHeaders(user, env) });
}

export async function handleAuth(request, env, pathname) {

  if (pathname === "/api/auth/session" && request.method === "GET") {
    const session = await getSession(request, env);

    return json({ user: session ? publicUser(session) : { isAdmin: false, isOwner: false } });
  }

  if (pathname === "/api/auth/providers" && request.method === "GET") return json({ providers: oauthProviders(env) });
  if (pathname === "/api/auth/logout" && request.method === "POST") return json({ success: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
  if (pathname === "/api/auth/signup" && request.method === "POST") return signup(request, env);
  if (pathname === "/api/auth/login" && request.method === "POST") return login(request, env);

  const callbackMatch = pathname.match(/^\/api\/auth\/oauth\/(google|discord)\/callback$/);

  if (callbackMatch && request.method === "GET") return oauthCallback(request, env, callbackMatch[1]);

  const startMatch = pathname.match(/^\/api\/auth\/oauth\/(google|discord)$/);

  if (startMatch && request.method === "GET") {
    try { return await beginOAuth(request, env, startMatch[1]); } catch (error) { return oauthErrorRedirect(request, error); }
  }

  return null;
}
