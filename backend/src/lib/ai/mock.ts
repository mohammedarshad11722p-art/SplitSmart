// Location: backend/src/lib/ai/mock.ts
// A fake parser that returns a fixed bill instantly. Used by tests, and as a
// demo backup: set AI_PROVIDER=mock and the app works with no internet or key.
import type { BillParser, ParsedBill } from "./types";

export const MOCK_BILL: ParsedBill = {
  restaurant: "Spice Junction",
  items: [
    { name: "Paneer Butter Masala", quantity: 1, unitPrice: 320, total: 320 },
    { name: "Butter Naan", quantity: 4, unitPrice: 60, total: 240 },
    { name: "Veg Biryani", quantity: 1, unitPrice: 280, total: 280 },
    { name: "Masala Chaas", quantity: 3, unitPrice: 70, total: 210 },
    { name: "Gulab Jamun", quantity: 2, unitPrice: 90, total: 180 },
  ],
  subtotal: 1230,
  tax: 61.5, // 5% GST
  serviceCharge: 123, // 10%
  discount: 0,
  grandTotal: 1414.5,
};

export class MockBillParser implements BillParser {
  readonly name = "mock";
  async parse(_imageUrl: string): Promise<ParsedBill> {
    // Return a deep copy so callers can't mutate the shared sample.
    return structuredClone(MOCK_BILL);
  }
}
