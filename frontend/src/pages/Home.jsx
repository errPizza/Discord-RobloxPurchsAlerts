import { useEffect, useState } from "react";
import LandingLayout from "../layouts/LandingLayout.jsx";
import Hero from "../components/landing/Hero.jsx";
import About from "../components/landing/About.jsx";
import ContactGrid from "../components/landing/ContactGrid.jsx";
import { api } from "../services/api.js";

const defaults = { hero_description: "Creamos experiencias que dan ganas de jugar una partida más. Innovación, creatividad y pasión en cada juego.", about_description: "Another Game More Studio nace con la misión de crear experiencias únicas que conecten y entretengan a jugadores de todo el mundo. Nos enfocamos en la calidad, la innovación y en construir comunidades increíbles." };
export default function Home() { const [site, setSite] = useState({ settings: defaults, contacts: undefined }); useEffect(() => { api("/api/site").then((data) => setSite({ settings: { ...defaults, ...data.settings }, contacts: data.contacts })).catch(() => {}); }, []); return <LandingLayout><Hero description={site.settings.hero_description} /><About description={site.settings.about_description} /><ContactGrid contacts={site.contacts} /></LandingLayout>; }
