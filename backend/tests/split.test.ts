// Location: backend/tests/split.test.ts
// The split calculation is where money bugs hide, so it gets the most tests.
// All amounts are paise: 10000 = ₹100.
import { MOCK_BILL } from "../src/lib/ai/mock";
import { allocateProportionally, calculateSplit, splitEvenly, type SplitItem } from "../src/services/split";
import { normalizeParsedBill } from "../src/services/billMath";

const A = { id: "a", name: "Arshad" };
const P = { id: "p", name: "Priya" };
const R = { id: "r", name: "Rahul" };
const noCharges = (grandTotal: number) => ({ tax: 0, serviceCharge: 0, discount: 0, grandTotal });
const item = (id: string, total: number, claimedBy: string[]): SplitItem => ({ id, name: id, total, claimedBy });
const totals = (r: ReturnType<typeof calculateSplit>) => Object.fromEntries(r.people.map((p) => [p.participantId, p.total]));

describe("splitEvenly", () => {
  it("splits exactly when it divides", () => {
    expect(splitEvenly(900, 3)).toEqual([300, 300, 300]);
  });
  it("gives leftover paise one each, and they always add up", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(101, 3)).toEqual([34, 34, 33]);
  });
  it("rotates who gets the extra paisa", () => {
    expect(splitEvenly(100, 3, 1)).toEqual([33, 34, 33]);
    expect(splitEvenly(100, 3, 2)).toEqual([33, 33, 34]);
    expect(splitEvenly(100, 3, 3)).toEqual([34, 33, 33]); // wraps around
  });
  it("handles amounts smaller than the number of people", () => {
    expect(splitEvenly(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });
});

describe("allocateProportionally", () => {
  it("splits in proportion", () => {
    expect(allocateProportionally(5000, [60000, 40000])).toEqual([3000, 2000]); // 60% / 40%
  });
  it("rounds so the parts add up exactly (largest remainder)", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b)).toBe(100);
  });
  it("gives the leftover to the biggest fraction, not just the first person", () => {
    // exact shares: 10 × 1/6 = 1.67, 10 × 2/6 = 3.33, 10 × 3/6 = 5 → 2, 3, 5
    expect(allocateProportionally(10, [1, 2, 3])).toEqual([2, 3, 5]);
  });
  it("gives zero to zero weights", () => {
    expect(allocateProportionally(999, [0, 500, 0])).toEqual([0, 999, 0]);
  });
  it("handles negative amounts (round-off down)", () => {
    expect(allocateProportionally(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });
  it("falls back to an equal split when all weights are 0", () => {
    expect(allocateProportionally(90, [0, 0, 0])).toEqual([30, 30, 30]);
  });
  it("doesn't overflow on huge bills", () => {
    const parts = allocateProportionally(100_000_000, [99_999_999, 1]); // ₹10 lakh
    expect(parts.reduce((a, b) => a + b)).toBe(100_000_000);
    expect(parts[1]).toBe(1);
  });
});

describe("calculateSplit: food", () => {
  it("everyone pays for what they had alone", () => {
    const r = calculateSplit([item("biryani", 30000, ["a"]), item("dosa", 12000, ["p"])], [A, P], noCharges(42000));
    expect(totals(r)).toEqual({ a: 30000, p: 12000 });
  });

  it("shared items are divided equally", () => {
    const r = calculateSplit([item("pizza", 60000, ["a", "p", "r"])], [A, P, R], noCharges(60000));
    expect(totals(r)).toEqual({ a: 20000, p: 20000, r: 20000 });
    expect(r.people[0]!.items[0]).toMatchObject({ share: 20000, sharedWith: 3 });
  });

  it("₹100 shared by 3 is 33.34 + 33.33 + 33.33, never 99.99", () => {
    const r = calculateSplit([item("naan", 10000, ["a", "p", "r"])], [A, P, R], noCharges(10000));
    const all = Object.values(totals(r));
    expect(all.reduce((a, b) => a + b)).toBe(10000);
    expect(all.sort()).toEqual([3333, 3333, 3334]);
  });

  it("someone who joined but ate nothing owes ₹0", () => {
    const r = calculateSplit([item("tea", 4000, ["a"])], [A, P], { tax: 200, serviceCharge: 400, discount: 0, grandTotal: 4600 });
    expect(totals(r)).toEqual({ a: 4600, p: 0 });
  });

  it("ignores claims from people who are no longer in the room", () => {
    const r = calculateSplit([item("tea", 4000, ["a", "ghost"])], [A], noCharges(4000));
    expect(totals(r)).toEqual({ a: 4000 });
  });

  it("unclaimed items are reported and split equally among everyone", () => {
    const r = calculateSplit([item("tea", 4000, ["a"]), item("water", 3000, [])], [A, P, R], noCharges(7000));
    expect(r.unclaimedItems).toEqual([{ itemId: "water", name: "water", total: 3000 }]);
    expect(totals(r)).toEqual({ a: 5000, p: 1000, r: 1000 });
  });

  it("throws with no participants (should never happen, but fail loudly)", () => {
    expect(() => calculateSplit([], [], noCharges(0))).toThrow();
  });

  it("rejects a negative grand total instead of producing negative amounts", () => {
    expect(() => calculateSplit([item("tea", 1, ["a"])], [A], noCharges(-27))).toThrow();
  });
});

describe("calculateSplit: tax, service, discount, round-off", () => {
  it("tax and service follow each person's share of the food", () => {
    // Arshad ate ₹600 (60%), Priya ₹400 (40%). Tax ₹50, service ₹100.
    const r = calculateSplit(
      [item("a-food", 60000, ["a"]), item("p-food", 40000, ["p"])],
      [A, P],
      { tax: 5000, serviceCharge: 10000, discount: 0, grandTotal: 115000 },
    );
    expect(r.people[0]).toMatchObject({ subtotal: 60000, tax: 3000, serviceCharge: 6000, total: 69000 });
    expect(r.people[1]).toMatchObject({ subtotal: 40000, tax: 2000, serviceCharge: 4000, total: 46000 });
  });

  it("discounts are shared the same way and reduce the total", () => {
    const r = calculateSplit(
      [item("a-food", 75000, ["a"]), item("p-food", 25000, ["p"])],
      [A, P],
      { tax: 0, serviceCharge: 0, discount: 20000, grandTotal: 80000 }, // ₹200 off
    );
    expect(totals(r)).toEqual({ a: 60000, p: 20000 });
    expect(r.people[0]!.discount).toBe(15000);
  });

  it("a ₹1 round-off on the printed total is shared so totals match what the host paid", () => {
    const r = calculateSplit(
      [item("x", 33333, ["a"]), item("y", 33333, ["p"]), item("z", 33334, ["r"])],
      [A, P, R],
      { tax: 4950, serviceCharge: 0, discount: 0, grandTotal: 105000 }, // computed 104950, printed 105000
    );
    expect(r.roundOff).toBe(50);
    expect(r.people.reduce((s, p) => s + p.roundOff, 0)).toBe(50);
    expect(r.balanced).toBe(true);
  });

  it("never makes someone with a tiny share owe a negative amount", () => {
    // 3 paise of food next to a ₹10,000 dish, with a big discount and a round-off down.
    const r = calculateSplit(
      [item("big", 1000000, ["a"]), item("tiny", 3, ["p"])],
      [A, P],
      { tax: 0, serviceCharge: 0, discount: 200000, grandTotal: 799900 },
    );
    expect(r.people[1]!.total).toBeGreaterThanOrEqual(0);
    expect(r.balanced).toBe(true);
  });

  it("round-off can also go down", () => {
    const r = calculateSplit([item("x", 10049, ["a", "p"])], [A, P], noCharges(10000));
    expect(r.roundOff).toBe(-49);
    expect(Object.values(totals(r)).reduce((a, b) => a + b)).toBe(10000);
  });

  it("tax that doesn't divide evenly still adds up exactly", () => {
    const r = calculateSplit([item("thali", 30000, ["a", "p", "r"])], [A, P, R], { tax: 1000, serviceCharge: 0, discount: 0, grandTotal: 31000 });
    expect(r.people.reduce((s, p) => s + p.tax, 0)).toBe(1000);
    expect(r.balanced).toBe(true);
  });
});

describe("calculateSplit: a realistic dinner (the mock bill)", () => {
  const bill = normalizeParsedBill(MOCK_BILL); // Spice Junction: ₹1,230 food, 5% GST, 10% service = ₹1,414.50
  const [paneer, naan, biryani, chaas, jamun] = bill.items.map((it, i) => ({ ...it, id: `i${i}` }));

  const items: SplitItem[] = [
    item("paneer", paneer!.total, ["a", "p"]), // ₹320 shared by 2
    item("naan", naan!.total, ["a", "p", "r"]), // ₹240 shared by 3
    item("biryani", biryani!.total, ["r"]), // ₹280 Rahul alone
    item("chaas", chaas!.total, ["a", "p", "r"]), // ₹210 shared by 3
    item("jamun", jamun!.total, ["p"]), // ₹180 Priya alone
  ];
  const r = calculateSplit(items, [A, P, R], {
    tax: bill.totals.tax,
    serviceCharge: bill.totals.serviceCharge,
    discount: bill.totals.discount,
    grandTotal: bill.totals.grandTotal,
  });

  it("food subtotals are right", () => {
    // Arshad: 160 + 80 + 70 = ₹310 · Priya: 160 + 80 + 70 + 180 = ₹490 · Rahul: 80 + 280 + 70 = ₹430
    expect(r.people.map((p) => p.subtotal)).toEqual([31000, 49000, 43000]);
  });

  it("final totals are right, to the paisa", () => {
    // Arshad 310 × 1.15 = ₹356.50 · Priya 490 × 1.15 = ₹563.50 · Rahul 430 × 1.15 = ₹494.50
    expect(totals(r)).toEqual({ a: 35650, p: 56350, r: 49450 });
    expect(r.balanced).toBe(true);
  });
});

describe("calculateSplit: properties that must ALWAYS hold (1,000 random bills)", () => {
  // Deterministic pseudo-random numbers, so a failure can be reproduced.
  let seed = 42;
  const rand = (max: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };

  it("totals always equal the grand total, nobody pays a negative amount, results are repeatable", () => {
    for (let run = 0; run < 1000; run++) {
      const people = Array.from({ length: 1 + rand(8) }, (_, i) => ({ id: `u${i}`, name: `U${i}` }));
      const items = Array.from({ length: 1 + rand(12) }, (_, i) => {
        const claimers = people.filter(() => rand(3) === 0).map((p) => p.id);
        return item(`it${i}`, 1 + rand(200000), claimers);
      });
      const food = items.reduce((s, it) => s + it.total, 0);
      const tax = rand(Math.ceil(food * 0.18) + 1);
      const serviceCharge = rand(Math.ceil(food * 0.1) + 1);
      const discount = rand(Math.ceil(food * 0.2) + 1);
      const roundOff = rand(201) - 100; // ±₹1
      // A real bill is never negative. (The first version of this test could
      // generate one, e.g. 1 paisa of food with −₹0.28 round-off, and the test
      // failed. The test was wrong, not the split, but now calculateSplit also
      // rejects negative totals explicitly.)
      const grandTotal = Math.max(0, food + tax + serviceCharge - discount + roundOff);
      const charges = { tax, serviceCharge, discount, grandTotal };

      const r = calculateSplit(items, people, charges);

      const sum = r.people.reduce((s, p) => s + p.total, 0);
      if (sum !== grandTotal) throw new Error(`run ${run}: sum ${sum} ≠ grand total ${grandTotal}`);
      expect(r.balanced).toBe(true);
      for (const p of r.people) {
        expect(Number.isInteger(p.total)).toBe(true);
        expect(p.total).toBeGreaterThanOrEqual(0);
        expect(p.subtotal + p.tax + p.serviceCharge - p.discount + p.roundOff).toBe(p.total);
      }
      // Each charge adds up on its own too
      expect(r.people.reduce((s, p) => s + p.tax, 0)).toBe(tax);
      expect(r.people.reduce((s, p) => s + p.discount, 0)).toBe(discount);
      // Same input → same output (no randomness, no order surprises)
      expect(calculateSplit(items, people, charges)).toEqual(r);
    }
  });
});
