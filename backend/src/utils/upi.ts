// Location: backend/src/utils/upi.ts
// Builds UPI payment links (the "upi://pay?..." deep links every Indian UPI app
// understands: GPay, PhonePe, Paytm, BHIM...). Tapping one on a phone opens the
// UPI app with the payee, amount and note already filled in. The same string
// inside a QR code is what shop counters use: "scan and pay".
//
// Spec (NPCI "UPI Linking Specification"), the fields we use:
//   pa = payee address (UPI ID)     pn = payee name
//   am = amount in rupees, 2 dp     cu = currency (always INR)
//   tn = transaction note (shows in both people's history)
import { formatPaise } from "./money";

export interface UpiLinkInput {
  payeeUpiId: string;
  payeeName: string;
  amountPaise: number;
  note?: string;
}

// Some UPI apps reject long names/notes, so we keep them short.
const MAX_NAME = 40;
const MAX_NOTE = 50;

/** Strip characters that confuse some UPI apps (& # ? % etc.) and squash spaces. */
function clean(text: string, max: number): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N} .,'()_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function buildUpiLink({ payeeUpiId, payeeName, amountPaise, note }: UpiLinkInput): string {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error(`UPI amount must be a positive whole number of paise, got ${amountPaise}`);
  }
  // Build by hand instead of URLSearchParams: URLSearchParams writes spaces as "+",
  // and several UPI apps show the "+" literally ("Arshad+Khan").
  // The UPI ID stays as-is: "@" is allowed there and some apps fail on "%40".
  const parts = [
    `pa=${payeeUpiId.trim()}`,
    `pn=${encodeURIComponent(clean(payeeName, MAX_NAME) || "SplitSmart")}`,
    `am=${formatPaise(amountPaise)}`,
    `cu=INR`,
  ];
  const tn = note ? clean(note, MAX_NOTE) : "";
  if (tn) parts.push(`tn=${encodeURIComponent(tn)}`);
  return `upi://pay?${parts.join("&")}`;
}

/** "SplitSmart · Dosa Corner" style note, ASCII-only so every app shows it. */
export function paymentNote(restaurantName: string | null): string {
  return restaurantName ? `SplitSmart ${restaurantName}` : "SplitSmart bill";
}
