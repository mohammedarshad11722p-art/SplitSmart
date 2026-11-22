// Location: backend/src/socket.ts
// Creates the Socket.io server and wires up authentication + handlers.
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env";
import { socketAuth } from "./realtime/auth";
import { broadcastPresence, roomChannel } from "./realtime/broadcast";
import { registerClaimHandlers } from "./realtime/claimHandlers";
import type { AppServer } from "./realtime/io";
import { getRoomState } from "./services/room.service";

export function createSocketServer(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Phones switch between Wi-Fi and 4G. Recovery replays missed events to a
    // client that drops for under 2 minutes, instead of losing claims.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  // 1. Who are you? Runs before "connection". Bad token = connection refused.
  io.use(socketAuth);

  // 2. You're in.
  io.on("connection", async (socket) => {
    const { roomCode, name } = socket.data;
    console.log(`🔌 ${name} connected to ${roomCode} (${socket.id})`);

    await socket.join(roomChannel(roomCode));
    registerClaimHandlers(io, socket);

    // Send a fresh full snapshot on EVERY connect, including reconnects.
    // Whatever the phone missed while offline, it's now in sync.
    try {
      socket.emit("room:state", await getRoomState(roomCode));
    } catch (err) {
      console.error("failed to send room state:", err);
    }
    void broadcastPresence(io, roomCode);

    socket.on("disconnect", (reason) => {
      console.log(`🔌 ${name} left ${roomCode} (${reason})`);
      void broadcastPresence(io, roomCode);
    });
  });

  return io;
}
