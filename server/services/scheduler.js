import { weeklySummary, sendDiscord } from "./discord.js";
import { getWeekKey } from "./stats.js";
import { getGroupIconUrl } from "./roblox.js";

function millisecondsUntilMondaySixUtc(now = new Date()) {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const days = (8 - next.getUTCDay()) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(6, 0, 0, 0);
  return Math.max(1_000, next.valueOf() - now.valueOf());
}

export function createWeeklySummaryScheduler({ db, config, stats, audit }) {
  let timer;
  async function run() {
    try {
      const enabled = db.prepare("SELECT value FROM site_settings WHERE key = 'worker_enabled'").get()?.value !== "0";
      if (!enabled || !config.statsWebhook) return false;
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - 7);
      const week = getWeekKey(date);
      const previous = db.prepare("SELECT value FROM site_settings WHERE key = 'last_weekly_summary_week'").get()?.value;
      const summary = stats.getWeekly(week);
      if (!summary || previous === week) return false;
      await sendDiscord(config.statsWebhook, weeklySummary(summary, await getGroupIconUrl()));
      db.prepare("INSERT INTO site_settings (key, value) VALUES ('last_weekly_summary_week', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(week);
      audit.log({ service: "scheduler", level: "INFO", message: `Resumen semanal enviado: ${week}` });
      return true;
    } catch (error) {
      audit.log({ service: "scheduler", level: "ERROR", message: "No fue posible enviar el resumen semanal.", metadata: { error: error.message } });
      return false;
    }
  }
  function schedule() {
    timer = setTimeout(async () => { await run(); schedule(); }, millisecondsUntilMondaySixUtc());
    timer.unref();
  }
  schedule();
  return { run, stop: () => clearTimeout(timer) };
}
