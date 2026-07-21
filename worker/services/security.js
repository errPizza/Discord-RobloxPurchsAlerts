import { hmacSha256, safeEqual, sha256Hex } from "../utils/crypto.js";
import { json } from "../utils/response.js";

const DEFAULT_MAX_BODY = 16 * 1024;
const SIGNATURE_MAX_AGE = 5 * 60;

export class RequestValidationError extends Error {

  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(request, maximumBytes = DEFAULT_MAX_BODY) {

  const contentType = request.headers.get("Content-Type") || "";
  const declaredLength = Number(request.headers.get("Content-Length") || 0);

  if (!contentType.toLowerCase().startsWith("application/json")) throw new RequestValidationError("El contenido debe enviarse como application/json.", 415);
  if (declaredLength > maximumBytes) throw new RequestValidationError("La petición supera el tamaño permitido.", 413);

  const raw = await request.text();

  if (new TextEncoder().encode(raw).byteLength > maximumBytes) throw new RequestValidationError("La petición supera el tamaño permitido.", 413);

  let data;

  try { data = JSON.parse(raw); } catch { throw new RequestValidationError("El cuerpo JSON no es válido."); }

  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RequestValidationError("El cuerpo debe ser un objeto JSON.");

  return { data, raw };
}

export function validationError(error, fallback = "La petición no es válida.") {

  if (error instanceof RequestValidationError) return json({ success: false, error: error.message }, { status: error.status });

  return json({ success: false, error: fallback }, { status: 400 });
}

export function isSameOriginMutation(request) {

  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (origin && origin !== url.origin) return false;
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;

  return true;
}

export async function consumeRateLimit(binding, request, scope, subject = "") {

  if (!binding?.limit) return true;

  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256Hex(`${scope}:${address}:${String(subject).slice(0, 160)}`);

  try { return (await binding.limit({ key })).success; }
  catch (error) {
    console.error("[RATE_LIMIT]", scope, error instanceof Error ? error.message : "unknown_error");

    return true;
  }
}

export function rateLimited() {

  return json({ success: false, error: "Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo." }, {
    status: 429,
    headers: { "Retry-After": "60" },
  });
}

export function validSecret(request, bodySecret, expectedSecret) {

  if (!expectedSecret) return false;

  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const supplied = bearer || String(bodySecret || "");

  return Boolean(supplied) && safeEqual(supplied, String(expectedSecret));
}

export async function verifyWebhookSignature(request, rawBody, secret, requireSignature = false) {

  const timestampValue = request.headers.get("X-AGM-Timestamp") || "";
  const nonce = request.headers.get("X-AGM-Nonce") || "";
  const signature = request.headers.get("X-AGM-Signature") || "";
  const hasSignature = Boolean(timestampValue || nonce || signature);

  if (!hasSignature) return { valid: !requireSignature, signed: false, nonce: null };
  if (!/^\d{10,13}$/.test(timestampValue) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !signature) return { valid: false, signed: true, nonce: null };

  const numericTimestamp = Number(timestampValue);
  const timestamp = numericTimestamp > 1e12 ? Math.floor(numericTimestamp / 1000) : numericTimestamp;

  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_MAX_AGE) return { valid: false, signed: true, nonce: null };

  const expected = await hmacSha256(`${timestampValue}.${nonce}.${rawBody}`, secret);

  return { valid: safeEqual(signature, expected), signed: true, nonce };
}

export function signedWebhooksRequired(env) {

  return ["1", "true", "yes", "on"].includes(String(env.REQUIRE_SIGNED_WEBHOOKS || "").toLowerCase());
}

export function applySecurityHeaders(response, request, requestId = crypto.randomUUID()) {

  const headers = new Headers(response.headers);
  const pathname = new URL(request.url).pathname;
  const contentType = headers.get("Content-Type") || "";

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Request-ID", requestId);

  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  if (contentType.includes("text/html")) {
    headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.rbxcdn.com; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; manifest-src 'self'; upgrade-insecure-requests");
  }

  if (pathname.startsWith("/api/") || ["/", "/item", "/bulk", "/stats"].includes(pathname) && request.method !== "GET") {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
