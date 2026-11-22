// Location: backend/tests/hostToken.test.ts
import { generateHostToken, hashHostToken, verifyHostToken } from "../src/utils/hostToken";

describe("host token", () => {
  it("generates long, unique tokens", () => {
    const a = generateHostToken();
    const b = generateHostToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("verifies the right token and rejects a wrong one", () => {
    const token = generateHostToken();
    const hash = hashHostToken(token);
    expect(hash).not.toContain(token); // we never store the token itself
    expect(verifyHostToken(token, hash)).toBe(true);
    expect(verifyHostToken(token + "x", hash)).toBe(false);
    expect(verifyHostToken(generateHostToken(), hash)).toBe(false);
  });
});
