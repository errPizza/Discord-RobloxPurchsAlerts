export function base64Url(bytes) {

  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function bytesFromBase64Url(value) {

  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);

  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function randomToken(size = 32) {

  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export function safeEqual(left, right) {

  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;

  let result = 0;

  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);

  return result === 0;
}

export async function hmacSha256(value, secret) {

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64Url(new Uint8Array(signature));
}

export async function sha256Hex(value) {

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

