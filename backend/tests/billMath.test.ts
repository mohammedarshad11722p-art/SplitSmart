// Location: backend/tests/billMath.test.ts
import { MOCK_BILL } from "../src/lib/ai/mock";
import type { ParsedBill } from "../src/lib/ai/types";
import { checkTotals, normalizeParsedBill } from "../src/services/billMath";

const base: ParsedBill = {
  restaurant: "Test Cafe",
  items: [],
  subtotal: 0,
  tax: 0,
  serviceCharge: 0,
  discount: 0,
  grandTotal: 0,
};

describe("normalizeParsedBill", () => {
  it("converts the sample bill to paise", () => {
    const n = normalizeParsedBill(MOCK_BILL);
    expect(n.restaurantName).toBe("Spice Junction");
    expect(n.items).toHaveLength(5);
    expect(n.items[1]).toEqual({ name: "Butter Naan", quantity: 4, unitPrice: 6000, total: 24000 });
    expect(n.totals).toEqual({ subtotal: 123000, tax: 6150, serviceCharge: 12300, discount: 0, grandTotal: 141450 });
  });

  it("fills in a missing unit price or total", () => {
    const n = normalizeParsedBill({
      ...base,
      items: [
        { name: "Lassi", quantity: 2, unitPrice: 0, total: 150 },
        { name: "Dosa", quantity: 3, unitPrice: 90, total: 0 },
      ],
    });
    expect(n.items[0]).toMatchObject({ unitPrice: 7500, total: 15000 });
    expect(n.items[1]).toMatchObject({ unitPrice: 9000, total: 27000 });
  });

  it("drops empty or zero-priced lines and fixes bad quantities", () => {
    const n = normalizeParsedBill({
      ...base,
      items: [
        { name: "  ", quantity: 1, unitPrice: 50, total: 50 },
        { name: "Water (complimentary)", quantity: 1, unitPrice: 0, total: 0 },
        { name: "Tea", quantity: 0, unitPrice: 20, total: 20 },
      ],
    });
    expect(n.items).toEqual([{ name: "Tea", quantity: 1, unitPrice: 2000, total: 2000 }]);
  });

  it("makes negative discounts positive", () => {
    const n = normalizeParsedBill({ ...base, discount: -100, subtotal: 500, grandTotal: 400 });
    expect(n.totals.discount).toBe(10000);
  });

  it("uses the items sum when the subtotal is missing", () => {
    const n = normalizeParsedBill({
      ...base,
      items: [{ name: "Chai", quantity: 2, unitPrice: 15, total: 30 }],
    });
    expect(n.totals.subtotal).toBe(3000);
    expect(n.totals.grandTotal).toBe(3000);
  });

  it("turns an empty restaurant name into null", () => {
    expect(normalizeParsedBill({ ...base, restaurant: "   " }).restaurantName).toBeNull();
  });
});

describe("checkTotals", () => {
  const totals = { subtotal: 100000, tax: 5000, serviceCharge: 10000, discount: 2000, grandTotal: 113000 };

  it("passes when everything adds up", () => {
    const c = checkTotals(totals, [{ total: 60000 }, { total: 40000 }]);
    expect(c.itemsMatchSubtotal).toBe(true);
    expect(c.grandTotalMatches).toBe(true);
    expect(c.computedGrandTotal).toBe(113000);
  });

  it("flags items that don't add up to the subtotal, with the difference", () => {
    // e.g. AI read ₹600 as ₹800
    const c = checkTotals(totals, [{ total: 80000 }, { total: 40000 }]);
    expect(c.itemsMatchSubtotal).toBe(false);
    expect(c.itemsDiff).toBe(20000); // items are ₹200 MORE than the printed subtotal
  });

  it("reports round-off differences on the grand total", () => {
    const c = checkTotals({ ...totals, grandTotal: 113100 }, [{ total: 100000 }]);
    expect(c.grandTotalMatches).toBe(false);
    expect(c.grandTotalDiff).toBe(100); // ₹1 round-off
  });
});
