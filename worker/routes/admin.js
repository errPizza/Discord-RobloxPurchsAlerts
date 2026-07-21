import { addDiscordMessageBlock, deleteDiscordMessageBlock, getDatabaseOverview, getWeeklyStats, getWorkerEnabled, listDiscordMessageBlocks, listUsers, promoteUser, replaceWeeklyStats, setWorkerEnabled } from "../database/database.js";
import { getAnalytics, getCompleteWeeklyHistory } from "../services/analytics.js";
import { getRobloxUserProfile } from "../services/roblox.js";
import { emptyStats, getWeekKey, syncLegacyStats } from "../services/stats.js";
import { requireAdmin, requireOwner } from "./auth.js";
import { consumeRateLimit, isSameOriginMutation, rateLimited, readJsonBody, validationError } from "../services/security.js";
import { json } from "../utils/response.js";

export async function handleAdmin(request, env, pathname) {

  const admin = await requireAdmin(request, env);

  if (!admin) return json({ error: "Esta sección es solo para administradores." }, { status: 401 });
  if (!isSameOriginMutation(request)) return json({ error: "Origen de la petición no permitido." }, { status: 403 });
  if (!(await consumeRateLimit(env.ADMIN_RATE_LIMITER, request, pathname, admin.id || admin.email))) return rateLimited();

  if (pathname.startsWith("/api/admin/promote/")) {

    if (!(await requireOwner(request, env))) return json({ error: "Solo el propietario puede administrar roles." }, { status: 403 });

    if (pathname === "/api/admin/promote/users" && request.method === "GET") {
      const query = new URL(request.url).searchParams.get("query") || "";

      return json({ users: await listUsers(env, query) });
    }

    const promoteMatch = pathname.match(/^\/api\/admin\/promote\/users\/(\d+)$/);

    if (promoteMatch && request.method === "PUT") {
      const user = await promoteUser(env, Number(promoteMatch[1]));

      if (!user) return json({ error: "Usuario no encontrado." }, { status: 404 });

      return json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
      });
    }

    return json({ error: "Ruta de promoción no encontrada." }, { status: 404 });
  }

  if (pathname === "/api/admin/stats" && request.method === "GET") {

    const currentWeek = getWeekKey();
    const requestedWeek = new URL(request.url).searchParams.get("week");
    const history = await getCompleteWeeklyHistory(env);
    const selectedWeek = requestedWeek || (history.some((item) => item.week === currentWeek) ? currentWeek : history.at(-1)?.week) || currentWeek;
    const selected = history.find((item) => item.week === selectedWeek) || emptyStats(selectedWeek);

    return json({ stats: selected, weeks: history.map((item) => item.week), currentWeek });
  }

  const statsMatch = pathname.match(/^\/api\/admin\/stats\/(\d{4}-W(?:[1-9]|[1-4]\d|5[0-3]))$/);

  if (statsMatch && request.method === "PUT") {

    let payload;

    try { payload = (await readJsonBody(request, 8192)).data; } catch (error) { return validationError(error, "Los valores enviados no son válidos."); }

    const values = {};

    for (const key of ["spent", "revenue", "single", "bulk", "donations"]) {
      const value = Number(payload[key]);

      if (!Number.isSafeInteger(value) || value < 0) return json({ error: `${key} debe ser un número entero igual o mayor que cero.` }, { status: 400 });

      values[key] = value;
    }

    const stats = await replaceWeeklyStats(env, statsMatch[1], values);

    await syncLegacyStats(env, stats);

    return json({ success: true, stats });
  }

  if (pathname === "/api/admin/analytics" && request.method === "GET") return json({ analytics: await getAnalytics(env) });

  if (pathname === "/api/admin/worker" && request.method === "GET") {

    return json({ enabled: await getWorkerEnabled(env) });
  }

  if (pathname === "/api/admin/worker" && request.method === "PUT") {

    let payload;

    try { payload = (await readJsonBody(request, 4096)).data; } catch (error) { return validationError(error, "Configuración inválida."); }

    if (typeof payload.enabled !== "boolean") return json({ error: "El estado debe ser verdadero o falso." }, { status: 400 });

    return json({ enabled: await setWorkerEnabled(env, payload.enabled), success: true });
  }

  if (pathname === "/api/admin/worker/blocked-users" && request.method === "GET") {

    return json({ users: await listDiscordMessageBlocks(env) });
  }

  if (pathname === "/api/admin/worker/blocked-users" && request.method === "POST") {

    let payload;

    try { payload = (await readJsonBody(request, 4096)).data; } catch (error) { return validationError(error, "El UserId enviado no es válido."); }

    const userId = String(payload.userId || "").trim();

    if (!/^[1-9]\d{0,19}$/.test(userId)) return json({ error: "El UserId debe contener únicamente números y ser mayor que cero." }, { status: 400 });

    return json({ success: true, user: await addDiscordMessageBlock(env, userId) }, { status: 201 });
  }

  const blockedProfileMatch = pathname.match(/^\/api\/admin\/worker\/blocked-users\/([1-9]\d{0,19})\/profile$/);

  if (blockedProfileMatch && request.method === "GET") {

    const profile = await getRobloxUserProfile(blockedProfileMatch[1]);

    if (!profile) return json({ error: "Roblox no encontró información para este UserId." }, { status: 404 });

    return json({ profile });
  }

  const blockedUserMatch = pathname.match(/^\/api\/admin\/worker\/blocked-users\/([1-9]\d{0,19})$/);

  if (blockedUserMatch && request.method === "DELETE") {

    await deleteDiscordMessageBlock(env, blockedUserMatch[1]);

    return json({ success: true });
  }

  if (pathname === "/api/admin/database" && request.method === "GET") {

    const currentWeek = getWeekKey();
    const [overview, weeklyRecord] = await Promise.all([
      getDatabaseOverview(env),
      getWeeklyStats(env, currentWeek),
    ]);

    return json({ engine: "Cloudflare D1", overview, currentWeek, weeklyRecord });
  }
  
  return json({ error: "Ruta de administración no encontrada." }, { status: 404 });
}
