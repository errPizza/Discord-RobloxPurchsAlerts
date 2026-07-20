import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import StudioLogo from "./StudioLogo.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { scrollToSection } from "../../utils/scroll.js";

const links = [["Inicio", "#inicio"], ["Nosotros", "#nosotros"], ["Juegos", "#juegos"], ["Logros", "#logros"], ["Equipo", "#equipo"], ["Contacto", "#contacto"]];

export default function SiteHeader() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [activeHash, setActiveHash] = useState("#inicio");

  useEffect(() => {
    if (pathname !== "/") return undefined;

    const sections = links.map(([, hash]) => document.querySelector(hash)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (visible) setActiveHash(`#${visible.target.id}`);
    }, { rootMargin: "-34% 0px -48%", threshold: [0, 0.01, 0.25, 0.6] });

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [pathname]);

  const navigateToSection = (event, hash) => {
    if (pathname !== "/") return;

    event.preventDefault();
    setActiveHash(hash);
    scrollToSection(hash);
  };

  return <header className="site-header">
    <StudioLogo />
    <nav aria-label="Navegación principal">
      {links.map(([label, href]) => <a className={pathname === "/" && activeHash === href ? "active" : ""} href={pathname === "/" ? href : `/${href}`} onClick={(event) => navigateToSection(event, href)} key={label}>{label}</a>)}
    </nav>
    <div className="header-actions">
      {user ? <button className="button outline" onClick={logout}>Cerrar sesión</button> : <Link className="button outline" to="/login">Iniciar sesión</Link>}
      {user?.isAdmin && <Link className="button red" to="/dashboard">Dashboard <b>›</b></Link>}
    </div>
  </header>;
}
