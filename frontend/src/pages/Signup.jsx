import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import StudioLogo from "../components/common/StudioLogo.jsx";
import PlatformIcon from "../components/common/PlatformIcon.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { getProviders } from "../services/auth.js";

const commonPasswords = new Set(["password1!", "contraseña1!", "admin123!", "qwerty123!", "123456789012345", "password123456", "contraseña123456", "anothergamemore"]);

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [providers, setProviders] = useState({ google: false, discord: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { getProviders().then((result) => setProviders(result.providers)).catch(() => {}); }, []);

  const checks = useMemo(() => {
    const emailName = email.trim().toLowerCase().split("@", 1)[0];

    return [
      { label: "8 caracteres como mínimo", valid: [...password].length >= 8 },
      { label: "Al menos 1 mayúscula", valid: /\p{Lu}/u.test(password) },
      { label: "Al menos 2 minúsculas", valid: (password.match(/\p{Ll}/gu) || []).length >= 2 },
      { label: "Al menos 1 número", valid: /\p{Nd}/u.test(password) },
      { label: "Al menos 1 signo", valid: /[^\p{L}\p{N}\s]/u.test(password) },
      { label: "No supera 128 caracteres", valid: password.length > 0 && [...password].length <= 128 },
      { label: "No contiene tu correo ni es común", valid: password.length > 0 && !commonPasswords.has(password.toLowerCase()) && !(emailName.length >= 4 && password.toLowerCase().includes(emailName)) },
      { label: "Ambas contraseñas coinciden", valid: confirmation.length > 0 && password === confirmation },
    ];
  }, [email, password, confirmation]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const next = await signup(email, password, confirmation);

      setLeaving(true);
      window.setTimeout(() => navigate(next.isAdmin ? "/dashboard" : "/"), 320);
    } catch (requestError) {
      setError(requestError.message);
      setSubmitting(false);
    }
  };

  if (user && !submitting && !leaving) return <Navigate to={user.isAdmin ? "/dashboard" : "/"} replace />;

  return <div className={`login-page${leaving ? " is-leaving" : ""}`}>
    <div className="login-orb login-orb-one" />
    <div className="login-orb login-orb-two" />
    <form className={`login-card auth-card signup-card${error ? " has-error" : ""}`} onSubmit={submit} aria-busy={submitting}>
      <StudioLogo />
      <span className="section-kicker">Nueva cuenta</span>
      <h1>Crear cuenta</h1>
      <p>Con Google o Discord no necesitas crear una contraseña.</p>
      <div className="provider-buttons">
        <a className={`provider-button google${providers.google ? "" : " is-disabled"}`} href={providers.google ? "/api/auth/oauth/google" : undefined} aria-disabled={!providers.google}><span aria-hidden="true">G</span>Registrarme con Google</a>
        <a className={`provider-button discord${providers.discord ? "" : " is-disabled"}`} href={providers.discord ? "/api/auth/oauth/discord" : undefined} aria-disabled={!providers.discord}><PlatformIcon type="discord" size={24} />Registrarme con Discord</a>
      </div>
      <div className="auth-divider"><span>o utiliza tu correo</span></div>
      <div className="login-fields">
        <label>Correo<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={submitting} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" maxLength="128" required disabled={submitting} /></label>
        <label>Repetir contraseña<input name="passwordConfirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength="8" maxLength="128" required disabled={submitting} /></label>
      </div>
      <ul className="password-checks" aria-label="Condiciones de la contraseña">
        {checks.map((check) => <li className={check.valid ? "is-valid" : ""} key={check.label}><span>{check.valid ? "✓" : "·"}</span>{check.label}</li>)}
      </ul>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button red" type="submit" disabled={submitting || !checks.every((check) => check.valid)}>
        <span>{leaving ? "Cuenta creada" : submitting ? "Creando…" : "Crear cuenta"}</span>
        <b>{submitting && !leaving ? <i className="button-spinner" /> : "›"}</b>
      </button>
      <p className="auth-switch">¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></p>
    </form>
  </div>;
}
