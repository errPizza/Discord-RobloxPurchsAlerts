import MetricIcon from "./MetricIcon.jsx";
import { METRICS } from "./metrics.js";

const GROUPS = [
  { title: "Robux", series: ["spent", "revenue"] },
  { title: "Actividad", series: ["single", "bulk", "donations"] },
];

export default function MetricOverviewChart({ values = {}, title = "Gráfica de la semana" }) {
  return <figure className="metric-overview-chart" aria-label={title}>
    <figcaption><span>{title}</span><small>Escalas independientes para Robux y cantidad de eventos.</small></figcaption>
    <div className="metric-overview-groups">
      {GROUPS.map((group) => {
        const maximum = Math.max(1, ...group.series.map((key) => Number(values[key]) || 0));

        return <section className="metric-overview-group" key={group.title}>
          <span className="metric-overview-axis">{group.title}</span>
          <div className="metric-overview-columns" style={{ "--columns": group.series.length }}>
            {group.series.map((key) => {
              const metric = METRICS[key];
              const value = Math.max(0, Number(values[key]) || 0);
              const height = value ? Math.max(7, (value / maximum) * 100) : 0;

              return <div className="metric-overview-column" style={{ "--series-color": metric.color, "--column-height": `${height}%` }} key={key}>
                <div className="metric-overview-value">{value.toLocaleString()}{metric.unit}</div>
                <div className="metric-overview-track"><i /></div>
                <span><MetricIcon type={key} size={20} />{metric.label}</span>
              </div>;
            })}
          </div>
        </section>;
      })}
    </div>
  </figure>;
}
