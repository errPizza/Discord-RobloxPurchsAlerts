import { getWeeklyStats, saveWeeklyStats } from "../database/database.js";

export const MY_CREATOR_ID = 802409113;

export function getWeekKey(date = new Date()) {
    
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.valueOf() - start.valueOf()) / 86400000);
  const week = Math.ceil((day + start.getUTCDay() + 1) / 7);

  return `${date.getUTCFullYear()}-W${week}`;
}

export function normalizePrice(price, isPlusPlayer) {

  const value = Number(price) || 0;

  return isPlusPlayer && value >= 10 ? Math.round(value / 0.9) : value;
}

export async function readCurrentStats(env) {

  return getWeeklyStats(env, getWeekKey());
}

export async function updateWeeklyStats(env, payload) {

  const weekKey = getWeekKey();
  let stats;

  try {
    stats = await getWeeklyStats(env, weekKey);
  } catch (error) {
    console.error("[STATS] Error al leer KV", error);
  }

  stats ||= { week: weekKey, createdAt: Date.now(), spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };

  if (payload.type === "Donation") {

    const amount = Number(payload.amount) || 0;

    stats.spent += amount;
    stats.revenue += Math.floor(amount * 0.7);
    stats.donations++;

  } else if (payload.type === "Single") {

    const price = normalizePrice(payload.price, payload.isPlusPlayer);

    stats.spent += price;
    stats.revenue += Math.floor(price * (payload.creatorId === MY_CREATOR_ID ? 0.7 : 0.4));
    stats.single++;

  } else if (payload.type === "Bulk") {

    let spent = 0;
    let revenue = 0;

    for (const item of payload.items || []) {

      const price = normalizePrice(item.price ?? payload.price, payload.isPlusPlayer);

      spent += price;
      revenue += Math.floor(price * (item.creatorId === MY_CREATOR_ID ? 0.7 : 0.4));

    }

    stats.spent += spent;
    stats.revenue += revenue;
    stats.bulk++;

  }

  await saveWeeklyStats(env, weekKey, stats);

  return stats;
}

export function emptyStats(week = getWeekKey()) {

  return { week, spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };
}
