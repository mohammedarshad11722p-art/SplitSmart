// Location: backend/src/realtime/claimHandlers.ts
// Handlers for events a phone sends while in a room.
import { ZodError, z } from "zod";
import { AppError } from "../middleware/errorHandler";
import { setClaim } from "../services/claim.service";
import { getRoomState } from "../services/room.service";
import { roomChannel } from "./broadcast";
import type { AppServer, AppSocket } from "./io";
import type { Ack, AckError } from "./types";

// Never trust a payload just because TypeScript has a type for it:
// anyone can open a socket and send anything.
const claimSetSchema = z.object({
  itemId: z.string().min(1).max(64),
  claimed: z.boolean(),
  participantId: z.string().min(1).max(64).optional(),
});

/** Turns any thrown error into the { code, message } shape phones understand. */
export function toAckError(err: unknown): AckError {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  if (err instanceof ZodError) return { code: "VALIDATION_ERROR", message: "Invalid request" };
  console.error("socket handler error:", err);
  return { code: "INTERNAL_ERROR", message: "Something went wrong" };
}

/** Runs a handler and always answers the ack, success or failure. */
async function respond<T>(ack: unknown, work: () => Promise<T>) {
  const reply = typeof ack === "function" ? (ack as Ack<T>) : () => {}; // client may omit the ack
  try {
    reply({ ok: true, data: await work() });
  } catch (err) {
    reply({ ok: false, error: toAckError(err) });
  }
}

/** Simple per-socket rate limit: max `limit` events per `windowMs`. */
function createRateLimiter(limit: number, windowMs: number) {
  let count = 0;
  let windowStart = Date.now();
  return () => {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > limit) throw new AppError(429, "RATE_LIMITED", "Slow down a little");
  };
}

export function registerClaimHandlers(io: AppServer, socket: AppSocket) {
  const { roomCode, roomId, participantId, isHost } = socket.data;
  const checkRate = createRateLimiter(30, 10_000); // 30 taps per 10 s is very fast tapping

  /**
   * Why "set" instead of "toggle"?
   * With toggle, a double tap or a retry after a network blip flips the item
   * TWICE and the phone ends up in the wrong state. With set, the phone says
   * "I want this claimed" and sending it twice gives the same result.
   * That property is called idempotency.
   */
  socket.on("claim:set", (payload, ack) =>
    respond(ack, async () => {
      checkRate();
      const input = claimSetSchema.parse(payload);
      const result = await setClaim({
        roomId,
        actor: { participantId, isHost },
        itemId: input.itemId,
        claimed: input.claimed,
        targetParticipantId: input.participantId,
      });
      // Everyone in the room, sender included, gets the new claimers list.
      io.to(roomChannel(roomCode)).emit("item:claims", { ...result, changedBy: participantId });
      return result;
    }),
  );

  socket.on("room:sync", (ack) =>
    respond(ack, async () => {
      checkRate();
      return getRoomState(roomCode);
    }),
  );
}
