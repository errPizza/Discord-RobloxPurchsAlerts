import { handleAdmin } from "./routes/admin.js";
import { handleAuth } from "./routes/auth.js";
import { handlePublicWebhook } from "./routes/public.js";
import { getWeekKey } from "./services/stats.js";
import { sendDiscord, weeklySummary } from "./services/discord.js";
import { getWeeklyStats } from "./database/database.js";
import { json } from "./utils/response.js";

export default {

  async fetch(request, env) {

    const { pathname } = new URL(request.url);

    try {

      if (pathname.startsWith("/api/auth/")) return (await handleAuth(request, env, pathname)) || json({ error: "Ruta no encontrada." }, { status: 404 });

      if (pathname.startsWith("/api/admin/")) return handleAdmin(request, env, pathname);

      if (request.method === "GET" && pathname === "/") return json({ name: "Another Game More API", status: "online" });

      return handlePublicWebhook(request, env, pathname);

    } catch (error) {
      console.error(error);

      return json({ success: false, error: "Error interno del Worker." }, { status: 500 });
    }

  },

  async scheduled(event, env) {

    const lastWeek = new Date();

    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

    const stats = await getWeeklyStats(env, getWeekKey(lastWeek));

    if (stats && env.STATS_WEBHOOK) await sendDiscord(env.STATS_WEBHOOK, weeklySummary(stats));

  },
  
};