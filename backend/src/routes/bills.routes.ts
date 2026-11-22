// Location: backend/src/routes/bills.routes.ts
// All amounts in requests and responses are integer PAISE.
//
// POST   /api/bills                       upload photo → AI parse        (public, rate limited)
// POST   /api/bills/manual                empty bill, type items in      (public)
// GET    /api/bills/:billId               bill + items + validation      (public: ids are unguessable)
// PATCH  /api/bills/:billId               edit name/subtotal/tax/...     (host)
// POST   /api/bills/:billId/items         add item                       (host)
// PATCH  /api/bills/:billId/items/:itemId edit item                      (host)
// DELETE /api/bills/:billId/items/:itemId delete item                    (host)
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AppError, asyncHandler } from "../middleware/errorHandler";
import { requireHost } from "../middleware/hostAuth";
import { uploadBillImage } from "../middleware/upload";
import { notifyBillChanged } from "../realtime/broadcast";
import * as billService from "../services/bill.service";

export const billsRouter = Router();

// Every upload costs an AI call (real money). 10 per minute per IP is plenty
// for a real host and stops someone draining your credits with a script.
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many uploads, please wait a minute" } },
});

// ── Validation schemas ──
const paise = z.number().int().min(0).max(100_000_000); // up to ₹10 lakh
const itemCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(999),
  unitPrice: paise,
  total: paise.optional(), // omitted → quantity × unitPrice
});
const itemUpdateSchema = itemCreateSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "Send at least one field to update",
});
const billUpdateSchema = z
  .object({
    restaurantName: z.string().trim().max(120).nullable(),
    subtotal: paise,
    tax: paise,
    serviceCharge: paise,
    discount: paise,
    grandTotal: paise,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Send at least one field to update" });
const manualSchema = z.object({ restaurantName: z.string().trim().max(120).optional() });

// ── Routes ──
billsRouter.post(
  "/",
  uploadLimiter,
  uploadBillImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, "IMAGE_REQUIRED", 'Attach the bill photo in a form field named "image"');
    const result = await billService.createBillFromImage(req.file.buffer);
    // 201 even if the AI failed: the bill exists and the host can add items manually.
    res.status(201).json(result);
  }),
);

billsRouter.post(
  "/manual",
  asyncHandler(async (req, res) => {
    const { restaurantName } = manualSchema.parse(req.body ?? {});
    res.status(201).json(await billService.createManualBill(restaurantName));
  }),
);

billsRouter.get(
  "/:billId",
  asyncHandler(async (req, res) => {
    res.json({ bill: await billService.getBill(req.params.billId!) });
  }),
);

billsRouter.patch(
  "/:billId",
  requireHost,
  asyncHandler(async (req, res) => {
    const patch = billUpdateSchema.parse(req.body);
    const bill = await billService.updateBillTotals(req.params.billId!, patch);
    await notifyBillChanged(req.app, bill.id); // phones in the room see the change live
    res.json({ bill });
  }),
);

billsRouter.post(
  "/:billId/items",
  requireHost,
  asyncHandler(async (req, res) => {
    const input = itemCreateSchema.parse(req.body);
    const bill = await billService.addItem(req.params.billId!, input);
    await notifyBillChanged(req.app, bill.id);
    res.status(201).json({ bill });
  }),
);

billsRouter.patch(
  "/:billId/items/:itemId",
  requireHost,
  asyncHandler(async (req, res) => {
    const patch = itemUpdateSchema.parse(req.body);
    const bill = await billService.updateItem(req.params.billId!, req.params.itemId!, patch);
    await notifyBillChanged(req.app, bill.id);
    res.json({ bill });
  }),
);

billsRouter.delete(
  "/:billId/items/:itemId",
  requireHost,
  asyncHandler(async (req, res) => {
    const bill = await billService.deleteItem(req.params.billId!, req.params.itemId!);
    await notifyBillChanged(req.app, bill.id);
    res.json({ bill });
  }),
);
