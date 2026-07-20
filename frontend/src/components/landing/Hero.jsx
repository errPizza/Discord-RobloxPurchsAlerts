import { scrollToSection } from "../../utils/scroll.js";
import usersIcon from "../../assets/icons/achievement-users.png";
import starIcon from "../../assets/icons/achievement-star.png";
import gamepadIcon from "../../assets/icons/achievement-gamepad.png";
import calendarIcon from "../../assets/icons/achievement-calendar.png";

export default function Hero({ description }) {
  const navigate = (event, hash) => {
    event.preventDefault();
    scrollToSection(hash);
  };

  return <section className="hero" id="inicio">
    <div className="hero-shade" />
    <div className="hero-content">
      <div className="eyebrow">Roblox game studio</div>
      <h1>ANOTHER GAME<br />MORE <span>STUDIO</span></h1>
      <p>{description}</p>
      <div className="hero-actions">
        <a className="button red" href="#nosotros" onClick={(event) => navigate(event, "#nosotros")}>Conócenos <b>›</b></a>
        <a className="button outline" href="#juegos" onClick={(event) => navigate(event, "#juegos")}>Ver experiencias <b>›</b></a>
      </div>
    </div>
    <StatsBar />
  </section>;
}

function StatsBar() {
  const stats = [
    [usersIcon, "10M+", "Visitas totales"],
    [starIcon, "250K+", "Favoritos"],
    [gamepadIcon, "15+", "Experiencias"],
    [calendarIcon, "4+", "Años creando"],
  ];

  return <div className="achievements-section">
    <div className="stats-bar" id="logros" role="group" aria-label="Logros del estudio">
      {stats.map(([icon, value, label]) => <div className="stat" key={label}>
        <img className="stat-icon" src={icon} alt="" aria-hidden="true" />
        <div><strong>{value}</strong><span>{label}</span></div>
      </div>)}
    </div>
  </div>;
}
