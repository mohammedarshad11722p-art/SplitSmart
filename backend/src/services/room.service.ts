// Location: backend/src/services/room.service.ts
// Business logic for rooms: create, join/rejoin, read state, host edits.
import { Prisma, type Participant } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { pickAvatar } from "../utils/avatar";
import { generateRoomCode } from "../utils/roomCode";
import { generateToken, hashToken } from "../utils/tokens";

export const ROOM_TTL_HOURS = 24;
export const MAX_PARTICIPANTS = 30;
const CODE_ATTEMPTS = 5;

// ── DTOs: what the API sends. Never includes token hashes. ──

export interface ParticipantDto {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string | null;
  isHost: boolean;
  paymentStatus: Participant["paymentStatus"];
  amountDue: number | null;
  joinedAt: Date;
}

export function toParticipantDto(p: Participant): ParticipantDto {
  return {
    id: p.id,
    name: p.name,
    avatarColor: p.avatarColor,
    avatarEmoji: p.avatarEmoji,
    isHost: p.isHost,
    paymentStatus: p.paymentStatus,
    amountDue: p.amountDue,
    joinedAt: p.joinedAt,
  };
}

export function joinUrlFor(code: string) {
  // First FRONTEND_URL origin, e.g. http://localhost:3000/room/K7P2QX
  return `${env.corsOrigins[0]}/room/${code}`;
}

/** Prisma error P2002 = "unique constraint failed". `target` names the column/index. */
function isUniqueViolation(err: unknown, column: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta?.target ?? "").includes(column)
  );
}

/**
 * Everything a phone needs to draw the room: bill, items with who claimed
 * them, and participants. Sent on join and (step 5) on every reconnect.
 */
export async function getRoomState(code: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      bill: {
        include: {
          items: { orderBy: { position: "asc" }, include: { claims: { select: { participantId: true } } } },
        },
      },
    },
  });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");

  const { bill } = room;
  return {
    room: {
      code: room.code,
      status: room.status,
      hostName: room.hostName,
      hostUpiId: room.hostUpiId,
      expiresAt: room.expiresAt,
      finalizedAt: room.finalizedAt,
      joinUrl: joinUrlFor(room.code),
    },
    bill: {
      id: bill.id,
      restaurantName: bill.restaurantName,
      imageUrl: bill.imageUrl,
      currency: bill.currency,
      subtotal: bill.subtotal,
      tax: bill.tax,
      serviceCharge: bill.serviceCharge,
      discount: bill.discount,
      grandTotal: bill.grandTotal,
      items: bill.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        position: it.position,
        claimedBy: it.claims.map((c) => c.participantId),
      })),
    },
    participants: room.participants.map(toParticipantDto),
  };
}

export type RoomState = Awaited<ReturnType<typeof getRoomState>>;

/**
 * Host turns their bill into a live room.
 * The host is also a participant (they ate too), created in the same query.
 */
export async function createRoom(input: { billId: string; hostName: string; hostUpiId: string }) {
  const bill = await prisma.bill.findUnique({
    where: { id: input.billId },
    include: { room: { select: { code: true } }, _count: { select: { items: true } } },
  });
  if (!bill) throw new AppError(404, "BILL_NOT_FOUND", "Bill not found");
  if (bill.room) {
    throw new AppError(409, "ROOM_EXISTS", "This bill already has a room", { code: bill.room.code });
  }
  if (bill.parseStatus === "PENDING") throw new AppError(409, "BILL_NOT_READY", "Bill is still being read");
  if (bill._count.items === 0) throw new AppError(400, "NO_ITEMS", "Add at least one item before starting the split");

  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + ROOM_TTL_HOURS * 60 * 60 * 1000);

  // A random code can (very rarely) collide with an existing one. Instead of
  // "check then insert" (racy), we just insert and retry if the DB says it's taken.
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    try {
      const room = await prisma.room.create({
        data: {
          code,
          billId: bill.id,
          hostName: input.hostName,
          hostUpiId: input.hostUpiId,
          expiresAt,
          participants: {
            create: {
              name: input.hostName,
              isHost: true,
              sessionTokenHash: hashToken(sessionToken),
              ...pickAvatar(0),
            },
          },
        },
        include: { participants: true },
      });
      return {
        sessionToken, // the host's guest identity, for claiming their own items
        me: toParticipantDto(room.participants[0]!),
        state: await getRoomState(room.code),
      };
    } catch (err) {
      if (isUniqueViolation(err, "code")) continue; // collision → try a new code
      if (isUniqueViolation(err, "billId")) {
        // Host double-tapped "Create room": two requests raced.
        throw new AppError(409, "ROOM_EXISTS", "This bill already has a room");
      }
      throw err;
    }
  }
  throw new AppError(503, "NO_ROOM_CODE", "Could not create a room code, please try again");
}

/**
 * Guest joins with a name. If they send a sessionToken we already know
 * (page refresh, phone reconnect), they get their old identity back instead
 * of becoming "Rahul (2)".
 */
export async function joinRoom(code: string, input: { name: string; sessionToken?: string }) {
  const room = await prisma.room.findUnique({ where: { code }, include: { participants: true } });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found. Check the code?");

  if (input.sessionToken) {
    const hash = hashToken(input.sessionToken);
    const existing = room.participants.find((p) => p.sessionTokenHash === hash);
    // Rejoining is allowed even after finalize: people need to see what they owe.
    if (existing) {
      return { rejoined: true, sessionToken: input.sessionToken, me: toParticipantDto(existing), state: await getRoomState(code) };
    }
    // Unknown/old token: fall through and join as a new person.
  }

  if (room.expiresAt < new Date()) throw new AppError(410, "ROOM_EXPIRED", "This room has expired");
  if (room.status !== "OPEN") throw new AppError(409, "ROOM_CLOSED", "The host has already finalized this split");
  if (room.participants.length >= MAX_PARTICIPANTS) throw new AppError(409, "ROOM_FULL", "This room is full");

  const nameTaken = room.participants.some((p) => p.name.toLowerCase() === input.name.toLowerCase());
  if (nameTaken) {
    throw new AppError(409, "NAME_TAKEN", `Someone called "${input.name}" is already here. Add an initial?`);
  }

  const sessionToken = generateToken();
  try {
    const participant = await prisma.participant.create({
      data: {
        roomId: room.id,
        name: input.name,
        sessionTokenHash: hashToken(sessionToken),
        ...pickAvatar(room.participants.length),
      },
    });
    return { rejoined: false, sessionToken, me: toParticipantDto(participant), state: await getRoomState(code) };
  } catch (err) {
    // Two people typed the same name at the same moment: the DB's
    // @@unique([roomId, name]) caught what our check above missed.
    if (isUniqueViolation(err, "name")) {
      throw new AppError(409, "NAME_TAKEN", `Someone called "${input.name}" is already here. Add an initial?`);
    }
    throw err;
  }
}

/** "Who am I?" The frontend calls this on page load with the token from localStorage. */
export async function getParticipantBySession(code: string, sessionToken: string) {
  const participant = await prisma.participant.findUnique({
    where: { sessionTokenHash: hashToken(sessionToken) },
    include: { room: { select: { code: true } } },
  });
  if (!participant || participant.room.code !== code) {
    throw new AppError(401, "SESSION_INVALID", "Session not recognised, please join again");
  }
  return toParticipantDto(participant);
}

export async function updateRoom(code: string, patch: { hostName?: string; hostUpiId?: string }) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
  if (room.status !== "OPEN") throw new AppError(409, "ROOM_CLOSED", "Room is finalized");
  await prisma.room.update({ where: { code }, data: patch });
  return getRoomState(code);
}

/** Host removes someone who joined by mistake. Their claims are deleted too (cascade). */
export async function removeParticipant(code: string, participantId: string) {
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, room: { code } },
    include: { room: { select: { status: true } } },
  });
  if (!participant) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "Participant not found in this room");
  if (participant.isHost) throw new AppError(400, "CANNOT_REMOVE_HOST", "The host can't be removed");
  if (participant.room.status !== "OPEN") throw new AppError(409, "ROOM_CLOSED", "Room is finalized");
  await prisma.participant.delete({ where: { id: participantId } });
}
