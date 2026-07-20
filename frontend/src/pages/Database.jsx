import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import DataCard from "../components/dashboard/DataCard.jsx";

export default function Database() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api("/api/admin/database").then(setData);
  }, []);

  const overview = data?.overview || {};

  return <>
    <div className="page-title"><span className="page-eyebrow">Infraestructura</span><h2>DataBase</h2><p>{data?.engine || "Cloudflare D1"}</p></div>
    <div className="data-grid">
      <DataCard label="Usuarios" value={overview.users || 0} />
      <DataCard label="Contactos" value={overview.contacts || 0} />
      <DataCard label="Registros Stats" value={overview.weeklyStatsRecords || 0} />
    </div>
  </>;
}
