import path from "node:path";
import fs from "node:fs";

function boolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function number(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function duration(value, fallbackMs) {
  const match = String(value || "").trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;
  const unit = (match[2] || "ms").toLowerCase();
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  const result = Number(match[1]) * multiplier;
  return Number.isSafeInteger(result) && result > 0 ? result : fallbackMs;
}

export function loadConfig(env = process.env) {
  if (env === process.env && typeof process.loadEnvFile === "function") {
    const localEnv = path.resolve(".env");
    if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
  }
  const host = env.HOST || "127.0.0.1";
  const port = number(env.PORT, 8787, { min: 1, max: 65535 });
  const databasePath = path.resolve(env.DATABASE_PATH || path.join(process.cwd(), "data", "database.sqlite"));
  const backupPath = path.resolve(env.BACKUP_PATH || path.join(process.cwd(), "backups"));
  const staticRoot = path.resolve(env.STATIC_ROOT || path.join(process.cwd(), "frontend", "dist"));
  const staticSourcePath = path.resolve(env.STATIC_SOURCE_PATH || path.join(process.cwd(), "frontend", "dist"));

  return Object.freeze({
    nodeEnv: env.NODE_ENV || "development",
    host,
    port,
    databasePath,
    backupPath,
    staticRoot,
    staticSourcePath,
    publicOrigin: env.PUBLIC_ORIGIN || `http://${host}:${port}`,
    cookieSecure: env.COOKIE_SECURE || "auto",
    sessionSecret: env.SESSION_SECRET || "",
    passwordPepper: env.PASSWORD_PEPPER || "",
    mobileAccessTokenSecret: env.MOBILE_ACCESS_TOKEN_SECRET || "",
    mobileRefreshTokenSecret: env.MOBILE_REFRESH_TOKEN_SECRET || "",
    donationSecret: env.DONATION_SECRET || "",
    itemsSecret: env.ITEMS_SECRET || "",
    statsSecret: env.STATS_SECRET || "",
    bombGameSecret: env.BOMBGAME_SECRET || "",
    donationWebhook: env.DONATION_WEBHOOK || "",
    singleItemWebhook: env.SINGLE_ITEM_WEBHOOK || "",
    bulkItemsWebhook: env.BULK_ITEMS_WEBHOOK || "",
    statsWebhook: env.STATS_WEBHOOK || "",
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || "",
    discordClientId: env.DISCORD_CLIENT_ID || "",
    discordClientSecret: env.DISCORD_CLIENT_SECRET || "",
    requireSignedWebhooks: boolean(env.REQUIRE_SIGNED_WEBHOOKS, true),
    dockerEnabled: boolean(env.DOCKER_ENABLED),
    dockerSocketPath: env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
    dockerAllowedContainers: new Set(String(env.DOCKER_ALLOWED_CONTAINERS || "").split(",").map((item) => item.trim()).filter(Boolean)),
    nginxEnabled: boolean(env.NGINX_ENABLED),
    hostControlEnabled: boolean(env.HOST_CONTROL_ENABLED),
    hostControlSocket: env.HOST_CONTROL_SOCKET || "/run/agm-host-control.sock",
    hostControlSecret: env.HOST_CONTROL_SECRET || "",
    backupEnabled: boolean(env.BACKUP_ENABLED, true),
    backupIntervalMs: duration(env.BACKUP_INTERVAL, 86_400_000),
    backupRetention: number(env.BACKUP_RETENTION, 14, { min: 1, max: 3650 }),
    requestLogRetentionDays: number(env.REQUEST_LOG_RETENTION_DAYS, 30, { min: 1, max: 3650 }),
    thresholds: {
      cpu: number(env.ALERT_CPU_PERCENT, 0, { min: 0, max: 100 }),
      ram: number(env.ALERT_RAM_PERCENT, 0, { min: 0, max: 100 }),
      temperature: number(env.ALERT_TEMPERATURE_C, 0, { min: 0, max: 150 }),
      disk: number(env.ALERT_DISK_PERCENT, 0, { min: 0, max: 100 }),
    },
  });
}
