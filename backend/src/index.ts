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

// Render sends SIGTERM on every deploy. Close cleanly so in-flight requests
// finish and DB connections are released.
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard stop if stuck
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
