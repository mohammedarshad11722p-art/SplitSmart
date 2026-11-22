// Location: backend/src/lib/ai/types.ts
// The contract every AI provider must follow. The rest of the app only knows
// about `BillParser` and `ParsedBill`, never about Claude specifically,
// so swapping providers means writing one new file.
import { z } from "zod";

/**
 * Exactly the JSON shape from the project brief. Amounts are in RUPEES here
 * (what's printed on the bill). We convert to paise right after parsing.
 *
 * This one schema does two jobs:
 *  1. it's sent to the AI as the required output format (structured outputs)
 *  2. it validates whatever comes back before we trust it
 */
export const ParsedBillSchema = z.object({
  restaurant: z.string().nullable().describe("Restaurant name as printed, or null if not visible"),
  items: z
    .array(
      z.object({
        name: z.string().describe("Item name as printed, cleaned up (no item codes)"),
        quantity: z.number().describe("Quantity ordered; 1 if not printed"),
        unitPrice: z.number().describe("Price of ONE unit in rupees"),
        total: z.number().describe("Line total in rupees as printed (usually quantity × unitPrice)"),
      }),
    )
    .describe("Only food/drink line items. Never include tax, service charge, discount or total lines."),
  subtotal: z.number().describe("Sum of items before tax/charges, in rupees, as printed"),
  tax: z.number().describe("Total of ALL taxes (CGST + SGST + VAT + cess...) in rupees; 0 if none"),
  serviceCharge: z.number().describe("Service charge in rupees; 0 if none"),
  discount: z.number().describe("Total discount as a POSITIVE number in rupees; 0 if none"),
  grandTotal: z.number().describe("Final amount payable as printed, in rupees"),
});

export type ParsedBill = z.infer<typeof ParsedBillSchema>;

export interface BillParser {
  /** Human-readable name, stored for debugging ("claude:claude-opus-5-5"). */
  readonly name: string;
  /** Reads a bill photo (public https URL) and returns structured data. */
  parse(imageUrl: string): Promise<ParsedBill>;
}

/** Thrown when the AI can't read the bill (blurry photo, not a bill, API down). */
export class BillParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "BillParseError";
  }
}
