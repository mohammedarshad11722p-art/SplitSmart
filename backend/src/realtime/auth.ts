// Location: backend/src/realtime/auth.ts
// Socket.io middleware: runs once per connection, BEFORE "connection" fires.
// The phone connects with  io(URL, { auth: { roomCode, sessionToken } }).
// We check the token exactly like GET /api/rooms/:code/me does.
import { prisma } from "../lib/prisma";
import { normalizeRoomCode } from "../utils/roomCode";
import { hashToken } from "../utils/tokens";
import type { AppSocket } from "./io";

/** The client receives this as a "connect_error" with err.message and err.data.code. */
function authError(code: string, message: string) {
  const err = new Error(message) as Error & { data?: { code: string } };
  err.data = { code };
  return err;
}

export async function socketAuth(socket: AppSocket, next: (err?: Error) => void) {
  try {
    const { roomCode, sessionToken } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const code = typeof roomCode === "string" ? normalizeRoomCode(roomCode) : null;
    if (!code || typeof sessionToken !== "string" || sessionToken.length < 20) {
      return next(authError("SESSION_INVALID", "Join the room first"));
    }

    const participant = await prisma.participant.findUnique({
      where: { sessionTokenHash: hashToken(sessionToken) },
      include: { room: { select: { id: true, code: true } } },
    });
    if (!participant || participant.room.code !== code) {
      return next(authError("SESSION_INVALID", "Session not recognised, please join again"));
    }

    // socket.data is per-connection storage that every handler can read.
    socket.data = {
      participantId: participant.id,
      roomId: participant.room.id,
      roomCode: code,
      isHost: participant.isHost,
      name: participant.name,
    };
    next();
  } catch (err) {
    console.error("socket auth failed:", err);
    next(authError("INTERNAL_ERROR", "Could not connect, please retry"));
  }
}
