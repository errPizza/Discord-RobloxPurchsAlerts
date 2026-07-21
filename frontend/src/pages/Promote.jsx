import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { api } from "../services/api.js";

const providerNames = { email: "Correo", google: "Google", discord: "Discord" };

function formatDate(timestamp) {
  if (!timestamp) return "Sin actividad";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp) * 1000));
}

export default function Promote() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoadingId, setProfileLoadingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const showProfile = async (entry) => {
    setProfileLoadingId(entry.id);
    setError("");
    setNotice("");

    try {
      const result = await api(`/api/admin/promote/users/${entry.id}`);

      setProfile(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfileLoadingId(null);
    }
  };

  const promote = async () => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const result = await api(`/api/admin/promote/users/${selected.id}`, { method: "PUT" });

      setUsers((current) => current.map((entry) => entry.id === result.user.id ? { ...entry, role: "admin" } : entry));
      setSelected(null);
      setNotice(`${result.user.email} ahora tiene el rol de administrador.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirmation = () => {
    setDeleteTarget(profile);
    setDeleteEmail("");
    setProfile(null);
    setError("");
    setNotice("");
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError("");

    try {
      const result = await api(`/api/admin/promote/users/${deleteTarget.id}`, { method: "DELETE" });

      setUsers((current) => current.filter((entry) => entry.id !== deleteTarget.id));
      setSelected((current) => current?.id === deleteTarget.id ? null : current);
      setDeleteTarget(null);
      setDeleteEmail("");
      setNotice(`La cuenta ${result.deletedUser.email} fue eliminada.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  };

  const canConfirmDelete = deleteTarget && deleteEmail.trim().toLowerCase() === deleteTarget.email.toLowerCase();

  return <>
    <div className="page-title"><span className="page-eyebrow">Permisos del equipo</span><h2>Promote</h2><p>Consulta las cuentas registradas, administra sus permisos o elimina accesos que ya no sean necesarios.</p></div>
    {notice && <div className="panel-message success-message">{notice}</div>}
    {error && !selected && !deleteTarget && <div className="panel-message error-message">{error}</div>}
    <section className="promote-panel">
      <label className="user-search"><span>Buscar usuario</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Correo o nombre…" /></label>
      <div className="users-list" aria-busy={loading}>
        {loading ? <div className="users-empty">Cargando usuarios…</div> : users.length === 0 ? <div className="users-empty">No se encontraron usuarios.</div> : users.map((entry) => <article className="user-row" key={entry.id}>
          <div className="user-avatar">{(entry.displayName || entry.email).slice(0, 1).toUpperCase()}</div>
          <div className="user-identity"><strong>{entry.displayName || "Usuario"}</strong><span>{entry.email}</span></div>
          <div className="provider-tags">{entry.providers.map((provider) => <span key={provider}>{providerNames[provider] || provider}</span>)}</div>
          <span className={`role-badge ${entry.role}`}>{entry.role === "admin" ? "Admin" : "Miembro"}</span>
          <div className="user-row-actions">
            <button className="button outline" type="button" onClick={() => showProfile(entry)} disabled={profileLoadingId === entry.id}>{profileLoadingId === entry.id ? "Cargando…" : "Ver perfil"}</button>
            <button className="button outline" type="button" onClick={() => { setSelected(entry); setError(""); setNotice(""); }} disabled={entry.role === "admin"}>{entry.role === "admin" ? "Promovido" : "Promover"}</button>
          </div>
        </article>)}
      </div>
    </section>

    {profile && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfile(null); }}>
      <section className="account-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="account-profile-title">
        <button className="profile-close" type="button" aria-label="Cerrar perfil" onClick={() => setProfile(null)}>×</button>
        <div className="account-profile-identity">
          <div className="user-avatar">{(profile.displayName || profile.email).slice(0, 1).toUpperCase()}</div>
          <div><span className="section-kicker">Perfil de cuenta</span><h3 id="account-profile-title">{profile.displayName || "Usuario"}</h3><p>{profile.email}</p></div>
        </div>
        <dl className="account-profile-data">
          <div><dt>ID interno</dt><dd>#{profile.id}</dd></div>
          <div><dt>Rol</dt><dd>{profile.role === "admin" ? "Administrador" : "Miembro"}</dd></div>
          <div><dt>Cuenta creada</dt><dd>{formatDate(profile.createdAt)}</dd></div>
          <div><dt>Última sesión</dt><dd>{formatDate(profile.lastSessionAt)}</dd></div>
          <div><dt>Sesiones activas</dt><dd>{profile.activeSessions}</dd></div>
          <div><dt>Contraseña</dt><dd>{profile.hasPassword ? "Configurada" : "Solo acceso social"}</dd></div>
        </dl>
        <div className="account-providers">
          <span>Métodos vinculados</span>
          <div>{profile.providers.map((provider) => <article key={provider.provider}>
            <strong>{providerNames[provider.provider] || provider.provider}</strong>
            <small>Vinculado {formatDate(provider.createdAt)}</small>
          </article>)}</div>
        </div>
        <div className="profile-actions">
          <button className="button danger" type="button" onClick={openDeleteConfirmation} disabled={profile.isOwner || profile.isCurrent} title={profile.isOwner || profile.isCurrent ? "La cuenta propietaria activa está protegida" : "Eliminar esta cuenta"}>Eliminar cuenta</button>
          <button className="button outline" type="button" onClick={() => setProfile(null)}>Cerrar</button>
        </div>
        {(profile.isOwner || profile.isCurrent) && <p className="protected-account-note">Esta es la cuenta propietaria activa y no se puede eliminar desde el dashboard.</p>}
      </section>
    </div>}

    {selected && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="promote-title">
        <span className="warning-icon">!</span>
        <span className="section-kicker">Confirmar permisos</span>
        <h3 id="promote-title">Promover a {selected.email}</h3>
        <p>El rol de administrador concede acceso completo al dashboard, las estadísticas, la base de datos y el control del Worker. Confirma únicamente si confías plenamente en esta persona.</p>
        {error && <div className="confirm-error">{error}</div>}
        <div className="confirm-actions">
          <button className="button outline" type="button" onClick={() => setSelected(null)} disabled={saving}>Cancelar</button>
          <button className="button red" type="button" onClick={promote} disabled={saving}>{saving ? "Promoviendo…" : "Sí, promover a admin"}</button>
        </div>
      </section>
    </div>}

    {deleteTarget && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}>
      <section className="confirm-dialog delete-account-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title">
        <span className="warning-icon">!</span>
        <span className="section-kicker">Acción permanente</span>
        <h3 id="delete-account-title">Eliminar {deleteTarget.email}</h3>
        <p>Se eliminarán la cuenta, sus accesos sociales y todas sus sesiones activas. Esta acción no se puede deshacer.</p>
        <label className="delete-account-check"><span>Escribe el correo para confirmar</span><strong>{deleteTarget.email}</strong><input type="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} autoComplete="off" placeholder="Correo exacto" /></label>
        {error && <div className="confirm-error">{error}</div>}
        <div className="confirm-actions">
          <button className="button outline" type="button" onClick={() => { setDeleteTarget(null); setDeleteEmail(""); }} disabled={deleting}>Cancelar</button>
          <button className="button danger" type="button" onClick={deleteAccount} disabled={!canConfirmDelete || deleting}>{deleting ? "Eliminando…" : "Eliminar definitivamente"}</button>
        </div>
      </section>
    </div>}
  </>;
}
