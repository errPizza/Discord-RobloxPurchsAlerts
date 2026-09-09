import crypto from "node:crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("base64url");
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${hmac(`${header}.${body}`, secret)}`;
}

export function verifyToken(token, secret) {
  const [header, body, signature, extra] = String(token || "").split(".");
  if (!header || !body || !signature || extra || !safeEqual(signature, hmac(`${header}.${body}`, secret))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return decoded && typeof decoded === "object" ? decoded : null;
  } catch {
    return null;
  }
}
