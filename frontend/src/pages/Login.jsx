import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import StudioLogo from "../components/common/StudioLogo.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      const next = await login(form.get("email"), form.get("password"));

      setLeaving(true);
      window.setTimeout(() => navigate(next.isAdmin ? "/dashboard" : "/"), 320);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (user && !submitting && !leaving) return <Navigate to={user.isAdmin ? "/dashboard" : "/"} replace />;

  return <div className={`login-page${leaving ? " is-leaving" : ""}`}>
    <div className="login-orb login-orb-one" />
    <div className="login-orb login-orb-two" />
    <form className={`login-card${error ? " has-error" : ""}`} onSubmit={submit} aria-busy={submitting}>
      <StudioLogo />
      <span className="section-kicker">Acceso del equipo</span>
      <h1>Iniciar sesión</h1>
      <p>Utiliza la cuenta asignada por el estudio.</p>
      <div className="login-fields">
        <label>Correo<input name="email" type="email" autoComplete="email" required disabled={submitting} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required disabled={submitting} /></label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button red" type="submit" disabled={submitting}>
        <span>{leaving ? "Acceso concedido" : submitting ? "Verificando…" : "Entrar"}</span>
        <b>{submitting && !leaving ? <i className="button-spinner" /> : "›"}</b>
      </button>
    </form>
  </div>;
}
