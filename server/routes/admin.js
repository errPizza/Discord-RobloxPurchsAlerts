import { getRobloxUserProfile } from "../services/roblox.js";
import { requireRateLimit, sameOriginMutation } from "../services/security.js";
import { publicUser } from "../services/auth.js";

function adminSession(request, auth) {
  const session = auth.getSession(request);
  return session && ["admin", "owner"].includes(session.role) ? session : null;
}

export function registerAdminRoutes(app, services) {
  const { db, auth, config, limiter, stats, events, audit } = services;
  const guard = (request, reply, { owner = false, mutation = false } = {}) => {
    const user = adminSession(request, auth);
    if (!user) { reply.code(401).send({ error: "Esta sección es solo para administradores." }); return null; }
    if (owner && user.role !== "owner") { reply.code(403).send({ error: "Solo el propietario puede realizar esta acción." }); return null; }
    if (mutation && !sameOriginMutation(request, config.publicOrigin)) { reply.code(403).send({ error: "Origen de la petición no permitido." }); return null; }
    if (!requireRateLimit(reply, limiter, "admin", request, 300, 60_000, user.id)) return null;
    return user;
  };

  app.get("/api/admin/stats", async (request, reply) => {
    if (!guard(request, reply)) return;
    const history = stats.history();
    const currentWeek = stats.getCurrent()?.week || new Date().getUTCFullYear() + "-W1";
    const requested = request.query?.week;
    const selected = stats.getWeekly(requested) || stats.getWeekly(currentWeek) || history.at(-1) || { week: requested || currentWeek, spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };
    return { stats: selected, weeks: history.map((item) => item.week), currentWeek };
  });

  app.put("/api/admin/stats/:week", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    const week = request.params.week;
    if (!/^\d{4}-W(?:[1-9]|[1-4]\d|5[0-3])$/.test(week)) return reply.code(400).send({ error: "Semana no válida." });
    const values = {};
    for (const key of ["spent", "revenue", "single", "bulk", "donations"]) {
      const value = Number(request.body?.data?.[key]);
      if (!Number.isSafeInteger(value) || value < 0) return reply.code(400).send({ error: `${key} debe ser un entero no negativo.` });
      values[key] = value;
    }
    const result = stats.replaceWeek(week, values);
    audit.record({ userId: user.id, action: "stats_replace", target: week, result: "success" });
    return { success: true, stats: result };
  });

  app.get("/api/admin/analytics", async (request, reply) => {
    if (!guard(request, reply)) return;
    return { analytics: stats.analytics() };
  });
  app.get("/api/admin/games", async (request, reply) => {
    if (!guard(request, reply)) return;
    const analytics = stats.gameAnalytics(request.query?.game || "Clothing");
    if (!analytics) return reply.code(404).send({ error: "El juego solicitado no existe." });
    reply.header("Cache-Control", "private, no-store, max-age=0");
    return { analytics };
  });
  app.get("/api/admin/games/events", { websocket: true }, (socket, request) => {
    const user = adminSession(request, auth);
    const game = request.query?.game || "Clothing";
    if (!user || !events.connect(game, socket)) return socket.close(1008, "No autorizado o juego inválido.");
  });

  app.get("/api/admin/worker", async (request, reply) => {
    if (!guard(request, reply)) return;
    return { enabled: db.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").get()?.value !== "0" };
  });
  app.put("/api/admin/worker", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    const enabled = request.body?.data?.enabled;
    if (typeof enabled !== "boolean") return reply.code(400).send({ error: "El estado debe ser verdadero o falso." });
    db.prepare("INSERT INTO site_settings (key, value) VALUES ('worker_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(enabled ? "1" : "0");
    audit.record({ userId: user.id, action: "discord_notifications_toggle", result: "success", metadata: { enabled } });
    return { success: true, enabled };
  });

  app.get("/api/admin/worker/blocked-users", async (request, reply) => {
    if (!guard(request, reply)) return;
    return { users: db.prepare("SELECT user_id AS userId, created_at AS createdAt FROM discord_message_blocklist ORDER BY created_at DESC, user_id").all() };
  });
  app.post("/api/admin/worker/blocked-users", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    const userId = String(request.body?.data?.userId || "").trim();
    if (!/^[1-9]\d{0,19}$/.test(userId)) return reply.code(400).send({ error: "El UserId debe ser numérico y mayor que cero." });
    db.prepare("INSERT OR IGNORE INTO discord_message_blocklist (user_id) VALUES (?)").run(userId);
    const blocked = db.prepare("SELECT user_id AS userId, created_at AS createdAt FROM discord_message_blocklist WHERE user_id = ?").get(userId);
    audit.record({ userId: user.id, action: "discord_user_block", target: userId, result: "success" });
    return reply.code(201).send({ success: true, user: blocked });
  });
  app.get("/api/admin/worker/blocked-users/:userId/profile", async (request, reply) => {
    if (!guard(request, reply)) return;
    if (!/^[1-9]\d{0,19}$/.test(request.params.userId)) return reply.code(400).send({ error: "UserId no válido." });
    const profile = await getRobloxUserProfile(request.params.userId);
    return profile ? { profile } : reply.code(404).send({ error: "Roblox no encontró información para este UserId." });
  });
  app.delete("/api/admin/worker/blocked-users/:userId", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    db.prepare("DELETE FROM discord_message_blocklist WHERE user_id = ?").run(request.params.userId);
    audit.record({ userId: user.id, action: "discord_user_unblock", target: request.params.userId, result: "success" });
    return { success: true };
  });

  app.get("/api/admin/database", async (request, reply) => {
    if (!guard(request, reply)) return;
    const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    return { engine: "SQLite local", overview: { users: count("users"), contacts: count("contacts"), weeklyStatsRecords: count("weekly_stats"), gameStatEvents: count("game_stat_events") }, currentWeek: stats.getCurrent()?.week || null, weeklyRecord: stats.getCurrent() || null };
  });

  app.get("/api/admin/promote/users", async (request, reply) => {
    if (!guard(request, reply, { owner: true })) return;
    const query = String(request.query?.query || "").trim().slice(0, 120);
    const rows = query ? db.prepare("SELECT id, email, role, display_name AS displayName, created_at AS createdAt FROM users WHERE email LIKE ? COLLATE NOCASE ORDER BY email LIMIT 50").all(`%${query}%`) : db.prepare("SELECT id, email, role, display_name AS displayName, created_at AS createdAt FROM users ORDER BY email LIMIT 50").all();
    return { users: rows.map((row) => ({ ...row, ...publicUser(row) })) };
  });
  app.get("/api/admin/promote/users/:id", async (request, reply) => {
    const owner = guard(request, reply, { owner: true }); if (!owner) return;
    const profile = db.prepare(`SELECT u.id, u.email, u.role, u.display_name AS displayName, u.created_at AS createdAt,
      (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id) AS sessionCount FROM users u WHERE u.id = ?`).get(Number(request.params.id));
    if (!profile) return reply.code(404).send({ error: "Usuario no encontrado." });
    return { user: { ...profile, isOwner: profile.id === owner.id, isCurrent: profile.id === owner.id } };
  });
  app.put("/api/admin/promote/users/:id", async (request, reply) => {
    const owner = guard(request, reply, { owner: true, mutation: true }); if (!owner) return;
    const id = Number(request.params.id); const user = db.prepare("SELECT id, email, role, display_name FROM users WHERE id = ?").get(id);
    if (!user) return reply.code(404).send({ error: "Usuario no encontrado." });
    if (user.role !== "owner") db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(id);
    const promoted = db.prepare("SELECT id, email, role, display_name FROM users WHERE id = ?").get(id);
    audit.record({ userId: owner.id, action: "user_promote", target: String(id), result: "success" });
    return { success: true, user: { ...promoted, displayName: promoted.display_name } };
  });
  app.delete("/api/admin/promote/users/:id", async (request, reply) => {
    const owner = guard(request, reply, { owner: true, mutation: true }); if (!owner) return;
    const id = Number(request.params.id); const user = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(id);
    if (!user) return reply.code(404).send({ error: "Usuario no encontrado." });
    if (user.id === owner.id || user.role === "owner") return reply.code(409).send({ error: "La cuenta propietaria no se puede eliminar." });
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    audit.record({ userId: owner.id, action: "user_delete", target: String(id), result: "success" });
    return { success: true, deletedUser: { id: user.id, email: user.email } };
  });

  app.get("/api/admin/mobile/sessions", async (request, reply) => {
    if (!guard(request, reply)) return;
    return { sessions: db.prepare(`SELECT ms.id, ms.user_id AS userId, u.email, ms.device_name AS deviceName, ms.platform,
      ms.app_version AS appVersion, ms.status, ms.requested_at AS requestedAt, ms.approved_at AS approvedAt,
      ms.last_seen_at AS lastSeenAt FROM mobile_sessions ms JOIN users u ON u.id = ms.user_id
      ORDER BY ms.requested_at DESC LIMIT 100`).all() };
  });
  app.post("/api/admin/mobile/sessions/:id/approve", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    const session = db.prepare("SELECT id, device_name FROM mobile_sessions WHERE id = ?").get(request.params.id);
    if (!session) return reply.code(404).send({ error: "Sesión no encontrada." });
    db.prepare("UPDATE mobile_sessions SET status = 'approved', approved_at = unixepoch(), approved_by = ?, revoked_at = NULL, revoked_by = NULL WHERE id = ?").run(user.id, session.id);
    audit.record({ userId: user.id, mobileSessionId: session.id, deviceName: session.device_name, action: "mobile_session_approve", result: "success" });
    return { success: true, session: { id: session.id, status: "approved" } };
  });
  app.post("/api/admin/mobile/sessions/:id/revoke", async (request, reply) => {
    const user = guard(request, reply, { mutation: true }); if (!user) return;
    const session = db.prepare("SELECT id, device_name FROM mobile_sessions WHERE id = ?").get(request.params.id);
    if (!session) return reply.code(404).send({ error: "Sesión no encontrada." });
    db.transaction(() => {
      db.prepare("UPDATE mobile_sessions SET status = 'revoked', revoked_at = unixepoch(), revoked_by = ? WHERE id = ?").run(user.id, session.id);
      db.prepare("UPDATE mobile_refresh_tokens SET revoked_at = unixepoch() WHERE mobile_session_id = ? AND revoked_at IS NULL").run(session.id);
    })();
    audit.record({ userId: user.id, mobileSessionId: session.id, deviceName: session.device_name, action: "mobile_session_revoke", result: "success" });
    return { success: true };
  });
}
