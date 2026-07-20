import { useEffect, useState } from "react";
import DataCard from "../components/dashboard/DataCard.jsx";
import LineChart from "../components/dashboard/LineChart.jsx";
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

  return <section className="analytics-period">
    <div className="page-title analytics-title"><span className="page-eyebrow">Analítica de actividad</span><h2>{period.title}</h2><p>{period.subtitle}</p></div>
    <div className="data-grid period-cards">
      <DataCard label="Robux generados" value={`${(totals.revenue || 0).toLocaleString()} R$`} icon="◈" />
      <DataCard label="Robux gastados" value={`${(totals.spent || 0).toLocaleString()} R$`} icon="◉" />
      <DataCard label="Compras" value={totals.purchases || 0} icon="▣" />
      <DataCard label="Donaciones" value={totals.donations || 0} icon="♡" />
    </div>
    <LineChart points={period.points} />
  </section>;
}
