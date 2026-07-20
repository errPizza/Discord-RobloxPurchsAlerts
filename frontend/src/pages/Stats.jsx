import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export default function Stats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api("/api/admin/stats").then(({ stats: result }) => setStats(result));
  }, []);

  return <div className="admin-panel"><div className="page-title"><span className="page-eyebrow">Datos en vivo</span><h2>Stats</h2><p>Detalle de estadísticas almacenadas en D1.</p></div><pre>{JSON.stringify(stats, null, 2)}</pre></div>;
}
