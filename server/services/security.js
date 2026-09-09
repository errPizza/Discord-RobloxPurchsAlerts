import { hmac, safeEqual, sha256 } from "./crypto.js";

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export class LocalRateLimiter {
  constructor({ maxEntries = 10_000 } = {}) {
    this.entries = new Map();
    this.maxEntries = maxEntries;
  }

  consume(scope, subject, limit, windowMs) {
    const now = Date.now();
    const key = `${scope}:${sha256(subject)}`;
    const item = this.entries.get(key);
    if (!item || item.resetAt <= now) {
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    item.count += 1;
    return { allowed: item.count <= limit, retryAfter: Math.max(1, Math.ceil((item.resetAt - now) / 1_000)) };
  }
}

export function clientAddress(request) {
  const forwarded = request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value || request.ip || "unknown").split(",")[0].trim().slice(0, 128);
}

export function requireRateLimit(reply, limiter, scope, request, limit, windowMs, subject = "") {
  const result = limiter.consume(scope, `${clientAddress(request)}:${subject}`, limit, windowMs);
  if (result.allowed) return true;
  reply.header("Retry-After", String(result.retryAfter)).code(429).send({ success: false, error: "Demasiadas solicitudes. Espera antes de reintentar." });
  return false;
}

export function sameOriginMutation(request, publicOrigin) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(publicOrigin).origin || new URL(origin).origin === request.protocol + "://" + request.hostname; }
  catch { return false; }
}

export function normalizedEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function validSecret(request, bodySecret, expectedSecret) {
  if (!expectedSecret) return false;
  const authorization = request.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const supplied = bearer || request.headers["x-webhook-secret"] || String(bodySecret || "");
  return Boolean(supplied) && safeEqual(supplied, expectedSecret);
}

export function verifyWebhookSignature(request, rawBody, secret, required) {
  const timestampValue = String(request.headers["x-agm-timestamp"] || "");
  const nonce = String(request.headers["x-agm-nonce"] || "");
  const signature = String(request.headers["x-agm-signature"] || "");
  const hasSignature = Boolean(timestampValue || nonce || signature);
  if (!hasSignature) return { valid: !required, nonce: null };
  if (!/^\d{10,13}$/.test(timestampValue) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !signature) return { valid: false, nonce: null };
  const numeric = Number(timestampValue);
  const seconds = numeric > 1e12 ? Math.floor(numeric / 1_000) : numeric;
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1_000) - seconds) > SIGNATURE_MAX_AGE_SECONDS) return { valid: false, nonce: null };
  return { valid: safeEqual(signature, hmac(`${timestampValue}.${nonce}.${rawBody}`, secret)), nonce };
}

export function cleanText(value, maximum, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error("Falta un campo obligatorio.");
  if (text.length > maximum) throw new Error("Un campo supera la longitud permitida.");
  return text;
}
