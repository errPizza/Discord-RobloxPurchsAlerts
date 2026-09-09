export function createGameEvents() {
  const sockets = new Map([["Clothing", new Set()], ["Missile", new Set()]]);
  function connect(gameKey, socket) {
    const group = sockets.get(gameKey);
    if (!group) return false;
    group.add(socket);
    socket.on("close", () => group.delete(socket));
    socket.on("error", () => group.delete(socket));
    return true;
  }
  function notify(gameKey) {
    const message = JSON.stringify({ type: "purchase", gameKey, receivedAt: new Date().toISOString() });
    for (const socket of sockets.get(gameKey) || []) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }
  return { connect, notify };
}
