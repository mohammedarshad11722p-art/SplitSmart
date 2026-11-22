// Location: backend/tests/realtime.test.ts
// Unit tests for the socket helpers that don't need a database.
// The full real-time flow is tested by `npm run simulate` (see STEP-05 doc).
import { ZodError, z } from "zod";
import { AppError } from "../src/middleware/errorHandler";
import { roomChannel } from "../src/realtime/broadcast";
import { toAckError } from "../src/realtime/claimHandlers";

describe("realtime helpers", () => {
  it("names a room's broadcast channel", () => {
    expect(roomChannel("K7P2QX")).toBe("room:K7P2QX");
  });

  it("turns known errors into friendly ack errors", () => {
    expect(toAckError(new AppError(409, "ROOM_CLOSED", "locked"))).toEqual({ code: "ROOM_CLOSED", message: "locked" });
    const zodErr = z.object({ a: z.string() }).safeParse({}).error as ZodError;
    expect(toAckError(zodErr).code).toBe("VALIDATION_ERROR");
  });

  it("hides unexpected errors from phones", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(toAckError(new Error("SQL details here"))).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong" });
    spy.mockRestore();
  });
});
