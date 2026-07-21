import { useEffect, useState } from "react";
import DataCard from "../components/dashboard/DataCard.jsx";
import LineChart from "../components/dashboard/LineChart.jsx";
import { METRICS } from "../components/dashboard/metrics.js";
import { api } from "../services/api.js";

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/analytics").then(({ analytics: result }) => setAnalytics(result)).catch((requestError) => setError(requestError.message));
  }, []);

  if (error) return <div className="panel-message error-message">{error}</div>;
  if (!analytics) return <div className="loading dashboard-loading">Preparando resúmenes…</div>;

  return <div className="analytics-stack">
    {[analytics.weekly, analytics.monthly, analytics.global].map((period) => <AnalyticsPeriod period={period} key={period.title} />)}
  </div>;
}

function AnalyticsPeriod({ period }) {
  const totals = period.totals || {};
  const isGlobal = period.title === "Resumen Global";

  return <section className="analytics-period">
    <div className="page-title analytics-title"><span className="page-eyebrow">Analítica de actividad</span><h2>{period.title}</h2><p>{period.subtitle}</p></div>
    <div className="data-grid period-cards">
      {["revenue", "spent", "single", "bulk", "donations"].map((key) => <DataCard label={METRICS[key].cardLabel} value={`${(totals[key] || 0).toLocaleString()}${METRICS[key].unit}`} icon={key} key={key} />)}
    </div>
    <div className="period-charts">
      <LineChart points={period.points} title={`${period.title}: revenue y gastado`} />
      {isGlobal && <div className="secondary-chart"><div className="chart-heading"><span className="page-eyebrow">Distribución global</span><h3>Single, bulk y donations</h3><p>Actividad histórica agrupada por semana.</p></div><LineChart points={period.points} series={["single", "bulk", "donations"]} title="Resumen global de single, bulk y donations" /></div>}
    </div>
  </section>;
}
