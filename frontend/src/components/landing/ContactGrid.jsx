import studioImage from "../../assets/images/another-game-more-logo.png";
import teamBackground from "../../assets/images/team-card-background.webp";
import PlatformIcon from "../common/PlatformIcon.jsx";

const fallback = [
  { name: "err_Pizza (@err_Lo2sDat4)", role: "Software Designer · Scripter · UI Design", teamGroup: "owner", robloxUserId: "4093162315", robloxUrl: "https://www.roblox.com/es/users/4093162315/profile", discordUsername: "err_pizza", joinedAt: "2023-02-04" },
  { name: "676767 (@dlksadjadjkd1s3)", role: "Builder · Game Design · Project Manager · Analytics", teamGroup: "co_owners", robloxUserId: "8933542097", robloxUrl: "https://www.roblox.com/es/users/8933542097/profile", discordUsername: "._1lll", joinedAt: "2026-01-19" },
  { name: "Chesco (@Chesco_ez)", role: "Builder", teamGroup: "co_owners", robloxUserId: "3790314421", robloxUrl: "https://www.roblox.com/es/users/3790314421/profile", discordUsername: "chescos_ez", joinedAt: "2026-01-19" },
  { name: "Karma (@YurKarmx)", role: "Builder · Game Design", teamGroup: "developers", robloxUserId: "8384200291", robloxUrl: "https://www.roblox.com/es/users/8384200291/profile", discordUsername: "karmalandl", joinedAt: "2026-04-25" },
  { name: "cici (@cicisgrave)", role: "Clothing Designer", teamGroup: "contributors", robloxUserId: "3457883254", robloxUrl: "https://www.roblox.com/es/users/3457883254/profile", discordUsername: "angelkiti", joinedAt: "2026-05-26" },
  { name: "Ryan (@ryan5857q)", role: "Game Tester", teamGroup: "testers", robloxUserId: "3164874123", robloxUrl: "https://www.roblox.com/es/users/3164874123/profile", discordUsername: "ryan2005", joinedAt: "2026-04-15" },
  { name: "Another Game More Studio", role: "Comunidad oficial", teamGroup: "community", robloxUrl: "https://www.roblox.com/es/communities/16939863/Another-Game-More-ST#!/about", discord: "https://discord.gg/QzS8xqmZX8", imageKey: "studio" },
];

const groups = [
  { key: "owner", title: "Owner", description: "Dirección principal del estudio" },
  { key: "co_owners", title: "Co-Owners", description: "Dirección y coordinación del equipo" },
  { key: "developers", title: "Developers", description: "Desarrollo técnico y creativo" },
  { key: "contributors", title: "Contributors", description: "Colaboradores de nuestros proyectos" },
  { key: "testers", title: "Testers", description: "Pruebas, calidad y retroalimentación" },
];

function identity(name = "") {
  const match = String(name).trim().match(/^(.*?)\s*\(@([^)]*)\)\s*$/);

  return match ? { displayName: match[1].trim(), username: `@${match[2].trim()}` } : { displayName: name || "Miembro", username: "Usuario por confirmar" };
}

function joinedLabel(value) {
  if (!value) return "Por confirmar";

  const date = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

function TeamMember({ member, group, avatarUrl }) {
  const person = identity(member.name);
  const specialties = String(member.role || "").split("·").map((role) => role.trim()).filter(Boolean);

  return <article className="team-member-card" style={{ "--member-background": `url(${teamBackground})` }}>
    <div className="team-member-top">
      <a className="team-member-avatar" href={member.robloxUrl} target="_blank" rel="noreferrer" aria-label={`Abrir perfil de Roblox de ${person.displayName}`}>
        {avatarUrl ? <img src={avatarUrl} alt={`Avatar actual de Roblox de ${person.displayName}`} loading="lazy" decoding="async" /> : <PlatformIcon type="roblox" size={31} />}
      </a>
      <span className="team-member-rank">{group.title}</span>
    </div>
    <div className="team-member-identity">
      <h4>{person.displayName}</h4>
      <a href={member.robloxUrl} target="_blank" rel="noreferrer"><PlatformIcon type="roblox" size={16} />{person.username}</a>
    </div>
    <div className="team-member-specialties"><span>Roles</span><div>{specialties.map((specialty) => <b key={specialty}>{specialty}</b>)}</div></div>
    <dl className="team-member-details">
      <div><dt><PlatformIcon type="discord" size={17} />Discord</dt><dd>{member.discordUsername || "Por confirmar"}</dd></div>
      <div><dt>Se unió</dt><dd>{joinedLabel(member.joinedAt)}</dd></div>
    </dl>
  </article>;
}

export default function ContactGrid({ contacts = fallback, avatars = {} }) {
  const directory = contacts?.length ? contacts : fallback;
  const members = directory.filter((contact) => contact.teamGroup && contact.teamGroup !== "community");
  const community = directory.find((contact) => contact.teamGroup === "community") || fallback.at(-1);
  const visibleGroups = groups.map((group) => ({ ...group, members: members.filter((member) => member.teamGroup === group.key) })).filter((group) => group.members.length);

  return <section className="contact-section team-section" id="equipo" data-reveal>
    <div className="team-section-heading">
      <span className="section-kicker">Nuestro estudio</span>
      <h2>Equipo</h2>
      <p className="section-lead">Las personas que diseñan, construyen y prueban cada experiencia de Another Game More.</p>
    </div>
    <div className="team-directory">
      {visibleGroups.map((group) => <section className="team-role-group" key={group.key}>
        <header><div><span>{group.title}</span><p>{group.description}</p></div><b>{group.members.length.toString().padStart(2, "0")}</b></header>
        <div className="team-members-grid">
          {group.members.map((member) => <TeamMember member={member} group={group} avatarUrl={avatars[String(member.robloxUserId)]} key={member.id || member.robloxUserId || member.name} />)}
        </div>
      </section>)}
    </div>
    {community && <aside className="team-community" id="contacto">
      <img src={studioImage} alt="Another Game More Studio" loading="lazy" decoding="async" />
      <div><span className="section-kicker">Contacto oficial</span><h3>Únete a nuestra comunidad</h3><p>Conoce las novedades del estudio, comparte tus ideas y mantente cerca de nuestros próximos proyectos.</p></div>
      <div className="team-community-links">
        {community.robloxUrl && <a className="button outline" href={community.robloxUrl} target="_blank" rel="noreferrer"><PlatformIcon type="roblox" size={20} />Roblox</a>}
        {community.discord && <a className="button red" href={community.discord} target="_blank" rel="noreferrer"><PlatformIcon type="discord" size={20} />Discord</a>}
      </div>
    </aside>}
  </section>;
}
