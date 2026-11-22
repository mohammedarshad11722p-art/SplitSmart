// Location: backend/src/lib/ai/index.ts
// Picks the AI provider from env. To add Gemini/OpenAI later: write a class
// that implements BillParser and add one `case` here. Nothing else changes.
import { env } from "../../config/env";
import { ClaudeBillParser } from "./claude";
import { MockBillParser } from "./mock";
import type { BillParser } from "./types";

let parser: BillParser | undefined;

export function getBillParser(): BillParser {
  if (parser) return parser;
  switch (env.AI_PROVIDER) {
    case "claude":
      parser = new ClaudeBillParser(env.ANTHROPIC_API_KEY!, env.AI_MODEL);
      break;
    case "mock":
      parser = new MockBillParser();
      break;
  }
  return parser;
}

export * from "./types";
