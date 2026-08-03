import { getGameStatBuckets } from "../database/database.js";

export const GAME_CATALOG = [
  {
    key: "Clothing",
    name: "Lacywings Outfits",
    metrics: ["spent", "revenue", "single", "bulk", "donations"],
    activityMetrics: ["single", "bulk", "donations"],
  },
  {
    key: "Missile",
    name: "Missile",
    metrics: ["spent", "revenue", "devProductNormal", "devProductGift", "gamepassNormal", "gamepassGift"],
    activityMetrics: ["devProductNormal", "devProductGift", "gamepassNormal", "gamepassGift"],
  },
];

const PERIODS = [
  { key: "live", title: "En vivo", subtitle: "Actividad de la última hora. Se actualiza cada cinco segundos.", duration: 60 * 60, bucket: 5 * 60, label: "time" },
  { key: "last24Hours", title: "Últimas 24 horas", subtitle: "Actividad agrupada por hora.", duration: 24 * 60 * 60, bucket: 60 * 60, label: "hour" },
  { key: "last7Days", title: "Últimos 7 días", subtitle: "Actividad diaria de la última semana.", duration: 7 * 24 * 60 * 60, bucket: 24 * 60 * 60, label: "day" },
  { key: "last30Days", title: "Último mes", subtitle: "Actividad diaria de los últimos 30 días.", duration: 30 * 24 * 60 * 60, bucket: 24 * 60 * 60, label: "day" },
];

const METRIC_KEYS = [
  "spent",
  "revenue",
  "single",
  "bulk",
  "donations",
  "devProductNormal",
  "devProductGift",
  "gamepassNormal",
  "gamepassGift",
];

function emptyMetrics() {

  return Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
}

function labelForBucket(timestamp, type) {

  const date = new Date(timestamp * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  if (type === "time") return `${hour}:${minute}`;
  if (type === "hour") return `${day}/${month} ${hour}h`;

  return `${day}/${month}`;
}

function completePoints(rows, startTimestamp, endTimestamp, bucketSeconds, labelType) {

  const byBucket = new Map(rows.map((row) => [Number(row.bucket), row]));
  const firstBucket = Math.floor(startTimestamp / bucketSeconds) * bucketSeconds;
  const lastBucket = Math.floor(endTimestamp / bucketSeconds) * bucketSeconds;
  const points = [];

  for (let bucket = firstBucket; bucket <= lastBucket; bucket += bucketSeconds) {
    const row = byBucket.get(bucket) || {};
    const values = emptyMetrics();

    for (const key of METRIC_KEYS) values[key] = Number(row[key]) || 0;

    points.push({
      ...values,
      key: String(bucket),
      timestamp: new Date(bucket * 1000).toISOString(),
      label: labelForBucket(bucket, labelType),
    });
  }

  return points;
}

function totalsForPoints(points) {

  const totals = emptyMetrics();

  for (const point of points) {
    for (const key of METRIC_KEYS) totals[key] += Number(point[key]) || 0;
  }

  return totals;
}

export function getGame(gameKey) {

  return GAME_CATALOG.find((game) => game.key.toLowerCase() === String(gameKey || "").toLowerCase()) || null;
}

export async function getGameAnalytics(env, gameKey, now = new Date()) {

  const game = getGame(gameKey);

  if (!game) return null;

  const endTimestamp = Math.floor(now.valueOf() / 1000);
  const rows = await Promise.all(PERIODS.map((period) => getGameStatBuckets(
    env,
    game.key,
    endTimestamp - period.duration,
    endTimestamp,
    period.bucket,
  )));
  const periods = Object.fromEntries(PERIODS.map((period, index) => {
    const startTimestamp = endTimestamp - period.duration;
    const points = completePoints(rows[index], startTimestamp, endTimestamp, period.bucket, period.label);

    return [period.key, {
      key: period.key,
      title: period.title,
      subtitle: period.subtitle,
      totals: totalsForPoints(points),
      points,
    }];
  }));

  return {
    generatedAt: now.toISOString(),
    games: GAME_CATALOG.map(({ key, name }) => ({ key, name })),
    game,
    periods,
  };
}
