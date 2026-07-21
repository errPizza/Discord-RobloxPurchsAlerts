import { getOrCreateOAuthUser } from "../database/database.js";
import { base64Url, bytesFromBase64Url, hmacSha256, randomToken, safeEqual } from "../utils/crypto.js";

const OAUTH_COOKIE = "agm_oauth_attempt";
const OAUTH_MAX_AGE = 10 * 60;

const PROVIDERS = {
  google: {
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    authorizationParams: { prompt: "select_account" },
    idField: "sub",
    name: (profile) => profile.name,
    verified: (profile) => profile.email_verified === true,
  },
  discord: {
    clientId: "DISCORD_CLIENT_ID",
    clientSecret: "DISCORD_CLIENT_SECRET",
    authorizationUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/v10/users/@me",
    scope: "identify email",
    authorizationParams: {},
    idField: "id",
    name: (profile) => profile.global_name || profile.username,
    verified: (profile) => profile.verified === true,
  },
};

export class OAuthError extends Error {

  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function readCookie(request, name) {

  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));

  return match ? match[1] : null;
}

export function oauthCookie(value, maxAge = OAUTH_MAX_AGE) {

  return `${OAUTH_COOKIE}=${value}; Path=/api/auth/oauth/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function providerConfig(env, provider) {

  const definition = PROVIDERS[provider];

  if (!definition) return null;

  return {
    ...definition,
    clientIdValue: env[definition.clientId],
    clientSecretValue: env[definition.clientSecret],
  };
}

export function oauthProviders(env) {

  return Object.fromEntries(Object.keys(PROVIDERS).map((provider) => {
    const config = providerConfig(env, provider);

    return [provider, Boolean(config.clientIdValue && config.clientSecretValue)];
  }));
}

function callbackUrl(request, provider) {

  const url = new URL(request.url);

  return `${url.origin}/api/auth/oauth/${provider}/callback`;
}

async function signedAttempt(data, secret) {

  const payload = base64Url(new TextEncoder().encode(JSON.stringify(data)));

  return `${payload}.${await hmacSha256(payload, secret)}`;
}

async function parseAttempt(value, secret) {

  if (!value || !value.includes(".") || !secret) return null;

  const [payload, signature] = value.split(".");

  if (!safeEqual(signature, await hmacSha256(payload, secret))) return null;

  try { return JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload))); } catch { return null; }
}

export async function beginOAuth(request, env, provider) {

  const config = providerConfig(env, provider);

  if (!config?.clientIdValue || !config.clientSecretValue) throw new OAuthError("provider_unavailable", `${provider} no está configurado.`);
  if (!env.SESSION_SECRET) throw new OAuthError("server_config", "SESSION_SECRET no está configurado.");

  const state = randomToken(32);
  const attempt = await signedAttempt({ provider, state, exp: Math.floor(Date.now() / 1000) + OAUTH_MAX_AGE }, env.SESSION_SECRET);
  const authorization = new URL(config.authorizationUrl);

  authorization.search = new URLSearchParams({
    client_id: config.clientIdValue,
    redirect_uri: callbackUrl(request, provider),
    response_type: "code",
    scope: config.scope,
    state,
    ...config.authorizationParams,
  }).toString();

  return new Response(null, { status: 302, headers: { Location: authorization.toString(), "Set-Cookie": oauthCookie(attempt) } });
}

async function responseJson(response, code) {

  const body = await response.json().catch(() => ({}));

  if (!response.ok) throw new OAuthError(code, body.error_description || body.message || `OAuth respondió ${response.status}.`);

  return body;
}

export async function finishOAuth(request, env, provider) {

  const config = providerConfig(env, provider);
  const url = new URL(request.url);
  const attempt = await parseAttempt(readCookie(request, OAUTH_COOKIE), env.SESSION_SECRET);

  if (!config?.clientIdValue || !config.clientSecretValue) throw new OAuthError("provider_unavailable", `${provider} no está configurado.`);
  if (url.searchParams.has("error")) throw new OAuthError("access_denied", "El usuario canceló la autorización.");
  if (!attempt || attempt.provider !== provider || attempt.state !== url.searchParams.get("state") || attempt.exp < Math.floor(Date.now() / 1000)) {
    throw new OAuthError("invalid_state", "El intento OAuth no es válido o expiró.");
  }

  const code = url.searchParams.get("code");

  if (!code) throw new OAuthError("missing_code", "El proveedor no devolvió un código.");

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientIdValue,
      client_secret: config.clientSecretValue,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(request, provider),
    }),
  });
  const token = await responseJson(tokenResponse, "token_exchange_failed");

  if (!token.access_token) throw new OAuthError("token_exchange_failed", "El proveedor no devolvió un access token.");

  const profileResponse = await fetch(config.profileUrl, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } });
  const profile = await responseJson(profileResponse, "profile_failed");
  const email = String(profile.email || "").trim().toLowerCase();
  const providerUserId = String(profile[config.idField] || "");

  if (!email || !providerUserId || !config.verified(profile)) throw new OAuthError("email_unverified", "El proveedor no entregó un correo verificado.");

  return getOrCreateOAuthUser(env, {
    provider,
    providerUserId,
    email,
    displayName: String(config.name(profile) || "").trim().slice(0, 80),
    placeholderHash: `oauth-only$${randomToken(32)}`,
  });
}
