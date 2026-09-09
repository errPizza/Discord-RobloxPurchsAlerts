import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../config.js";
import { openDatabase } from "../database/database.js";
import { applyMigrations } from "../database/migrate.js";
import { hashPassword, passwordRequirements } from "../services/password.js";
import { normalizedEmail } from "../services/security.js";

const config = loadConfig();
const cli = readline.createInterface({ input, output });
try {
  const email = normalizedEmail(process.argv[2] || await cli.question("Correo de la cuenta owner: "));
  const password = await cli.question("Contraseña inicial (se mostrará al escribir): ");
  if (!email) throw new Error("El correo no es válido.");
  const requirement = passwordRequirements(password, email);
  if (requirement) throw new Error(requirement);
  const db = openDatabase(config.databasePath);
  try {
    applyMigrations(db, path.resolve("server/database/migrations"));
    const existingOwner = db.prepare("SELECT id, email FROM users WHERE role = 'owner' LIMIT 1").get();
    if (existingOwner && existingOwner.email.toLowerCase() !== email) throw new Error(`Ya existe una cuenta owner (${existingOwner.email}).`);
    const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
    if (existing) db.prepare("UPDATE users SET password_hash = ?, role = 'owner' WHERE id = ?").run(hashPassword(password, config.passwordPepper), existing.id);
    else db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'owner')").run(email, hashPassword(password, config.passwordPepper));
    console.log(`La cuenta ${email} ahora es owner.`);
  } finally { db.close(); }
} catch (error) {
  console.error(`No se creó la cuenta owner: ${error.message}`);
  process.exitCode = 1;
} finally { cli.close(); }
