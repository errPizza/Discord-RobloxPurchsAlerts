import studioImage from "../../assets/images/another-game-more-logo.png";

const fallback = [
  { name: "err_Pizza (@err_Lo2sDat4)", role: "Scripter · Software · UI Design", description: "Hola, soy desarrollador de páginas web y videojuegos. Tengo alrededor de cinco años de experiencia creando juegos en la plataforma Roblox. Al principio solo hacía sistemas individuales para personas que me los pedían, pero ahora mi equipo y yo aspiramos a mucho más.", robloxUrl: "https://www.roblox.com/es/users/4093162315/profile", initials: "EP" },
  { name: "676767 (@dlksadjadjkd1s3)", role: "Builder · Game Design · Analytics", description: "Especialista en construcción y diseño de experiencias, enfocado en transformar ideas en mundos claros, funcionales y memorables para cada jugador.", robloxUrl: "https://www.roblox.com/es/users/8933542097/profile", initials: "67" },
  { name: "Community", role: "Comunidad oficial", description: "El punto de encuentro de Another Game More: un espacio para conocer novedades, compartir ideas y crecer junto a jugadores y desarrolladores.", robloxUrl: "https://www.roblox.com/es/communities/16939863/Another-Game-More-ST#!/about", discord: "https://discord.gg/QzS8xqmZX8", imageKey: "studio", initials: "AGM" },
];

function RobloxIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.2 2.4 14.4 4.8-4.8 14.4L2.4 16.8z" /><path d="m9.3 9.3 5.4 1.8-1.8 5.4-5.4-1.8z" /></svg>;
}

function DiscordIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 7.2a12 12 0 0 1 7.6 0M9.2 15.2c1.8 1 3.8 1 5.6 0" /><path d="M7.4 4.8A16 16 0 0 0 3 17.8c1.7 1.3 3.3 1.8 4.8 2.2l1.1-1.6M16.6 4.8A16 16 0 0 1 21 17.8c-1.7 1.3-3.3 1.8-4.8 2.2l-1.1-1.6" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
}

export default function ContactGrid({ contacts = fallback }) {
  const visibleContacts = contacts?.length ? contacts : fallback;

  return <section className="contact-section" id="equipo" data-reveal>
    <span className="section-kicker">Nuestro equipo</span><h2>Contacto</h2><p className="section-lead">Las personas detrás de cada experiencia. Conoce sus especialidades y conecta con el estudio.</p>
    <div className="contact-grid" id="contacto">
      {visibleContacts.map((contact, index) => {
        const roles = String(contact.role || "").split("·").map((role) => role.trim()).filter(Boolean);
        const hasStudioImage = contact.imageKey === "studio";
        const area = contact.area || ["Administrador", "Game Design", "Community"][index] || "Equipo";
        const displayName = hasStudioImage && contact.name === "Community" ? "Another Game More Studio" : contact.name;
        const robloxLabel = contact.robloxUrl?.includes("/communities/") ? "Comunidad de Roblox" : "Perfil de Roblox";

        return <article className="contact-card team-card" style={{ "--card-index": index }} key={contact.id || contact.robloxUrl || index}>
          <div className={`team-avatar${hasStudioImage ? " has-image" : ""}`}>{hasStudioImage ? <img src={studioImage} alt="Logotipo de Another Game More" /> : <span>{contact.initials || contact.name?.slice(0, 1)}</span>}</div>
          <span className="team-area">{area}</span>
          <h3>{displayName}</h3>
          <div className="team-roles">{roles.map((role) => <span key={role}>{role}</span>)}</div>
          <p className="team-description">{contact.description || "Miembro del equipo de Another Game More Studio."}</p>
          <div className="team-links">
            {contact.robloxUrl && <a href={contact.robloxUrl} target="_blank" rel="noreferrer"><RobloxIcon /><span>{robloxLabel}</span></a>}
            {contact.discord && <a href={contact.discord} target="_blank" rel="noreferrer"><DiscordIcon /><span>Discord</span></a>}
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
