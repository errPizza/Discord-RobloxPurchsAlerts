export async function getUserByEmail(env, email) {

  return env.DB.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
}

export async function getWeeklyStats(env, weekKey) {

  return env.DB.prepare("SELECT week, created_at AS createdAt, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM weekly_stats WHERE week = ?").bind(weekKey).first();
}

export async function incrementWeeklyStats(env, weekKey, changes) {

  const { spent = 0, revenue = 0, single = 0, bulk = 0, donations = 0 } = changes;

  await env.DB.prepare(`INSERT INTO weekly_stats (week, created_at, spent, revenue, single_count, bulk_count, donations)
    VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
    ON CONFLICT(week) DO UPDATE SET spent = spent + excluded.spent, revenue = revenue + excluded.revenue,
    single_count = single_count + excluded.single_count, bulk_count = bulk_count + excluded.bulk_count,
    donations = donations + excluded.donations`).bind(weekKey, spent, revenue, single, bulk, donations).run();

  return getWeeklyStats(env, weekKey);
}

export async function getDailyStats(env, dayKey) {

  return env.DB.prepare("SELECT day, created_at AS createdAt, spent, revenue, single_count AS single, bulk_count AS bulk, donations FROM daily_stats WHERE day = ?").bind(dayKey).first();
}

export async function incrementDailyStats(env, dayKey, changes) {

  const { spent = 0, revenue = 0, single = 0, bulk = 0, donations = 0 } = changes;

  await env.DB.prepare(`INSERT INTO daily_stats (day, created_at, spent, revenue, single_count, bulk_count, donations)
    VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET spent = spent + excluded.spent, revenue = revenue + excluded.revenue,
    single_count = single_count + excluded.single_count, bulk_count = bulk_count + excluded.bulk_count,
    donations = donations + excluded.donations`).bind(dayKey, spent, revenue, single, bulk, donations).run();

  return getDailyStats(env, dayKey);
}

export async function getDailyStatsRange(env, startDay, endDay) {

  const result = await env.DB.prepare(`SELECT day, created_at AS createdAt, spent, revenue, single_count AS single,
    bulk_count AS bulk, donations FROM daily_stats WHERE day BETWEEN ? AND ? ORDER BY day`).bind(startDay, endDay).all();

  return result.results || [];
}

export async function getWeeklyStatsHistory(env) {

  const result = await env.DB.prepare(`SELECT week, created_at AS createdAt, spent, revenue, single_count AS single,
    bulk_count AS bulk, donations FROM weekly_stats ORDER BY week`).all();

  return result.results || [];
}

export async function getWorkerEnabled(env) {

  const setting = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").first();

  return setting?.value !== "0";
}

export async function setWorkerEnabled(env, enabled) {

  const value = enabled ? "1" : "0";

  await env.DB.prepare(`INSERT INTO site_settings (key, value) VALUES ('worker_enabled', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(value).run();

  return enabled;
}

export async function getPublicSite(env) {

  const [settings, contacts] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM site_settings").all(),
    env.DB.prepare("SELECT id, name, role, email, discord, initials, display_order FROM contacts WHERE is_visible = 1 ORDER BY display_order, id").all(),
  ]);

  return { settings: Object.fromEntries((settings.results || []).map((row) => [row.key, row.value])), contacts: contacts.results || [] };
}

export async function getDatabaseOverview(env) {

  const [users, contacts, stats] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM contacts").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM weekly_stats").first(),
  ]);
  
  return { users: users.count, contacts: contacts.count, weeklyStatsRecords: stats.count };
}
