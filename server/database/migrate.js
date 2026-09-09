import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function checksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

export function applyMigrations(db, migrationsDirectory) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  const applied = new Map(db.prepare("SELECT name, checksum FROM schema_migrations").all().map((row) => [row.name, row.checksum]));
  const files = fs.readdirSync(migrationsDirectory).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  const migrate = db.transaction(() => {
    for (const name of files) {
      const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
      const digest = checksum(sql);
      const previous = applied.get(name);
      if (previous && previous !== digest) throw new Error(`La migración ${name} fue modificada después de aplicarse.`);
      if (previous) continue;
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)").run(name, digest);
    }
  });
  migrate();
  return files;
}
