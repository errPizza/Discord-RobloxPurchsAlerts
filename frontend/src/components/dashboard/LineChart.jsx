import { useId } from "react";
import MetricIcon from "./MetricIcon.jsx";
import { METRICS } from "./metrics.js";

const WIDTH = 760;
const HEIGHT = 270;
const PADDING = { top: 24, right: 58, bottom: 42, left: 58 };

function linePoints(points, key, maximum) {
  const availableWidth = WIDTH - PADDING.left - PADDING.right;
  const availableHeight = HEIGHT - PADDING.top - PADDING.bottom;

  return points.map((point, index) => {
    const x = PADDING.left + (points.length === 1 ? availableWidth / 2 : (index / (points.length - 1)) * availableWidth);
    const y = PADDING.top + availableHeight - ((Number(point[key]) || 0) / maximum) * availableHeight;

    return { ...point, x, y };
  });
}

function labelIndexes(length) {
  if (length <= 6) return Array.from({ length }, (_, index) => index);

  return [...new Set([0, Math.floor((length - 1) / 4), Math.floor((length - 1) / 2), Math.floor(((length - 1) * 3) / 4), length - 1])];
}

function axisMaximum(points, series, axis) {
  const keys = series.filter((key) => METRICS[key].axis === axis);

  return Math.max(1, ...points.flatMap((point) => keys.map((key) => Number(point[key]) || 0)));
}

export default function LineChart({ points = [], series = ["revenue", "spent"], title = "Evolución de estadísticas" }) {
  const titleId = useId();
  const safePoints = points.length ? points : [{ key: "empty", label: "Sin datos", revenue: 0, spent: 0, single: 0, bulk: 0, donations: 0 }];
  const visibleSeries = series.filter((key) => METRICS[key]);
  const hasRobux = visibleSeries.some((key) => METRICS[key].axis === "robux");
  const hasCount = visibleSeries.some((key) => METRICS[key].axis === "count");
  const maxima = {
    robux: axisMaximum(safePoints, visibleSeries, "robux"),
    count: axisMaximum(safePoints, visibleSeries, "count"),
  };
  const lines = Object.fromEntries(visibleSeries.map((key) => [key, linePoints(safePoints, key, maxima[METRICS[key].axis])]));
  const visibleLabels = labelIndexes(safePoints.length);

  return <div className="line-chart">
    <div className="chart-legend" aria-hidden="true">
      {visibleSeries.map((key) => <span key={key} style={{ "--series-color": METRICS[key].color }}><MetricIcon type={key} size={17} />{METRICS[key].label}</span>)}
    </div>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{title}</title>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) * ratio;
        const leftMaximum = hasRobux ? maxima.robux : maxima.count;
        const leftValue = Math.round(leftMaximum * (1 - ratio));
        const rightValue = Math.round(maxima.count * (1 - ratio));

        return <g key={ratio}>
          <line className="chart-gridline" x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} />
          <text className="chart-axis-value" textAnchor="end" x={PADDING.left - 12} y={y + 4}>{leftValue.toLocaleString()}</text>
          {hasRobux && hasCount && <text className="chart-axis-value chart-axis-right" x={WIDTH - PADDING.right + 12} y={y + 4}>{rightValue.toLocaleString()}</text>}
        </g>;
      })}
      {visibleSeries.map((key) => <polyline className="chart-line" style={{ stroke: METRICS[key].color }} points={lines[key].map(({ x, y }) => `${x},${y}`).join(" ")} key={`line-${key}`} />)}
      {visibleSeries.flatMap((key) => lines[key].map((item) => <circle className="chart-point" style={{ fill: METRICS[key].color }} cx={item.x} cy={item.y} r="4" key={`${key}-${item.key}`}>
        <title>{`${item.label}: ${(Number(item[key]) || 0).toLocaleString()}${METRICS[key].unit} · ${METRICS[key].label}`}</title>
      </circle>))}
      {visibleLabels.map((index) => <text className="chart-axis-label" textAnchor={index === 0 ? "start" : index === safePoints.length - 1 ? "end" : "middle"} x={lines[visibleSeries[0]][index].x} y={HEIGHT - 14} key={safePoints[index].key}>{safePoints[index].label}</text>)}
    </svg>
    {hasRobux && hasCount && <div className="chart-axis-note"><span>Izquierda: Robux</span><span>Derecha: actividad</span></div>}
  </div>;
}
