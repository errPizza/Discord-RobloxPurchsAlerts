import fs from "node:fs/promises";

export async function syncStaticAssets(config) {
  if (config.staticRoot === config.staticSourcePath) return;
  try {
    await fs.access(config.staticSourcePath);
    await fs.mkdir(config.staticRoot, { recursive: true, mode: 0o750 });
    await fs.cp(config.staticSourcePath, config.staticRoot, { recursive: true, force: true });
  } catch (error) {
    if (config.nodeEnv === "production") throw new Error(`No fue posible preparar los archivos web persistentes: ${error.message}`);
  }
}
