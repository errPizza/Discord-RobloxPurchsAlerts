import { useEffect, useState } from "react";
import MetricBarChart from "../components/dashboard/MetricBarChart.jsx";
import MetricIcon from "../components/dashboard/MetricIcon.jsx";
import MetricOverviewChart from "../components/dashboard/MetricOverviewChart.jsx";
import WeekSelect from "../components/dashboard/WeekSelect.jsx";
import { METRICS } from "../components/dashboard/metrics.js";
import { api } from "../services/api.js";

const FIELDS = ["spent", "revenue", "single", "bulk", "donations"];

function emptyStats(week = "") {
  return { week, spent: 0, revenue: 0, single: 0, bulk: 0, donations: 0 };
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [currentWeek, setCurrentWeek] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/api/admin/stats").then((result) => {
      setStats(result.stats);
      setWeeks(result.weeks || []);
      setCurrentWeek(result.currentWeek || "");
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);

  async function selectWeek(week) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await api(`/api/admin/stats?week=${encodeURIComponent(week)}`);

      setStats(result.stats || emptyStats(week));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function changeValue(key, value) {
    if (value !== "" && (!/^\d+$/.test(value) || Number(value) > Number.MAX_SAFE_INTEGER)) return;

    setStats((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function nudgeValue(key, amount) {
    const current = Number(stats?.[key]) || 0;
    const next = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, current + amount));

    changeValue(key, String(next));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = Object.fromEntries(FIELDS.map((key) => [key, Number(stats[key]) || 0]));
      const result = await api(`/api/admin/stats/${encodeURIComponent(stats.week)}`, { method: "PUT", body: JSON.stringify(payload) });

      setStats(result.stats);
      setWeeks((current) => [...new Set([...current, result.stats.week])].sort());
      setMessage("Los valores se guardaron y las gráficas ya usan la nueva información.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !stats) return <div className="loading dashboard-loading">Cargando semanas…</div>;

  const selectableWeeks = [...new Set([...weeks, currentWeek].filter(Boolean))].sort().reverse();

  return <div className="stats-page">
    <div className="page-title"><span className="page-eyebrow">Edición semanal</span><h2>Stats</h2><p>Selecciona una Key, modifica sus valores y revisa el resultado antes de guardarlo.</p></div>
    {error && <div className="panel-message error-message">{error}</div>}
    {message && <div className="panel-message success-message">{message}</div>}
    <div className="stats-workspace">
      <form className="stats-editor" onSubmit={save}>
        <div className="stats-editor-header">
          <div><span className="page-eyebrow">Key de la semana</span><strong>{stats?.week || "Sin semana"}</strong></div>
          <label>Seleccionar Key
            <WeekSelect value={stats?.week || ""} options={selectableWeeks} currentWeek={currentWeek} onChange={selectWeek} disabled={loading || saving} />
          </label>
        </div>
        <div className="stats-fields">
          {FIELDS.map((key) => <div className="stats-field" key={key} style={{ "--series-color": METRICS[key].color }}>
            <label htmlFor={`stats-${key}`}><MetricIcon type={key} size={24} /><span><strong>{METRICS[key].label}</strong><small>{METRICS[key].axis === "robux" ? "Cantidad de Robux" : "Cantidad de eventos"}</small></span></label>
            <div className="stats-number-control">
              <input id={`stats-${key}`} type="text" inputMode="numeric" pattern="[0-9]*" value={stats?.[key] ?? 0} onChange={(event) => changeValue(key, event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); nudgeValue(key, event.key === "ArrowUp" ? 1 : -1); } }} disabled={saving} required aria-label={`Valor de ${METRICS[key].label}`} />
              <span className="stats-stepper">
                <button type="button" onClick={() => nudgeValue(key, 1)} disabled={saving} aria-label={`Aumentar ${METRICS[key].label}`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg></button>
                <button type="button" onClick={() => nudgeValue(key, -1)} disabled={saving || Number(stats?.[key]) <= 0} aria-label={`Disminuir ${METRICS[key].label}`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
              </span>
            </div>
          </div>)}
        </div>
        <div className="stats-save-row"><span>La gráfica cambia mientras escribes. Guardar reemplaza los valores exactos de esta Key.</span><button className="button red" type="submit" disabled={saving || loading}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>
      <div className="stats-preview-stack">
        <MetricBarChart values={stats || emptyStats()} title={`Vista previa · ${stats?.week || "Sin semana"}`} />
        <MetricOverviewChart values={stats || emptyStats()} title={`Gráfica · ${stats?.week || "Sin semana"}`} />
      </div>
    </div>
  </div>;
}
