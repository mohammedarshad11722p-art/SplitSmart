// Location: backend/tests/env.test.ts
// The production FRONTEND_URL guard. env.ts runs at import time and exits on
// bad config, so each case boots it in a separate Node process.
import { spawnSync } from "node:child_process";
import path from "node:path";

function bootEnv(vars: Record<string, string>) {
  const tsx = path.join(__dirname, "..", "node_modules", ".bin", "tsx");
  return spawnSync(tsx, ["-e", 'require("./src/config/env"); console.log("OK")'], {
    cwd: path.join(__dirname, ".."),
    // DOTENV_CONFIG_PATH points dotenv at a file that doesn't exist, so a
    // developer's real .env can't leak into the test.
    env: {
      PATH: process.env.PATH!,
      DOTENV_CONFIG_PATH: "/nonexistent/.env",
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      AI_PROVIDER: "mock",
      ...vars,
    },
    encoding: "utf8",
  });
}

describe("production env guard", () => {
  it("accepts an https frontend URL in production", () => {
    const r = bootEnv({ NODE_ENV: "production", FRONTEND_URL: "https://splitsmart.vercel.app" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("OK");
  });

  it("accepts several https origins and a trailing slash", () => {
    const r = bootEnv({ NODE_ENV: "production", FRONTEND_URL: "https://splitsmart.vercel.app/, https://splitsmart.in" });
    expect(r.status).toBe(0);
  });

  it.each(["http://localhost:3000", "http://splitsmart.vercel.app", "https://splitsmart.vercel.app/room"])(
    "refuses %s in production",
    (url) => {
      const r = bootEnv({ NODE_ENV: "production", FRONTEND_URL: url });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("FRONTEND_URL");
    },
  );

  it("allows localhost in development", () => {
    const r = bootEnv({ NODE_ENV: "development", FRONTEND_URL: "http://localhost:3000" });
    expect(r.status).toBe(0);
  });
});
