import MetricIcon from "./MetricIcon.jsx";

export default function DataCard({ label, value, icon = "revenue" }) { return <article className="data-card"><span><MetricIcon type={icon} /></span><div><small>{label}</small><strong>{value}</strong></div></article>; }
