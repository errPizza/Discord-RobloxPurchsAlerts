import { Link } from "react-router-dom";
export default function NotFound() { return <div className="not-found"><span className="section-kicker">404</span><h1>Página no encontrada</h1><Link className="button red" to="/">Volver al inicio</Link></div>; }
