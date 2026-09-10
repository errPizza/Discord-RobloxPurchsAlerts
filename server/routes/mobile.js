import crypto from "node:crypto";
import path from "node:path";
import { clientAddress, normalizedEmail, requireRateLimit } from "../services/security.js";
import { hasPermission, PERMISSIONS } from "../services/permissions.js";
import { randomToken, sha256, signToken, verifyToken } from "../services/crypto.js";
import { systemSnapshot, powerStatus, nginxStatus } from "../services/monitoring.js";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

function page(query) {
  return { limit: Math.min(Math.max(Number(query?.limit) || 50, 1), 100), offset: Math.max(Number(query?.offset) || 0, 0) };
}

function device(body) {
  const id = String(body.deviceId || "").trim();
  const name = String(body.deviceName || "").trim();
  if (id.length < 8 || id.length > 200 || name.length < 1 || name.length > 120) throw new Error("deviceId y deviceName son obligatorios.");
  return { id, name, platform: String(body.platform || "").trim().slice(0, 80) || null, appVersion: String(body.appVersion || "").trim().slice(0, 80) || null };
}

export function registerMobileRoutes(app, services) {
  const { db, auth, config, limiter, audit, docker, hostControl } = services;
  const insertRefresh = db.prepare("INSERT INTO mobile_refresh_tokens (token_hash, mobile_session_id, expires_at) VALUES (?, ?, ?)");
  const bySession = db.prepare(`SELECT ms.*, u.id AS user_id, u.email, u.role, u.display_name FROM mobile_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.id = ?`);

  function tokens(session) {
    if (!config.mobileAccessTokenSecret || !config.mobileRefreshTokenSecret) throw new Error("Los secretos de tokens móviles no están configurados.");
    const now = Math.floor(Date.now() / 1_000);
    const accessToken = signToken({ typ: "mobile-access", sub: session.user_id, sid: session.id, role: session.role, iat: now, exp: now + ACCESS_TOKEN_SECONDS }, config.mobileAccessTokenSecret);
    const refreshToken = randomToken(48);
    insertRefresh.run(sha256(refreshToken), session.id, now + REFRESH_TOKEN_SECONDS);
    db.prepare("UPDATE mobile_sessions SET last_seen_at = unixepoch() WHERE id = ?").run(session.id);
    return { accessToken, refreshToken, accessTokenExpiresIn: ACCESS_TOKEN_SECONDS, refreshTokenExpiresIn: REFRESH_TOKEN_SECONDS };
  }

  function mobileSession(request, reply) {
    if (!config.mobileAccessTokenSecret || !config.mobileRefreshTokenSecret) {
      reply.code(503).send({ error: "La autenticación móvil no está configurada." }); return null;
    }
    const authorization = String(request.headers.authorization || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const payload = verifyToken(token, config.mobileAccessTokenSecret);
    if (!payload || payload.typ !== "mobile-access" || !Number.isSafeInteger(payload.sub) || !payload.sid || payload.exp <= Math.floor(Date.now() / 1_000)) {
      reply.code(401).send({ error: "Token móvil no válido o expirado." }); return null;
    }
    const session = bySession.get(payload.sid);
    if (!session || session.status !== "approved" || session.user_id !== payload.sub) { reply.code(403).send({ error: "La sesión móvil no está aprobada." }); return null; }
    return { session, user: { id: session.user_id, email: session.email, role: session.role, display_name: session.display_name } };
  }

  function permission(request, reply, needed) {
    const identity = mobileSession(request, reply);
    if (!identity) return null;
    if (!hasPermission(identity.user, needed)) {
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: "mobile_permission", target: needed, result: "denied" });
      reply.code(403).send({ error: "No tienes el permiso requerido." }); return null;
    }
    return identity;
  }

  function mobileAdmin(request, reply) {
    const identity = mobileSession(request, reply);
    if (!identity) return null;
    if (!["admin", "owner"].includes(identity.user.role)) { reply.code(403).send({ error: "Solo administradores pueden gestionar sesiones." }); return null; }
    return identity;
  }

  app.post("/api/mobile/auth/login", async (request, reply) => {
    if (!requireRateLimit(reply, limiter, "mobile-login", request, 8, 60_000)) return;
    const body = request.body?.data || {};
    let info;
    try { info = device(body); } catch (error) { return reply.code(400).send({ error: error.message }); }
    const result = auth.authenticatePassword(request, normalizedEmail(body.email), String(body.password || ""));
    if (result.error) return reply.code(result.status).send({ error: result.error });
    const deviceHash = sha256(info.id);
    let session = db.prepare(`SELECT ms.*, u.id AS user_id, u.email, u.role, u.display_name FROM mobile_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.user_id = ? AND ms.device_id_hash = ? ORDER BY ms.requested_at DESC LIMIT 1`).get(result.user.id, deviceHash);
    if (!session || session.status === "revoked") {
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO mobile_sessions (id, user_id, device_id_hash, device_name, platform, app_version, status, ip_hash, user_agent_hash) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, result.user.id, deviceHash, info.name, info.platform, info.appVersion, sha256(clientAddress(request)), sha256(request.headers["user-agent"] || ""));
      session = bySession.get(id);
      audit.record({ userId: result.user.id, mobileSessionId: id, deviceName: info.name, action: "mobile_session_request", result: "success" });
    }
    if (session.status !== "approved") return reply.code(202).send({ status: "pending", session: { id: session.id, deviceName: session.device_name, requestedAt: session.requested_at } });
    audit.record({ userId: result.user.id, mobileSessionId: session.id, deviceName: session.device_name, action: "mobile_login", result: "success" });
    return { status: "approved", session: { id: session.id, deviceName: session.device_name }, ...tokens(session) };
  });

  app.post("/api/mobile/auth/refresh", async (request, reply) => {
    if (!requireRateLimit(reply, limiter, "mobile-refresh", request, 20, 60_000)) return;
    const tokenHash = sha256(request.body?.data?.refreshToken || "");
    const record = db.prepare(`SELECT rt.token_hash, rt.mobile_session_id FROM mobile_refresh_tokens rt JOIN mobile_sessions ms ON ms.id = rt.mobile_session_id WHERE rt.token_hash = ? AND rt.revoked_at IS NULL AND rt.expires_at > unixepoch() AND ms.status = 'approved'`).get(tokenHash);
    if (!record) return reply.code(401).send({ error: "Refresh token no válido o revocado." });
    const session = bySession.get(record.mobile_session_id);
    const issued = db.transaction(() => {
      db.prepare("UPDATE mobile_refresh_tokens SET revoked_at = unixepoch() WHERE token_hash = ?").run(tokenHash);
      return tokens(session);
    })();
    return issued;
  });

  app.post("/api/mobile/auth/logout", async (request, reply) => {
    const identity = mobileSession(request, reply); if (!identity) return;
    db.prepare("UPDATE mobile_refresh_tokens SET revoked_at = unixepoch() WHERE mobile_session_id = ? AND revoked_at IS NULL").run(identity.session.id);
    audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: "mobile_logout", result: "success" });
    return { success: true };
  });

  app.get("/api/mobile/sessions", async (request, reply) => {
    const identity = mobileAdmin(request, reply); if (!identity) return;
    return { sessions: db.prepare(`SELECT ms.id, ms.user_id AS userId, u.email, ms.device_name AS deviceName, ms.platform, ms.app_version AS appVersion, ms.status, ms.requested_at AS requestedAt, ms.approved_at AS approvedAt, ms.last_seen_at AS lastSeenAt FROM mobile_sessions ms JOIN users u ON u.id = ms.user_id ORDER BY ms.requested_at DESC LIMIT 100`).all() };
  });
  app.post("/api/mobile/sessions/:id/approve", async (request, reply) => {
    const identity = mobileAdmin(request, reply); if (!identity) return;
    const target = bySession.get(request.params.id); if (!target) return reply.code(404).send({ error: "Sesión no encontrada." });
    db.prepare("UPDATE mobile_sessions SET status = 'approved', approved_at = unixepoch(), approved_by = ?, revoked_at = NULL, revoked_by = NULL WHERE id = ?").run(identity.user.id, target.id);
    audit.record({ userId: identity.user.id, mobileSessionId: target.id, deviceName: target.device_name, action: "mobile_session_approve", result: "success" });
    return { success: true, session: { id: target.id, status: "approved" } };
  });
  app.post("/api/mobile/sessions/:id/revoke", async (request, reply) => {
    const identity = mobileAdmin(request, reply); if (!identity) return;
    const target = bySession.get(request.params.id); if (!target) return reply.code(404).send({ error: "Sesión no encontrada." });
    db.transaction(() => {
      db.prepare("UPDATE mobile_sessions SET status = 'revoked', revoked_at = unixepoch(), revoked_by = ? WHERE id = ?").run(identity.user.id, target.id);
      db.prepare("UPDATE mobile_refresh_tokens SET revoked_at = unixepoch() WHERE mobile_session_id = ? AND revoked_at IS NULL").run(target.id);
    })();
    audit.record({ userId: identity.user.id, mobileSessionId: target.id, deviceName: target.device_name, action: "mobile_session_revoke", result: "success" });
    return { success: true };
  });

  app.get("/api/mobile/system", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.MONITOR_READ)) return;
    return systemSnapshot(path.dirname(config.databasePath));
  });
  app.get("/api/mobile/power", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.MONITOR_READ)) return;
    return powerStatus();
  });
  app.get("/api/mobile/requests", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.STATS_READ)) return;
    const since = Math.floor(Date.now() / 60_000) * 60 - 3_600;
    const buckets = db.prepare(`SELECT bucket_start AS bucketStart, status, SUM(request_count) AS count, SUM(latency_total_ms) AS latencyTotalMs FROM request_metric_buckets WHERE bucket_start >= ? GROUP BY bucket_start, status ORDER BY bucket_start`).all(since);
    const total = db.prepare("SELECT COUNT(*) AS count FROM request_logs").get().count;
    return { totalRequests: total, lastHour: buckets, requestsPerMinute: buckets.reduce((sum, row) => sum + row.count, 0) / 60 };
  });
  app.get("/api/mobile/errors", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.LOGS_READ)) return;
    const { limit, offset } = page(request.query);
    return { errors: db.prepare("SELECT id, service, level, message, request_id AS requestId, created_at AS createdAt FROM application_logs WHERE level IN ('ERROR', 'CRITICAL') ORDER BY id DESC LIMIT ? OFFSET ?").all(limit, offset), limit, offset };
  });
  app.get("/api/mobile/logs", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.LOGS_READ)) return;
    const { limit, offset } = page(request.query); const service = String(request.query?.service || "").slice(0, 80); const level = String(request.query?.level || "").toUpperCase(); const search = String(request.query?.search || "").slice(0, 160);
    const clauses = []; const parameters = [];
    if (service) { clauses.push("service = ?"); parameters.push(service); }
    if (["INFO", "WARNING", "ERROR", "CRITICAL"].includes(level)) { clauses.push("level = ?"); parameters.push(level); }
    if (search) { clauses.push("message LIKE ?"); parameters.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return { logs: db.prepare(`SELECT id, service, level, message, metadata, request_id AS requestId, created_at AS createdAt FROM application_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...parameters, limit, offset), limit, offset };
  });
  app.get("/api/mobile/docker", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.DOCKER_READ)) return;
    return docker.list();
  });
  for (const action of ["start", "stop", "restart"]) app.post(`/api/mobile/docker/:id/${action}`, async (request, reply) => {
    const identity = permission(request, reply, PERMISSIONS.DOCKER_CONTROL); if (!identity) return;
    if (!requireRateLimit(reply, limiter, "docker-control", request, 6, 60_000, identity.user.id)) return;
    try {
      const result = await docker.control(request.params.id, action);
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: `docker_${action}`, target: result.id, result: "success" });
      return { success: true, ...result };
    } catch (error) { audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, action: `docker_${action}`, target: request.params.id, result: "denied" }); return reply.code(403).send({ error: error.message }); }
  });
  app.get("/api/mobile/nginx", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.NGINX_READ)) return;
    return nginxStatus(config);
  });
  for (const action of ["reload", "restart"]) app.post(`/api/mobile/nginx/${action}`, async (request, reply) => {
    const identity = permission(request, reply, PERMISSIONS.NGINX_CONTROL); if (!identity) return;
    if (!requireRateLimit(reply, limiter, `nginx-${action}`, request, 4, 60_000, identity.user.id)) return;
    try {
      await hostControl.send(`nginx-${action}`);
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: `nginx_${action}`, target: "nginx", result: "success" });
      return { success: true, accepted: true };
    } catch (error) {
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: `nginx_${action}`, target: "nginx", result: "failure" });
      return reply.code(503).send({ error: error.message });
    }
  });
  app.get("/api/mobile/statistics", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.STATS_READ)) return;
    return { analytics: services.stats.analytics(), games: [services.stats.gameAnalytics("Clothing"), services.stats.gameAnalytics("Missile")] };
  });
  app.get("/api/mobile/alerts", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.ALERTS_READ)) return;
    const { limit, offset } = page(request.query);
    return { alerts: db.prepare("SELECT id, type, severity, service, message, metadata, acknowledged_at AS acknowledgedAt, created_at AS timestamp FROM alerts ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset), limit, offset };
  });
  app.post("/api/mobile/alerts/:id/acknowledge", async (request, reply) => {
    const identity = permission(request, reply, PERMISSIONS.ALERTS_READ); if (!identity) return;
    db.prepare("UPDATE alerts SET acknowledged_at = unixepoch(), acknowledged_by = ? WHERE id = ?").run(identity.user.id, request.params.id);
    audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, action: "alert_acknowledge", target: request.params.id, result: "success" });
    return { success: true };
  });
  app.get("/api/mobile/application", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.MONITOR_READ)) return;
    return { name: "Another Game More", status: "online", node: process.version, uptimeSeconds: Math.floor(process.uptime()), database: "SQLite local" };
  });
  app.get("/api/mobile/server/status", async (request, reply) => {
    if (!permission(request, reply, PERMISSIONS.MONITOR_READ)) return;
    return { system: await systemSnapshot(path.dirname(config.databasePath)), events: db.prepare("SELECT type, message, created_at AS createdAt FROM server_events ORDER BY created_at DESC LIMIT 20").all() };
  });
  for (const action of ["restart", "shutdown"]) app.post(`/api/mobile/server/${action}`, async (request, reply) => {
    const identity = permission(request, reply, PERMISSIONS.SERVER_CONTROL); if (!identity) return;
    if (!requireRateLimit(reply, limiter, `server-${action}`, request, 2, 3_600_000, identity.user.id)) return;
    const type = action === "restart" ? "REMOTE_RESTART" : "SERVER_SHUTDOWN";
    const eventId = crypto.randomUUID();
    db.prepare("INSERT INTO server_events (id, type, message, metadata) VALUES (?, ?, ?, ?)").run(eventId, type, `Solicitud remota de ${action}.`, JSON.stringify({ userId: identity.user.id, sessionId: identity.session.id }));
    try {
      await hostControl.send(action);
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, deviceName: identity.session.device_name, action: `server_${action}`, result: "success" });
      return { success: true, accepted: true };
    } catch (error) {
      audit.record({ userId: identity.user.id, mobileSessionId: identity.session.id, action: `server_${action}`, result: "failure" });
      return reply.code(503).send({ error: error.message });
    }
  });
}
