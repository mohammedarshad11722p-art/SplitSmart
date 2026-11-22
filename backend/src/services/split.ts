// Location: backend/src/services/split.ts
//
// THE SPLIT CALCULATION. Pure function: plain numbers in, plain numbers out.
// No database, no network, so it can be tested exhaustively (tests/split.test.ts).
//
// All amounts are integer paise. The golden rule:
//     sum of everyone's total === the bill's grand total, to the paisa.
//
// The algorithm:
//  1. Food: each item's total is divided equally among the people who
//     claimed it. Leftover paise (₹1 split 3 ways = 34 + 33 + 33) go to
//     claimers in turn, rotating per item, so nobody always pays the extra paisa.
//  2. Unclaimed items (only if the host forced finalize) are split equally
//     among everyone.
//  3. Charges: tax, service charge and discount are shared in proportion to
//     each person's food subtotal: if you ate 60% of the food, you pay 60% of
//     the tax. So each person's TOTAL is simply their share of the grand total:
//         total = grandTotal × (my food ÷ all food)
//     We round that ONCE per person with the "largest remainder" method, so
//     totals add up exactly and nobody can end up owing a negative amount.
//  4. The breakdown lines (tax, service, discount) are rounded separately for
//     display. A "round-off" line absorbs the last paisa or two, plus the
//     bill's own printed round-off (often ±₹1), so every line still adds up.
//
//  Why round the total once instead of adding up four separately rounded
//  charges? Each rounding can be off by a paisa. Four of them can push a
//  person 3-4 paise away from their exact share (or, for a tiny share, below
//  zero). One rounding keeps everyone within 1 paisa of their exact share.

export interface SplitItem {
  id: string;
  name: string;
  total: number; // paise
  /** Participant ids, in claim order. Empty = unclaimed. */
  claimedBy: string[];
}

export interface SplitParticipant {
  id: string;
  name: string;
}

export interface SplitCharges {
  tax: number;
  serviceCharge: number;
  discount: number; // positive number, subtracted
  grandTotal: number; // what the host actually paid (never negative)
}

export interface PersonItemShare {
  itemId: string;
  name: string;
  share: number; // paise this person pays for this item
  sharedWith: number; // how many people split it (1 = had it alone)
}

export interface PersonSplit {
  participantId: string;
  name: string;
  items: PersonItemShare[];
  subtotal: number; // food
  tax: number;
  serviceCharge: number;
  discount: number; // positive, already subtracted in total
  roundOff: number; // can be negative
  total: number; // what this person owes
}

export interface SplitResult {
  people: PersonSplit[];
  unclaimedItems: Array<{ itemId: string; name: string; total: number }>;
  itemsTotal: number;
  roundOff: number;
  grandTotal: number;
  /** Always true if the code is right. Checked again in tests. */
  balanced: boolean;
}

/**
 * Divides `amount` into `count` integer parts that differ by at most 1.
 * The `offset` decides who gets the leftover paise (rotates per item).
 *   splitEvenly(100, 3, 0) → [34, 33, 33]
 *   splitEvenly(100, 3, 1) → [33, 34, 33]
 */
export function splitEvenly(amount: number, count: number, offset = 0): number[] {
  if (count <= 0) throw new Error("splitEvenly: count must be positive");
  const base = Math.floor(amount / count);
  const leftover = amount - base * count;
  const parts = new Array<number>(count).fill(base);
  for (let k = 0; k < leftover; k++) parts[(offset + k) % count]! += 1;
  return parts;
}

/**
 * Divides `amount` (may be negative) in proportion to `weights`, as integers
 * that add up to exactly `amount`. "Largest remainder" (Hamilton) method:
 *  1. give everyone the rounded-down exact share
 *  2. hand the leftover paise, one each, to those with the biggest fractions
 * BigInt avoids overflow: amount × weight can exceed JavaScript's safe integer
 * range (about 9 × 10^15). A ₹10 lakh bill is 10^8 paise, and 10^8 × 10^8 = 10^16.
 * If every weight is 0 (nobody ordered anything), it falls back to an equal split.
 */
export function allocateProportionally(amount: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) throw new Error("allocateProportionally: no weights");
  if (amount === 0) return new Array<number>(n).fill(0);
  if (amount < 0) return allocateProportionally(-amount, weights).map((x) => (x === 0 ? 0 : -x));

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return splitEvenly(amount, n);

  const A = BigInt(amount);
  const W = BigInt(totalWeight);
  const floors: number[] = [];
  const remainders: Array<{ index: number; rem: bigint }> = [];
  weights.forEach((w, index) => {
    const exact = A * BigInt(w); // exact share × W
    floors.push(Number(exact / W));
    remainders.push({ index, rem: exact % W });
  });

  let leftover = amount - floors.reduce((a, b) => a + b, 0);
  // Biggest fraction first; ties go to the earlier person (stable + deterministic).
  remainders.sort((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1));
  for (const { index } of remainders) {
    if (leftover === 0) break;
    floors[index]! += 1;
    leftover -= 1;
  }
  return floors;
}

export function calculateSplit(
  items: SplitItem[],
  participants: SplitParticipant[],
  charges: SplitCharges,
): SplitResult {
  if (participants.length === 0) throw new Error("calculateSplit: no participants");
  if (charges.grandTotal < 0) throw new Error("calculateSplit: grand total can't be negative");

  const indexOf = new Map(participants.map((p, i) => [p.id, i]));
  const people: PersonSplit[] = participants.map((p) => ({
    participantId: p.id,
    name: p.name,
    items: [],
    subtotal: 0,
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    roundOff: 0,
    total: 0,
  }));

  const unclaimedItems: SplitResult["unclaimedItems"] = [];
  const everyone = participants.map((p) => p.id);

  // 1 + 2. Food
  items.forEach((item, itemIndex) => {
    // Ignore claims by people no longer in the room (e.g. removed).
    const claimers = item.claimedBy.filter((id) => indexOf.has(id));
    if (claimers.length === 0) unclaimedItems.push({ itemId: item.id, name: item.name, total: item.total });
    const payers = claimers.length > 0 ? claimers : everyone;

    const shares = splitEvenly(item.total, payers.length, itemIndex);
    payers.forEach((pid, k) => {
      const person = people[indexOf.get(pid)!]!;
      person.items.push({ itemId: item.id, name: item.name, share: shares[k]!, sharedWith: payers.length });
      person.subtotal += shares[k]!;
    });
  });

  // 3 + 4. Charges, proportional to food subtotal
  const itemsTotal = items.reduce((sum, it) => sum + it.total, 0);
  const roundOff = charges.grandTotal - (itemsTotal + charges.tax + charges.serviceCharge - charges.discount);
  const weights = people.map((p) => p.subtotal);

  // The amount each person owes: one rounding step, always adds up, never negative.
  const totalShares = allocateProportionally(charges.grandTotal, weights);
  // Breakdown lines for the summary screen.
  const taxShares = allocateProportionally(charges.tax, weights);
  const serviceShares = allocateProportionally(charges.serviceCharge, weights);
  const discountShares = allocateProportionally(charges.discount, weights);

  people.forEach((p, i) => {
    p.total = totalShares[i]!;
    p.tax = taxShares[i]!;
    p.serviceCharge = serviceShares[i]!;
    p.discount = discountShares[i]!;
    // Whatever makes this person's lines add up to their total.
    p.roundOff = p.total - (p.subtotal + p.tax + p.serviceCharge - p.discount);
  });

  const sum = people.reduce((s, p) => s + p.total, 0);
  return {
    people,
    unclaimedItems,
    itemsTotal,
    roundOff,
    grandTotal: charges.grandTotal,
    balanced: sum === charges.grandTotal,
  };
}
