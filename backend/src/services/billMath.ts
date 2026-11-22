// Location: backend/src/services/billMath.ts
// PURE functions (no database, no network): turn AI output into clean paise
// values and check that the numbers add up. Pure = easy to unit test.
import type { ParsedBill } from "../lib/ai/types";
import { rupeesToPaise } from "../utils/money";

export interface BillTotals {
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  grandTotal: number;
}

export interface ItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface NormalizedBill {
  restaurantName: string | null;
  totals: BillTotals;
  items: ItemInput[];
}

/** AI output (rupees, possibly messy) → clean integer paise. */
export function normalizeParsedBill(parsed: ParsedBill): NormalizedBill {
  const items: ItemInput[] = parsed.items
    .map((it) => {
      const quantity = Math.max(1, Math.round(it.quantity || 1));
      let total = rupeesToPaise(Math.abs(it.total));
      let unitPrice = rupeesToPaise(Math.abs(it.unitPrice));
      // Fill in whichever price the AI couldn't read.
      if (total === 0 && unitPrice > 0) total = unitPrice * quantity;
      if (unitPrice === 0 && total > 0) unitPrice = Math.round(total / quantity);
      return { name: it.name.trim().slice(0, 120), quantity, unitPrice, total };
    })
    .filter((it) => it.name.length > 0 && it.total > 0);

  const itemsSum = sumItems(items);
  const subtotal = rupeesToPaise(Math.abs(parsed.subtotal)) || itemsSum; // missing → use items
  const tax = rupeesToPaise(Math.abs(parsed.tax));
  const serviceCharge = rupeesToPaise(Math.abs(parsed.serviceCharge));
  const discount = rupeesToPaise(Math.abs(parsed.discount));
  const grandTotal =
    rupeesToPaise(Math.abs(parsed.grandTotal)) || subtotal + tax + serviceCharge - discount;

  const restaurantName = parsed.restaurant?.trim() || null;
  return { restaurantName, totals: { subtotal, tax, serviceCharge, discount, grandTotal }, items };
}

export function sumItems(items: Pick<ItemInput, "total">[]): number {
  return items.reduce((sum, it) => sum + it.total, 0);
}

export interface TotalsCheck {
  itemsSum: number;
  /** itemsSum - subtotal. Non-zero = AI misread something or the host must fix an item. */
  itemsDiff: number;
  itemsMatchSubtotal: boolean;
  /** What the parts add up to: subtotal + tax + service - discount. */
  computedGrandTotal: number;
  /** printed grandTotal - computed. Often ±1 rupee because of "round off" lines. */
  grandTotalDiff: number;
  grandTotalMatches: boolean;
}

/** Validates the bill. Used after AI parsing and after every host edit. */
export function checkTotals(totals: BillTotals, items: Pick<ItemInput, "total">[]): TotalsCheck {
  const itemsSum = sumItems(items);
  const itemsDiff = itemsSum - totals.subtotal;
  const computedGrandTotal = totals.subtotal + totals.tax + totals.serviceCharge - totals.discount;
  const grandTotalDiff = totals.grandTotal - computedGrandTotal;
  return {
    itemsSum,
    itemsDiff,
    itemsMatchSubtotal: itemsDiff === 0,
    computedGrandTotal,
    grandTotalDiff,
    grandTotalMatches: grandTotalDiff === 0,
  };
}
