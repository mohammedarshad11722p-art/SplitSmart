// Location: backend/tests/bills.routes.test.ts
// Request validation tests. These fail BEFORE touching the database,
// so they run without one. The full flow is tested manually (see STEP-03 doc).
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("bills routes: validation", () => {
  it("rejects an upload with no file", async () => {
    const res = await request(app).post("/api/bills");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IMAGE_REQUIRED");
  });

  it("rejects a non-image file", async () => {
    const res = await request(app)
      .post("/api/bills")
      .attach("image", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("rejects a file sent under the wrong field name", async () => {
    const res = await request(app)
      .post("/api/bills")
      .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "bill.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UPLOAD_ERROR");
  });

  it("requires the host token to edit items", async () => {
    const res = await request(app).post("/api/bills/some-bill-id/items").send({ name: "Tea", quantity: 1, unitPrice: 2000 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("HOST_TOKEN_MISSING");
  });
});
