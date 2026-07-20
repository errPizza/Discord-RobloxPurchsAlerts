import { getDatabaseOverview, getWeeklyStats, getWorkerEnabled, setWorkerEnabled } from "../database/database.js";
import { getAnalytics } from "../services/analytics.js";
import { emptyStats, getWeekKey } from "../services/stats.js";
import { requireAdmin } from "./auth.js";
import { json } from "../utils/response.js";

export async function handleAdmin(request, env, pathname) {

  if (!(await requireAdmin(request, env))) return json({ error: "Esta sección es solo para administradores." }, { status: 401 });

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
