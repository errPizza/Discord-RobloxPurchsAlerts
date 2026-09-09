import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import StudioLogo from "../components/common/StudioLogo.jsx";
import PlatformIcon from "../components/common/PlatformIcon.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { getProviders } from "../services/auth.js";

const oauthErrors = {
  provider_unavailable: "Este proveedor todavía no está configurado.",
  access_denied: "El inicio de sesión fue cancelado.",
  invalid_state: "La solicitud expiró. Inténtalo de nuevo.",
  email_unverified: "El proveedor no entregó un correo verificado.",
  oauth_failed: "No fue posible iniciar sesión con ese proveedor.",
  missing_code: "El proveedor no devolvió el código de acceso.",
  token_exchange_failed: "El proveedor rechazó el intercambio de acceso. Revisa sus credenciales OAuth.",
  profile_failed: "No fue posible obtener el perfil del proveedor.",
  server_config: "La configuración de seguridad del servidor está incompleta.",
};

function ProviderButtons({ providers }) {
  return <div className="provider-buttons">
    <a className={`provider-button google${providers.google ? "" : " is-disabled"}`} href={providers.google ? "/api/auth/oauth/google" : undefined} aria-disabled={!providers.google}>
      <span aria-hidden="true">G</span>Continuar con Google
    </a>
    <a className={`provider-button discord${providers.discord ? "" : " is-disabled"}`} href={providers.discord ? "/api/auth/oauth/discord" : undefined} aria-disabled={!providers.discord}>
      <PlatformIcon type="discord" size={24} />Continuar con Discord
    </a>
  </div>;
}
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [providers, setProviders] = useState({ google: false, discord: false });
  const [error, setError] = useState(() => oauthErrors[searchParams.get("auth_error")] || "");
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { getProviders().then((result) => setProviders(result.providers)).catch(() => {}); }, []);

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
    <form className={`login-card auth-card${error ? " has-error" : ""}`} onSubmit={submit} aria-busy={submitting}>
      <StudioLogo />
      <span className="section-kicker">Acceso a tu cuenta</span>
      <h1>Iniciar sesión</h1>
      <p>Accede con Google, Discord o tu correo.</p>
      <ProviderButtons providers={providers} />
      <div className="auth-divider"><span>o continúa con correo</span></div>
      <div className="login-fields">
        <label>Correo<input name="email" type="email" autoComplete="email" required disabled={submitting} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required disabled={submitting} /></label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button red" type="submit" disabled={submitting}>
        <span>{leaving ? "Acceso concedido" : submitting ? "Verificando…" : "Entrar"}</span>
        <b>{submitting && !leaving ? <i className="button-spinner" /> : "›"}</b>
      </button>
      <p className="auth-switch">¿Todavía no tienes cuenta? <Link to="/signup">Crear cuenta</Link></p>
    </form>
  </div>;
}
