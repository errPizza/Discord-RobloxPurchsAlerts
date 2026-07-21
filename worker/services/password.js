import { base64Url, bytesFromBase64Url, hmacSha256, safeEqual, sha256Hex } from "../utils/crypto.js";

const PBKDF2_SCHEME = "pbkdf2-sha256";
const HMAC_SCHEME = "hmac-sha256";
const PBKDF2_ITERATIONS = 600000;
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;
const COMMON_PASSWORDS = new Set([
  "123456789012345", "1234567890123456", "adminadminadmin", "contraseña123456", "password123456", "qwertyuiop12345",
  "letmeinletmein", "iloveyouiloveyou", "anothergamemore", "pizza1234567890",
]);

async function derivePassword(password, pepper, salt, iterations) {

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${password}${pepper}`), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);

  return base64Url(new Uint8Array(derived));
}

export function passwordRequirements(password, email = "") {

  const value = typeof password === "string" ? password : "";
  const length = [...value].length;
  const emailName = String(email).trim().toLowerCase().split("@", 1)[0];

  if (length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (length > MAX_PASSWORD_LENGTH) return `La contraseña no puede superar ${MAX_PASSWORD_LENGTH} caracteres.`;
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return "Elige una contraseña menos común.";
  if (emailName.length >= 4 && value.toLowerCase().includes(emailName)) return "La contraseña no puede contener tu correo.";

  return null;
}

export async function hashPassword(password, pepper) {

  if (!pepper) throw new Error("PASSWORD_PEPPER no está configurado.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, pepper, salt, PBKDF2_ITERATIONS);

  return `${PBKDF2_SCHEME}$${PBKDF2_ITERATIONS}$${base64Url(salt)}$${hash}`;
}

export async function verifyPassword(password, storedHash, pepper = "") {

  const stored = String(storedHash || "");

  if (stored.startsWith(`${HMAC_SCHEME}$`)) {

    const [scheme, saltValue, expectedHash] = stored.split("$");

    if (scheme !== HMAC_SCHEME || !pepper || !saltValue || !expectedHash) return false;

    try { return safeEqual(await hmacSha256(`${saltValue}:${password}`, pepper), expectedHash); } catch { return false; }
  }

  if (stored.startsWith(`${PBKDF2_SCHEME}$`)) {

    const [scheme, iterationsValue, saltValue, expectedHash] = stored.split("$");
    const iterations = Number(iterationsValue);

    if (scheme !== PBKDF2_SCHEME || !pepper || !Number.isSafeInteger(iterations) || iterations < 100000 || !saltValue || !expectedHash) return false;

    try { return safeEqual(await derivePassword(password, pepper, bytesFromBase64Url(saltValue), iterations), expectedHash); } catch { return false; }
  }

  if (stored.startsWith("oauth-only$")) return false;

  return safeEqual(await sha256Hex(`${password}${pepper}`), stored);
}

