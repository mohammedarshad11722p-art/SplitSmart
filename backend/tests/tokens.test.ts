// Location: backend/tests/tokens.test.ts  (renamed from hostToken.test.ts)
import { generateToken, hashToken, verifyToken } from "../src/utils/tokens";

describe("tokens", () => {
  it("generates long, unique tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes deterministically (needed to look guests up by hash)", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t); // we never store the token itself
  });

  it("verifies the right token and rejects a wrong one", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken(token + "x", hash)).toBe(false);
    expect(verifyToken(generateToken(), hash)).toBe(false);
  });
});
