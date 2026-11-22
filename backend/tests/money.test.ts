// Location: backend/tests/money.test.ts
import { formatPaise, paiseToRupees, rupeesToPaise } from "../src/utils/money";

describe("money helpers", () => {
  it("converts rupees to integer paise", () => {
    expect(rupeesToPaise(245.5)).toBe(24550);
    expect(rupeesToPaise(0)).toBe(0);
  });

  it("removes floating point noise", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the reason we use paise at all
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(1.1 * 3).not.toBe(3.3);
    expect(rupeesToPaise(1.1 * 3)).toBe(330);
  });

  it("treats NaN / Infinity as 0 instead of corrupting the bill", () => {
    expect(rupeesToPaise(Number.NaN)).toBe(0);
    expect(rupeesToPaise(Infinity)).toBe(0);
  });

  it("formats paise for display and UPI links", () => {
    expect(formatPaise(24550)).toBe("245.50");
    expect(formatPaise(5)).toBe("0.05");
    expect(paiseToRupees(24550)).toBe(245.5);
  });
});
