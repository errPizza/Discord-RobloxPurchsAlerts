const principles = [
  { number: "01", title: "Gameplay con intención", text: "Cada mecánica está pensada para ser clara, satisfactoria y dejar ganas de jugar una partida más." },
  { number: "02", title: "Comunidades vivas", text: "Diseñamos espacios sociales que convierten una experiencia en un lugar al que siempre apetece volver." },
  { number: "03", title: "Evolución constante", text: "Escuchamos, medimos y mejoramos cada mundo para que siga sintiéndose fresco con el paso del tiempo." },
];

export default function Games() {
  return <section className="games-section" id="juegos" data-reveal>
    <div className="games-heading">
      <span className="section-kicker">Nuestras experiencias</span>
      <h2>Creamos mundos que se sienten vivos.</h2>
      <p>No perseguimos partidas rápidas: construimos experiencias memorables, sociales y preparadas para crecer junto a sus jugadores.</p>
    </div>
    <div className="principles-grid">
      {principles.map((principle) => <article className="principle-card" key={principle.number}>
        <span>{principle.number}</span>
        <h3>{principle.title}</h3>
        <p>{principle.text}</p>
      </article>)}
    </div>
  </section>;
}
