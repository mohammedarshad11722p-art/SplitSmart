// Location: backend/src/realtime/broadcast.ts
// Helpers for sending events to everyone in a room, usable from both socket
// handlers and REST routes.
import type { Application } from "express";
import { prisma } from "../lib/prisma";
import { getRoomState } from "../services/room.service";
import type { AppServer } from "./io";
import type { ServerToClientEvents } from "./types";

/**
 * Every SplitSmart room maps to one Socket.io "room" (a broadcast channel).
 * Emitting to room:K7P2QX reaches every phone looking at that split.
 */
export function roomChannel(code: string) {
  return `room:${code}`;
}

/** index.ts stores `io` on the Express app. In tests there is none, so helpers no-op. */
export function getIo(app: Application): AppServer | undefined {
  return app.get("io") as AppServer | undefined;
}

/** Typed emit: event name and payload are checked against ServerToClientEvents. */
export function emitToRoom<E extends keyof ServerToClientEvents>(
  app: Application,
  code: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  getIo(app)?.to(roomChannel(code)).emit(event, ...args);
}

/** Send the full snapshot to everyone, e.g. after the host edits an item. */
export async function broadcastRoomState(io: AppServer | undefined, code: string) {
  if (!io) return;
  io.to(roomChannel(code)).emit("room:state", await getRoomState(code));
}

/** Called by bill routes after host edits: if the bill has a live room, refresh every phone. */
export async function notifyBillChanged(app: Application, billId: string) {
  const io = getIo(app);
  if (!io) return;
  const room = await prisma.room.findUnique({ where: { billId }, select: { code: true } });
  if (room) await broadcastRoomState(io, room.code);
}

/** Who has the room open right now? Unique participant ids across all connected sockets. */
export async function broadcastPresence(io: AppServer, code: string) {
  const sockets = await io.in(roomChannel(code)).fetchSockets();
  const online = [...new Set(sockets.map((s) => s.data.participantId))];
  io.to(roomChannel(code)).emit("presence", { online });
}

/** Host removed someone: tell their phone(s) and close the connection. */
export async function disconnectParticipant(app: Application, code: string, participantId: string) {
  const io = getIo(app);
  if (!io) return;
  const sockets = await io.in(roomChannel(code)).fetchSockets();
  for (const s of sockets) {
    if (s.data.participantId === participantId) {
      s.emit("session:ended", { reason: "removed" });
      s.disconnect(true);
    }
  }
}
