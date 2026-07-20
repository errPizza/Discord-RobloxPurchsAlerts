export default function DataCard({ label, value, icon = "◇" }) { return <article className="data-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }
