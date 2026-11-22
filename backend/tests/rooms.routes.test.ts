// Location: backend/tests/rooms.routes.test.ts
// Validation tests that fail BEFORE touching the database.
// The full flow is tested against a real database (see STEP-04 doc).
import request from "supertest";
import { createApp } from "../src/app";
import { upiIdSchema } from "../src/routes/rooms.routes";

const app = createApp();

describe("UPI ID validation", () => {
  it.each(["arshad@okaxis", "9876543210@ybl", "first.last-1@paytm", "a_b@oksbi"])("accepts %s", (id) => {
    expect(upiIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(["arshad", "@okaxis", "arshad@", "ar shad@okaxis", "arshad@ok axis", "a@1bank"])("rejects %s", (id) => {
    expect(upiIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("rooms routes: validation", () => {
  it("creating a room needs the host token", async () => {
    const res = await request(app).post("/api/rooms").send({ billId: "x", hostName: "Arshad", hostUpiId: "a@okaxis" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("HOST_TOKEN_MISSING");
  });

  it("impossible room codes are a 404 without a DB lookup", async () => {
    for (const bad of ["abc", "K0P2QX", "TOOLONG1"]) {
      const res = await request(app).get(`/api/rooms/${bad}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ROOM_NOT_FOUND");
    }
  });

  it("joining needs a name", async () => {
    const res = await request(app).post("/api/rooms/K7P2QX/join").send({ name: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("'who am I' needs a session token", async () => {
    const res = await request(app).get("/api/rooms/K7P2QX/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_MISSING");
  });

  it("host actions need the host token", async () => {
    const res = await request(app).patch("/api/rooms/K7P2QX").send({ hostUpiId: "a@okaxis" });
    expect(res.status).toBe(401);
  });
});
