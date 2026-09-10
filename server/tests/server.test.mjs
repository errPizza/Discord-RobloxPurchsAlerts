import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildApp } from "../index.js";
import { loadConfig } from "../config.js";
import { openDatabase } from "../database/database.js";
import { hmac } from "../services/crypto.js";
import { createAuditService } from "../services/audit.js";
import { createBackupService } from "../services/backups.js";

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agm-server-"));
  const staticRoot = path.join(root, "web");
  await fs.mkdir(staticRoot);
  await fs.writeFile(path.join(staticRoot, "index.html"), "<!doctype html><title>AGM</title>");
  const config = loadConfig({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "8787",
    DATABASE_PATH: path.join(root, "database.sqlite"),
    BACKUP_PATH: path.join(root, "backups"),
    STATIC_ROOT: staticRoot,
    STATIC_SOURCE_PATH: staticRoot,
    PUBLIC_ORIGIN: "http://127.0.0.1:8787",
    COOKIE_SECURE: "never",
    SESSION_SECRET: "a-session-secret-that-is-long-enough-for-tests",
    PASSWORD_PEPPER: "a-password-pepper-that-is-long-enough-for-tests",
    MOBILE_ACCESS_TOKEN_SECRET: "an-access-secret-that-is-long-enough-for-tests",
    MOBILE_REFRESH_TOKEN_SECRET: "a-refresh-secret-that-is-long-enough-for-tests",
    STATS_SECRET: "test-stats-webhook-secret",
    BACKUP_ENABLED: "false",
    REQUIRE_SIGNED_WEBHOOKS: "true",
  });
  const db = openDatabase(config.databasePath);
  const app = await buildApp({ config, db });
  return { root, config, db, app };
}

function cookie(response) {
  return response.headers["set-cookie"].split(";")[0];
}

test("servidor local conserva auth web y exige aprobación móvil", async (t) => {
  const { app, db } = await setup();
  t.after(async () => { await app.close(); db.close(); });

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });

  const created = await app.inject({ method: "POST", url: "/api/auth/signup", headers: { "content-type": "application/json" }, payload: { email: "owner@example.com", password: "Validpass1!", passwordConfirmation: "Validpass1!" } });
  assert.equal(created.statusCode, 201);
  const webCookie = cookie(created);
  db.prepare("UPDATE users SET role = 'owner' WHERE email = ?").run("owner@example.com");

  const requested = await app.inject({ method: "POST", url: "/api/mobile/auth/login", headers: { "content-type": "application/json" }, payload: { email: "owner@example.com", password: "Validpass1!", deviceId: "test-device-123456", deviceName: "Test Android", platform: "android" } });
  assert.equal(requested.statusCode, 202);
  const sessionId = requested.json().session.id;

  const denied = await app.inject({ method: "GET", url: "/api/mobile/system" });
  assert.equal(denied.statusCode, 401);

  const approval = await app.inject({ method: "POST", url: `/api/admin/mobile/sessions/${sessionId}/approve`, headers: { cookie: webCookie } });
  assert.equal(approval.statusCode, 200);

  const approved = await app.inject({ method: "POST", url: "/api/mobile/auth/login", headers: { "content-type": "application/json" }, payload: { email: "owner@example.com", password: "Validpass1!", deviceId: "test-device-123456", deviceName: "Test Android", platform: "android" } });
  assert.equal(approved.statusCode, 200);
  const accessToken = approved.json().accessToken;
  assert.ok(accessToken);
  assert.ok(approved.json().refreshToken);

  const system = await app.inject({ method: "GET", url: "/api/mobile/system", headers: { authorization: `Bearer ${accessToken}` } });
  assert.equal(system.statusCode, 200);
  assert.equal(system.json().available, true);

  const refresh = await app.inject({ method: "POST", url: "/api/mobile/auth/refresh", headers: { "content-type": "application/json" }, payload: { refreshToken: approved.json().refreshToken } });
  assert.equal(refresh.statusCode, 200);
  const replay = await app.inject({ method: "POST", url: "/api/mobile/auth/refresh", headers: { "content-type": "application/json" }, payload: { refreshToken: approved.json().refreshToken } });
  assert.equal(replay.statusCode, 401);
});

test("health, SQLite y fallback SPA funcionan sin Cloudflare", async (t) => {
  const { app, db } = await setup();
  t.after(async () => { await app.close(); db.close(); });
  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().database, "ok");
  const page = await app.inject({ method: "GET", url: "/dashboard/unknown" });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /AGM/);
  assert.doesNotMatch(page.headers["content-security-policy"], /cloudflare/i, "CSP must not allow Cloudflare");
});

test("webhook firmado actualiza SQLite una vez y el backup es consistente", async (t) => {
  const { app, db, config } = await setup();
  t.after(async () => { await app.close(); db.close(); });
  const payload = { secret: "test-stats-webhook-secret", type: "Single", price: 100, creatorId: 802409113, userId: "123456789", eventId: "webhook-test-event-1234" };
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = "nonce-for-test-123456";
  const signature = hmac(`${timestamp}.${nonce}.${raw}`, config.statsSecret);
  const request = { method: "POST", url: "/games/Clothing/stats", headers: { "content-type": "application/json", "x-agm-timestamp": timestamp, "x-agm-nonce": nonce, "x-agm-signature": signature }, payload: raw };
  const first = await app.inject(request);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().recorded, true);
  const duplicate = await app.inject(request);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().duplicate, true);
  assert.equal(db.prepare("SELECT spent, revenue, single_count FROM weekly_stats").get().spent, 100);
  assert.equal(db.prepare("SELECT spent, revenue, single_count FROM weekly_stats").get().revenue, 70);
  assert.equal(db.prepare("SELECT spent, revenue, single_count FROM weekly_stats").get().single_count, 1);

  const backups = createBackupService({ db, config, audit: createAuditService(db) });
  const backupPath = await backups.create("test");
  const information = await fs.stat(backupPath);
  assert.ok(information.size > 0);
});
