// Location: backend/src/config/env.ts
// Reads environment variables ONCE, validates them, and exports a typed object.
// If something is missing the server crashes at startup with a clear message,
// instead of failing later in the middle of a demo.
import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().min(1).default("http://localhost:3000"),
    DATABASE_URL: z.url(),
    DIRECT_DATABASE_URL: z.url().optional(),

    // ── Image storage (step 3) ──
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    // ── AI bill parsing (step 3) ──
    // "claude" = real AI. "mock" = fixed sample bill, no API key or internet
    // needed. Great for tests and as a backup if the venue Wi-Fi dies.
    AI_PROVIDER: z.enum(["claude", "mock"]).default("claude"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-opus-5-5"),
  })
  .superRefine((e, ctx) => {
    if (e.AI_PROVIDER === "claude") {
      if (!e.ANTHROPIC_API_KEY) {
        ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "Required when AI_PROVIDER=claude" });
      }
      // Claude reads the bill photo from its Cloudinary URL, so Cloudinary is required.
      for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
        if (!e[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required when AI_PROVIDER=claude" });
      }
    }
    // Catch the classic deploy mistake: forgetting to point FRONTEND_URL at the
    // real site. CORS would block every request and the QR codes would point
    // at localhost, which only "works" on the developer's own laptop.
    if (e.NODE_ENV === "production") {
      for (const origin of e.FRONTEND_URL.split(",").map((o) => o.trim())) {
        if (!/^https:\/\/[^/]+\/?$/.test(origin)) {
          ctx.addIssue({
            code: "custom",
            path: ["FRONTEND_URL"],
            message: `In production this must be your https site, like https://splitsmart.vercel.app (got "${origin}")`,
          });
        }
      }
    }
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

const data = parsed.data;

export const env = {
  ...data,
  // "http://a.com,http://b.com" → ["http://a.com", "http://b.com"]
  corsOrigins: data.FRONTEND_URL.split(",").map((o) => o.trim().replace(/\/$/, "")),
  isProd: data.NODE_ENV === "production",
  cloudinaryConfigured: Boolean(
    data.CLOUDINARY_CLOUD_NAME && data.CLOUDINARY_API_KEY && data.CLOUDINARY_API_SECRET,
  ),
};
