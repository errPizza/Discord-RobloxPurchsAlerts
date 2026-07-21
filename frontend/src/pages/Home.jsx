import { useEffect, useState } from "react";
import LandingLayout from "../layouts/LandingLayout.jsx";
import Hero from "../components/landing/Hero.jsx";
import About from "../components/landing/About.jsx";
import Games from "../components/landing/Games.jsx";
import ContactGrid from "../components/landing/ContactGrid.jsx";
import { api } from "../services/api.js";

const defaults = { hero_description: "Creamos experiencias que dan ganas de jugar una partida más. Innovación, creatividad y pasión en cada juego.", about_description: "Another Game More Studio nace con la misión de crear experiencias únicas que conecten y entretengan a jugadores de todo el mundo. Nos enfocamos en la calidad, la innovación y en construir comunidades increíbles." };

export default function Home() {
  const [site, setSite] = useState({ settings: defaults, contacts: undefined });
  const [avatars, setAvatars] = useState({});

  useEffect(() => {
    api("/api/site").then((data) => {
      setSite({ settings: { ...defaults, ...data.settings }, contacts: data.contacts });
      setAvatars(data.avatars || {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll("[data-reveal]");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8%" });

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [site.contacts]);

  return <LandingLayout>
    <Hero description={site.settings.hero_description} />
    <About description={site.settings.about_description} />
    <Games avatars={avatars} />
    <ContactGrid contacts={site.contacts} avatars={avatars} />
  </LandingLayout>;
}
