import { useId } from "react";

const WIDTH = 760;
const HEIGHT = 250;
const PADDING = { top: 24, right: 24, bottom: 42, left: 58 };

function linePoints(points, key, maximum) {

  const availableWidth = WIDTH - PADDING.left - PADDING.right;
  const availableHeight = HEIGHT - PADDING.top - PADDING.bottom;

  return points.map((point, index) => {
    const x = PADDING.left + (points.length === 1 ? availableWidth / 2 : (index / (points.length - 1)) * availableWidth);
    const y = PADDING.top + availableHeight - (point[key] / maximum) * availableHeight;

    return { ...point, x, y };
  });
}

function labelIndexes(length) {

  if (length <= 6) return Array.from({ length }, (_, index) => index);

  return [...new Set([0, Math.floor((length - 1) / 4), Math.floor((length - 1) / 2), Math.floor(((length - 1) * 3) / 4), length - 1])];
}

export default function LineChart({ points = [] }) {
  const titleId = useId();
  const safePoints = points.length ? points : [{ key: "empty", label: "Sin datos", revenue: 0, spent: 0 }];
  const maximum = Math.max(1, ...safePoints.flatMap((point) => [point.revenue, point.spent]));
  const revenue = linePoints(safePoints, "revenue", maximum);
  const spent = linePoints(safePoints, "spent", maximum);
  const visibleLabels = labelIndexes(safePoints.length);

  return <div className="line-chart">
    <div className="chart-legend" aria-hidden="true"><span className="revenue-line">Generados</span><span className="spent-line">Gastados</span></div>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>Gráfica lineal de Robux generados y gastados</title>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) * ratio;
        const value = Math.round(maximum * (1 - ratio));

        return <g key={ratio}><line className="chart-gridline" x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} /><text className="chart-axis-value" x={PADDING.left - 12} y={y + 4}>{value.toLocaleString()}</text></g>;
      })}
      <polyline className="chart-line chart-line-revenue" points={revenue.map(({ x, y }) => `${x},${y}`).join(" ")} />
      <polyline className="chart-line chart-line-spent" points={spent.map(({ x, y }) => `${x},${y}`).join(" ")} />
      {revenue.map((item) => <circle className="chart-point chart-point-revenue" cx={item.x} cy={item.y} r="4" key={`revenue-${item.key}`}><title>{`${item.label}: ${item.revenue.toLocaleString()} R$ generados`}</title></circle>)}
      {spent.map((item) => <circle className="chart-point chart-point-spent" cx={item.x} cy={item.y} r="3.5" key={`spent-${item.key}`}><title>{`${item.label}: ${item.spent.toLocaleString()} R$ gastados`}</title></circle>)}
      {visibleLabels.map((index) => <text className="chart-axis-label" textAnchor={index === 0 ? "start" : index === safePoints.length - 1 ? "end" : "middle"} x={revenue[index].x} y={HEIGHT - 14} key={safePoints[index].key}>{safePoints[index].label}</text>)}
    </svg>
  </div>;
}
