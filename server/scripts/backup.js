import { loadConfig } from "../config.js";
import { openDatabase } from "../database/database.js";
import { createAuditService } from "../services/audit.js";
import { createBackupService } from "../services/backups.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
try {
  const backup = createBackupService({ db, config, audit: createAuditService(db) });
  const file = await backup.create("manual-cli");
  console.log(`Backup creado: ${file}`);
} finally { db.close(); }
