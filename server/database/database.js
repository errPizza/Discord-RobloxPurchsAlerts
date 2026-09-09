import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o750 });
  const db = new Database(databasePath, { fileMustExist: false, timeout: 5_000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  return db;
}

export function transaction(db, operation) {
  return db.transaction(operation)();
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1_000);
}
