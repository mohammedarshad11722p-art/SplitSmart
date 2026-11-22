// Location: backend/src/socket.ts
// Creates the Socket.io server. Real-time claiming handlers arrive in step 5.
import type { Application } from "express";
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

/**
 * Every SplitSmart room maps to one Socket.io "room" (a broadcast channel).
 * Emitting to room:K7P2QX reaches every phone looking at that split.
 */
export function roomChannel(code: string) {
  return `room:${code}`;
}

/** Event names, in one place so backend and frontend can't drift apart. */
export const ServerEvents = {
  participantJoined: "participant:joined",
  participantRemoved: "participant:removed",
  roomUpdated: "room:updated",
} as const;

/**
 * Lets REST routes broadcast. index.ts stores `io` on the Express app; in
 * tests there's no io, so this quietly does nothing.
 */
export function emitToRoom(app: Application, code: string, event: string, payload: unknown) {
  const io = app.get("io") as Server | undefined;
  io?.to(roomChannel(code)).emit(event, payload);
}
