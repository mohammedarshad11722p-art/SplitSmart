// Location: backend/tests/avatar.test.ts
import { AVATAR_COLORS, pickAvatar } from "../src/utils/avatar";

describe("pickAvatar", () => {
  it("gives the first 12 people different colours", () => {
    const colors = new Set(Array.from({ length: AVATAR_COLORS.length }, (_, i) => pickAvatar(i).avatarColor));
    expect(colors.size).toBe(AVATAR_COLORS.length);
  });

  it("wraps around instead of crashing for big groups", () => {
    expect(pickAvatar(12).avatarColor).toBe(pickAvatar(0).avatarColor);
    expect(pickAvatar(29).avatarEmoji).toBeTruthy();
  });
});
