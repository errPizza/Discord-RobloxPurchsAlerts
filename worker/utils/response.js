export function json(body, init = {}) {

  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function methodNotAllowed() {

  return json({ success: false, error: "Método no permitido." }, { status: 405 });
}

export function unauthorized() {

  return json({ success: false, error: "No autorizado." }, { status: 401 });
}
