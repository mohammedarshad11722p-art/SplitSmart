// Location: backend/src/services/claim.service.ts
// The one function that changes claims. Used by the "claim:set" socket event.
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import type { ItemClaims } from "../realtime/types";
import { roomLock } from "./roomLock";

export interface SetClaimInput {
  roomId: string;
  actor: { participantId: string; isHost: boolean };
  itemId: string;
  claimed: boolean;
  /** Defaults to the actor. Only the host may set it to someone else. */
  targetParticipantId?: string;
}

export async function setClaim(input: SetClaimInput): Promise<ItemClaims> {
  const target = input.targetParticipantId ?? input.actor.participantId;
  if (target !== input.actor.participantId && !input.actor.isHost) {
    throw new AppError(403, "NOT_HOST", "Only the host can claim items for someone else");
  }

  // One change at a time per room (see utils/keyedLock.ts for why).
  return roomLock.run(input.roomId, async () => {
    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
      select: { status: true, expiresAt: true, billId: true },
    });
    if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
    if (room.status !== "OPEN") throw new AppError(409, "ROOM_CLOSED", "The split is finalized, claims are locked");
    if (room.expiresAt < new Date()) throw new AppError(410, "ROOM_EXPIRED", "This room has expired");

    // Both checks scope by room/bill, so ids from another room are useless here.
    const item = await prisma.item.findFirst({ where: { id: input.itemId, billId: room.billId }, select: { id: true } });
    if (!item) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found in this room");
    const participant = await prisma.participant.findFirst({
      where: { id: target, roomId: input.roomId },
      select: { id: true },
    });
    if (!participant) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "Participant not found in this room");

    if (input.claimed) {
      // Already claimed (double tap, retry after reconnect)? That's the state we
      // wanted anyway, so it's a success, not an error. This is idempotency.
      // skipDuplicates becomes SQL "ON CONFLICT DO NOTHING": the @@unique on
      // (itemId, participantId) quietly ignores the second insert.
      await prisma.claim.createMany({
        data: [{ itemId: item.id, participantId: target }],
        skipDuplicates: true,
      });
    } else {
      // deleteMany doesn't throw when nothing matches: unclaiming twice is fine too.
      await prisma.claim.deleteMany({ where: { itemId: item.id, participantId: target } });
    }

    const claims = await prisma.claim.findMany({
      where: { itemId: item.id },
      orderBy: { createdAt: "asc" },
      select: { participantId: true },
    });
    return { itemId: item.id, claimedBy: claims.map((c) => c.participantId) };
  });
}
