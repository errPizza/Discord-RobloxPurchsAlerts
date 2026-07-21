import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { api } from "../services/api.js";

const providerNames = { email: "Correo", google: "Google", discord: "Discord" };

export default function Promote() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.isOwner) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      api(`/api/admin/promote/users?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((result) => setUsers(result.users))
        .catch((requestError) => { if (requestError.name !== "AbortError") setError(requestError.message); })
        .finally(() => setLoading(false));
    }, 220);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, user?.isOwner]);

  if (!user?.isOwner) return <Navigate to="/dashboard" replace />;

  const promote = async () => {
    setSaving(true);
    setError("");

    try {
      const result = await api(`/api/admin/promote/users/${selected.id}`, { method: "PUT" });

      setUsers((current) => current.map((entry) => entry.id === result.user.id ? { ...entry, role: "admin" } : entry));
      setSelected(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="page-title"><span className="page-eyebrow">Permisos del equipo</span><h2>Promote</h2><p>Busca usuarios registrados y concede acceso administrativo cuando sea necesario.</p></div>
    <section className="promote-panel">
      <label className="user-search"><span>Buscar usuario</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Correo o nombre…" /></label>
      <div className="users-list" aria-busy={loading}>
        {loading ? <div className="users-empty">Cargando usuarios…</div> : users.length === 0 ? <div className="users-empty">No se encontraron usuarios.</div> : users.map((entry) => <article className="user-row" key={entry.id}>
          <div className="user-avatar">{(entry.displayName || entry.email).slice(0, 1).toUpperCase()}</div>
          <div className="user-identity"><strong>{entry.displayName || "Usuario"}</strong><span>{entry.email}</span></div>
          <div className="provider-tags">{entry.providers.map((provider) => <span key={provider}>{providerNames[provider] || provider}</span>)}</div>
          <span className={`role-badge ${entry.role}`}>{entry.role === "admin" ? "Admin" : "Miembro"}</span>
          <button className="button outline" type="button" onClick={() => setSelected(entry)} disabled={entry.role === "admin"}>{entry.role === "admin" ? "Promovido" : "Promover"}</button>
        </article>)}
      </div>
    </section>
    {error && <div className="panel-message error-message">{error}</div>}
    {selected && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="promote-title">
        <span className="warning-icon">!</span>
        <span className="section-kicker">Confirmar permisos</span>
        <h3 id="promote-title">Promover a {selected.email}</h3>
        <p>El rol de administrador concede acceso completo al dashboard, las estadísticas, la base de datos y el control del Worker. Confirma únicamente si confías plenamente en esta persona.</p>
        <div className="confirm-actions">
          <button className="button outline" type="button" onClick={() => setSelected(null)} disabled={saving}>Cancelar</button>
          <button className="button red" type="button" onClick={promote} disabled={saving}>{saving ? "Promoviendo…" : "Sí, promover a admin"}</button>
        </div>
      </section>
    </div>}
  </>;
}

