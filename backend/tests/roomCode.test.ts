// Location: backend/tests/roomCode.test.ts
import { ROOM_CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from "../src/utils/roomCode";

describe("room codes", () => {
  it("are 6 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
  });

  it("never contain look-alike characters", () => {
    for (const c of ["0", "O", "1", "I", "L"]) expect(ROOM_CODE_ALPHABET).not.toContain(c);
  });

  it("are random enough not to repeat in a small batch", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(995);
  });

  it("normalizes user input", () => {
    expect(normalizeRoomCode(" k7p2qx ")).toBe("K7P2QX");
    expect(normalizeRoomCode("K7P2Q")).toBeNull(); // too short
    expect(normalizeRoomCode("K7P2QXX")).toBeNull(); // too long
    expect(normalizeRoomCode("K0P2QX")).toBeNull(); // 0 is not in the alphabet
    expect(normalizeRoomCode("K7P-QX")).toBeNull();
  });
});
