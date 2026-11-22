// Location: backend/src/lib/ai/claude.ts
// Bill parsing with Claude's vision + structured outputs.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BillParseError, ParsedBillSchema, type BillParser, type ParsedBill } from "./types";

const SYSTEM_PROMPT = `You read photos of restaurant bills, mostly from India, and extract them as data.

Rules:
- Amounts are in rupees exactly as printed. Do not convert currencies.
- items: only food and drink lines. Tax, service charge, discount, round-off and total lines are NOT items.
- If a line shows only a total, set quantity to 1 and unitPrice to that total. If it shows quantity and total but no unit price, unitPrice = total / quantity.
- tax: add up every tax line (CGST, SGST, IGST, VAT, cess). 0 if there are none.
- discount: a positive number, even if printed as negative. 0 if there is none.
- Read numbers carefully: a misread digit makes the split wrong. If a value is unreadable, use your best estimate from the other numbers on the bill.
- If the image is not a restaurant bill, return an empty items list and zeros.`;

export class ClaudeBillParser implements BillParser {
  readonly name: string;
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    this.name = `claude:${model}`;
  }

  async parse(imageUrl: string): Promise<ParsedBill> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        // Effort controls how hard the model thinks. "medium" is plenty for
        // reading a receipt; raise to "high" if you see misread numbers.
        output_config: {
          effort: "medium",
          // Structured outputs: the API guarantees the reply matches our schema,
          // so no "please return JSON" prompt tricks and no broken JSON.
          format: betaZodOutputFormat(ParsedBillSchema),
        },
        // If Claude's safety filter ever declines (very unlikely for a bill),
        // the API automatically retries on a suitable fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: imageUrl } },
              { type: "text", text: "Extract this bill." },
            ],
          },
        ],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new BillParseError("AI is busy right now, please retry in a moment", err);
      }
      if (err instanceof Anthropic.APIError) {
        throw new BillParseError(`AI request failed (${err.status ?? "network"})`, err);
      }
      throw new BillParseError("AI request failed", err);
    }

    if (response.stop_reason === "refusal") {
      throw new BillParseError("AI declined to read this image");
    }
    if (response.stop_reason === "max_tokens") {
      throw new BillParseError("Bill too long for one AI response");
    }
    if (!response.parsed_output) {
      throw new BillParseError("AI returned data in an unexpected format");
    }
    // Belt and braces: validate again with our own schema.
    return ParsedBillSchema.parse(response.parsed_output);
  }
}
