import { getWeeklyStats, incrementDailyStats, incrementWeeklyStats } from "../database/database.js";

export const MY_CREATOR_ID = 802409113;

export function getWeekKey(date = new Date()) {
    
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.valueOf() - start.valueOf()) / 86400000);
  const week = Math.ceil((day + start.getUTCDay() + 1) / 7);

  return `${date.getUTCFullYear()}-W${week}`;
}

export function getDayKey(date = new Date()) {

  return date.toISOString().slice(0, 10);
}

export function normalizePrice(price, isPlusPlayer) {

  const value = Number(price) || 0;

  return isPlusPlayer && value >= 10 ? Math.round(value / 0.9) : value;
}

export function changesForStatsPayload(payload) {

  const changes = {};

  if (payload.type === "Donation") {

    const amount = Number(payload.amount) || 0;

    changes.spent = amount;
    changes.revenue = Math.floor(amount * 0.7);
    changes.donations = 1;

  } else if (payload.type === "Single") {

    const price = normalizePrice(payload.price, payload.isPlusPlayer);

    changes.spent = price;
    changes.revenue = Math.floor(price * (payload.creatorId === MY_CREATOR_ID ? 0.7 : 0.4));
    changes.single = 1;

  } else if (payload.type === "Bulk") {

    let spent = 0;
    let revenue = 0;

    for (const item of payload.items || []) {

      const price = normalizePrice(item.price ?? payload.price, payload.isPlusPlayer);

      spent += price;
      revenue += Math.floor(price * (item.creatorId === MY_CREATOR_ID ? 0.7 : 0.4));

    }

    changes.spent = spent;
    changes.revenue = revenue;
    changes.bulk = 1;
  }

  return changes;
}

export async function readCurrentStats(env) {

  return getWeeklyStats(env, getWeekKey());
}

export async function updateWeeklyStats(env, payload) {

  const weekKey = getWeekKey();
  const changes = changesForStatsPayload(payload);

  const weeklyStats = await incrementWeeklyStats(env, weekKey, changes);

  await incrementDailyStats(env, getDayKey(), changes);

  await syncLegacyStats(env, weeklyStats);

  return weeklyStats;
}

export async function syncLegacyStats(env, weeklyStats) {

  if (!env.WEEKLY_STATS || !weeklyStats?.week) return;

  const createdAt = Number(weeklyStats.createdAt) || Date.now();
  const legacyRecord = { ...weeklyStats, createdAt: createdAt < 1e12 ? createdAt * 1000 : createdAt };

  try { await env.WEEKLY_STATS.put(weeklyStats.week, JSON.stringify(legacyRecord)); }
  catch (error) { console.error("[WEEKLY_STATS_SYNC]", error); }
}

export function emptyStats(week = getWeekKey()) {

  return { week, spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };
}
