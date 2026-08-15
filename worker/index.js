import { handleAdmin } from "./routes/admin.js";
import { handleAuth } from "./routes/auth.js";
import { handlePublicWebhook } from "./routes/public.js";
import { getWeekKey } from "./services/stats.js";
import { sendDiscord, weeklySummary } from "./services/discord.js";
import { getAvatarUrls, getGroupIconUrl } from "./services/roblox.js";
import { getPublicSite, getWeeklyStats } from "./database/database.js";
import { getWorkerEnabled } from "./database/database.js";
import { applySecurityHeaders } from "./services/security.js";
import { json } from "./utils/response.js";

export { GameAnalyticsEvents } from "./services/game-events.js";

export default {

  async fetch(request, env) {

    const { pathname } = new URL(request.url);
    const requestId = crypto.randomUUID();

    try {

      let response;

      if (pathname.startsWith("/api/auth/")) response = (await handleAuth(request, env, pathname)) || json({ error: "Ruta no encontrada." }, { status: 404 });

      else if (pathname.startsWith("/api/admin/")) response = await handleAdmin(request, env, pathname);

      else if (request.method === "GET" && pathname === "/api/site") {

        const site = await getPublicSite(env);
        const userIds = site.contacts.map((contact) => contact.robloxUserId).filter(Boolean);

        response = json({ ...site, avatars: await getAvatarUrls(userIds) }, {
          headers: { "Cache-Control": "private, no-cache, max-age=0" },
        });
      }

      else if (request.method === "GET" && pathname === "/api/status") {

        const enabled = await getWorkerEnabled(env);

        response = json({ name: "Another Game More API", status: enabled ? "online" : "paused", messagesEnabled: enabled });
      }

      else if (["GET", "HEAD"].includes(request.method) && env.ASSETS) {

        const assetResponse = await env.ASSETS.fetch(request.method === "HEAD" ? new Request(request, { method: "GET" }) : request);

        response = request.method === "HEAD"
          ? new Response(null, { status: assetResponse.status, statusText: assetResponse.statusText, headers: assetResponse.headers })
          : assetResponse;
      }

      else response = await handlePublicWebhook(request, env, pathname);

      return applySecurityHeaders(response, request, requestId);

    } catch (error) {
      console.error(`[REQUEST ${requestId}]`, error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");

      return applySecurityHeaders(json({ success: false, error: "Error interno del Worker.", requestId }, { status: 500 }), request, requestId);
    }

  },

  async scheduled(event, env) {

    if (!(await getWorkerEnabled(env))) return;

    const lastWeek = new Date();

    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);

    const stats = await getWeeklyStats(env, getWeekKey(lastWeek));

    if (stats && env.STATS_WEBHOOK) await sendDiscord(env.STATS_WEBHOOK, weeklySummary(stats, await getGroupIconUrl()));

  },
  
};
