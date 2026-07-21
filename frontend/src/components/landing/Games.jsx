import lacywingsCover from "../../assets/images/lacywings-outfits-cover.webp";
import gamesBackground from "../../assets/images/games-shared-background.webp";
import errPizzaAvatar from "../../assets/images/avatar-err-pizza.webp";
import builderAvatar from "../../assets/images/avatar-676767.webp";
import ciciAvatar from "../../assets/images/avatar-cici.webp";
import PlatformIcon from "../common/PlatformIcon.jsx";

const principles = [
  { number: "01", title: "Gameplay con intención", text: "Cada mecánica está pensada para ser clara, satisfactoria y dejar ganas de jugar una partida más." },
  { number: "02", title: "Comunidades vivas", text: "Diseñamos espacios sociales que convierten una experiencia en un lugar al que siempre apetece volver." },
  { number: "03", title: "Evolución constante", text: "Escuchamos, medimos y mejoramos cada mundo para que siga sintiéndose fresco con el paso del tiempo." },
];

const contributors = [
  {
    name: "err_Pizza",
    handle: "@err_Lo2sDat4",
    roles: ["Software Designer", "Scripter", "UI Design"],
    avatar: errPizzaAvatar,
    profile: "https://www.roblox.com/es/users/4093162315/profile",
  },
  {
    name: "676767",
    handle: "@dlksadjadjkd1s3",
    roles: ["Builder", "Game Design", "Project Manager"],
    avatar: builderAvatar,
    profile: "https://www.roblox.com/es/users/8933542097/profile",
  },
  {
    name: "cici",
    handle: "@cicisgrave",
    roles: ["Clothing Designer"],
    avatar: ciciAvatar,
    profile: "https://www.roblox.com/es/users/3457883254/profile",
  },
];

export default function Games() {
  return <section className="games-section" id="juegos" data-reveal>
    <div className="games-heading">
      <span className="section-kicker">Nuestras experiencias</span>
      <h2>Creamos mundos que se sienten vivos.</h2>
      <p>No perseguimos partidas rápidas: construimos experiencias memorables, sociales y preparadas para crecer junto a sus jugadores.</p>
    </div>
    <article className="game-showcase" style={{ "--game-background": `url(${gamesBackground})` }}>
      <div className="game-cover-wrap">
        <img className="game-cover" src={lacywingsCover} alt="Portada de Lacywings Outfits" loading="lazy" decoding="async" />
        <span className="game-index">Experiencia 01</span>
      </div>
      <div className="game-content">
        <span className="game-category">Moda y personalización · Roblox</span>
        <h3>Lacywings Outfits</h3>
        <p className="game-description">Una experiencia de moda creada para descubrir ropa, comprar accesorios y transformar tu avatar con un catálogo de skins prediseñadas. Explora combinaciones cuidadosamente preparadas y encuentra un estilo listo para llevar dentro de Roblox.</p>
        <div className="game-team-heading">
          <span>Equipo del proyecto</span>
          <small>Diseño, desarrollo y contenido</small>
        </div>
        <div className="game-contributors">
          {contributors.map((contributor) => <a className="game-contributor" href={contributor.profile} target="_blank" rel="noreferrer" key={contributor.profile}>
            <img src={contributor.avatar} alt={`Avatar de Roblox de ${contributor.name}`} loading="lazy" decoding="async" />
            <span className="game-contributor-info">
              <strong>{contributor.name} <i>({contributor.handle})</i></strong>
              <small>{contributor.roles.join(" · ")}</small>
            </span>
            <PlatformIcon type="roblox" size={18} className="game-platform-icon" />
          </a>)}
        </div>
      </div>
    </article>
    <div className="principles-grid">
      {principles.map((principle) => <article className="principle-card" key={principle.number}>
        <span>{principle.number}</span>
        <h3>{principle.title}</h3>
        <p>{principle.text}</p>
      </article>)}
    </div>
  </section>;
}
