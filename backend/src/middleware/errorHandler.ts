// Location: backend/src/middleware/errorHandler.ts
// Every error in the app ends up here and leaves as consistent JSON:
//   { "error": { "code": "NOT_FOUND", "message": "Room not found" } }
// so the frontend only has to handle one error shape.
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError, z } from "zod";
import { env } from "../config/env";

/** Throw this from routes/services for expected errors (404, 400, 403...). */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Wraps async route handlers so a rejected promise reaches errorHandler. */
export const asyncHandler =
  <T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}

// Express recognises an error handler by its 4 arguments, so keep `_next`.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: z.flattenError(err) },
    });
  }

  // File upload problems (too big, wrong field name...)
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 10 MB)" : err.message;
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Malformed JSON body" } });
  }

  console.error("💥 Unhandled error:", err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      // Never leak stack traces or SQL errors to users in production.
      message: env.isProd ? "Something went wrong" : String((err as Error)?.message ?? err),
    },
  });
}
