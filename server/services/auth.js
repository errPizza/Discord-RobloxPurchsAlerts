import crypto from "node:crypto";
import { dummyPasswordCheck, hashPassword, passwordRequirements, verifyPassword } from "./password.js";
import { hmac, randomToken, safeEqual, sha256 } from "./crypto.js";
import { normalizedEmail } from "./security.js";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_MAX_AGE_SECONDS = 10 * 60;

const PROVIDERS = Object.freeze({
  google: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  discord: {
    authorizationUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
  },
});

export function publicUser(user) {
  const role = ["member", "admin", "owner"].includes(user?.role) ? user.role : "member";
  return {
    id: user?.id,
    email: normalizedEmail(user?.email),
    role,
    displayName: user?.display_name ?? user?.displayName ?? null,
    isAdmin: role === "admin" || role === "owner",
    isOwner: role === "owner",
  };
}

function cookieOptions(request, config, maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = config.cookieSecure === "always" || (config.cookieSecure === "auto" && request.protocol === "https");
  return { path: "/", httpOnly: true, secure, sameSite: "lax", maxAge };
}

function userAgentHash(request) {
  return sha256(request.headers["user-agent"] || "");
}

function providerCredentials(config, provider) {
  return provider === "google"
    ? { id: config.googleClientId, secret: config.googleClientSecret }
    : { id: config.discordClientId, secret: config.discordClientSecret };
}

function callbackUrl(config, provider) {
  const origin = new URL(config.publicOrigin);
  return new URL(`/api/auth/oauth/${provider}/callback`, origin).toString();
}

function signedAttempt(data, secret) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

function parseAttempt(value, secret) {
  const [body, signature, extra] = String(value || "").split(".");
  if (!body || !signature || extra || !safeEqual(signature, hmac(body, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return data?.exp >= Math.floor(Date.now() / 1_000) ? data : null;
  } catch { return null; }
}

export function createAuthService({ db, config }) {
  function createSession(request, reply, user) {
    const token = randomToken(32);
    const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_MAX_AGE_SECONDS;
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= unixepoch()").run();
    db.prepare("INSERT INTO auth_sessions (token_hash, user_id, user_agent_hash, expires_at) VALUES (?, ?, ?, ?)").run(sha256(token), user.id, userAgentHash(request), expiresAt);
    reply.setCookie("agm_session", token, cookieOptions(request, config));
    return publicUser(user);
  }

  function getSession(request) {
    const token = request.cookies?.agm_session;
    if (!token || token.length > 256) return null;
    return db.prepare(`SELECT u.id, u.email, u.password_hash, u.role, u.display_name, s.expires_at
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.user_agent_hash = ? AND s.expires_at > unixepoch()`).get(sha256(token), userAgentHash(request)) || null;
  }

  function clearSession(request, reply) {
    const token = request.cookies?.agm_session;
    if (token) db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(sha256(token));
    reply.clearCookie("agm_session", cookieOptions(request, config, 0));
  }

  function authenticatePassword(request, emailInput, password) {
    const email = normalizedEmail(emailInput);
    const identifierHash = sha256(email || "invalid-email");
    const lock = db.prepare("SELECT locked_until FROM auth_failures WHERE identifier_hash = ?").get(identifierHash);
    if (lock?.locked_until > Math.floor(Date.now() / 1_000)) {
      dummyPasswordCheck(password, config.passwordPepper);
      return { error: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.", status: 429 };
    }
    const account = email ? db.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE email = ? COLLATE NOCASE").get(email) : null;
    const valid = Boolean(account && verifyPassword(String(password || ""), account.password_hash, config.passwordPepper));
    if (!account) dummyPasswordCheck(password, config.passwordPepper);
    if (!valid) {
      db.prepare(`INSERT INTO auth_failures (identifier_hash, failed_attempts, window_started, locked_until)
        VALUES (?, 1, unixepoch(), 0)
        ON CONFLICT(identifier_hash) DO UPDATE SET
          failed_attempts = CASE WHEN auth_failures.window_started < unixepoch() - 900 THEN 1 ELSE auth_failures.failed_attempts + 1 END,
          window_started = CASE WHEN auth_failures.window_started < unixepoch() - 900 THEN unixepoch() ELSE auth_failures.window_started END,
          locked_until = CASE WHEN auth_failures.window_started >= unixepoch() - 900 AND auth_failures.failed_attempts + 1 >= 8 THEN unixepoch() + 900 ELSE 0 END`).run(identifierHash);
      return { error: "Correo o contraseña incorrectos.", status: 401 };
    }
    db.prepare("DELETE FROM auth_failures WHERE identifier_hash = ?").run(identifierHash);
    return { user: account };
  }

  function signup(emailInput, password, confirmation) {
    const email = normalizedEmail(emailInput);
    if (!email) return { error: "Introduce un correo válido.", status: 400 };
    if (password !== confirmation) return { error: "Las contraseñas no coinciden.", status: 400 };
    const requirement = passwordRequirements(password, email);
    if (requirement) return { error: requirement, status: 400 };
    try {
      const result = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, 'member', ?)").run(email, hashPassword(password, config.passwordPepper), null);
      return { user: db.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE id = ?").get(result.lastInsertRowid) };
    } catch {
      return { error: "No fue posible crear la cuenta con esos datos.", status: 409 };
    }
  }

  function providers() {
    return Object.fromEntries(Object.keys(PROVIDERS).map((provider) => {
      const credentials = providerCredentials(config, provider);
      return [provider, Boolean(credentials.id && credentials.secret)];
    }));
  }

  function beginOAuth(request, reply, provider) {
    const definition = PROVIDERS[provider];
    const credentials = providerCredentials(config, provider);
    if (!definition || !credentials.id || !credentials.secret || !config.sessionSecret) return null;
    const state = randomToken(24);
    const redirectUri = callbackUrl(config, provider);
    const attempt = signedAttempt({ provider, state, redirectUri, exp: Math.floor(Date.now() / 1_000) + OAUTH_MAX_AGE_SECONDS }, config.sessionSecret);
    reply.setCookie(`agm_oauth_${provider}`, attempt, { ...cookieOptions(request, config, OAUTH_MAX_AGE_SECONDS), sameSite: "lax" });
    const destination = new URL(definition.authorizationUrl);
    destination.searchParams.set("client_id", credentials.id);
    destination.searchParams.set("redirect_uri", redirectUri);
    destination.searchParams.set("response_type", "code");
    destination.searchParams.set("scope", definition.scope);
    destination.searchParams.set("state", state);
    if (provider === "google") destination.searchParams.set("access_type", "online");
    reply.redirect(destination.toString());
    return true;
  }

  async function finishOAuth(request, reply, provider) {
    const definition = PROVIDERS[provider];
    const credentials = providerCredentials(config, provider);
    const query = request.query || {};
    const attempt = parseAttempt(request.cookies?.[`agm_oauth_${provider}`], config.sessionSecret);
    reply.clearCookie(`agm_oauth_${provider}`, cookieOptions(request, config, 0));
    if (!definition || !credentials.id || !credentials.secret || !attempt || attempt.provider !== provider || !safeEqual(query.state || "", attempt.state) || !query.code) throw new Error("oauth_failed");
    const tokenResponse = await fetch(definition.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: query.code, redirect_uri: attempt.redirectUri, client_id: credentials.id, client_secret: credentials.secret }),
    });
    const token = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !token?.access_token) throw new Error("oauth_token_failed");
    const profileResponse = await fetch(definition.profileUrl, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } });
    const profile = await profileResponse.json().catch(() => null);
    const email = normalizedEmail(profile?.email);
    const providerUserId = String(profile?.sub || profile?.id || "");
    const verified = provider === "discord" ? Boolean(profile?.verified) : Boolean(profile?.email_verified);
    if (!profileResponse.ok || !email || !providerUserId || !verified) throw new Error("oauth_profile_failed");
    let user = db.prepare(`SELECT u.id, u.email, u.password_hash, u.role, u.display_name FROM oauth_accounts o JOIN users u ON u.id = o.user_id WHERE o.provider = ? AND o.provider_user_id = ?`).get(provider, providerUserId);
    if (!user) {
      user = db.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE email = ? COLLATE NOCASE").get(email);
      if (!user) {
        const result = db.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES (?, 'oauth-only', 'member', ?)").run(email, String(profile.name || profile.global_name || profile.login || "").slice(0, 120) || null);
        user = db.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE id = ?").get(result.lastInsertRowid);
      }
      db.prepare("INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_user_id) VALUES (?, ?, ?)").run(user.id, provider, providerUserId);
    }
    return user;
  }

  return { createSession, getSession, clearSession, authenticatePassword, signup, providers, beginOAuth, finishOAuth, cookieOptions };
}
