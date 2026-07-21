import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import StudioLogo from "./StudioLogo.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { closestSectionHash, scrollToSection } from "../../utils/scroll.js";

const links = [["Inicio", "#inicio"], ["Logros", "#logros"], ["Nosotros", "#nosotros"], ["Juegos", "#juegos"], ["Equipo", "#equipo"], ["Contacto", "#contacto"]];

export default function SiteHeader() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [activeHash, setActiveHash] = useState("#inicio");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeWithEscape = (event) => { if (event.key === "Escape") setMenuOpen(false); };

    document.addEventListener("keydown", closeWithEscape);

    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (pathname !== "/") return undefined;

    const sections = links.map(([, hash]) => ({ hash, element: document.querySelector(hash) })).filter(({ element }) => element);
    let frame = 0;

    const updateActiveSection = () => {
      frame = 0;

      const closestHash = closestSectionHash(sections);
      const pageBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;

      setActiveHash(pageBottom ? sections.at(-1)?.hash || closestHash : closestHash);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateActiveSection);
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);

    sections.forEach(({ element }) => resizeObserver?.observe(element));
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [pathname]);

  const navigateToSection = (event, hash) => {
    if (pathname !== "/") return;

    event.preventDefault();
    setActiveHash(hash);
    setMenuOpen(false);
    scrollToSection(hash);
  };

  return <header className="site-header">
    <StudioLogo />
    <div className={`site-menu-panel${menuOpen ? " is-open" : ""}`} id="site-menu">
      <nav aria-label="Navegación principal">
        {links.map(([label, href]) => <a className={pathname === "/" && activeHash === href ? "active" : ""} href={pathname === "/" ? href : `/${href}`} onClick={(event) => navigateToSection(event, href)} key={label}>{label}</a>)}
      </nav>
      <div className="header-actions">
        {user ? <button className="button outline" type="button" onClick={() => { setMenuOpen(false); logout(); }}>Cerrar sesión</button> : <Link className="button outline" to="/login">Iniciar sesión</Link>}
        {user?.isAdmin && <Link className="button red" to="/dashboard">Dashboard <b>›</b></Link>}
      </div>
    </div>
    <button className="mobile-menu-toggle" type="button" aria-controls="site-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((current) => !current)}>
      <span /><span /><span />
    </button>
  </header>;
}
