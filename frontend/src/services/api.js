const API_BASE = import.meta.env.VITE_API_URL || "";

export function webSocketUrl(path) {
  const url = new URL(`${API_BASE}${path}`, window.location.href);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
}

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No fue posible completar la solicitud.");
  return data;
}
