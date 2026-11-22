// Location: backend/src/index.ts
// Entry point: one HTTP server shared by Express (REST) and Socket.io (WebSockets).
// Sharing a port matters on Render, which exposes exactly one port per service.
import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { createSocketServer } from "./socket";

const app = createApp();
const httpServer = createServer(app);
const io = createSocketServer(httpServer);

// Later steps (rooms, claiming) need `io` inside routes to broadcast events.
app.set("io", io);

httpServer.listen(env.PORT, () => {
  console.log(`🚀 SplitSmart API on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Render sends SIGTERM on every deploy, Ctrl+C sends SIGINT. Close cleanly so
// DB connections are released.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return; // a second Ctrl+C shouldn't start a second shutdown
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);
  setTimeout(() => process.exit(1), 5_000).unref(); // hard stop if anything hangs

  // io.close() disconnects every socket AND stops the HTTP server.
  // closeAllConnections() drops idle keep-alive HTTP connections, which
  // otherwise keep the server "open" for a while (why you needed Ctrl+C twice).
  io.close();
  httpServer.closeAllConnections();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
