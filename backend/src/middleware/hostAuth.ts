// Location: backend/src/middleware/hostAuth.ts
// Protects host-only routes. The frontend sends the token it got when the bill
// was created, in the "X-Host-Token" header.
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyToken } from "../utils/tokens";
import { AppError } from "./errorHandler";

function readHostToken(req: Request): string {
  const token = req.header("x-host-token");
  if (!token) throw new AppError(401, "HOST_TOKEN_MISSING", "Host token required");
  return token;
}

/** For /api/bills/:billId/... and POST /api/rooms (billId in the body). */
export async function requireHost(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readHostToken(req);
    const billId: unknown = req.params.billId ?? req.body?.billId;
    if (typeof billId !== "string" || !billId) throw new AppError(400, "BILL_ID_MISSING", "Bill id missing");

    const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { hostTokenHash: true } });
    if (!bill) throw new AppError(404, "BILL_NOT_FOUND", "Bill not found");
    if (!verifyToken(token, bill.hostTokenHash)) {
      throw new AppError(403, "NOT_HOST", "Only the host can do this");
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** For /api/rooms/:code/... host actions. The room's bill holds the token hash. */
export async function requireRoomHost(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readHostToken(req);
    const room = await prisma.room.findUnique({
      where: { code: req.params.code! },
      select: { bill: { select: { hostTokenHash: true } } },
    });
    if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
    if (!verifyToken(token, room.bill.hostTokenHash)) {
      throw new AppError(403, "NOT_HOST", "Only the host can do this");
    }
    next();
  } catch (err) {
    next(err);
  }
}
