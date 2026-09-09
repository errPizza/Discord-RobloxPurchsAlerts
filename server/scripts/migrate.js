import path from "node:path";
import { loadConfig } from "../config.js";
import { openDatabase } from "../database/database.js";
import { applyMigrations } from "../database/migrate.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
try {
  const files = applyMigrations(db, path.resolve("server/database/migrations"));
  console.log(`SQLite listo en ${config.databasePath}; ${files.length} migraciones verificadas.`);
} finally {
  db.close();
}
