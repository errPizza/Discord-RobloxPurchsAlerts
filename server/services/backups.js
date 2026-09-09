import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function createBackupService({ db, config, audit }) {
  async function create(reason = "manual") {
    await fs.mkdir(config.backupPath, { recursive: true, mode: 0o750 });
    const finalPath = path.join(config.backupPath, `database-${stamp()}.sqlite`);
    const temporaryPath = `${finalPath}.partial`;
    await db.backup(temporaryPath);
    const check = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = check.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") throw new Error("El backup SQLite no superó integrity_check.");
    } finally { check.close(); }
    await fs.rename(temporaryPath, finalPath);
    audit.log({ service: "backup", level: "INFO", message: `Backup creado: ${path.basename(finalPath)}`, metadata: { reason } });
    await rotate();
    return finalPath;
  }

  async function rotate() {
    const names = (await fs.readdir(config.backupPath, { withFileTypes: true })).filter((entry) => entry.isFile() && /^database-.*\.sqlite$/.test(entry.name)).map((entry) => entry.name).sort().reverse();
    await Promise.all(names.slice(config.backupRetention).map((name) => fs.unlink(path.join(config.backupPath, name))));
  }

  function schedule() {
    if (!config.backupEnabled) return () => {};
    const timer = setInterval(() => create("automatic").catch((error) => audit.log({ service: "backup", level: "ERROR", message: "Falló el backup automático.", metadata: { error: error.message } })), config.backupIntervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  return { create, rotate, schedule };
}
