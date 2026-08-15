import { useEffect, useState } from "react";
import DataCard from "../components/dashboard/DataCard.jsx";
import GameSelect from "../components/dashboard/GameSelect.jsx";
import LineChart from "../components/dashboard/LineChart.jsx";
import { METRICS } from "../components/dashboard/metrics.js";
import { api, webSocketUrl } from "../services/api.js";

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
  const [liveConnection, setLiveConnection] = useState("connecting");

  useEffect(() => {
    let active = true;
    let requestRunning = false;
    let refreshQueued = false;
    let reconnectAttempts = 0;
    let reconnectTimer;
    let socket;

    async function load(silent = false) {
      if (requestRunning) {
        refreshQueued = true;
        return;
      }

      requestRunning = true;

      if (!silent) setLoading(true);

      do {
        refreshQueued = false;

        try {
          const result = await api(`/api/admin/games?game=${encodeURIComponent(selectedGame)}`);

          if (!active) return;

          setAnalytics(result.analytics);
          setError("");
        } catch (requestError) {
          if (active) setError(requestError.message);
        }
      } while (active && refreshQueued);

      requestRunning = false;

      if (active && !silent) setLoading(false);
    }

    function connect() {
      if (!active) return;

      setLiveConnection(reconnectAttempts ? "reconnecting" : "connecting");
      socket = new WebSocket(webSocketUrl(`/api/admin/games/events?game=${encodeURIComponent(selectedGame)}`));

      socket.addEventListener("open", () => {
        if (!active) return;

        reconnectAttempts = 0;
        setLiveConnection("connected");
        load(true);
      });

      socket.addEventListener("message", (event) => {
        if (!active) return;

        try {
          const purchase = JSON.parse(event.data);

          if (purchase.type === "purchase" && purchase.gameKey === selectedGame) load(true);
        } catch { /* Ignore control frames that are not purchase events. */ }
      });

      socket.addEventListener("close", () => {
        if (!active) return;

        setLiveConnection("reconnecting");
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * (2 ** (reconnectAttempts - 1)), 15000));
      });

      socket.addEventListener("error", () => socket.close());
    }

    setAnalytics(null);
    load();
    connect();

    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close(1000, "Cambio de vista");
    };
  }, [selectedGame]);

  const games = analytics?.games || [
    { key: "Clothing", name: "Lacywings Outfits" },
    { key: "Missile", name: "Missile" },
  ];
  const liveLabel = liveConnection === "connected"
    ? `En vivo · ${readableUpdate(analytics?.generatedAt)}`
    : liveConnection === "reconnecting" ? "Reconectando en vivo…" : "Conectando en vivo…";
  const liveHasError = Boolean(error) || liveConnection === "reconnecting";

  return <div className="games-dashboard-page">
    <div className="games-dashboard-heading">
      <div className="page-title">
        <span className="page-eyebrow">Analítica por experiencia</span>
        <h2>Games</h2>
        <p>Consulta la actividad de cada juego sin mezclar sus estadísticas.</p>
      </div>
      <div className="game-dashboard-controls">
        <label htmlFor="dashboard-game">Seleccionar juego</label>
        <GameSelect id="dashboard-game" value={selectedGame} options={games} onChange={setSelectedGame} disabled={loading} />
        <span className={`games-live-indicator${liveHasError ? " has-error" : ""}`}><i />{error && !analytics ? "Conexión interrumpida" : liveLabel}</span>
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
