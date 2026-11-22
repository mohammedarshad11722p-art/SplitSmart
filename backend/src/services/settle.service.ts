// Location: backend/src/services/settle.service.ts
// Connects the pure split math (split.ts) to the database:
// preview the split, finalize it (lock + save amounts), or reopen it.
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { roomLock } from "./roomLock";
import { calculateSplit, type SplitResult } from "./split";

export interface SplitWarnings {
  /** Items nobody claimed. Finalizing anyway splits them equally among everyone. */
  unclaimedItems: SplitResult["unclaimedItems"];
  /** Items add up to something other than the printed subtotal (AI misread or host edit). */
  itemsMismatch: { itemsTotal: number; subtotal: number; difference: number } | null;
}

export interface SplitView {
  status: "OPEN" | "FINALIZED" | "CLOSED";
  final: boolean; // true = amounts are locked and saved
  split: SplitResult;
  warnings: SplitWarnings;
}

async function loadRoom(code: string) {
  const room = await prisma.room.findUnique({
    where: { code },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      bill: {
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { claims: { orderBy: { createdAt: "asc" }, select: { participantId: true } } },
          },
        },
      },
    },
  });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
  return room;
}

type LoadedRoom = Awaited<ReturnType<typeof loadRoom>>;

function computeView(room: LoadedRoom): SplitView {
  const { bill } = room;
  const split = calculateSplit(
    bill.items.map((it) => ({ id: it.id, name: it.name, total: it.total, claimedBy: it.claims.map((c) => c.participantId) })),
    room.participants.map((p) => ({ id: p.id, name: p.name })),
    { tax: bill.tax, serviceCharge: bill.serviceCharge, discount: bill.discount, grandTotal: bill.grandTotal },
  );
  const difference = split.itemsTotal - bill.subtotal;
  return {
    status: room.status,
    final: room.status !== "OPEN",
    split,
    warnings: {
      unclaimedItems: split.unclaimedItems,
      itemsMismatch: difference === 0 ? null : { itemsTotal: split.itemsTotal, subtotal: bill.subtotal, difference },
    },
  };
}

/**
 * Live preview while people are still claiming ("so far you owe ₹412").
 * After finalize it returns the locked amounts.
 */
export async function getSplitView(code: string): Promise<SplitView> {
  const room = await loadRoom(code);
  const view = computeView(room);

  if (view.final) {
    // Claims are locked, so recomputing gives the same numbers. If it ever
    // didn't (e.g. a future change to the rounding rules), the SAVED amount
    // wins, because that's what people were already asked to pay.
    for (const person of view.split.people) {
      const saved = room.participants.find((p) => p.id === person.participantId)?.amountDue;
      if (saved != null && saved !== person.total) {
        console.warn(`amountDue drift for ${person.participantId}: saved ${saved}, computed ${person.total}`);
        person.total = saved;
      }
    }
  }
  return view;
}

/**
 * Host locks the split. Blocks with a 409 if there are unclaimed items or the
 * items don't match the subtotal, unless `force` is true (host confirmed the warning).
 */
export async function finalizeRoom(code: string, force: boolean): Promise<SplitView> {
  const found = await prisma.room.findUnique({ where: { code }, select: { id: true } });
  if (!found) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
  const roomId = found.id;

  // Same lock as claim:set, so nobody can tap an item halfway through finalizing.
  return roomLock.run(roomId, async () => {
    const room = await loadRoom(code);
    if (room.status !== "OPEN") throw new AppError(409, "ALREADY_FINALIZED", "This split is already finalized");

    const view = computeView(room);
    if (!force && view.warnings.unclaimedItems.length > 0) {
      throw new AppError(
        409,
        "UNCLAIMED_ITEMS",
        `${view.warnings.unclaimedItems.length} item(s) haven't been claimed. Finalize anyway to split them equally among everyone.`,
        view.warnings,
      );
    }
    if (!force && view.warnings.itemsMismatch) {
      throw new AppError(
        409,
        "BILL_MISMATCH",
        "The items don't add up to the bill's subtotal. Fix the items, or finalize anyway.",
        view.warnings,
      );
    }
    if (!view.split.balanced) {
      // Should be impossible; refuse rather than save wrong amounts.
      throw new AppError(500, "SPLIT_UNBALANCED", "Split didn't add up, please report this");
    }

    // Save everyone's amount and lock the room in ONE transaction:
    // either all of it happens or none of it does.
    await prisma.$transaction([
      ...view.split.people.map((p) =>
        prisma.participant.update({ where: { id: p.participantId }, data: { amountDue: p.total } }),
      ),
      prisma.room.update({ where: { id: roomId }, data: { status: "FINALIZED", finalizedAt: new Date() } }),
    ]);

    return { ...view, status: "FINALIZED", final: true };
  });
}

/** Host made a mistake: unlock so people can fix claims. Not allowed once anyone has paid. */
export async function reopenRoom(code: string) {
  const room = await prisma.room.findUnique({ where: { code }, include: { participants: true } });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");

  return roomLock.run(room.id, async () => {
    const fresh = await prisma.room.findUniqueOrThrow({ where: { id: room.id }, include: { participants: true } });
    if (fresh.status === "OPEN") throw new AppError(409, "NOT_FINALIZED", "This split isn't finalized");
    if (fresh.participants.some((p) => p.paymentStatus === "PAID")) {
      throw new AppError(409, "PAYMENTS_STARTED", "Someone has already paid, so the split can't be reopened");
    }
    await prisma.$transaction([
      prisma.participant.updateMany({ where: { roomId: room.id }, data: { amountDue: null } }),
      prisma.room.update({ where: { id: room.id }, data: { status: "OPEN", finalizedAt: null } }),
    ]);
  });
}
