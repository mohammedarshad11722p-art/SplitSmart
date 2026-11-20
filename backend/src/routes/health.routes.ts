// Location: backend/src/routes/health.routes.ts
// GET /api/health     → is the process alive? (Render pings this)
// GET /api/health/db  → can we reach Postgres?
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, asyncHandler } from "../middleware/errorHandler";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

healthRouter.get(
  "/db",
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.error("DB health check failed:", (err as Error).message);
      // 503 = "service unavailable": the server is fine, its dependency isn't.
      throw new AppError(503, "DB_UNREACHABLE", "Cannot reach the database. Check DATABASE_URL.");
    }
    res.json({ status: "ok", database: "reachable", latencyMs: Date.now() - started });
  }),
);
