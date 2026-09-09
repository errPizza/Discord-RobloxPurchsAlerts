import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";

const socketPath = process.env.HOST_CONTROL_SOCKET || "/run/agm-host-control.sock";
const secret = process.env.HOST_CONTROL_SECRET || "";
const allowed = new Map([
  ["restart", ["reboot"]],
  ["shutdown", ["poweroff"]],
  ["nginx-reload", ["reload", "nginx"]],
  ["nginx-restart", ["restart", "nginx"]],
]);
const seen = new Map();

function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(timestamp, nonce, action) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${action}`).digest("base64url");
}

function respond(socket, data) {
  socket.end(`${JSON.stringify(data)}\n`);
}

if (process.getuid?.() !== 0) throw new Error("host-control debe ejecutarse como root mediante systemd.");
if (!secret || secret.length < 32) throw new Error("HOST_CONTROL_SECRET debe tener al menos 32 caracteres y existir sólo en /etc/another-game-more/host-control.env.");
fs.rmSync(socketPath, { force: true });

const server = net.createServer((socket) => {
  let raw = "";
  socket.setTimeout(5_000);
  socket.on("data", (chunk) => { raw += chunk; if (raw.length > 4_096) socket.destroy(); });
  socket.on("timeout", () => socket.destroy());
  socket.on("end", () => {
    try {
      const data = JSON.parse(raw);
      const now = Math.floor(Date.now() / 1_000);
      if (!allowed.has(data.action) || !/^\d{10}$/.test(String(data.timestamp)) || !/^[A-Za-z0-9_-]{16,128}$/.test(String(data.nonce)) || Math.abs(now - Number(data.timestamp)) > 30 || seen.has(data.nonce) || !safeEqual(data.signature, signature(data.timestamp, data.nonce, data.action))) return respond(socket, { success: false, error: "Solicitud no autorizada." });
      seen.set(data.nonce, now);
      for (const [nonce, timestamp] of seen) if (timestamp < now - 60) seen.delete(nonce);
      respond(socket, { success: true, accepted: true });
      setTimeout(() => {
        const child = spawn("/bin/systemctl", allowed.get(data.action), { detached: true, stdio: "ignore", shell: false });
        child.unref();
      }, 100).unref();
    } catch { respond(socket, { success: false, error: "Solicitud inválida." }); }
  });
});

server.listen(socketPath, () => fs.chmodSync(socketPath, 0o660));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
