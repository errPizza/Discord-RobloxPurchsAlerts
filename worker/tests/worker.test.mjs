import assert from "node:assert/strict";
import test from "node:test";

import worker from "../index.js";
import { bulkMessage, donationMessage, singleMessage, weeklySummary } from "../services/discord.js";
import { passwordRequirements } from "../services/password.js";
import { MY_CREATOR_ID, updateWeeklyStats } from "../services/stats.js";
import { hmacSha256 } from "../utils/crypto.js";

class FakeD1 {

  constructor() {
    this.weeklyRecord = null;
    this.dailyRecords = new Map();
    this.blockedUsers = new Map();
    this.sessions = new Map();
    this.oauthAccounts = new Map();
    this.webhookEvents = new Set();
    this.authFailures = new Map();
    this.settings = new Map([["worker_enabled", "1"]]);
    this.user = null;
    this.additionalUsers = [];
  }

  prepare(sql) {

    const database = this;

    return {
      run: async () => {
        if (sql.includes("DELETE FROM auth_sessions WHERE expires_at")) {
          const now = Math.floor(Date.now() / 1000);

          for (const [tokenHash, session] of database.sessions) if (session.expiresAt <= now) database.sessions.delete(tokenHash);

          return { success: true };
        }

        if (sql.includes("DELETE FROM webhook_events WHERE created_at")) return { success: true };

        throw new Error(`Consulta run() directa no contemplada: ${sql}`);
      },
      all: async () => {
        if (sql.includes("FROM site_settings")) return { results: [{ key: "studio_name", value: "Another Game More Studio" }] };
        if (sql.includes("FROM contacts")) return { results: [{ id: 1, name: "Admin", role: "Dirección", initials: "A", display_order: 1 }] };
        if (sql.includes("FROM weekly_stats ORDER BY week")) return { results: database.weeklyRecord ? [database.weeklyRecord] : [] };
        if (sql.includes("FROM discord_message_blocklist ORDER BY")) return { results: [...database.blockedUsers.entries()].map(([userId, createdAt]) => ({ userId, createdAt })).reverse() };
        throw new Error(`Consulta all() no contemplada: ${sql}`);
      },
      first: async () => {
        if (sql.includes("COUNT(*)") && sql.includes("FROM users")) return { count: 1 };
        if (sql.includes("COUNT(*)") && sql.includes("FROM contacts")) return { count: 2 };
        if (sql.includes("COUNT(*)") && sql.includes("FROM weekly_stats")) return { count: this.weeklyRecord ? 1 : 0 };
        if (sql.includes("FROM site_settings WHERE key = 'worker_enabled'")) return { value: database.settings.get("worker_enabled") };
        throw new Error(`Consulta first() no contemplada: ${sql}`);
      },
      bind(...values) {
        return {
          first: async () => {
            if (sql.includes("FROM users WHERE email")) return [database.user, ...database.additionalUsers].find((user) => user?.email.toLowerCase() === String(values[0]).toLowerCase()) || null;
            if (sql.includes("FROM users WHERE id")) return [database.user, ...database.additionalUsers].find((user) => user?.id === values[0]) || null;
            if (sql.includes("FROM users u WHERE u.id")) {
              const user = [database.user, ...database.additionalUsers].find((entry) => entry?.id === values[0]);

              if (!user) return null;

              const now = Math.floor(Date.now() / 1000);
              const sessions = [...database.sessions.values()].filter((session) => session.userId === user.id);

              return {
                id: user.id,
                email: user.email,
                role: user.role,
                displayName: user.display_name,
                createdAt: user.created_at,
                hasPassword: user.password_hash.startsWith("oauth-only$") ? 0 : 1,
                activeSessions: sessions.filter((session) => session.expiresAt > now).length,
                lastSessionAt: sessions.reduce((latest, session) => Math.max(latest, session.createdAt || 0), 0) || null,
              };
            }
            if (sql.includes("FROM oauth_accounts")) {
              const userId = database.oauthAccounts.get(`${values[0]}:${values[1]}`);

              return [database.user, ...database.additionalUsers].find((user) => userId && user?.id === userId) || null;
            }
            if (sql.includes("FROM auth_sessions s JOIN users")) {
              const session = database.sessions.get(values[0]);

              const sessionUser = [database.user, ...database.additionalUsers].find((user) => user?.id === session?.userId);

              if (!session || session.userAgentHash !== values[1] || session.expiresAt <= Math.floor(Date.now() / 1000) || !sessionUser) return null;

              return { ...sessionUser, expires_at: session.expiresAt };
            }
            if (sql.includes("FROM auth_failures WHERE identifier_hash")) {
              const failure = database.authFailures.get(values[0]);

              return failure ? { lockedUntil: failure.lockedUntil } : null;
            }
            if (sql.includes("FROM daily_stats WHERE day = ?")) return database.dailyRecords.get(values[0]) || null;
            if (sql.includes("FROM discord_message_blocklist WHERE user_id")) {
              const createdAt = database.blockedUsers.get(String(values[0]));

              if (!createdAt) return null;

              return sql.includes("AS userId") ? { userId: String(values[0]), createdAt } : { user_id: String(values[0]) };
            }

            return database.weeklyRecord;
          },
          all: async () => {
            if (sql.includes("FROM oauth_accounts WHERE user_id")) {
              const results = [...database.oauthAccounts.entries()]
                .filter(([, userId]) => userId === values[0])
                .map(([identity]) => ({ provider: identity.split(":", 1)[0], createdAt: 1 }));

              return { results };
            }

            if (sql.includes("FROM users u LEFT JOIN oauth_accounts")) {
              const query = values[0];
              const user = database.user;

              if (!user || (query && !user.email.toLowerCase().includes(query) && !String(user.display_name || "").toLowerCase().includes(query))) return { results: [] };

              return { results: [{ id: user.id, email: user.email, role: user.role, displayName: user.display_name, createdAt: user.created_at, hasPassword: 1, oauthProviders: null }] };
            }

            if (!sql.includes("FROM daily_stats WHERE day BETWEEN")) throw new Error(`Consulta bind().all() no contemplada: ${sql}`);

            const [start, end] = values;
            const results = [...database.dailyRecords.values()].filter((row) => row.day >= start && row.day <= end).sort((left, right) => left.day.localeCompare(right.day));

            return { results };
          },
          run: async () => {
            if (sql.includes("INSERT INTO users") || sql.includes("INSERT OR IGNORE INTO users")) {
              const usesExplicitRole = sql.includes("password_hash, role, display_name");
              const [email, passwordHash] = values;
              const role = usesExplicitRole ? values[2] : "member";
              const displayName = usesExplicitRole ? values[3] : values[2];

              const createdUser = { id: database.user ? database.additionalUsers.length + 2 : 1, email, password_hash: passwordHash, role, display_name: displayName, created_at: Math.floor(Date.now() / 1000) };

              if (!database.user) database.user = createdUser;
              else if (![database.user, ...database.additionalUsers].some((user) => user.email.toLowerCase() === String(email).toLowerCase())) database.additionalUsers.push(createdUser);

              return { success: true };
            }

            if (sql.includes("UPDATE users SET role = 'admin'")) {
              const user = [database.user, ...database.additionalUsers].find((entry) => entry?.id === values[0]);

              if (user) user.role = "admin";

              return { success: true };
            }

            if (sql.includes("DELETE FROM users WHERE id")) {
              const exists = [database.user, ...database.additionalUsers].some((entry) => entry?.id === values[0]);

              if (database.user?.id === values[0]) database.user = null;
              database.additionalUsers = database.additionalUsers.filter((entry) => entry.id !== values[0]);
              for (const [tokenHash, session] of database.sessions) if (session.userId === values[0]) database.sessions.delete(tokenHash);
              for (const [identity, userId] of database.oauthAccounts) if (userId === values[0]) database.oauthAccounts.delete(identity);

              return { success: true, meta: { changes: exists ? 1 : 0 } };
            }

            if (sql.includes("INSERT OR IGNORE INTO oauth_accounts")) {
              database.oauthAccounts.set(`${values[1]}:${values[2]}`, values[0]);

              return { success: true };
            }

            if (sql.includes("INSERT INTO auth_sessions")) {
              database.sessions.set(values[0], { userId: values[1], userAgentHash: values[2], expiresAt: values[3], createdAt: Math.floor(Date.now() / 1000) });

              return { success: true };
            }

            if (sql.includes("DELETE FROM auth_sessions WHERE token_hash")) {
              database.sessions.delete(values[0]);

              return { success: true };
            }

            if (sql.includes("INSERT INTO auth_failures")) {
              const current = database.authFailures.get(values[0]) || { failedAttempts: 0, windowStarted: Math.floor(Date.now() / 1000), lockedUntil: 0 };

              current.failedAttempts += 1;
              if (current.failedAttempts >= 5) current.lockedUntil = Math.floor(Date.now() / 1000) + 900;
              database.authFailures.set(values[0], current);

              return { success: true };
            }

            if (sql.includes("DELETE FROM auth_failures WHERE identifier_hash")) {
              database.authFailures.delete(values[0]);

              return { success: true };
            }

            if (sql.includes("INSERT OR IGNORE INTO webhook_events")) {
              const key = `${values[0]}:${values[1]}`;
              const exists = database.webhookEvents.has(key);

              database.webhookEvents.add(key);

              return { success: true, meta: { changes: exists ? 0 : 1 } };
            }

            if (sql.includes("INSERT INTO site_settings")) {
              database.settings.set("worker_enabled", values[0]);

              return { success: true };
            }

            if (sql.includes("INSERT OR IGNORE INTO discord_message_blocklist")) {
              database.blockedUsers.set(String(values[0]), Math.floor(Date.now() / 1000));

              return { success: true };
            }

            if (sql.includes("DELETE FROM discord_message_blocklist")) {
              database.blockedUsers.delete(String(values[0]));

              return { success: true };
            }

            if (sql.includes("INSERT INTO daily_stats")) {
              const [day, spent, revenue, single, bulk, donations] = values;
              const record = database.dailyRecords.get(day) || { day, createdAt: Math.floor(Date.now() / 1000), spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };

              record.spent += spent;
              record.revenue += revenue;
              record.single += single;
              record.bulk += bulk;
              record.donations += donations;
              database.dailyRecords.set(day, record);

              return { success: true };
            }

            if (!sql.includes("INSERT INTO weekly_stats")) throw new Error(`Consulta run() no contemplada: ${sql}`);

            const [week, spent, revenue, single, bulk, donations] = values;

            database.weeklyRecord ||= { week, createdAt: Math.floor(Date.now() / 1000), spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };

            if (sql.includes("spent = excluded.spent")) {
              Object.assign(database.weeklyRecord, { week, spent, revenue, single, bulk, donations });
            } else {
              database.weeklyRecord.spent += spent;
              database.weeklyRecord.revenue += revenue;
              database.weeklyRecord.single += single;
              database.weeklyRecord.bulk += bulk;
              database.weeklyRecord.donations += donations;
            }

            return { success: true };
          },
        };
      },
    };
  }
}

async function passwordHash(password, pepper) {

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${password}${pepper}`));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function d1PasswordHash(password, pepper) {

  const salt = "test-salt-value";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${salt}:${password}`));

  return `hmac-sha256$${salt}$${Buffer.from(signature).toString("base64url")}`;
}

async function adminSession(DB = new FakeD1()) {
  const pepper = "test-pepper";
  const env = {
    DB,
    PASSWORD_PEPPER: pepper,
    SESSION_SECRET: "test-session-secret",
    ACCOUNT_CONFIG: JSON.stringify([{ email: "admin@example.com", passwordHash: await passwordHash("test-password", pepper), role: "admin" }]),
  };
  const response = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" }),
  }), env);

  return { DB, env, cookie: response.headers.get("Set-Cookie").split(";", 1)[0] };
}

function responseCookie(response, name) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("Set-Cookie")].filter(Boolean);
  const match = values.join(", ").match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));

  return match ? `${name}=${match[1]}` : null;
}

async function oauthRoundTrip(provider, { DB = new FakeD1(), profile }) {
  const upper = provider.toUpperCase();
  const env = {
    DB,
    SESSION_SECRET: "test-session-secret",
    PASSWORD_PEPPER: "test-password-pepper",
    [`${upper}_CLIENT_ID`]: `${provider}-client-id`,
    [`${upper}_CLIENT_SECRET`]: `${provider}-client-secret`,
  };
  const userAgent = "AGM OAuth Test/1.0";
  const start = await worker.fetch(new Request(`https://api.example.com/api/auth/oauth/${provider}`, { headers: { "User-Agent": userAgent } }), env);
  const authorization = new URL(start.headers.get("Location"));
  const state = authorization.searchParams.get("state");
  const attemptCookie = responseCookie(start, `__Host-agm_oauth_${provider}`);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);

    if (address.includes("/token")) {
      const body = new URLSearchParams(options.body);

      assert.equal(body.get("code"), "oauth-code");
      assert.equal(body.get("redirect_uri"), `https://api.example.com/api/auth/oauth/${provider}/callback`);

      if (provider === "discord") {
        assert.equal(options.headers.Authorization, `Basic ${btoa("discord-client-id:discord-client-secret")}`);
        assert.equal(body.has("client_secret"), false);
      } else {
        assert.equal(body.get("client_id"), "google-client-id");
        assert.equal(body.get("client_secret"), "google-client-secret");
      }

      return Response.json({ access_token: "provider-access-token", token_type: "Bearer" });
    }

    assert.match(address, provider === "google" ? /openidconnect\.googleapis\.com/ : /discord\.com\/api\/v10\/users/);
    assert.equal(options.headers.Authorization, "Bearer provider-access-token");

    return Response.json(profile);
  };

  try {
    const callback = await worker.fetch(new Request(`https://api.example.com/api/auth/oauth/${provider}/callback?code=oauth-code&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: attemptCookie, "User-Agent": userAgent },
    }), env);
    const sessionCookie = responseCookie(callback, "__Host-agm_session");
    const sessionResponse = await worker.fetch(new Request("https://api.example.com/api/auth/session", {
      headers: { Cookie: sessionCookie, "User-Agent": userAgent },
    }), env);

    return { callback, session: await sessionResponse.json(), DB };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("el Worker carga y expone los datos públicos del sitio", async () => {

  const response = await worker.fetch(new Request("https://api.example.com/api/site"), { DB: new FakeD1() });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(data.settings.studio_name, "Another Game More Studio");
  assert.equal(data.contacts[0].name, "Admin");
});

test("el Worker sirve React y mantiene el estado en /api/status", async () => {

  const ASSETS = {
    fetch: async (request) => new Response(`<main>${new URL(request.url).pathname}</main>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  };
  const env = { ASSETS, DB: new FakeD1() };
  const pageResponse = await worker.fetch(new Request("https://api.example.com/dashboard/stats"), env);
  const headResponse = await worker.fetch(new Request("https://api.example.com/", { method: "HEAD" }), env);
  const statusResponse = await worker.fetch(new Request("https://api.example.com/api/status"), env);

  assert.equal(pageResponse.status, 200);
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");
  assert.equal(await pageResponse.text(), "<main>/dashboard/stats</main>");
  assert.equal(pageResponse.headers.get("X-Frame-Options"), "DENY");
  assert.match(pageResponse.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.match(pageResponse.headers.get("Content-Security-Policy"), /style-src[^;]+https:\/\/fonts\.googleapis\.com/);
  assert.match(pageResponse.headers.get("Content-Security-Policy"), /font-src[^;]+https:\/\/fonts\.gstatic\.com/);
  assert.equal(statusResponse.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.match(statusResponse.headers.get("Cache-Control"), /no-store/);
  assert.equal((await statusResponse.json()).status, "online");
});

test("las estadísticas se incrementan de forma acumulativa", async () => {

  const legacyStats = new Map();
  const env = { DB: new FakeD1(), WEEKLY_STATS: { put: async (key, value) => legacyStats.set(key, JSON.parse(value)) } };

  await updateWeeklyStats(env, { type: "Donation", amount: 100 });
  await updateWeeklyStats(env, { type: "Single", price: 50, creatorId: MY_CREATOR_ID });
  const stats = await updateWeeklyStats(env, { type: "Bulk", items: [{ price: 100, creatorId: MY_CREATOR_ID }, { price: 40, creatorId: 1 }] });

  assert.deepEqual(
    { spent: stats.spent, revenue: stats.revenue, single: stats.single, bulk: stats.bulk, donations: stats.donations },
    { spent: 290, revenue: 191, single: 1, bulk: 1, donations: 1 },
  );
  assert.equal(legacyStats.get(stats.week).revenue, 191);
});

test("los embeds conservan el estilo detallado del Worker original", () => {

  const donation = donationMessage({ displayName: "Pizza", username: "err_Lo2sDat4", userId: 4093162315, amount: 100 }, "https://example.com/avatar.png", 3, "https://example.com/studio.png");
  const single = singleMessage({ displayName: "Pizza", username: "err_Lo2sDat4", item: { id: 10, name: "Item", price: 50, revenue: 35, percent: 0.7 } }, "https://example.com/avatar.png", 4, "https://example.com/item.png", "https://example.com/studio.png");
  const bulk = bulkMessage({ displayName: "Pizza", username: "err_Lo2sDat4", itemCount: 2, totalRobux: 80, totalRevenue: 40, items: [{ name: "Uno", price: 50, revenue: 25 }, { name: "Dos", price: 30, revenue: 15 }] }, "https://example.com/avatar.png", 2, "https://example.com/studio.png");
  const summary = weeklySummary({ week: "2026-W30", spent: 230, revenue: 120, single: 3, bulk: 1, donations: 2 }, "https://example.com/studio.png");

  assert.match(donation.content, /Another Game More Studio/);
  assert.match(donation.embeds[0].title, /Donación verificada/);
  assert.equal(donation.embeds[0].thumbnail.url, "https://example.com/studio.png");
  assert.match(single.embeds[0].fields[3].value, /70%/);
  assert.equal(single.embeds[0].thumbnail.url, "https://example.com/item.png");
  assert.match(bulk.embeds[0].fields[3].value, /Uno/);
  assert.match(summary.embeds[0].title, /Resumen semanal de ganancias/);
  assert.equal(summary.embeds[0].fields.length, 6);
});

test("la ruta de base de datos devuelve el contrato usado por React", async () => {

  const DB = new FakeD1();
  const pepper = "test-pepper";
  const env = {
    DB,
    PASSWORD_PEPPER: pepper,
    SESSION_SECRET: "test-session-secret",
    ACCOUNT_CONFIG: JSON.stringify([{ email: "admin@example.com", passwordHash: await passwordHash("test-password", pepper), role: "admin" }]),
  };
  const loginResponse = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" }),
  }), env);
  const cookie = loginResponse.headers.get("Set-Cookie").split(";", 1)[0];
  const response = await worker.fetch(new Request("https://api.example.com/api/admin/database", { headers: { Cookie: cookie } }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.engine, "Cloudflare D1");
  assert.deepEqual(data.overview, { users: 1, contacts: 2, weeklyStatsRecords: 0 });
  assert.ok(data.currentWeek);
  assert.equal(data.weeklyRecord, null);
});

test("un administrador almacenado en D1 puede iniciar sesión", async () => {

  const DB = new FakeD1();
  const pepper = "test-password-pepper";
  DB.user = {
    id: 1,
    email: "admin@example.com",
    password_hash: await d1PasswordHash("test-password", pepper),
    role: "admin",
    display_name: "Admin",
  };
  const response = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "test-password" }),
  }), { DB, SESSION_SECRET: "test-session-secret", PASSWORD_PEPPER: pepper });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.user.email, "admin@example.com");
  assert.equal(data.user.isAdmin, true);
  assert.match(response.headers.get("Set-Cookie"), /^__Host-agm_session=/);
});

test("un usuario puede registrarse con correo y recibe rol member", async () => {

  const DB = new FakeD1();
  const env = { DB, SESSION_SECRET: "test-session-secret", PASSWORD_PEPPER: "test-password-pepper" };
  const password = "Una frase larga y segura 2026!";
  const response = await worker.fetch(new Request("https://api.example.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password, passwordConfirmation: password }),
  }), env);
  const data = await response.json();
  const cookie = response.headers.get("Set-Cookie").split(";", 1)[0];
  const sessionResponse = await worker.fetch(new Request("https://api.example.com/api/auth/session", { headers: { Cookie: cookie } }), env);
  const session = await sessionResponse.json();

  assert.equal(response.status, 201);
  assert.equal(data.user.role, "member");
  assert.equal(data.user.isAdmin, false);
  assert.match(DB.user.password_hash, /^pbkdf2-sha256\$600000\$/);
  assert.equal(session.user.email, "member@example.com");
  assert.equal(session.user.isAdmin, false);
});

test("el registro no duplica un correo aunque cambien mayúsculas o espacios", async () => {

  const DB = new FakeD1();
  const env = { DB, SESSION_SECRET: "test-session-secret", PASSWORD_PEPPER: "test-password-pepper" };
  const password = "Una frase larga y segura 2026!";
  const signup = (email) => worker.fetch(new Request("https://api.example.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, passwordConfirmation: password }),
  }), env);
  const first = await signup("persona@example.com");
  const duplicate = await signup("  PERSONA@EXAMPLE.COM  ");

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(DB.user.email, "persona@example.com");
  assert.equal(DB.additionalUsers.length, 0);
});

test("el registro aplica la política de contraseña y exige confirmación", async () => {

  const env = { DB: new FakeD1(), SESSION_SECRET: "test-session-secret", PASSWORD_PEPPER: "test-password-pepper" };
  const shortResponse = await worker.fetch(new Request("https://api.example.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password: "Aa1!", passwordConfirmation: "Aa1!" }),
  }), env);
  const mismatchResponse = await worker.fetch(new Request("https://api.example.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "member@example.com", password: "Una frase suficientemente larga", passwordConfirmation: "Una frase completamente distinta" }),
  }), env);

  assert.equal(shortResponse.status, 400);
  assert.match((await shortResponse.json()).error, /8 caracteres/);
  assert.equal(mismatchResponse.status, 400);
  assert.match((await mismatchResponse.json()).error, /no coinciden/);
});

test("la contraseña exige mayúscula, dos minúsculas, número y signo", () => {

  assert.match(passwordRequirements("abcdefg1!"), /mayúscula/);
  assert.match(passwordRequirements("AAAAAAAa1!"), /dos minúsculas/);
  assert.match(passwordRequirements("Abcdefgh!"), /número/);
  assert.match(passwordRequirements("Abcdefg1"), /signo/);
  assert.equal(passwordRequirements("Abcdefg1!"), null);
});

test("solo el propietario puede consultar, promover y eliminar usuarios", async () => {

  const DB = new FakeD1();
  DB.user = { id: 8, email: "member@example.com", password_hash: "hash", role: "member", display_name: "Member", created_at: 1 };
  const owner = await adminSession(DB);
  owner.env.ACCOUNT_CONFIG = JSON.stringify([{ email: "kikinttrex0231@gmail.com", passwordHash: await passwordHash("test-password", "test-pepper"), role: "admin" }]);
  const ownerLogin = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "kikinttrex0231@gmail.com", password: "test-password" }),
  }), owner.env);
  const ownerCookie = ownerLogin.headers.get("Set-Cookie").split(";", 1)[0];
  const listResponse = await worker.fetch(new Request("https://api.example.com/api/admin/promote/users", { headers: { Cookie: ownerCookie } }), owner.env);
  const profileResponse = await worker.fetch(new Request("https://api.example.com/api/admin/promote/users/8", { headers: { Cookie: ownerCookie } }), owner.env);
  const promoteResponse = await worker.fetch(new Request("https://api.example.com/api/admin/promote/users/8", { method: "PUT", headers: { Cookie: ownerCookie } }), owner.env);
  const deleteResponse = await worker.fetch(new Request("https://api.example.com/api/admin/promote/users/8", { method: "DELETE", headers: { Cookie: ownerCookie } }), owner.env);
  const ownerAccount = owner.DB.additionalUsers.find((entry) => entry.email === "kikinttrex0231@gmail.com");
  const deleteOwnerResponse = await worker.fetch(new Request(`https://api.example.com/api/admin/promote/users/${ownerAccount.id}`, { method: "DELETE", headers: { Cookie: ownerCookie } }), owner.env);
  const regularAdmin = await adminSession(DB);
  const forbiddenResponse = await worker.fetch(new Request("https://api.example.com/api/admin/promote/users", { headers: { Cookie: regularAdmin.cookie } }), regularAdmin.env);
  const profile = (await profileResponse.json()).user;

  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).users[0].email, "member@example.com");
  assert.equal(profileResponse.status, 200);
  assert.equal(profile.email, "member@example.com");
  assert.equal(profile.hasPassword, true);
  assert.equal("password_hash" in profile, false);
  assert.equal(promoteResponse.status, 200);
  assert.equal(deleteResponse.status, 200);
  assert.equal(DB.user, null);
  assert.equal(deleteOwnerResponse.status, 409);
  assert.ok(owner.DB.additionalUsers.some((entry) => entry.id === ownerAccount.id));
  assert.equal(forbiddenResponse.status, 403);
});

test("OAuth informa proveedores disponibles e inicia con state seguro", async () => {

  const unavailable = await worker.fetch(new Request("https://api.example.com/api/auth/providers"), {});
  const availableEnv = { GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", SESSION_SECRET: "session-secret" };
  const start = await worker.fetch(new Request("https://api.example.com/api/auth/oauth/google"), availableEnv);
  const destination = new URL(start.headers.get("Location"));

  assert.deepEqual((await unavailable.json()).providers, { google: false, discord: false });
  assert.equal(start.status, 302);
  assert.equal(destination.origin, "https://accounts.google.com");
  assert.equal(destination.searchParams.get("scope"), "openid email profile");
  assert.ok(destination.searchParams.get("state"));
  assert.match(start.headers.get("Set-Cookie"), /^__Host-agm_oauth_google=/);
});

test("Google OAuth registra una cuenta nueva y crea una sesión revocable", async () => {

  const result = await oauthRoundTrip("google", {
    profile: { sub: "google-user-1", email: "new-google@example.com", email_verified: true, name: "Google User" },
  });

  assert.equal(result.callback.status, 302);
  assert.equal(new URL(result.callback.headers.get("Location")).pathname, "/");
  assert.equal(result.session.user.email, "new-google@example.com");
  assert.equal(result.session.user.role, "member");
  assert.equal(result.DB.oauthAccounts.get("google:google-user-1"), result.DB.user.id);
  assert.equal(result.DB.sessions.size, 1);
});

test("Google OAuth reutiliza una cuenta manual con el mismo correo", async () => {

  const DB = new FakeD1();

  DB.user = { id: 5, email: "Persona@Example.com", password_hash: "manual-password-hash", role: "member", display_name: "Persona", created_at: 1 };

  const result = await oauthRoundTrip("google", {
    DB,
    profile: { sub: "google-existing-5", email: "persona@example.com", email_verified: true, name: "Persona Google" },
  });

  assert.equal(result.callback.status, 302);
  assert.equal(result.session.user.email, "persona@example.com");
  assert.equal(result.DB.oauthAccounts.get("google:google-existing-5"), 5);
  assert.equal(result.DB.additionalUsers.length, 0);
});

test("Discord OAuth enlaza una cuenta existente e inicia sesión con HTTP Basic", async () => {

  const DB = new FakeD1();

  DB.user = { id: 7, email: "owner@example.com", password_hash: "oauth-only$existing", role: "admin", display_name: "Owner" };

  const result = await oauthRoundTrip("discord", {
    DB,
    profile: { id: "discord-user-7", email: "owner@example.com", verified: true, global_name: "Discord Owner", username: "owner" },
  });

  assert.equal(result.callback.status, 302);
  assert.equal(new URL(result.callback.headers.get("Location")).pathname, "/dashboard");
  assert.equal(result.session.user.email, "owner@example.com");
  assert.equal(result.session.user.isAdmin, true);
  assert.equal(DB.oauthAccounts.get("discord:discord-user-7"), 7);
});

test("cerrar sesión revoca el token almacenado en D1", async () => {

  const session = await adminSession();
  const before = await worker.fetch(new Request("https://api.example.com/api/auth/session", { headers: { Cookie: session.cookie } }), session.env);
  const logout = await worker.fetch(new Request("https://api.example.com/api/auth/logout", {
    method: "POST",
    headers: { Cookie: session.cookie, Origin: "https://api.example.com" },
  }), session.env);
  const after = await worker.fetch(new Request("https://api.example.com/api/auth/session", { headers: { Cookie: session.cookie } }), session.env);

  assert.equal((await before.json()).user.isAdmin, true);
  assert.equal(logout.status, 200);
  assert.equal(session.DB.sessions.size, 0);
  assert.equal((await after.json()).user.isAdmin, false);
});

test("las mutaciones administrativas rechazan orígenes externos", async () => {

  const session = await adminSession();
  const response = await worker.fetch(new Request("https://api.example.com/api/admin/worker", {
    method: "PUT",
    headers: { Cookie: session.cookie, Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  }), session.env);

  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Origen/);
});

test("auth limita abuso y rechaza cuerpos que no son JSON", async () => {

  const limited = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "Password1!" }),
  }), { AUTH_RATE_LIMITER: { limit: async () => ({ success: false }) } });
  const invalidType = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "email=test@example.com",
  }), {});

  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal(invalidType.status, 415);
});

test("cinco contraseñas incorrectas bloquean temporalmente la cuenta", async () => {

  const DB = new FakeD1();
  const pepper = "lockout-test-pepper";

  DB.user = { id: 1, email: "locked@example.com", password_hash: await d1PasswordHash("Correct1!", pepper), role: "member", display_name: "Locked" };

  const env = { DB, SESSION_SECRET: "session-secret", PASSWORD_PEPPER: pepper };

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "locked@example.com", password: "Wrong1!" }),
    }), env);

    assert.equal(response.status, 401);
  }

  const blocked = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "locked@example.com", password: "Correct1!" }),
  }), env);

  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "900");

  DB.authFailures.values().next().value.lockedUntil = 0;

  const recovered = await worker.fetch(new Request("https://api.example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "locked@example.com", password: "Correct1!" }),
  }), env);

  assert.equal(recovered.status, 200);
  assert.equal(DB.authFailures.size, 0);
});

test("los webhooks firmados rechazan replay y no duplican estadísticas", async () => {

  const DB = new FakeD1();
  const secret = "stats-signature-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "unique_nonce_123456789";
  const raw = JSON.stringify({ secret, type: "Donation", amount: 100, userId: 123456 });
  const signature = await hmacSha256(`${timestamp}.${nonce}.${raw}`, secret);
  const env = { DB, STATS_SECRET: secret, REQUIRE_SIGNED_WEBHOOKS: "true" };
  const headers = {
    "Content-Type": "application/json",
    "X-AGM-Timestamp": timestamp,
    "X-AGM-Nonce": nonce,
    "X-AGM-Signature": signature,
  };
  const unsigned = await worker.fetch(new Request("https://api.example.com/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  }), env);
  const accepted = await worker.fetch(new Request("https://api.example.com/stats", { method: "POST", headers, body: raw }), env);
  const replay = await worker.fetch(new Request("https://api.example.com/stats", { method: "POST", headers, body: raw }), env);

  assert.equal(unsigned.status, 401);
  assert.equal(accepted.status, 200);
  assert.equal((await replay.json()).duplicate, true);
  assert.equal(DB.weeklyRecord.donations, 1);
});

test("las respuestas de error tienen estado y cuerpo JSON", async () => {

  const methodResponse = await worker.fetch(new Request("https://api.example.com/item"), {});
  const unauthorizedResponse = await worker.fetch(new Request("https://api.example.com/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "incorrecto" }),
  }), { ITEMS_SECRET: "correcto" });

  assert.equal(methodResponse.status, 405);
  assert.equal((await methodResponse.json()).error, "Método no permitido.");
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal((await unauthorizedResponse.json()).error, "No autorizado.");
});

test("el resumen entrega series semanal, mensual y global", async () => {

  const session = await adminSession();
  const legacyStats = new Map();

  session.env.WEEKLY_STATS = {
    put: async (key, value) => legacyStats.set(key, JSON.parse(value)),
    list: async () => ({ keys: [...legacyStats.keys()].map((name) => ({ name })), list_complete: true }),
    get: async (key) => legacyStats.get(key),
  };

  await updateWeeklyStats(session.env, { type: "Donation", amount: 100 });

  const current = [...legacyStats.values()][0];

  legacyStats.set(current.week, { ...current, spent: 150, revenue: 90 });
  Object.assign(session.DB.weeklyRecord, { spent: 150, revenue: 90 });

  const response = await worker.fetch(new Request("https://api.example.com/api/admin/analytics", { headers: { Cookie: session.cookie } }), session.env);
  const { analytics } = await response.json();

  assert.equal(response.status, 200);
  assert.equal(analytics.weekly.title, "Resumen Semanal");
  assert.equal(analytics.monthly.title, "Resumen Mensual");
  assert.equal(analytics.global.title, "Resumen Global");
  assert.equal(analytics.weekly.totals.revenue, 90);
  assert.equal(analytics.weekly.totals.single, 0);
  assert.equal(analytics.weekly.totals.bulk, 0);
  assert.equal(analytics.global.totals.spent, 150);
  assert.equal(analytics.global.totals.donations, 1);
});

test("un administrador puede reemplazar los valores exactos de una semana", async () => {

  const session = await adminSession();
  const legacyStats = new Map();

  session.env.WEEKLY_STATS = {
    put: async (key, value) => legacyStats.set(key, JSON.parse(value)),
    list: async () => ({ keys: [...legacyStats.keys()].map((name) => ({ name })), list_complete: true }),
    get: async (key) => legacyStats.get(key),
  };

  const response = await worker.fetch(new Request("https://api.example.com/api/admin/stats/2026-W30", {
    method: "PUT",
    headers: { Cookie: session.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ spent: 900, revenue: 500, single: 12, bulk: 4, donations: 3 }),
  }), session.env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    { spent: data.stats.spent, revenue: data.stats.revenue, single: data.stats.single, bulk: data.stats.bulk, donations: data.stats.donations },
    { spent: 900, revenue: 500, single: 12, bulk: 4, donations: 3 },
  );
  assert.equal(legacyStats.get("2026-W30").revenue, 500);

  const invalidResponse = await worker.fetch(new Request("https://api.example.com/api/admin/stats/2026-W30", {
    method: "PUT",
    headers: { Cookie: session.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ spent: -1, revenue: 0, single: 0, bulk: 0, donations: 0 }),
  }), session.env);

  assert.equal(invalidResponse.status, 400);
});

test("el modo pausado omite mensajes y mantiene el registro de estadísticas", async () => {

  const session = await adminSession();
  const disableResponse = await worker.fetch(new Request("https://api.example.com/api/admin/worker", {
    method: "PUT",
    headers: { Cookie: session.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  }), session.env);
  const messageResponse = await worker.fetch(new Request("https://api.example.com/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "items-secret", type: "Single", price: 50 }),
  }), { ...session.env, ITEMS_SECRET: "items-secret" });
  const statsResponse = await worker.fetch(new Request("https://api.example.com/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "stats-secret", type: "Single", price: 50, creatorId: MY_CREATOR_ID }),
  }), { ...session.env, STATS_SECRET: "stats-secret" });
  const messageResult = await messageResponse.json();

  assert.equal(disableResponse.status, 200);
  assert.equal(messageResponse.status, 200);
  assert.equal(messageResult.messageSent, false);
  assert.equal(statsResponse.status, 200);
  assert.equal(session.DB.weeklyRecord.single, 1);
});

test("un UserId bloqueado omite Discord pero permite sumar estadísticas", async () => {

  const session = await adminSession();
  const addResponse = await worker.fetch(new Request("https://api.example.com/api/admin/worker/blocked-users", {
    method: "POST",
    headers: { Cookie: session.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "802409113" }),
  }), session.env);
  const messageResponse = await worker.fetch(new Request("https://api.example.com/item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "items-secret", userId: 802409113, displayName: "Bloqueado" }),
  }), { ...session.env, ITEMS_SECRET: "items-secret" });
  const statsResponse = await worker.fetch(new Request("https://api.example.com/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: "stats-secret", type: "Single", price: 50, creatorId: MY_CREATOR_ID, userId: 802409113 }),
  }), { ...session.env, STATS_SECRET: "stats-secret" });
  const listResponse = await worker.fetch(new Request("https://api.example.com/api/admin/worker/blocked-users", { headers: { Cookie: session.cookie } }), session.env);
  const message = await messageResponse.json();
  const list = await listResponse.json();

  assert.equal(addResponse.status, 201);
  assert.equal(messageResponse.status, 200);
  assert.equal(message.messageSent, false);
  assert.equal(message.ignoredReason, "blocked_user");
  assert.equal(statsResponse.status, 200);
  assert.equal(session.DB.weeklyRecord.single, 1);
  assert.equal(list.users[0].userId, "802409113");

  const deleteResponse = await worker.fetch(new Request("https://api.example.com/api/admin/worker/blocked-users/802409113", {
    method: "DELETE",
    headers: { Cookie: session.cookie },
  }), session.env);

  assert.equal(deleteResponse.status, 200);
  assert.equal(session.DB.blockedUsers.size, 0);
});
