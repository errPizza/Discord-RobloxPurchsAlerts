import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import StudioLogo from "../components/common/StudioLogo.jsx";

export default function DashboardLayout() {
  const { user, logout, loading } = useAuth();
  if (loading) return <div className="loading">Cargando sesión…</div>;
  if (!user?.isAdmin) return <Navigate to="/login" replace />;
  return <div className="dashboard-shell"><aside className="dashboard-sidebar"><StudioLogo /><p>Panel administrativo</p><NavLink to="/dashboard" end>Resumen</NavLink><NavLink to="/dashboard/stats">Stats</NavLink><NavLink to="/dashboard/database">DataBase</NavLink><button onClick={logout}>Cerrar sesión</button></aside><section className="dashboard-main"><header><div><span className="section-kicker">Administración</span><h1>Another Game More</h1></div><span className="admin-email">{user.email}</span></header><Outlet /></section></div>;
}
