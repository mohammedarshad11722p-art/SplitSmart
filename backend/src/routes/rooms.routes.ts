// Location: backend/src/routes/rooms.routes.ts
//
// POST   /api/rooms                                  create room from a bill   (host: X-Host-Token)
// GET    /api/rooms/:code                            full room state           (anyone with the code)
// POST   /api/rooms/:code/join                       join / rejoin with a name (anyone with the code)
// GET    /api/rooms/:code/me                         who am I?                 (X-Session-Token)
// GET    /api/rooms/:code/qr                         QR code PNG of join link  (anyone with the code)
// PATCH  /api/rooms/:code                            edit host name / UPI ID   (host)
// DELETE /api/rooms/:code/participants/:participantId remove a participant    (host)
import { Router } from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import { z } from "zod";
import { AppError, asyncHandler } from "../middleware/errorHandler";
import { requireHost, requireRoomHost } from "../middleware/hostAuth";
import * as roomService from "../services/room.service";
import { disconnectParticipant, emitToRoom } from "../realtime/broadcast";
import { normalizeRoomCode } from "../utils/roomCode";

export const roomsRouter = Router();

// Stops a script from spamming fake guests into a room.
const joinLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please wait a minute" } },
});

/**
 * Runs before every route with :code. Accepts "k7p2qx" and rewrites it to
 * "K7P2QX", or answers 404 straight away for impossible codes, so handlers
 * never deal with messy input.
 */
roomsRouter.param("code", (req, _res, next, raw: string) => {
  const code = normalizeRoomCode(raw);
  if (!code) return next(new AppError(404, "ROOM_NOT_FOUND", "Room not found. Check the code?"));
  req.params.code = code;
  next();
});

// ── Validation schemas ──

// UPI IDs look like name@bank: "arshad.k@okaxis", "9876543210@ybl".
export const upiIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/, "Enter a valid UPI ID, like name@okaxis");

const personName = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(30, "Keep it under 30 characters")
  .transform((s) => s.replace(/\s+/g, " ")); // "Rahul   K" → "Rahul K"

const createSchema = z.object({ billId: z.string().min(1), hostName: personName, hostUpiId: upiIdSchema });
const joinSchema = z.object({ name: personName, sessionToken: z.string().min(20).max(200).optional() });
const updateSchema = z
  .object({ hostName: personName, hostUpiId: upiIdSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Send at least one field to update" });

// ── Routes ──

roomsRouter.post(
  "/",
  requireHost, // checks X-Host-Token against the bill in req.body.billId
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const result = await roomService.createRoom(input);
    res.status(201).json(result);
  }),
);

roomsRouter.get(
  "/:code",
  asyncHandler(async (req, res) => {
    res.json(await roomService.getRoomState(req.params.code!));
  }),
);

roomsRouter.post(
  "/:code/join",
  joinLimiter,
  asyncHandler(async (req, res) => {
    const input = joinSchema.parse(req.body);
    const code = req.params.code!;
    const result = await roomService.joinRoom(code, input);
    if (!result.rejoined) {
      // Everyone already in the room sees the new avatar pop in.
      emitToRoom(req.app, code, "participant:joined", result.me);
    }
    res.status(result.rejoined ? 200 : 201).json(result);
  }),
);

roomsRouter.get(
  "/:code/me",
  asyncHandler(async (req, res) => {
    const token = req.header("x-session-token");
    if (!token) throw new AppError(401, "SESSION_MISSING", "Session token required");
    res.json({ me: await roomService.getParticipantBySession(req.params.code!, token) });
  }),
);

roomsRouter.get(
  "/:code/qr",
  asyncHandler(async (req, res) => {
    const code = req.params.code!;
    await roomService.getRoomState(code); // 404 if the room doesn't exist
    const png = await QRCode.toBuffer(roomService.joinUrlFor(code), {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M", // still scans if the screen has glare or a crack
    });
    res.type("png").set("Cache-Control", "public, max-age=3600").send(png);
  }),
);

roomsRouter.patch(
  "/:code",
  requireRoomHost,
  asyncHandler(async (req, res) => {
    const patch = updateSchema.parse(req.body);
    const state = await roomService.updateRoom(req.params.code!, patch);
    emitToRoom(req.app, state.room.code, "room:updated", state.room);
    res.json(state);
  }),
);

roomsRouter.delete(
  "/:code/participants/:participantId",
  requireRoomHost,
  asyncHandler(async (req, res) => {
    const code = req.params.code!;
    const participantId = req.params.participantId!;
    await roomService.removeParticipant(code, participantId);
    emitToRoom(req.app, code, "participant:removed", { participantId });
    await disconnectParticipant(req.app, code, participantId); // kick their phone out
    res.status(204).end();
  }),
);
