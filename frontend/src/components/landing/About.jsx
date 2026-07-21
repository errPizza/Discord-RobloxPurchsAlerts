export default function About({ description }) {
  return <section className="about-section" id="nosotros" data-reveal>
    <div className="about-inner">
      <div><span className="section-kicker">私たちについて</span><h2>Sobre nosotros</h2><p>{description}</p></div>
    </div>
  </section>;
}
