import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export default function WorkerControl() {
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/worker").then((result) => setEnabled(result.enabled)).catch((requestError) => setError(requestError.message));
  }, []);

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

  return <>
    <div className="page-title"><span className="page-eyebrow">Operaciones</span><h2>Control del Worker</h2><p>Pausa las notificaciones de Discord sin detener la recopilación de estadísticas.</p></div>
    <section className={`worker-control-card ${enabled ? "is-enabled" : "is-disabled"}`}>
      <div className="worker-status-icon"><i /></div>
      <div className="worker-control-copy">
        <span className="worker-status-label">Estado de las notificaciones</span>
        <h3>{enabled === null ? "Consultando…" : enabled ? "Worker habilitado" : "Worker pausado"}</h3>
        <p>{enabled ? "Las peticiones válidas envían mensajes a Discord y las estadísticas continúan registrándose." : "Los mensajes se omiten con una respuesta exitosa. Las estadísticas continúan acumulándose con normalidad."}</p>
      </div>
      <button className={`button ${enabled ? "outline" : "red"}`} type="button" onClick={toggle} disabled={enabled === null || saving}>
        {saving ? <><span className="button-spinner" />Guardando</> : enabled ? "Pausar mensajes" : "Habilitar mensajes"}
      </button>
    </section>
    {error && <div className="panel-message error-message">{error}</div>}
    <div className="control-note"><strong>Importante</strong><span>Este interruptor no apaga la API, D1 ni el panel administrativo. Solo controla la entrega de mensajes externos.</span></div>
  </>;
}
