import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import StudioLogo from "../components/common/StudioLogo.jsx";

export default function DashboardLayout() {
  const { user, logout, loading } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeWithEscape = (event) => { if (event.key === "Escape") setMenuOpen(false); };

    document.addEventListener("keydown", closeWithEscape);

    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [menuOpen]);

  if (loading) return <div className="loading">Cargando sesión…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;

  return <div className="dashboard-shell">
    <aside className={`dashboard-sidebar${menuOpen ? " is-open" : ""}`}>
      <StudioLogo />
      <p>Panel administrativo</p>
      <button className="dashboard-menu-toggle" type="button" aria-controls="dashboard-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><span>{menuOpen ? "Cerrar" : "Menú"}</span><i><b /><b /><b /></i></button>
      <div className="dashboard-menu-panel" id="dashboard-menu">
        <nav aria-label="Navegación administrativa">
          <NavLink to="/dashboard" end><span>01</span>Resumen</NavLink>
          <NavLink to="/dashboard/stats"><span>02</span>Stats</NavLink>
          <NavLink to="/dashboard/games"><span>03</span>Games</NavLink>
          <NavLink to="/dashboard/worker"><span>04</span>Control Worker</NavLink>
          <NavLink to="/dashboard/database"><span>05</span>DataBase</NavLink>
          {user.isOwner && <NavLink to="/dashboard/promote"><span>06</span>Promote</NavLink>}
        </nav>
        <button className="dashboard-logout" type="button" onClick={logout}>Cerrar sesión <b>↗</b></button>
      </div>
    </aside>
    <section className="dashboard-main">
      <header>
        <div><span className="section-kicker">Administración</span><h1>Another Game More</h1></div>
        <span className="admin-email"><i />{user.email}</span>
      </header>
      <div className="dashboard-view" key={pathname}><Outlet /></div>
    </section>
  </div>;
}
