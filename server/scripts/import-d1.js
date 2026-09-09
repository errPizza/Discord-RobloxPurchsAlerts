import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { openDatabase } from "../database/database.js";
import { applyMigrations } from "../database/migrate.js";

const TABLES = ["users", "oauth_accounts", "auth_sessions", "auth_failures", "webhook_events", "contacts", "site_settings", "weekly_stats", "daily_stats", "discord_message_blocklist", "game_stat_events"];
const argumentsList = process.argv.slice(2);
const inputIndex = argumentsList.indexOf("--input");
const input = inputIndex >= 0 ? argumentsList[inputIndex + 1] : null;

if (!input) {
  console.error("Uso: npm run db:import -- --input /ruta/export.sql|export.json");
  process.exit(1);
}

const config = loadConfig();
const target = openDatabase(config.databasePath);
let source;
let temporary;
try {
  applyMigrations(target, path.resolve("server/database/migrations"));
  const occupied = TABLES.filter((table) => table !== "site_settings" && target.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count > 0);
  if (occupied.length) throw new Error(`La SQLite de destino ya contiene datos en: ${occupied.join(", ")}. El importador nunca borra ni sobrescribe datos.`);
  const raw = await fs.readFile(input, "utf8");
  if (input.toLowerCase().endsWith(".json")) {
    temporary = path.join(config.backupPath, `d1-import-${crypto.randomUUID()}.sqlite`);
    await fs.mkdir(config.backupPath, { recursive: true, mode: 0o750 });
    source = new Database(temporary);
    const parsed = JSON.parse(raw);
    for (const table of TABLES) {
      const rows = parsed?.tables?.[table] || parsed?.[table] || [];
      if (!Array.isArray(rows) || !rows.length) continue;
      const columns = source.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.length) {
        const names = Object.keys(rows[0]).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
        source.exec(`CREATE TABLE ${table} (${names.map((name) => `${name} TEXT`).join(", ")})`);
      }
      const names = Object.keys(rows[0]).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
      const insert = source.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`);
      const write = source.transaction((items) => items.forEach((row) => insert.run(...names.map((name) => row[name] ?? null))));
      write(rows);
    }
  } else {
    temporary = path.join(config.backupPath, `d1-import-${crypto.randomUUID()}.sqlite`);
    await fs.mkdir(config.backupPath, { recursive: true, mode: 0o750 });
    source = new Database(temporary);
    source.exec(raw);
  }
  const copy = target.transaction(() => {
    for (const table of TABLES) {
      const sourceColumns = source.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      if (!sourceColumns.length) continue;
      const targetColumns = target.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      const columns = targetColumns.filter((column) => sourceColumns.includes(column));
      if (!columns.length) continue;
      const read = source.prepare(`SELECT ${columns.join(",")} FROM ${table}`);
      const write = target.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
      for (const row of read.iterate()) write.run(...columns.map((column) => row[column]));
    }
  });
  copy();
  console.log("Importación terminada sin borrar ni sobrescribir registros existentes.");
} catch (error) {
  console.error(`Importación cancelada: ${error.message}`);
  process.exitCode = 1;
} finally {
  source?.close();
  target.close();
  if (temporary) await fs.unlink(temporary).catch(() => {});
}
