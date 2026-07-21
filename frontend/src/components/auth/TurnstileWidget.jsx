import { useEffect, useRef } from "react";

let turnstileLoader;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-agm-turnstile]");
    const script = existing || document.createElement("script");

    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener("error", () => reject(new Error("No fue posible cargar Turnstile.")), { once: true });

    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.agmTurnstile = "true";
      document.head.appendChild(script);
    }
  });

  return turnstileLoader;
}

export default function TurnstileWidget({ siteKey, action, onToken }) {
  const container = useRef(null);

  useEffect(() => {
    if (!siteKey) return undefined;

    let cancelled = false;
    let widgetId;

    loadTurnstile().then((turnstile) => {
      if (cancelled || !turnstile || !container.current) return;

      widgetId = turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: "dark",
        size: "flexible",
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    }).catch(() => onToken(""));

    return () => {
      cancelled = true;
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, onToken, siteKey]);

  if (!siteKey) return null;

  return <div className="turnstile-field"><span>Comprobación de seguridad</span><div ref={container} /></div>;
}
