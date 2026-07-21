import { randomToken } from "../utils/crypto.js";

export function turnstileSiteKey(env) {

  return env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? String(env.TURNSTILE_SITE_KEY) : null;
}

export async function verifyTurnstile(request, env, token, expectedAction) {

  if (!turnstileSiteKey(env)) return true;

  const responseToken = String(token || "");

  if (!responseToken || responseToken.length > 2048) return false;

  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: responseToken,
    idempotency_key: crypto.randomUUID?.() || randomToken(16),
  });
  const remoteIp = request.headers.get("CF-Connecting-IP");

  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    const hostname = new URL(request.url).hostname;
    const hostnameMatches = !result.hostname || result.hostname === hostname || ["localhost", "127.0.0.1"].includes(hostname);
    const actionMatches = !result.action || result.action === expectedAction;

    return response.ok && result.success === true && hostnameMatches && actionMatches;
  } catch (error) {
    console.error("[TURNSTILE]", error instanceof Error ? error.message : "validation_failed");

    return false;
  }
}
