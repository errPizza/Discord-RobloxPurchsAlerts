import { getWeeklyStats } from "../database/database.js";
import { emptyStats, getWeekKey } from "../services/stats.js";
import { requireAdmin } from "./auth.js";
import { json } from "../utils/response.js";

export async function handleAdmin(request, env, pathname) {

  if (!(await requireAdmin(request, env))) return json({ error: "Esta sección es solo para administradores." }, { status: 401 });

  if (pathname === "/api/admin/stats" && request.method === "GET") {

    const week = new URL(request.url).searchParams.get("week") || getWeekKey();

    return json({ stats: (await getWeeklyStats(env, week)) || emptyStats(week) });
  }

  if (pathname === "/api/admin/database" && request.method === "GET") {

    return json({ namespace: "WEEKLY_STATS", currentWeek: getWeekKey(), weeklyRecord: await getWeeklyStats(env, getWeekKey()), note: "La capa database está preparada para migrar a D1 cuando se necesiten usuarios, contactos y ajustes editables." });
  }
  
  return json({ error: "Ruta de administración no encontrada." }, { status: 404 });
}
