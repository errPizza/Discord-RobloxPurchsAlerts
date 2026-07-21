export async function getUserByEmail(env, email) {

  return env.DB.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
}

export async function getUserById(env, id) {

  return env.DB.prepare("SELECT id, email, password_hash, role, display_name FROM users WHERE id = ?").bind(id).first();
}

export async function createEmailUser(env, email, passwordHash) {

  const displayName = email.split("@", 1)[0].slice(0, 80);

  await env.DB.prepare("INSERT INTO users (email, password_hash, role, display_name) VALUES (?, ?, 'member', ?)").bind(email, passwordHash, displayName).run();

  return getUserByEmail(env, email);
}

export async function getUserByOAuth(env, provider, providerUserId) {

  return env.DB.prepare(`SELECT u.id, u.email, u.password_hash, u.role, u.display_name
    FROM oauth_accounts oauth JOIN users u ON u.id = oauth.user_id
    WHERE oauth.provider = ? AND oauth.provider_user_id = ?`).bind(provider, providerUserId).first();
}

export async function getOrCreateOAuthUser(env, { provider, providerUserId, email, displayName, placeholderHash }) {

  const existingIdentity = await getUserByOAuth(env, provider, providerUserId);

  if (existingIdentity) return existingIdentity;

  await env.DB.prepare(`INSERT OR IGNORE INTO users (email, password_hash, role, display_name)
    VALUES (?, ?, 'member', ?)`).bind(email, placeholderHash, displayName || email.split("@", 1)[0]).run();

  const user = await getUserByEmail(env, email);

  if (!user) throw new Error("No fue posible crear la cuenta OAuth.");

  await env.DB.prepare(`INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_user_id)
    VALUES (?, ?, ?)`).bind(user.id, provider, providerUserId).run();

  return (await getUserByOAuth(env, provider, providerUserId)) || user;
}

export async function listUsers(env, query = "") {

  const normalized = query.trim().toLowerCase().slice(0, 100);
  const result = await env.DB.prepare(`SELECT u.id, u.email, u.role, u.display_name AS displayName, u.created_at AS createdAt,
      CASE WHEN u.password_hash LIKE 'oauth-only$%' THEN 0 ELSE 1 END AS hasPassword,
      GROUP_CONCAT(DISTINCT oauth.provider) AS oauthProviders
    FROM users u LEFT JOIN oauth_accounts oauth ON oauth.user_id = u.id
    WHERE ? = '' OR instr(lower(u.email), ?) > 0 OR instr(lower(COALESCE(u.display_name, '')), ?) > 0
    GROUP BY u.id ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, lower(u.email) LIMIT 100`).bind(normalized, normalized, normalized).all();

  return (result.results || []).map(({ hasPassword, oauthProviders, ...user }) => ({
    ...user,
    providers: [...(hasPassword ? ["email"] : []), ...(oauthProviders ? oauthProviders.split(",") : [])],
  }));
}

export async function promoteUser(env, userId) {

  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(userId).run();

  return getUserById(env, userId);
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

export async function replaceWeeklyStats(env, weekKey, values) {

  const { spent, revenue, single, bulk, donations } = values;

  await env.DB.prepare(`INSERT INTO weekly_stats (week, created_at, spent, revenue, single_count, bulk_count, donations)
    VALUES (?, unixepoch(), ?, ?, ?, ?, ?)
    ON CONFLICT(week) DO UPDATE SET spent = excluded.spent, revenue = excluded.revenue,
    single_count = excluded.single_count, bulk_count = excluded.bulk_count,
    donations = excluded.donations`).bind(weekKey, spent, revenue, single, bulk, donations).run();

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

export async function listDiscordMessageBlocks(env) {

  const result = await env.DB.prepare("SELECT user_id AS userId, created_at AS createdAt FROM discord_message_blocklist ORDER BY created_at DESC, user_id").all();

  return result.results || [];
}

export async function isDiscordUserBlocked(env, userId) {

  const record = await env.DB.prepare("SELECT user_id FROM discord_message_blocklist WHERE user_id = ?").bind(String(userId)).first();

  return Boolean(record);
}

export async function addDiscordMessageBlock(env, userId) {

  await env.DB.prepare("INSERT OR IGNORE INTO discord_message_blocklist (user_id) VALUES (?)").bind(String(userId)).run();

  return env.DB.prepare("SELECT user_id AS userId, created_at AS createdAt FROM discord_message_blocklist WHERE user_id = ?").bind(String(userId)).first();
}

export async function deleteDiscordMessageBlock(env, userId) {

  await env.DB.prepare("DELETE FROM discord_message_blocklist WHERE user_id = ?").bind(String(userId)).run();
}

export async function getPublicSite(env) {

  const [settings, contacts] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM site_settings").all(),
    env.DB.prepare(`SELECT id, name, role, email, discord, initials, description, roblox_url AS robloxUrl,
      image_key AS imageKey, display_order FROM contacts WHERE is_visible = 1 ORDER BY display_order, id`).all(),
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
