// Location: backend/tests/app.test.ts
// Smoke tests for the Express setup. They don't need a database.
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("app setup", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("unknown routes return a JSON 404", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns a 400, not a crash", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });

  it("allows CORS from the frontend origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
