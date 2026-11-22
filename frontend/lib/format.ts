// Location: frontend/lib/format.ts
// Paise ↔ rupees for DISPLAY and INPUT only. All maths stays in paise.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** 141450 → "₹1,414.50" (Indian digit grouping: ₹1,00,000.00) */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

/** 30000 → "₹300", 30050 → "₹300.5". For tight spaces. */
export function formatINRShort(paise: number): string {
  return inrShort.format(paise / 100);
}

/** What a user typed ("245.5", "₹1,200") → paise, or null if it isn't a valid amount. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** 24550 → "245.50" for pre-filling inputs. */
export function paiseToInput(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}
