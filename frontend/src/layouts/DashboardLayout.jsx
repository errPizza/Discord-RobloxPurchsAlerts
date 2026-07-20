import { useEffect } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import StudioLogo from "../components/common/StudioLogo.jsx";

export default function DashboardLayout() {
  const { user, logout, loading } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [pathname]);

  if (loading) return <div className="loading">Cargando sesión…</div>;
  if (!user?.isAdmin) return <Navigate to="/login" replace />;

  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <StudioLogo />
      <p>Panel administrativo</p>
      <nav aria-label="Navegación administrativa">
        <NavLink to="/dashboard" end><span>01</span>Resumen</NavLink>
        <NavLink to="/dashboard/stats"><span>02</span>Stats</NavLink>
        <NavLink to="/dashboard/worker"><span>03</span>Control Worker</NavLink>
        <NavLink to="/dashboard/database"><span>04</span>DataBase</NavLink>
      </nav>
      <button onClick={logout}>Cerrar sesión <b>↗</b></button>
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
