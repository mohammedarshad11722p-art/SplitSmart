// Location: backend/src/lib/prisma.ts
// One shared PrismaClient for the whole app. Each client opens its own pool
// of DB connections, so creating one per request would exhaust Neon quickly.
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// In dev, `tsx watch` re-runs this file on every save. Caching the client on
// globalThis stops us leaking a new connection pool on each reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ["error"] : ["warn", "error"],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;
