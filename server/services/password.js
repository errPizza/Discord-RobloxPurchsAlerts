import crypto from "node:crypto";
import { safeEqual } from "./crypto.js";

const ITERATIONS = 310_000;

function derive(password, pepper, salt, iterations = ITERATIONS) {
  return crypto.pbkdf2Sync(`${password}${pepper}`, salt, iterations, 32, "sha256").toString("base64url");
}

export function passwordRequirements(password, email = "") {
  if (password.length < 8 || password.length > 128) return "La contraseña debe tener entre 8 y 128 caracteres.";
  if (!/[A-Z]/.test(password) || (password.match(/[a-z]/g) || []).length < 2 || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "La contraseña debe incluir una mayúscula, dos minúsculas, un número y un símbolo.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "La contraseña no puede contener el correo.";
  return null;
}

export function hashPassword(password, pepper) {
  if (!pepper) throw new Error("PASSWORD_PEPPER no está configurado.");
  const salt = crypto.randomBytes(16).toString("base64url");
  return `pbkdf2$${ITERATIONS}$${salt}$${derive(password, pepper, salt)}`;
}

export function verifyPassword(password, storedHash, pepper) {
  const [scheme, iterations, salt, expected, extra] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected || extra || !pepper) return false;
  const count = Number(iterations);
  if (!Number.isSafeInteger(count) || count < 100_000 || count > 1_000_000) return false;
  return safeEqual(derive(password, pepper, salt, count), expected);
}

export function dummyPasswordCheck(password, pepper) {
  derive(password || "invalid", pepper || "unconfigured", "dummy-password-salt", ITERATIONS);
}
