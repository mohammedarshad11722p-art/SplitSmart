// Location: backend/src/app.ts
// Builds the Express app but does NOT start listening. index.ts does that.
// Keeping them apart lets tests import the app without opening a port.
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { billsRouter } from "./routes/bills.routes";
import { healthRouter } from "./routes/health.routes";
import { roomsRouter } from "./routes/rooms.routes";

export function createApp() {
  const app = express();

  // Render sits behind a proxy; this makes req.ip the real client IP.
  app.set("trust proxy", 1);

  app.use(helmet()); // sensible security headers
  app.use(
    cors({
      origin: env.corsOrigins, // only our frontend may call the API from a browser
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" })); // bill images use multipart (multer), not JSON

  // ── Routes ──
  app.use("/api/health", healthRouter);
  app.use("/api/bills", billsRouter);
  app.use("/api/rooms", roomsRouter);

  // ── Errors (must be registered last) ──
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
