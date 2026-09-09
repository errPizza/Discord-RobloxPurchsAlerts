import { requireRateLimit, sameOriginMutation } from "../services/security.js";
import { publicUser } from "../services/auth.js";

export function registerAuthRoutes(app, services) {
  const { auth, config, limiter, audit } = services;
  const sameOrigin = (request, reply) => {
    if (sameOriginMutation(request, config.publicOrigin)) return true;
    reply.code(403).send({ error: "Origen de la petición no permitido." });
    return false;
  };

  app.get("/api/auth/session", async (request) => ({ user: auth.getSession(request) ? publicUser(auth.getSession(request)) : { isAdmin: false, isOwner: false } }));
  app.get("/api/auth/providers", async () => ({ providers: auth.providers() }));

  app.post("/api/auth/signup", async (request, reply) => {
    if (!sameOrigin(request, reply) || !requireRateLimit(reply, limiter, "signup", request, 8, 60_000)) return;
    const body = request.body?.data || {};
    const result = auth.signup(String(body.email || ""), String(body.password || ""), String(body.passwordConfirmation || ""));
    if (result.error) return reply.code(result.status).send({ error: result.error });
    const user = auth.createSession(request, reply, result.user);
    audit.record({ userId: result.user.id, action: "signup", result: "success" });
    return reply.code(201).send({ user });
  });

  app.post("/api/auth/login", async (request, reply) => {
    if (!sameOrigin(request, reply) || !requireRateLimit(reply, limiter, "login", request, 12, 60_000)) return;
    const body = request.body?.data || {};
    const result = auth.authenticatePassword(request, body.email, body.password);
    if (result.error) return reply.code(result.status).send({ error: result.error });
    const user = auth.createSession(request, reply, result.user);
    audit.record({ userId: result.user.id, action: "login", result: "success" });
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (!sameOrigin(request, reply)) return;
    const session = auth.getSession(request);
    auth.clearSession(request, reply);
    audit.record({ userId: session?.id, action: "logout", result: "success" });
    return { success: true };
  });

  for (const provider of ["google", "discord"]) {
    app.get(`/api/auth/oauth/${provider}`, async (request, reply) => {
      if (!requireRateLimit(reply, limiter, `oauth:${provider}`, request, 10, 60_000)) return;
      if (!auth.beginOAuth(request, reply, provider)) return reply.code(503).send({ error: "El proveedor OAuth no está configurado." });
    });
    app.get(`/api/auth/oauth/${provider}/callback`, async (request, reply) => {
      try {
        const user = await auth.finishOAuth(request, reply, provider);
        auth.createSession(request, reply, user);
        audit.record({ userId: user.id, action: `oauth_login:${provider}`, result: "success" });
        reply.redirect(user.role === "admin" || user.role === "owner" ? "/dashboard" : "/");
      } catch {
        reply.redirect(`/login?auth_error=oauth_failed`);
      }
    });
  }
}
