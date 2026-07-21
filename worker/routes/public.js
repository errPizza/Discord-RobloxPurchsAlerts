import { bulkMessage, donationMessage, sendDiscord, singleMessage } from "../services/discord.js";
import { getAvatarUrl, getGroupIconUrl, getItemThumbnailUrl } from "../services/roblox.js";
import { readCurrentStats, updateWeeklyStats } from "../services/stats.js";
import { getWorkerEnabled, isDiscordUserBlocked } from "../database/database.js";
import { json, methodNotAllowed, unauthorized } from "../utils/response.js";

export async function handlePublicWebhook(request, env, pathname) {

  if (request.method !== "POST") return methodNotAllowed();

  const data = await request.json();
  const isDonation = pathname === "/";
  const isSingle = pathname === "/item";
  const isBulk = pathname === "/bulk";
  const isStats = pathname === "/stats";

  if (!isDonation && !isSingle && !isBulk && !isStats) return new Response("Invalid Route", { status: 404 });

  const secret = isDonation ? env.DONATION_SECRET : isStats ? env.STATS_SECRET : env.ITEMS_SECRET;

  if (!secret || data.secret !== secret) return unauthorized();

  if (isStats) { await updateWeeklyStats(env, data); return json({ success: true }); }

  if (!(await getWorkerEnabled(env))) return json({ success: true, workerEnabled: false, messageSent: false });

  const userId = String(data.userId || "").trim();

  if (userId && await isDiscordUserBlocked(env, userId)) return json({ success: true, workerEnabled: true, messageSent: false, ignoredReason: "blocked_user" });

  const stats = (await readCurrentStats(env)) || {};
  const number = isDonation ? (stats.donations || 0) + 1 : isSingle ? (stats.single || 0) + 1 : (stats.bulk || 0) + 1;
  const [avatar, brandImage, itemImage] = await Promise.all([
    getAvatarUrl(data.userId),
    getGroupIconUrl(),
    isSingle ? getItemThumbnailUrl(data.item) : null,
  ]);

  if (isDonation) await sendDiscord(env.DONATION_WEBHOOK, donationMessage(data, avatar, number, brandImage));

  else if (isSingle) await sendDiscord(env.SINGLE_ITEM_WEBHOOK, singleMessage(data, avatar, number, itemImage, brandImage));

  else await sendDiscord(env.BULK_ITEMS_WEBHOOK, bulkMessage(data, avatar, number, brandImage));

  return json({ success: true, workerEnabled: true, messageSent: true });
  
}
