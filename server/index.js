import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database/database.js";
import { applyMigrations } from "./database/migrate.js";
import { createAuthService } from "./services/auth.js";
import { createAuditService } from "./services/audit.js";
import { createBackupService } from "./services/backups.js";
import { createGameEvents } from "./services/game-events.js";
import { createDockerService, createHostControl, systemSnapshot } from "./services/monitoring.js";
import { LocalRateLimiter, clientAddress } from "./services/security.js";
import { createStatsService } from "./services/stats.js";
import { syncStaticAssets } from "./services/static-assets.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerMobileRoutes } from "./routes/mobile.js";
import { registerPublicRoutes } from "./routes/public.js";
import { getAvatarUrls } from "./services/roblox.js";
import { sha256 } from "./services/crypto.js";

function loadEnvironment() {
  const file = path.resolve(".env");
  if (fs.existsSync(file) && typeof process.loadEnvFile === "function") process.loadEnvFile(file);
}

function securityHeaders(request, reply) {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()");
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
  reply.header("X-Request-ID", request.agmRequestId);
  if (request.protocol === "https") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

async function detectHostRestart(db, audit, config) {
  const snapshot = await systemSnapshot(path.dirname(config.databasePath));
  const previous = db.prepare("SELECT value FROM site_settings WHERE key = 'host_boot_id'").get()?.value;
  if (previous && snapshot.bootId && previous !== snapshot.bootId) {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO server_events (id, type, message, metadata) VALUES (?, 'SPONTANEOUS_RESTART', ?, ?)").run(id, "La Raspberry Pi se reinició fuera de una orden remota registrada.", JSON.stringify({ previousBootId: previous, bootId: snapshot.bootId }));
    audit.alert({ type: "SERVER_RESTART", severity: "CRITICAL", service: "system", message: "Se detectó un reinicio espontáneo de la Raspberry Pi." });
  }
  if (snapshot.bootId) db.prepare("INSERT INTO site_settings (key, value) VALUES ('host_boot_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(snapshot.bootId);
}

function monitorThresholds(db, audit, config) {
  const dataPath = path.dirname(config.databasePath);
  const check = async () => {
    const snapshot = await systemSnapshot(dataPath);
    const samples = [
      ["HIGH_CPU", "cpu", config.thresholds.cpu, snapshot.cpu.usagePercent, "%"],
      ["HIGH_RAM", "memory", config.thresholds.ram, snapshot.memory.usedPercent, "%"],
      ["HIGH_TEMPERATURE", "temperature", config.thresholds.temperature, snapshot.temperature.celsius, "°C"],
      ["LOW_DISK", "storage", config.thresholds.disk, snapshot.storage.usedPercent, "%"],
    ];
    for (const [type, service, threshold, value, unit] of samples) {
      if (!threshold || value === null || value === undefined || value < threshold) continue;
      const open = db.prepare("SELECT id FROM alerts WHERE type = ? AND acknowledged_at IS NULL AND created_at > unixepoch() - 900 LIMIT 1").get(type);
      if (!open) audit.alert({ type, severity: "WARNING", service, message: `${type}: ${value}${unit} supera el umbral de ${threshold}${unit}.`, metadata: { value, threshold } });
    }
  };
  const timer = setInterval(() => check().catch((error) => audit.log({ service: "monitor", level: "ERROR", message: "Falló la comprobación de umbrales.", metadata: { error: error.message } })), 5 * 60_000);
  timer.unref();
  return { check, stop: () => clearInterval(timer) };
}

export async function buildApp(options = {}) {
  if (!options.config) loadEnvironment();
  const config = options.config || loadConfig();
  const db = options.db || openDatabase(config.databasePath);
  applyMigrations(db, path.resolve("server/database/migrations"));
  await syncStaticAssets(config);

  const audit = createAuditService(db);
  const services = {
    config, db, audit,
    limiter: new LocalRateLimiter(),
    auth: createAuthService({ db, config }),
    stats: createStatsService(db),
    events: createGameEvents(),
    docker: createDockerService(config),
    hostControl: createHostControl(config),
  };
  services.backups = createBackupService({ db, config, audit });

  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 128 * 1024, requestIdHeader: "x-request-id" });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(/^application\/json(?:;.*)?$/i, { parseAs: "string" }, (request, body, done) => {
    try {
      const data = JSON.parse(body);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("El cuerpo debe ser un objeto JSON.");
      done(null, { data, raw: body });
    } catch { done(new Error("El cuerpo JSON no es válido.")); }
  });
  await app.register(cookie);
  await app.register(websocket);

  app.addHook("onRequest", async (request) => { request.agmRequestId = /^[A-Za-z0-9_-]{8,128}$/.test(request.headers["x-request-id"] || "") ? request.headers["x-request-id"] : request.id; request.agmStartedAt = process.hrtime.bigint(); });
  app.addHook("onSend", async (request, reply, payload) => { securityHeaders(request, reply); if (request.url.startsWith("/api/") || request.method !== "GET") reply.header("Cache-Control", "no-store, max-age=0"); return payload; });
  app.addHook("onResponse", async (request, reply) => {
    try {
      const elapsed = Number(process.hrtime.bigint() - request.agmStartedAt) / 1_000_000;
      const endpoint = request.routeOptions?.url || request.url.split("?")[0];
      const originHash = clientAddress(request) === "unknown" ? null : sha256(clientAddress(request));
      db.prepare("INSERT INTO request_logs (request_id, method, endpoint, status, response_ms, origin_hash) VALUES (?, ?, ?, ?, ?, ?)").run(request.agmRequestId, request.method, endpoint, reply.statusCode, Math.round(elapsed), originHash);
      const bucket = Math.floor(Date.now() / 60_000) * 60;
      db.prepare(`INSERT INTO request_metric_buckets (bucket_start, method, endpoint, status, request_count, latency_total_ms) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(bucket_start, method, endpoint, status) DO UPDATE SET request_count = request_count + 1, latency_total_ms = latency_total_ms + excluded.latency_total_ms`).run(bucket, request.method, endpoint, reply.statusCode, Math.round(elapsed));
    } catch { /* Observability cannot break the requested response. */ }
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    audit.log({ service: "app", level: status >= 500 ? "ERROR" : "WARNING", message: status >= 500 ? "Error interno de aplicación." : error.message, requestId: request.agmRequestId });
    if (status >= 500) audit.alert({ type: "APPLICATION_ERROR", severity: "ERROR", service: "app", message: "La aplicación registró un error interno.", metadata: { requestId: request.agmRequestId } });
    reply.code(status).send({ success: false, error: status >= 500 ? "Error interno de la aplicación." : error.message, requestId: request.agmRequestId });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (request, reply) => {
    try { db.prepare("SELECT 1").get(); fs.accessSync(path.dirname(config.databasePath), fs.constants.W_OK); return { status: "ready", database: "ok" }; }
    catch { return reply.code(503).send({ status: "not_ready" }); }
  });
  app.get("/api/site", async () => {
    const [settings, contacts] = [db.prepare("SELECT key, value FROM site_settings").all(), db.prepare(`SELECT id, name, role, email, discord, initials, description, roblox_url AS robloxUrl, image_key AS imageKey, team_group AS teamGroup, joined_at AS joinedAt, roblox_user_id AS robloxUserId, discord_username AS discordUsername, display_order AS displayOrder FROM contacts WHERE is_visible = 1 ORDER BY display_order, id`).all()];
    return { settings: Object.fromEntries(settings.map((row) => [row.key, row.value])), contacts, avatars: await getAvatarUrls(contacts.map((item) => item.robloxUserId).filter(Boolean)) };
  });
  app.get("/api/status", async () => ({ name: "Another Game More API", status: db.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").get()?.value !== "0" ? "online" : "paused", messagesEnabled: db.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").get()?.value !== "0" }));

  registerAuthRoutes(app, services);
  registerAdminRoutes(app, services);
  registerMobileRoutes(app, services);
  registerPublicRoutes(app, services);
  await app.register(staticFiles, { root: config.staticRoot, prefix: "/", wildcard: false, index: ["index.html"] });
  app.get("/*", async (request, reply) => {
    if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Ruta no encontrada." });
    return reply.sendFile("index.html");
  });

  const backupStop = services.backups.schedule();
  const thresholdMonitor = monitorThresholds(db, audit, config);
  await detectHostRestart(db, audit, config).catch((error) => audit.log({ service: "monitor", level: "ERROR", message: "No fue posible verificar el reinicio del host.", metadata: { error: error.message } }));
  thresholdMonitor.check().catch(() => {});
  app.addHook("onClose", async () => { backupStop(); thresholdMonitor.stop(); if (!options.db) db.close(); });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildApp();
  const config = loadConfig();
  const close = async () => { await app.close(); process.exit(0); };
  process.on("SIGINT", close); process.on("SIGTERM", close);
  await app.listen({ host: config.host, port: config.port });
  console.log(`Another Game More escucha en http://${config.host}:${config.port}`);
}
