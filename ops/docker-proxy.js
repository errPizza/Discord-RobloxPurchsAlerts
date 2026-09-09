import fs from "node:fs";
import http from "node:http";

const listenSocket = process.env.DOCKER_PROXY_SOCKET || "/run/agm-docker-proxy.sock";
const dockerSocket = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";

function allowed(method, pathname, search) {
  if (method === "GET" && pathname === "/containers/json") return true;
  if (method === "GET" && /^\/containers\/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\/(json|stats)$/.test(pathname) && (pathname.endsWith("/json") || search === "?stream=false")) return true;
  return method === "POST" && /^\/containers\/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\/(start|stop|restart)$/.test(pathname);
}

fs.rmSync(listenSocket, { force: true });
const proxy = http.createServer((request, response) => {
  const url = new URL(request.url, "http://docker.local");
  if (!allowed(request.method, url.pathname, url.search)) {
    request.resume();
    response.writeHead(403, { "Content-Type": "application/json" }).end('{"error":"Docker API no permitida."}');
    return;
  }
  const upstream = http.request({ socketPath: dockerSocket, method: request.method, path: `${url.pathname}${url.search}`, headers: { Accept: "application/json" } }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => response.writeHead(502, { "Content-Type": "application/json" }).end('{"error":"Docker no disponible."}'));
  request.pipe(upstream);
});
proxy.listen(listenSocket, () => fs.chmodSync(listenSocket, 0o660));
process.on("SIGTERM", () => proxy.close(() => process.exit(0)));
