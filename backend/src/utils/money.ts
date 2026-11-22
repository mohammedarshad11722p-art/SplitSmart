// Location: backend/src/utils/money.ts
// All money inside SplitSmart is an integer number of paise (₹1 = 100 paise).
// These helpers are the ONLY place rupees and paise get converted.

/** 245.5 → 24550. Rounds to the nearest paisa to kill float noise (0.1+0.2). */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** 24550 → 245.5 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** 24550 → "245.50", the format UPI links and receipts use. */
export function formatPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}
