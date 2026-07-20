import { json } from "../utils/response.js";
import { getUserByEmail } from "../database/database.js";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const PBKDF2_SCHEME = "pbkdf2-sha256";
const HMAC_SCHEME = "hmac-sha256";

function base64Url(bytes) {

  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesFromBase64Url(value) {

  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);

  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sha256(value) {

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password, storedHash, pepper = "") {

  const stored = String(storedHash || "");

  if (stored.startsWith(`${HMAC_SCHEME}$`)) {

    const [scheme, saltValue, expectedHash] = stored.split("$");

    if (scheme !== HMAC_SCHEME || !pepper || !saltValue || !expectedHash) return false;

    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${saltValue}:${password}`));

      return safeEqual(base64Url(new Uint8Array(signature)), expectedHash);
    } catch { return false; }
  }

  if (stored.startsWith(`${PBKDF2_SCHEME}$`)) {

    const [scheme, iterationsValue, saltValue, expectedHash] = stored.split("$");
    const iterations = Number(iterationsValue);

    if (scheme !== PBKDF2_SCHEME || !Number.isSafeInteger(iterations) || iterations < 100000 || !saltValue || !expectedHash) return false;

    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytesFromBase64Url(saltValue), iterations }, key, 256);

      return safeEqual(base64Url(new Uint8Array(derived)), expectedHash);
    } catch { return false; }
  }

  return safeEqual(await sha256(`${password}${pepper}`), stored);
}

async function sign(value, secret) {

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function safeEqual(left, right) {

  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);

  return result === 0;
}

function readCookie(request, name) {

  const match = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));

  return match ? match[1] : null;
}

function sessionCookie(value, maxAge = SESSION_MAX_AGE) {

  return `agm_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function accounts(env) {

  if (!env.ACCOUNT_CONFIG) return [];

  const config = JSON.parse(env.ACCOUNT_CONFIG);

  return Array.isArray(config) ? config : config.accounts || [];
}

export async function getSession(request, env) {

  if (!env.SESSION_SECRET) return null;

  const token = readCookie(request, "agm_session");

  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");

  if (!safeEqual(signature, await sign(payload, env.SESSION_SECRET))) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(bytesFromBase64Url(payload)));

    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch { return null; }
}

export async function requireAdmin(request, env) {

  const session = await getSession(request, env);

  return session?.role === "admin" ? session : null;
}

export async function handleAuth(request, env, pathname) {

  if (pathname === "/api/auth/session" && request.method === "GET") {

    const session = await getSession(request, env);

    return json({ user: session ? { email: session.email, role: session.role, isAdmin: session.role === "admin" } : { isAdmin: false } });
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") return json({ success: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
  if (pathname !== "/api/auth/login" || request.method !== "POST") return null;

  let credentials;

  try { credentials = await request.json(); } catch { return json({ error: "Datos de acceso inválidos." }, { status: 400 }); }

  const email = String(credentials.email || "").trim().toLowerCase();
  const password = String(credentials.password || "");
  let account = accounts(env).find((item) => String(item.email).toLowerCase() === email);

  if (!account && env.DB && email) account = await getUserByEmail(env, email);

  const storedHash = account?.passwordHash ?? account?.password_hash;
  const isValid = Boolean(email && password && storedHash && await verifyPassword(password, storedHash, env.PASSWORD_PEPPER || ""));

  if (!isValid) return json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET no está configurado.");

  const user = { email, role: account.role === "admin" ? "admin" : "member" };
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  const token = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
  
  return json({ user: { ...user, isAdmin: user.role === "admin" } }, { headers: { "Set-Cookie": sessionCookie(token) } });
}
