import { Link } from "react-router-dom";

export default function Hero({ description }) {
  return <section className="hero" id="inicio"><div className="hero-shade" /><div className="hero-content"><div className="eyebrow">Roblox game studio</div><h1>ANOTHER GAME<br />MORE <span>STUDIO</span></h1><p>{description}</p><div className="hero-actions"><a className="button red" href="#nosotros">Conócenos <b>›</b></a><a className="button outline" href="#juegos">Ver juegos <b>›</b></a></div></div><StatsBar /></section>;
}

function StatsBar() {
  const stats = [["♧", "10M+", "Visitas totales"], ["☆", "250K+", "Favoritos"], ["⌘", "15+", "Experiencias"], ["▣", "4+", "Años creando"]];
  return <div className="stats-bar" id="logros">{stats.map(([icon, value, label]) => <div className="stat" key={label}><i>{icon}</i><div><strong>{value}</strong><span>{label}</span></div></div>)}</div>;
}
