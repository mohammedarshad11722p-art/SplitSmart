// Location: backend/tests/upi.test.ts
import { buildUpiLink, paymentNote } from "../src/utils/upi";

describe("buildUpiLink", () => {
  it("builds the standard link", () => {
    expect(buildUpiLink({ payeeUpiId: "arshad@okaxis", payeeName: "Arshad", amountPaise: 31500 })).toBe(
      "upi://pay?pa=arshad@okaxis&pn=Arshad&am=315.00&cu=INR",
    );
  });

  it("always sends 2 decimal places", () => {
    expect(buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "A", amountPaise: 5 })).toContain("am=0.05&");
    expect(buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "A", amountPaise: 56350 })).toContain("am=563.50&");
    expect(buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "A", amountPaise: 123456789 })).toContain("am=1234567.89&");
  });

  it("encodes spaces as %20, never +", () => {
    const link = buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "Arshad Khan", amountPaise: 100, note: "SplitSmart Dosa Corner" });
    expect(link).toContain("pn=Arshad%20Khan");
    expect(link).toContain("tn=SplitSmart%20Dosa%20Corner");
    expect(link).not.toContain("+");
  });

  it("keeps the @ in the UPI ID unencoded", () => {
    expect(buildUpiLink({ payeeUpiId: " 9876543210@ybl ", payeeName: "A", amountPaise: 100 })).toContain("pa=9876543210@ybl&");
  });

  it("strips characters that would break the link (& ? # %)", () => {
    const link = buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "Tom & Jerry?", amountPaise: 100, note: "50% off #party" });
    const query = link.split("?")[1]!;
    expect(query.split("&")).toHaveLength(5); // pa, pn, am, cu, tn: no extra "&"
    expect(link).toContain("pn=Tom%20Jerry");
    expect(link).toContain("tn=50%20off%20party");
  });

  it("keeps non-English names", () => {
    expect(buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "अर्शद", amountPaise: 100 })).toContain(
      `pn=${encodeURIComponent("अर्शद")}`,
    );
  });

  it("shortens long names and notes", () => {
    const link = buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "x".repeat(100), amountPaise: 100, note: "y".repeat(100) });
    expect(link).toContain(`pn=${"x".repeat(40)}&`);
    expect(link).toMatch(new RegExp(`tn=${"y".repeat(50)}$`));
  });

  it("falls back to a name if nothing is left after cleaning", () => {
    expect(buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "&&&", amountPaise: 100 })).toContain("pn=SplitSmart");
  });

  it.each([0, -100, 10.5, NaN])("rejects amount %p", (amountPaise) => {
    expect(() => buildUpiLink({ payeeUpiId: "a@ybl", payeeName: "A", amountPaise })).toThrow();
  });
});

describe("paymentNote", () => {
  it("names the restaurant when known", () => {
    expect(paymentNote("Dosa Corner")).toBe("SplitSmart Dosa Corner");
    expect(paymentNote(null)).toBe("SplitSmart bill");
  });
});
