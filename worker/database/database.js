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