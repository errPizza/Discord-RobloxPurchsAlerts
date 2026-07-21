import { getDatabaseOverview, getWeeklyStats, getWorkerEnabled, listUsers, promoteUser, setWorkerEnabled } from "../database/database.js";
import { getAnalytics } from "../services/analytics.js";
import { emptyStats, getWeekKey } from "../services/stats.js";
import { requireAdmin, requireOwner } from "./auth.js";
import { json } from "../utils/response.js";

export async function handleAdmin(request, env, pathname) {

  if (!(await requireAdmin(request, env))) return json({ error: "Esta sección es solo para administradores." }, { status: 401 });

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

    const week = new URL(request.url).searchParams.get("week") || getWeekKey();

    return json({ stats: (await getWeeklyStats(env, week)) || emptyStats(week) });
  }

  if (pathname === "/api/admin/analytics" && request.method === "GET") return json({ analytics: await getAnalytics(env) });

  if (pathname === "/api/admin/worker" && request.method === "GET") {

    return json({ enabled: await getWorkerEnabled(env) });
  }

  if (pathname === "/api/admin/worker" && request.method === "PUT") {

    let payload;

    try { payload = await request.json(); } catch { return json({ error: "Configuración inválida." }, { status: 400 }); }

    if (typeof payload.enabled !== "boolean") return json({ error: "El estado debe ser verdadero o falso." }, { status: 400 });

    return json({ enabled: await setWorkerEnabled(env, payload.enabled), success: true });
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
