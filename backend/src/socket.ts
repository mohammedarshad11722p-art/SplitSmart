// Location: backend/src/socket.ts
// Creates the Socket.io server. Real-time claiming handlers arrive in step 5;
// for now we just log connections so we can prove WebSockets work end to end.
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Phones switch between Wi-Fi and 4G. Recovery replays missed events to a
    // client that drops for under 2 minutes, instead of losing claims.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 socket connected ${socket.id}`);
    socket.emit("server:hello", { message: "Connected to SplitSmart" });

    socket.on("disconnect", (reason) => {
      console.log(`🔌 socket disconnected ${socket.id} (${reason})`);
    });
  });

  return io;
}
