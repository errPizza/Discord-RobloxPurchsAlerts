import { bulkMessage, donationMessage, sendDiscord, singleMessage } from "../services/discord.js";
import { getAvatarUrl, getGroupIconUrl, getItemThumbnailUrl } from "../services/roblox.js";
import { readCurrentStats, updateWeeklyStats } from "../services/stats.js";
import { claimWebhookEvent, getWorkerEnabled, isDiscordUserBlocked } from "../database/database.js";
import { consumeRateLimit, rateLimited, readJsonBody, signedWebhooksRequired, validSecret, validationError, verifyWebhookSignature } from "../services/security.js";
import { json, methodNotAllowed, unauthorized } from "../utils/response.js";

const MAX_ROBUX = 1_000_000_000;

function integer(value, label, maximum = MAX_ROBUX) {

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) throw new Error(`${label} debe ser un número entero entre 0 y ${maximum.toLocaleString()}.`);

  return parsed;
}

function validateUserId(value) {

  if (value === undefined || value === null || value === "") return;
  if (!/^[1-9]\d{0,19}$/.test(String(value))) throw new Error("userId no es válido.");
}

function validateText(value, label, maximum, required = true) {

  const normalized = String(value ?? "").trim();

  if (required && !normalized) throw new Error(`${label} es obligatorio.`);
  if (normalized.length > maximum) throw new Error(`${label} supera ${maximum} caracteres.`);
}

function validateMessagePayload(data, type) {

  validateUserId(data.userId);
  validateText(data.displayName, "displayName", 80);
  validateText(data.username, "username", 80);

  if (data.isStudio !== undefined && typeof data.isStudio !== "boolean") throw new Error("isStudio debe ser verdadero o falso.");

  if (type === "Donation") integer(data.amount, "amount");

  if (type === "Single") {
    if (!data.item || typeof data.item !== "object" || Array.isArray(data.item)) throw new Error("item es obligatorio.");

    validateText(data.item.name, "item.name", 160);
    validateText(data.item.id, "item.id", 40);
    integer(data.item.price, "item.price");
    integer(data.item.revenue ?? 0, "item.revenue");

    const percent = Number(data.item.percent ?? 0);

    if (!Number.isFinite(percent) || percent < 0 || percent > 1) throw new Error("item.percent debe estar entre 0 y 1.");
  }

  if (type === "Bulk") {
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 25) throw new Error("items debe contener entre 1 y 25 elementos.");

    for (const item of data.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Cada item debe ser un objeto.");

      validateText(item.name, "item.name", 160);
      integer(item.price, "item.price");
      integer(item.revenue ?? 0, "item.revenue");
    }

    integer(data.itemCount ?? data.items.length, "itemCount", 25);
    integer(data.totalRobux, "totalRobux");
    integer(data.totalRevenue, "totalRevenue");
  }
}

function validateStatsPayload(data) {

  validateUserId(data.userId);

  if (!new Set(["Donation", "Single", "Bulk"]).has(data.type)) throw new Error("type debe ser Donation, Single o Bulk.");
  if (data.isPlusPlayer !== undefined && typeof data.isPlusPlayer !== "boolean") throw new Error("isPlusPlayer debe ser verdadero o falso.");

  if (data.type === "Donation") integer(data.amount, "amount");
  if (data.type === "Single") {
    integer(data.price, "price");
    integer(data.creatorId ?? 0, "creatorId", Number.MAX_SAFE_INTEGER);
  }
  if (data.type === "Bulk") {
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new Error("items debe contener entre 1 y 100 elementos.");

    for (const item of data.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Cada item debe ser un objeto.");

      integer(item.price ?? data.price, "item.price");
      integer(item.creatorId ?? 0, "item.creatorId", Number.MAX_SAFE_INTEGER);
    }
  }
}

export async function handlePublicWebhook(request, env, pathname) {

  const isDonation = pathname === "/";
  const isSingle = pathname === "/item";
  const isBulk = pathname === "/bulk";
  const isStats = pathname === "/stats";

  if (!isDonation && !isSingle && !isBulk && !isStats) return new Response("Invalid Route", { status: 404 });
  if (request.method !== "POST") return methodNotAllowed();

  let body;

  try { body = await readJsonBody(request, 128 * 1024); } catch (error) { return validationError(error); }

  const { data, raw } = body;

  const secret = isDonation ? env.DONATION_SECRET : isStats ? env.STATS_SECRET : env.ITEMS_SECRET;

  if (!validSecret(request, data.secret, secret)) return unauthorized();

  const signature = await verifyWebhookSignature(request, raw, secret, signedWebhooksRequired(env));

  if (!signature.valid) return json({ success: false, error: "Firma de petición inválida o expirada." }, { status: 401 });
  if (!(await consumeRateLimit(env.WEBHOOK_RATE_LIMITER, request, pathname))) return rateLimited();

  const eventId = String(data.eventId || "").trim();

  if (eventId && !/^[A-Za-z0-9:_-]{8,128}$/.test(eventId)) return json({ success: false, error: "eventId no es válido." }, { status: 400 });

  const deduplicationId = signature.nonce || eventId;

  if (isStats) {
    try { validateStatsPayload(data); } catch (error) { return json({ success: false, error: error.message }, { status: 400 }); }

    if (deduplicationId && !(await claimWebhookEvent(env, pathname, deduplicationId))) return json({ success: true, duplicate: true, messageSent: false });

    await updateWeeklyStats(env, data);

    return json({ success: true });
  }

  try { validateUserId(data.userId); } catch (error) { return json({ success: false, error: error.message }, { status: 400 }); }

  if (!(await getWorkerEnabled(env))) return json({ success: true, workerEnabled: false, messageSent: false });

  const userId = String(data.userId || "").trim();

  if (userId && await isDiscordUserBlocked(env, userId)) return json({ success: true, workerEnabled: true, messageSent: false, ignoredReason: "blocked_user" });

  try { validateMessagePayload(data, isDonation ? "Donation" : isSingle ? "Single" : "Bulk"); }
  catch (error) { return json({ success: false, error: error.message }, { status: 400 }); }

  if (deduplicationId && !(await claimWebhookEvent(env, pathname, deduplicationId))) return json({ success: true, duplicate: true, messageSent: false });

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
