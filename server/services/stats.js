export const MY_CREATOR_ID = 802409113;

export function getWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.valueOf() - start.valueOf()) / 86_400_000);
  const week = Math.ceil((day + start.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

export function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function emptyStats(week = getWeekKey()) {
  return { week, spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };
}

export function changesForStatsPayload(payload) {
  if (payload.type === "Donation") {
    const amount = Number(payload.amount) || 0;
    return { spent: amount, revenue: Math.floor(amount * 0.7), single: 0, bulk: 0, donations: 1 };
  }
  if (payload.type === "Single") {
    const value = Number(payload.price) || 0;
    const price = payload.isPlusPlayer && value >= 10 ? Math.round(value / 0.9) : value;
    return { spent: price, revenue: Math.floor(price * (Number(payload.creatorId) === MY_CREATOR_ID ? 0.7 : 0.4)), single: 1, bulk: 0, donations: 0 };
  }
  let spent = 0;
  let revenue = 0;
  for (const item of payload.items || []) {
    const value = Number(item.price ?? payload.price) || 0;
    const price = payload.isPlusPlayer && value >= 10 ? Math.round(value / 0.9) : value;
    spent += price;
    revenue += Math.floor(price * (Number(item.creatorId) === MY_CREATOR_ID ? 0.7 : 0.4));
  }
  return { spent, revenue, single: 0, bulk: 1, donations: 0 };
}

export function createStatsService(db) {
  const getWeekly = db.prepare("SELECT week, created_at AS createdAt, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM weekly_stats WHERE week = ?");
  const getDaily = db.prepare("SELECT day, created_at AS createdAt, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM daily_stats WHERE day = ?");
  const incrementWeekly = db.prepare(`INSERT INTO weekly_stats (week, created_at, spent, revenue, single_count, bulk_count, donations)
    VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
    ON CONFLICT(week) DO UPDATE SET spent = spent + excluded.spent, revenue = revenue + excluded.revenue,
      single_count = single_count + excluded.single_count, bulk_count = bulk_count + excluded.bulk_count, donations = donations + excluded.donations`);
  const incrementDaily = db.prepare(`INSERT INTO daily_stats (day, created_at, spent, revenue, single_count, bulk_count, donations)
    VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET spent = spent + excluded.spent, revenue = revenue + excluded.revenue,
      single_count = single_count + excluded.single_count, bulk_count = bulk_count + excluded.bulk_count, donations = donations + excluded.donations`);
  const update = db.transaction((payload) => {
    const changes = changesForStatsPayload(payload);
    const week = getWeekKey();
    const day = getDayKey();
    incrementWeekly.run(week, changes.spent, changes.revenue, changes.single, changes.bulk, changes.donations);
    incrementDaily.run(day, changes.spent, changes.revenue, changes.single, changes.bulk, changes.donations);
    return getWeekly.get(week);
  });

  function replaceWeek(week, values) {
    db.prepare(`INSERT INTO weekly_stats (week, created_at, spent, revenue, single_count, bulk_count, donations)
      VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
      ON CONFLICT(week) DO UPDATE SET spent = excluded.spent, revenue = excluded.revenue, single_count = excluded.single_count, bulk_count = excluded.bulk_count, donations = excluded.donations`).run(week, values.spent, values.revenue, values.single, values.bulk, values.donations);
    return getWeekly.get(week);
  }

  function analytics(now = new Date()) {
    const today = getDayKey(now);
    const weekRows = db.prepare("SELECT day, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM daily_stats WHERE day >= ? AND day <= ? ORDER BY day").all(dayKeyOffset(now, -6), today);
    const monthRows = db.prepare("SELECT day, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM daily_stats WHERE day >= ? AND day <= ? ORDER BY day").all(`${today.slice(0, 8)}01`, today);
    const historyRows = db.prepare("SELECT week, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM weekly_stats ORDER BY week").all();
    return { generatedAt: now.toISOString(), weekly: period("Resumen Semanal", weekRows, "day"), monthly: period("Resumen Mensual", monthRows, "day"), global: period("Resumen Global", historyRows, "week") };
  }

  return {
    getWeekly: (week) => getWeekly.get(week),
    getCurrent: () => getWeekly.get(getWeekKey()),
    update,
    replaceWeek,
    history: () => db.prepare("SELECT week, created_at AS createdAt, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM weekly_stats ORDER BY week").all(),
    analytics,
    gameAnalytics(gameKey) {
      if (!["Clothing", "Missile"].includes(gameKey)) return null;
      const now = Math.floor(Date.now() / 1_000);
      const periods = [["live", "En vivo", 3600, 300], ["last24Hours", "Últimas 24 horas", 86400, 3600], ["last7Days", "Últimos 7 días", 604800, 86400], ["last30Days", "Último mes", 2592000, 86400]];
      const values = Object.fromEntries(periods.map(([key, title, seconds, bucket]) => {
        const start = now - seconds;
        const rows = db.prepare(`SELECT CAST(created_at / ? AS INTEGER) * ? AS bucket, SUM(spent) AS spent, SUM(revenue) AS revenue,
          SUM(single_count) AS single, SUM(bulk_count) AS bulk, SUM(donations) AS donations,
          SUM(devproduct_normal_count) AS devProductNormal, SUM(devproduct_gift_count) AS devProductGift,
          SUM(gamepass_normal_count) AS gamepassNormal, SUM(gamepass_gift_count) AS gamepassGift
          FROM game_stat_events WHERE game_key = ? AND created_at >= ? GROUP BY bucket ORDER BY bucket`).all(bucket, bucket, gameKey, start);
        const points = rows.map((row) => ({ ...row, key: String(row.bucket), label: new Date(row.bucket * 1_000).toISOString().slice(bucket >= 86400 ? 0 : 16, bucket >= 86400 ? 10 : 16) }));
        return [key, { key, title, subtitle: title, points, totals: sum(points) }];
      }));
      const game = gameKey === "Clothing"
        ? { key: "Clothing", name: "Lacywings Outfits", metrics: ["spent", "revenue", "single", "bulk", "donations"], activityMetrics: ["single", "bulk", "donations"] }
        : { key: "Missile", name: "Missile", metrics: ["spent", "revenue", "devProductNormal", "devProductGift", "gamepassNormal", "gamepassGift"], activityMetrics: ["devProductNormal", "devProductGift", "gamepassNormal", "gamepassGift"] };
      return { generatedAt: new Date().toISOString(), game, games: [{ key: "Clothing", name: "Lacywings Outfits" }, { key: "Missile", name: "Missile" }], periods: values };
    },
    getDaily,
  };
}

function dayKeyOffset(now, days) {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + days);
  return getDayKey(value);
}

function sum(rows) {
  return rows.reduce((total, row) => {
    for (const key of ["spent", "revenue", "single", "bulk", "donations", "devProductNormal", "devProductGift", "gamepassNormal", "gamepassGift"]) total[key] = (total[key] || 0) + Number(row[key] || 0);
    return total;
  }, {});
}

function period(title, rows, key) {
  const points = rows.map((row) => ({ ...row, key: row[key], label: key === "week" ? row.week.replace(/^\d{4}-W/, "S") : row.day, purchases: Number(row.single || 0) + Number(row.bulk || 0) }));
  const totals = sum(points);
  totals.purchases = totals.single + totals.bulk;
  return { title, subtitle: "", points, totals };
}
