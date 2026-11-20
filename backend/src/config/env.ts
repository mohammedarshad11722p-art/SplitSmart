// Location: backend/src/config/env.ts
// Reads environment variables ONCE, validates them, and exports a typed object.
// If something is missing the server crashes at startup with a clear message,
// instead of failing later in the middle of a demo.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().min(1).default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("   Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // "http://a.com,http://b.com" → ["http://a.com", "http://b.com"]
  corsOrigins: parsed.data.FRONTEND_URL.split(",").map((o) => o.trim().replace(/\/$/, "")),
  isProd: parsed.data.NODE_ENV === "production",
};
