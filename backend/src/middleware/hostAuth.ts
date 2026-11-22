// Location: backend/src/middleware/hostAuth.ts
// Protects host-only routes. The frontend sends the token it got when the bill
// was created, in the "X-Host-Token" header.
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyHostToken } from "../utils/hostToken";
import { AppError } from "./errorHandler";

export async function requireHost(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.header("x-host-token");
    if (!token) throw new AppError(401, "HOST_TOKEN_MISSING", "Host token required");

    const billId = req.params.billId;
    if (!billId) throw new AppError(400, "BILL_ID_MISSING", "Bill id missing");

    const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { hostTokenHash: true } });
    if (!bill) throw new AppError(404, "BILL_NOT_FOUND", "Bill not found");
    if (!verifyHostToken(token, bill.hostTokenHash)) {
      throw new AppError(403, "NOT_HOST", "Only the host can do this");
    }
    next();
  } catch (err) {
    next(err);
  }
}
