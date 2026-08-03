import { useEffect, useState } from "react";
import DataCard from "../components/dashboard/DataCard.jsx";
import LineChart from "../components/dashboard/LineChart.jsx";
import { METRICS } from "../components/dashboard/metrics.js";
import { api } from "../services/api.js";

const PERIOD_ORDER = ["live", "last24Hours", "last7Days", "last30Days"];

function readableUpdate(value) {
  if (!value) return "Esperando datos";

  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function GamesDashboard() {
  const [selectedGame, setSelectedGame] = useState("Clothing");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load(silent = false) {
      if (!silent) setLoading(true);

      try {
        const result = await api(`/api/admin/games?game=${encodeURIComponent(selectedGame)}`);

        if (!active) return;

        setAnalytics(result.analytics);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active && !silent) setLoading(false);
      }
    }

    setAnalytics(null);
    load();

    const interval = window.setInterval(() => load(true), 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedGame]);

  const games = analytics?.games || [
    { key: "Clothing", name: "Lacywings Outfits" },
    { key: "Missile", name: "Missile" },
  ];

  return <div className="games-dashboard-page">
    <div className="games-dashboard-heading">
      <div className="page-title">
        <span className="page-eyebrow">Analítica por experiencia</span>
        <h2>Games</h2>
        <p>Consulta la actividad de cada juego sin mezclar sus estadísticas.</p>
      </div>
      <div className="game-dashboard-controls">
        <label htmlFor="dashboard-game">Seleccionar juego</label>
        <div className="game-dashboard-select">
          <select id="dashboard-game" value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)} disabled={loading}>
            {games.map((game) => <option value={game.key} key={game.key}>{game.name}</option>)}
          </select>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
        </div>
        <span className={`games-live-indicator${error ? " has-error" : ""}`}><i />{error ? "Conexión interrumpida" : `En vivo · ${readableUpdate(analytics?.generatedAt)}`}</span>
      </div>
    </div>

    {error && !analytics && <div className="panel-message error-message">{error}</div>}
    {loading && !analytics
      ? <div className="loading dashboard-loading">Preparando estadísticas del juego…</div>
      : analytics && <div className="game-periods-stack">
        <section className="selected-game-banner">
          <span>Juego seleccionado</span>
          <h3>{analytics.game.name}</h3>
          <small>Identificador de API: {analytics.game.key}</small>
        </section>
        {PERIOD_ORDER.map((key) => <GamePeriod period={analytics.periods[key]} game={analytics.game} key={key} />)}
      </div>}
  </div>;
}

function GamePeriod({ period, game }) {
  const metrics = game.metrics || [];
  const activityMetrics = game.activityMetrics || [];

  return <section className={`game-analytics-period${period.key === "live" ? " is-live" : ""}`}>
    <header className="game-period-heading">
      <div>
        <span className="page-eyebrow">{period.key === "live" ? "Actualización automática" : "Historial del juego"}</span>
        <h3>{period.title}</h3>
        <p>{period.subtitle}</p>
      </div>
      {period.key === "live" && <span className="live-pill"><i />Live</span>}
    </header>
    <div className="data-grid game-period-cards">
      {metrics.map((metric) => <DataCard
        label={METRICS[metric].cardLabel}
        value={`${(period.totals?.[metric] || 0).toLocaleString()}${METRICS[metric].unit}`}
        icon={metric}
        key={metric}
      />)}
    </div>
    <div className="game-period-charts">
      <div>
        <div className="chart-heading"><span className="page-eyebrow">Economía</span><h4>Robux registrados</h4><p>Gastado y revenue durante este periodo.</p></div>
        <LineChart points={period.points} series={["spent", "revenue"]} title={`${game.name}: ${period.title} en Robux`} />
      </div>
      <div>
        <div className="chart-heading"><span className="page-eyebrow">Actividad</span><h4>Eventos registrados</h4><p>Compras y regalos separados por tipo.</p></div>
        <LineChart points={period.points} series={activityMetrics} title={`${game.name}: ${period.title} por tipo de evento`} />
      </div>
    </div>
  </section>;
}
