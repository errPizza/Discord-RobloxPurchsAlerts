import { Link, useLocation } from "react-router-dom";
import StudioLogo from "./StudioLogo.jsx";
import { useAuth } from "../../hooks/useAuth.js";

const links = [["Inicio", "#inicio"], ["Nosotros", "#nosotros"], ["Juegos", "#juegos"], ["Logros", "#logros"], ["Equipo", "#equipo"], ["Contacto", "#contacto"]];
export default function SiteHeader() {
  const { user, logout } = useAuth(); const { pathname } = useLocation();
  return <header className="site-header"><StudioLogo /><nav>{links.map(([label, href], index) => <a className={index === 0 && pathname === "/" ? "active" : ""} href={pathname === "/" ? href : `/${href}` } key={label}>{label}</a>)}</nav><div className="header-actions">{user ? <button className="button outline" onClick={logout}>Cerrar sesión</button> : <Link className="button outline" to="/login">Iniciar sesión</Link>}{user?.isAdmin && <Link className="button red" to="/dashboard">Dashboard <b>›</b></Link>}</div></header>;
}
