import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import PlatformIcon from "../components/common/PlatformIcon.jsx";

function formatDate(value) {
  if (!value) return "Fecha no disponible";

  const numeric = Number(value);
  const date = numeric ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(value);

  return Number.isNaN(date.valueOf()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

export default function WorkerControl() {
  const [enabled, setEnabled] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [profileLoadingId, setProfileLoadingId] = useState("");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/admin/worker"), api("/api/admin/worker/blocked-users")]).then(([worker, blocked]) => {
      setEnabled(worker.enabled);
      setBlockedUsers(blocked.users || []);
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!profile) return undefined;

    const close = (event) => { if (event.key === "Escape") setProfile(null); };

    document.addEventListener("keydown", close);

    return () => document.removeEventListener("keydown", close);
  }, [profile]);

  const toggle = async () => {
    setSaving(true);
    setError("");

    try {
      const result = await api("/api/admin/worker", { method: "PUT", body: JSON.stringify({ enabled: !enabled }) });

      setEnabled(result.enabled);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  async function addBlockedUser(event) {
    event.preventDefault();
    const normalized = userId.trim();

    if (!/^[1-9]\d{0,19}$/.test(normalized)) {
      setError("Introduce un UserId numérico de Roblox mayor que cero.");
      return;
    }

    setAdding(true);
    setError("");

    try {
      const result = await api("/api/admin/worker/blocked-users", { method: "POST", body: JSON.stringify({ userId: normalized }) });

      setBlockedUsers((current) => [result.user, ...current.filter((user) => user.userId !== result.user.userId)]);
      setUserId("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdding(false);
    }
  }

  async function removeBlockedUser(blockedUserId) {
    setRemovingId(blockedUserId);
    setError("");

    try {
      await api(`/api/admin/worker/blocked-users/${encodeURIComponent(blockedUserId)}`, { method: "DELETE" });
      setBlockedUsers((current) => current.filter((user) => user.userId !== blockedUserId));
      if (profile?.id === blockedUserId) setProfile(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRemovingId("");
    }
  }

  async function viewProfile(blockedUserId) {
    setProfileLoadingId(blockedUserId);
    setError("");

    try {
      const result = await api(`/api/admin/worker/blocked-users/${encodeURIComponent(blockedUserId)}/profile`);

      setProfile(result.profile);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfileLoadingId("");
    }
  }

  return <>
    <div className="page-title"><span className="page-eyebrow">Operaciones</span><h2>Control del Worker</h2><p>Pausa todas las notificaciones o excluye UserIds concretos sin detener la recopilación de estadísticas.</p></div>
    <section className={`worker-control-card ${enabled ? "is-enabled" : "is-disabled"}`}>
      <div className="worker-status-icon"><i /></div>
      <div className="worker-control-copy">
        <span className="worker-status-label">Estado de las notificaciones</span>
        <h3>{enabled === null ? "Consultando…" : enabled ? "Worker habilitado" : "Worker pausado"}</h3>
        <p>{enabled ? "Las peticiones válidas envían mensajes a Discord, excepto los UserIds excluidos. Las estadísticas continúan registrándose." : "Todos los mensajes se omiten con una respuesta exitosa. Las estadísticas continúan acumulándose con normalidad."}</p>
      </div>
      <button className={`button ${enabled ? "outline" : "red"}`} type="button" onClick={toggle} disabled={enabled === null || saving}>
        {saving ? <><span className="button-spinner" />Guardando</> : enabled ? "Pausar mensajes" : "Habilitar mensajes"}
      </button>
    </section>
    {error && <div className="panel-message error-message">{error}</div>}
    <div className="control-note"><strong>Importante</strong><span>El interruptor y la lista inferior controlan únicamente Discord. La API, SQLite local y el conteo de estadísticas permanecen activos.</span></div>

    <section className="blocked-users-panel">
      <div className="blocked-users-heading">
        <div><span className="page-eyebrow">Exclusiones individuales</span><h3>UserIds sin mensajes de Discord</h3><p>Las compras y donaciones de estos usuarios se contabilizan, pero no generan una notificación.</p></div>
        <span className="blocked-count">{blockedUsers.length} {blockedUsers.length === 1 ? "usuario" : "usuarios"}</span>
      </div>
      <form className="blocked-user-form" onSubmit={addBlockedUser}>
        <label htmlFor="blocked-user-id">Agregar UserId de Roblox</label>
        <div><input id="blocked-user-id" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="Ejemplo: 802409113" value={userId} onChange={(event) => { if (/^\d{0,20}$/.test(event.target.value)) setUserId(event.target.value); }} disabled={adding} /><button className="button red" type="submit" disabled={adding || !userId}>{adding ? "Agregando…" : "Agregar a la lista"}</button></div>
      </form>
      <div className="blocked-users-list">
        {blockedUsers.map((user) => <article className="blocked-user-row" key={user.userId}>
          <span className="blocked-user-icon"><PlatformIcon type="discord" size={23} /></span>
          <div className="blocked-user-copy"><strong>UserId {user.userId}</strong><span>Agregado el {formatDate(user.createdAt)}</span></div>
          <div className="blocked-user-actions"><button className="button outline" type="button" onClick={() => viewProfile(user.userId)} disabled={profileLoadingId === user.userId}>{profileLoadingId === user.userId ? "Consultando…" : "Ver información"}</button><button className="button danger" type="button" onClick={() => removeBlockedUser(user.userId)} disabled={removingId === user.userId}>{removingId === user.userId ? "Eliminando…" : "Eliminar"}</button></div>
        </article>)}
        {!blockedUsers.length && <div className="blocked-users-empty"><span>✓</span><strong>No hay UserIds excluidos</strong><p>Todas las peticiones válidas pueden generar mensajes mientras el Worker esté habilitado.</p></div>}
      </div>
    </section>

    {profile && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfile(null); }}><section className="roblox-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="roblox-profile-title">
      <button className="profile-close" type="button" onClick={() => setProfile(null)} aria-label="Cerrar información">×</button>
      <div className="roblox-profile-identity">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span><PlatformIcon type="roblox" size={34} /></span>}<div><span className="page-eyebrow">Perfil de Roblox</span><h3 id="roblox-profile-title">{profile.displayName}</h3><p>@{profile.username}</p></div></div>
      <dl className="roblox-profile-data"><div><dt>UserId</dt><dd>{profile.id}</dd></div><div><dt>Cuenta creada</dt><dd>{formatDate(profile.created)}</dd></div><div><dt>Estado</dt><dd>{profile.isBanned ? "Cuenta suspendida" : "Cuenta activa"}</dd></div><div><dt>Verificación</dt><dd>{profile.hasVerifiedBadge ? "Insignia verificada" : "Sin insignia"}</dd></div></dl>
      {profile.description && <div className="roblox-profile-description"><span>Descripción</span><p>{profile.description}</p></div>}
      <div className="profile-actions"><button className="button outline" type="button" onClick={() => setProfile(null)}>Cerrar</button><a className="button red" href={profile.profileUrl} target="_blank" rel="noreferrer"><PlatformIcon type="roblox" size={18} />Abrir en Roblox ↗</a></div>
    </section></div>}
  </>;
}
