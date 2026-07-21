import MetricIcon from "./MetricIcon.jsx";
import { METRICS } from "./metrics.js";

const DEFAULT_SERIES = ["spent", "revenue", "single", "bulk", "donations"];

export default function MetricBarChart({ values = {}, series = DEFAULT_SERIES, title = "Valores de la semana" }) {
  const maxima = {
    robux: Math.max(1, ...series.filter((key) => METRICS[key].axis === "robux").map((key) => Number(values[key]) || 0)),
    count: Math.max(1, ...series.filter((key) => METRICS[key].axis === "count").map((key) => Number(values[key]) || 0)),
  };

  return <figure className="metric-bar-chart" aria-label={title}>
    <figcaption>{title}</figcaption>
    <div className="metric-bars">
      {series.map((key) => {
        const metric = METRICS[key];
        const value = Math.max(0, Number(values[key]) || 0);
        const percentage = value ? Math.max(4, (value / maxima[metric.axis]) * 100) : 0;

        return <div className="metric-bar-row" key={key} style={{ "--series-color": metric.color, "--bar-size": `${percentage}%` }}>
          <span className="metric-bar-label"><MetricIcon type={key} size={21} />{metric.label}</span>
          <div className="metric-bar-track"><i /></div>
          <strong>{value.toLocaleString()}{metric.unit}</strong>
        </div>;
      })}
    </div>
  </figure>;
}
