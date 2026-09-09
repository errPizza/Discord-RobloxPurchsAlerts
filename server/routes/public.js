import { bulkMessage, donationMessage, sendDiscord, singleMessage } from "../services/discord.js";
import { getAvatarUrl, getGroupIconUrl, getItemThumbnailUrl } from "../services/roblox.js";
import { cleanText, requireRateLimit, validSecret, verifyWebhookSignature } from "../services/security.js";
import { changesForStatsPayload } from "../services/stats.js";

const MAX_ROBUX = 1_000_000_000;

function integer(value, label, maximum = MAX_ROBUX) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) throw new Error(`${label} debe ser un número entero válido.`);
  return parsed;
}

function userId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!/^[1-9]\d{0,19}$/.test(String(value))) throw new Error("userId no es válido.");
  return String(value);
}

function eventId(data, signature) {
  const value = String(data.eventId || "").trim();
  if (value && !/^[A-Za-z0-9:_-]{8,128}$/.test(value)) throw new Error("eventId no es válido.");
  return signature.nonce || value || null;
}

function validateStats(data) {
  userId(data.userId);
  if (!["Donation", "Single", "Bulk"].includes(data.type)) throw new Error("type debe ser Donation, Single o Bulk.");
  if (data.type === "Donation") integer(data.amount, "amount");
  if (data.type === "Single") { integer(data.price, "price"); integer(data.creatorId ?? 0, "creatorId", Number.MAX_SAFE_INTEGER); }
  if (data.type === "Bulk") {
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new Error("items debe contener entre 1 y 100 elementos.");
    data.items.forEach((item) => { integer(item?.price ?? data.price, "item.price"); integer(item?.creatorId ?? 0, "item.creatorId", Number.MAX_SAFE_INTEGER); });
  }
}

function validateMessage(data, kind) {
  userId(data.userId);
  cleanText(data.displayName, 80);
  cleanText(data.username, 80);
  if (kind === "donation") integer(data.amount, "amount");
  if (kind === "item") {
    if (!data.item || typeof data.item !== "object" || Array.isArray(data.item)) throw new Error("item es obligatorio.");
    cleanText(data.item.name, 160); cleanText(data.item.id, 40); integer(data.item.price, "item.price"); integer(data.item.revenue ?? 0, "item.revenue");
  }
  if (kind === "bulk") {
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 25) throw new Error("items debe contener entre 1 y 25 elementos.");
    data.items.forEach((item) => { cleanText(item?.name, 160); integer(item?.price, "item.price"); integer(item?.revenue ?? 0, "item.revenue"); });
    integer(data.totalRobux, "totalRobux"); integer(data.totalRevenue, "totalRevenue");
  }
}

export function registerPublicRoutes(app, services) {
  const { db, config, limiter, stats, events, audit } = services;
  const claim = db.prepare("INSERT OR IGNORE INTO webhook_events (scope, event_id) VALUES (?, ?)");
  const insertEvent = db.prepare(`INSERT OR IGNORE INTO game_stat_events (game_key, event_type, spent, revenue, single_count, bulk_count, donations, devproduct_normal_count, devproduct_gift_count, gamepass_normal_count, gamepass_gift_count, user_id, source_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const enabled = () => db.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").get()?.value !== "0";
  const blocked = db.prepare("SELECT 1 FROM discord_message_blocklist WHERE user_id = ?");

  async function clothing(request, reply, kind) {
    if (!requireRateLimit(reply, limiter, "webhook:clothing", request, 1_200, 60_000)) return;
    const { data = {}, raw = "" } = request.body || {};
    const secret = kind === "donation" ? config.donationSecret : kind === "stats" ? config.statsSecret : config.itemsSecret;
    if (!validSecret(request, data.secret, secret)) return reply.code(401).send({ success: false, error: "No autorizado." });
    const signature = verifyWebhookSignature(request, raw, secret, config.requireSignedWebhooks);
    if (!signature.valid) return reply.code(401).send({ success: false, error: "Firma de petición inválida o expirada." });
    let sourceEventId;
    try { sourceEventId = eventId(data, signature); if (kind === "stats") validateStats(data); else validateMessage(data, kind); }
    catch (error) { return reply.code(400).send({ success: false, error: error.message }); }
    const scope = `/games/Clothing/${kind}`;
    if (sourceEventId && claim.run(scope, sourceEventId).changes === 0) return { success: true, duplicate: true, recorded: false, messageSent: false };
    if (kind === "stats") {
      const weekly = stats.update(data);
      const changes = changesForStatsPayload(data);
      const inserted = insertEvent.run("Clothing", `clothing_${String(data.type).toLowerCase()}`, changes.spent, changes.revenue, changes.single, changes.bulk, changes.donations, 0, 0, 0, 0, data.userId ? String(data.userId) : null, sourceEventId).changes > 0;
      if (inserted) events.notify("Clothing");
      return { success: true, game: "Clothing", recorded: inserted, messageSent: false, stats: weekly };
    }
    if (!enabled()) return { success: true, workerEnabled: false, messageSent: false };
    if (data.userId && blocked.get(String(data.userId))) return { success: true, workerEnabled: true, messageSent: false, ignoredReason: "blocked_user" };
    const current = stats.getCurrent() || { donations: 0, single: 0, bulk: 0 };
    const [avatar, brandImage, itemImage] = await Promise.all([getAvatarUrl(data.userId), getGroupIconUrl(), kind === "item" ? getItemThumbnailUrl(data.item) : null]);
    if (kind === "donation") await sendDiscord(config.donationWebhook, donationMessage(data, avatar, Number(current.donations) + 1, brandImage));
    if (kind === "item") await sendDiscord(config.singleItemWebhook, singleMessage(data, avatar, Number(current.single) + 1, itemImage, brandImage));
    if (kind === "bulk") await sendDiscord(config.bulkItemsWebhook, bulkMessage(data, avatar, Number(current.bulk) + 1, brandImage));
    audit.log({ service: "webhook", level: "INFO", message: `Mensaje Discord enviado: ${kind}`, requestId: request.id });
    return { success: true, workerEnabled: true, messageSent: true };
  }

  async function missile(request, reply, eventType, metric) {
    if (!requireRateLimit(reply, limiter, "webhook:missile", request, 1_200, 60_000)) return;
    const { data = {}, raw = "" } = request.body || {};
    if (!validSecret(request, data.secret, config.bombGameSecret)) return reply.code(401).send({ success: false, error: "No autorizado." });
    const signature = verifyWebhookSignature(request, raw, config.bombGameSecret, config.requireSignedWebhooks);
    if (!signature.valid) return reply.code(401).send({ success: false, error: "Firma de petición inválida o expirada." });
    try {
      const source = eventId(data, signature); const id = userId(data.userId ?? data.player?.userId); const amount = integer(data.amount ?? data.price ?? data.robux ?? data.value ?? data.productPrice ?? data.product?.price ?? 0, "amount"); const revenue = integer(data.revenue ?? data.received ?? data.net ?? amount, "revenue");
      if (source && claim.run(`/games/Missile/${eventType}`, source).changes === 0) return { success: true, duplicate: true, recorded: false, messageSent: false };
      const counters = { devProductNormal: 0, devProductGift: 0, gamepassNormal: 0, gamepassGift: 0 }; counters[metric] = 1;
      const inserted = insertEvent.run("Missile", eventType, amount, revenue, 0, 0, 0, counters.devProductNormal, counters.devProductGift, counters.gamepassNormal, counters.gamepassGift, id, source).changes > 0;
      if (inserted) events.notify("Missile");
      return { success: true, game: "Missile", eventType, recorded: inserted, messageSent: false };
    } catch (error) { return reply.code(400).send({ success: false, error: error.message }); }
  }

  for (const [path, kind] of [["/games/Clothing/donation", "donation"], ["/games/Clothing/item", "item"], ["/games/Clothing/bulk", "bulk"], ["/games/Clothing/stats", "stats"], ["/", "donation"], ["/item", "item"], ["/bulk", "bulk"], ["/stats", "stats"]]) app.post(path, (request, reply) => clothing(request, reply, kind));
  for (const [path, type, metric] of [["/games/Missile/DevProduct/Normal", "missile_devproduct_normal", "devProductNormal"], ["/games/Missile/DevProduct/Gift", "missile_devproduct_gift", "devProductGift"], ["/games/Missile/Gamepass/Normal", "missile_gamepass_normal", "gamepassNormal"], ["/games/Missile/Gamepass/Gift", "missile_gamepass_gift", "gamepassGift"]]) app.post(path, (request, reply) => missile(request, reply, type, metric));
}
