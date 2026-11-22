// Location: backend/src/services/settle.service.ts
// Connects the pure split math (split.ts) to the database:
// preview the split, finalize it (lock + save amounts), or reopen it.
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { roomLock } from "./roomLock";
import { buildUpiLink, paymentNote } from "../utils/upi";
import { calculateSplit, type SplitResult } from "./split";

export interface SplitWarnings {
  /** Items nobody claimed. Finalizing anyway splits them equally among everyone. */
  unclaimedItems: SplitResult["unclaimedItems"];
  /** Items add up to something other than the printed subtotal (AI misread or host edit). */
  itemsMismatch: { itemsTotal: number; subtotal: number; difference: number } | null;
}

export interface PersonPayment {
  participantId: string;
  /** HOST = paid the restaurant, owes nobody. NOTHING_DUE = their share is ₹0. */
  status: "PENDING" | "PAID" | "HOST" | "NOTHING_DUE";
  amount: number; // paise
  paidAt: Date | null;
  /** upi://pay?... with the host as payee. Null when there's nothing to pay. */
  upiLink: string | null;
}

export interface PaymentsView {
  payee: { name: string; upiId: string };
  people: PersonPayment[];
  dueCount: number; // people who owe the host something
  paidCount: number;
  collected: number; // paise received by the host so far
  outstanding: number; // paise still to come
  settled: boolean; // everyone who owes something has paid
}

export interface SplitView {
  status: "OPEN" | "FINALIZED" | "CLOSED";
  final: boolean; // true = amounts are locked and saved
  split: SplitResult;
  warnings: SplitWarnings;
  /** Only after finalize: who has paid, and each person's UPI link. */
  payments: PaymentsView | null;
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
    payments: null,
  };
}

/**
 * Payment status for everyone, plus a UPI link per person that pays the host.
 * Uses the locked totals in `split` (what each person owes).
 */
function buildPayments(room: LoadedRoom, split: SplitResult): PaymentsView {
  const note = paymentNote(room.bill.restaurantName);
  const people: PersonPayment[] = split.people.map((person) => {
    const p = room.participants.find((x) => x.id === person.participantId);
    const amount = person.total;
    let status: PersonPayment["status"];
    if (p?.isHost) status = "HOST";
    else if (amount <= 0) status = "NOTHING_DUE";
    else status = p?.paymentStatus === "PAID" ? "PAID" : "PENDING";
    const owes = status === "PENDING" || status === "PAID";
    return {
      participantId: person.participantId,
      status,
      amount,
      paidAt: status === "PAID" ? (p?.paidAt ?? null) : null,
      upiLink: owes ? buildUpiLink({ payeeUpiId: room.hostUpiId, payeeName: room.hostName, amountPaise: amount, note }) : null,
    };
  });
  const due = people.filter((p) => p.status === "PENDING" || p.status === "PAID");
  const paid = due.filter((p) => p.status === "PAID");
  const collected = paid.reduce((sum, p) => sum + p.amount, 0);
  const totalDue = due.reduce((sum, p) => sum + p.amount, 0);
  return {
    payee: { name: room.hostName, upiId: room.hostUpiId },
    people,
    dueCount: due.length,
    paidCount: paid.length,
    collected,
    outstanding: totalDue - collected,
    settled: paid.length === due.length,
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
    view.payments = buildPayments(room, view.split);
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

    // Re-read so the view includes payments (everyone starts as PENDING).
    return getSplitView(code);
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

/**
 * Host marks someone as paid (or undoes it). We can't see UPI payments
 * ourselves: a web page gets no "payment succeeded" signal back from the UPI
 * app, so the host checks their bank app and confirms here.
 * When everyone who owes something has paid, the room becomes CLOSED (settled).
 */
export async function setPaid(code: string, participantId: string, paid: boolean) {
  const found = await prisma.room.findUnique({ where: { code }, select: { id: true } });
  if (!found) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
  const roomId = found.id;

  return roomLock.run(roomId, async () => {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId }, include: { participants: true } });
    if (room.status === "OPEN") throw new AppError(409, "NOT_FINALIZED", "Finalize the split before marking payments");
    const participant = room.participants.find((p) => p.id === participantId);
    if (!participant) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "Participant not found in this room");
    if (participant.isHost) throw new AppError(400, "HOST_DOES_NOT_PAY", "The host paid the bill, so they don't owe anyone");
    if (paid && !participant.amountDue) throw new AppError(400, "NOTHING_DUE", `${participant.name} doesn't owe anything`);

    await prisma.participant.update({
      where: { id: participantId },
      data: paid ? { paymentStatus: "PAID", paidAt: new Date() } : { paymentStatus: "PENDING", paidAt: null },
    });

    // Settled = nobody with something to pay is still PENDING.
    const stillOwing = await prisma.participant.count({
      where: { roomId, isHost: false, amountDue: { gt: 0 }, paymentStatus: "PENDING" },
    });
    const status = stillOwing === 0 ? "CLOSED" : "FINALIZED";
    if (status !== room.status) await prisma.room.update({ where: { id: roomId }, data: { status } });

    const view = await getSplitView(code);
    const payment = view.payments!.people.find((p) => p.participantId === participantId)!;
    return { view, payment };
  });
}

/** The UPI link for one person (for their payment QR code). */
export async function getUpiLink(code: string, participantId: string): Promise<string> {
  const view = await getSplitView(code);
  if (!view.payments) throw new AppError(409, "NOT_FINALIZED", "The split isn't finalized yet");
  const person = view.payments.people.find((p) => p.participantId === participantId);
  if (!person) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "Participant not found in this room");
  if (!person.upiLink) throw new AppError(404, "NOTHING_TO_PAY", "This person has nothing to pay");
  return person.upiLink;
}
