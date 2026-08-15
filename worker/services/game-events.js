const HUB_NAME = "game-analytics";
const GAME_KEYS = new Set(["Clothing", "Missile"]);

function normalizedGameKey(value) {
  const candidate = String(value || "").toLowerCase();

  return [...GAME_KEYS].find((gameKey) => gameKey.toLowerCase() === candidate) || null;
}

function internalJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export class GameAnalyticsEvents {

  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/notify") {
      let data;

      try { data = await request.json(); }
      catch { return internalJson({ error: "Evento inválido." }, 400); }

      const gameKey = normalizedGameKey(data.gameKey);

      if (!gameKey) return internalJson({ error: "Juego inválido." }, 400);

      const message = JSON.stringify({
        type: "purchase",
        gameKey,
        receivedAt: new Date().toISOString(),
      });
      let delivered = 0;

      for (const socket of this.state.getWebSockets(gameKey)) {
        try {
          socket.send(message);
          delivered += 1;
        } catch {
          try { socket.close(1011, "No fue posible entregar el evento."); } catch { /* Connection already closed. */ }
        }
      }

      return internalJson({ delivered });
    }

    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return internalJson({ error: "Se esperaba una conexión WebSocket." }, 426);
    }

    const gameKey = normalizedGameKey(url.searchParams.get("game"));

    if (!gameKey) return internalJson({ error: "Juego inválido." }, 400);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server, [gameKey]);
    server.serializeAttachment({ gameKey });

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }

  webSocketClose(socket, code, reason) {
    socket.close(code, reason);
  }
}

function hub(env) {
  return env.GAME_ANALYTICS_EVENTS?.getByName?.(HUB_NAME) || null;
}

export function connectToGameEvents(request, env) {
  const stub = hub(env);

  if (!stub) return internalJson({ error: "El canal en vivo no está disponible." }, 503);

  return stub.fetch(request);
}

export async function notifyGamePurchase(env, gameKey) {
  const stub = hub(env);

  if (!stub) return false;

  try {
    const response = await stub.fetch("https://game-events.internal/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameKey }),
    });

    if (!response.ok) console.error("[GAME_EVENTS_NOTIFY]", `Durable Object respondió ${response.status}.`);

    return response.ok;
  } catch (error) {
    console.error("[GAME_EVENTS_NOTIFY]", error instanceof Error ? error.message : "unknown_error");

    return false;
  }
}
