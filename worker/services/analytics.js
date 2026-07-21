import { getDailyStatsRange, getWeeklyStatsHistory } from "../database/database.js";
import { getDayKey, getWeekKey } from "./stats.js";

function shiftDays(date, amount) {

  const shifted = new Date(date);

  shifted.setUTCDate(shifted.getUTCDate() + amount);

  return shifted;
}

function startOfWeek(date) {

  const weekKey = getWeekKey(date);
  let start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  while (getWeekKey(shiftDays(start, -1)) === weekKey) start = shiftDays(start, -1);

  return start;
}

function formatDay(day, includeMonth = true) {

  const date = new Date(`${day}T00:00:00Z`);
  const options = includeMonth ? { day: "2-digit", month: "short", timeZone: "UTC" } : { weekday: "short", timeZone: "UTC" };

  return new Intl.DateTimeFormat("es-ES", options).format(date).replace(".", "");
}

function point(row, label, key) {

  const single = Number(row?.single) || 0;
  const bulk = Number(row?.bulk) || 0;

  return {
    key,
    label,
    spent: Number(row?.spent) || 0,
    revenue: Number(row?.revenue) || 0,
    single,
    bulk,
    purchases: single + bulk,
    donations: Number(row?.donations) || 0,
  };
}

function completeDays(rows, start, end, weeklyLabels = false) {

  const byDay = new Map(rows.map((row) => [row.day, row]));
  const points = [];

  for (let cursor = new Date(start); cursor <= end; cursor = shiftDays(cursor, 1)) {
    const day = getDayKey(cursor);

    points.push(point(byDay.get(day), formatDay(day, !weeklyLabels), day));
  }

  return points;
}

function totals(points) {

  return points.reduce((summary, item) => ({
    spent: summary.spent + item.spent,
    revenue: summary.revenue + item.revenue,
    single: summary.single + item.single,
    bulk: summary.bulk + item.bulk,
    purchases: summary.purchases + item.purchases,
    donations: summary.donations + item.donations,
  }), { spent: 0, revenue: 0, single: 0, bulk: 0, purchases: 0, donations: 0 });
}

function period(title, subtitle, points) {

  return { title, subtitle, points, totals: totals(points) };
}

function distributeTotal(points, key, expectedTotal) {

  const expected = Math.max(0, Number(expectedTotal) || 0);
  const current = points.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);

  if (!points.length || current === expected) return points;
  if (current === 0) return points.map((item, index) => ({ ...item, [key]: index === points.length - 1 ? expected : 0 }));

  const scaled = points.map((item, index) => {
    const precise = ((Number(item[key]) || 0) / current) * expected;

    return { index, value: Math.floor(precise), fraction: precise - Math.floor(precise) };
  });
  let remainder = expected - scaled.reduce((sum, item) => sum + item.value, 0);

  for (const item of [...scaled].sort((left, right) => right.fraction - left.fraction)) {
    if (remainder <= 0) break;

    scaled[item.index].value += 1;
    remainder -= 1;
  }

  return points.map((item, index) => ({ ...item, [key]: scaled[index].value }));
}

function reconcileCurrentWeek(points, weeklyRecord) {

  if (!weeklyRecord || !points.length) return points;

  const expected = point(weeklyRecord, "", weeklyRecord.week);
  let reconciled = points;

  for (const key of ["spent", "revenue", "single", "bulk", "donations"]) reconciled = distributeTotal(reconciled, key, expected[key]);

  return reconciled.map((item) => ({ ...item, purchases: item.single + item.bulk }));
}

async function getLegacyHistory(env) {

  if (!env.WEEKLY_STATS) return [];

  try {
    const rows = [];
    let cursor;

    do {
      const page = await env.WEEKLY_STATS.list(cursor ? { cursor } : undefined);
      const values = await Promise.all((page.keys || []).map((key) => env.WEEKLY_STATS.get(key.name, "json")));

      rows.push(...values.filter((value) => value?.week));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    return rows;
  } catch (error) {
    console.error("[WEEKLY_STATS_READ]", error);

    return [];
  }
}

function mergeWeeklyHistory(databaseRows, legacyRows) {

  const byWeek = new Map(legacyRows.map((row) => [row.week, row]));

  for (const row of databaseRows) byWeek.set(row.week, row);

  return [...byWeek.values()].sort((left, right) => left.week.localeCompare(right.week));
}

export async function getCompleteWeeklyHistory(env) {

  const [databaseRows, legacyRows] = await Promise.all([
    getWeeklyStatsHistory(env),
    getLegacyHistory(env),
  ]);

  return mergeWeeklyHistory(databaseRows, legacyRows);
}

export async function getAnalytics(env, now = new Date()) {

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = startOfWeek(today);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [weekRows, monthRows, historyRows] = await Promise.all([
    getDailyStatsRange(env, getDayKey(weekStart), getDayKey(today)),
    getDailyStatsRange(env, getDayKey(monthStart), getDayKey(today)),
    getCompleteWeeklyHistory(env),
  ]);
  const currentWeek = historyRows.find((row) => row.week === getWeekKey(today));
  const weeklyPoints = reconcileCurrentWeek(completeDays(weekRows, weekStart, today, true), currentWeek);
  const monthlyPoints = completeDays(monthRows, monthStart, today);
  const globalPoints = historyRows.length
    ? historyRows.map((row) => point(row, row.week.replace(/^\d{4}-W/, "S"), row.week))
    : [point(null, getWeekKey(today).replace(/^\d{4}-W/, "S"), getWeekKey(today))];

  return {
    generatedAt: now.toISOString(),
    weekly: period("Resumen Semanal", "Actividad desde el inicio de la semana hasta hoy.", weeklyPoints),
    monthly: period("Resumen Mensual", "Actividad diaria del mes actual.", monthlyPoints),
    global: period("Resumen Global", "Evolución histórica agrupada por semana.", globalPoints),
  };
}
