import { bulkMessage, donationMessage, getAvatarUrl, sendDiscord, singleMessage } from "../services/discord.js";
import { readCurrentStats, updateWeeklyStats } from "../services/stats.js";
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

  const stats = (await readCurrentStats(env)) || {};
  const number = isDonation ? (stats.donations || 0) + 1 : isSingle ? (stats.single || 0) + 1 : (stats.bulk || 0) + 1;
  const avatar = await getAvatarUrl(data.userId);

  if (isDonation) await sendDiscord(env.DONATION_WEBHOOK, donationMessage(data, avatar, number));

  else if (isSingle) await sendDiscord(env.SINGLE_ITEM_WEBHOOK, singleMessage(data, avatar, number));

  else await sendDiscord(env.BULK_ITEMS_WEBHOOK, bulkMessage(data, avatar, number));

  return json({ success: true });
  
}