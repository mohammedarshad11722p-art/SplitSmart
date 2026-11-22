// Location: frontend/lib/share.ts
// WhatsApp share: wa.me/?text=... opens WhatsApp (app on phones, web on
// laptops) with the message typed in, and the user picks the group.
// We share the summary page link, not upi:// links: WhatsApp doesn't make
// upi:// clickable, but the page has a working Pay button for each person.
import { formatINR } from "./format";
import type { PaymentsView, SplitView } from "./types";

export function summaryShareText(opts: {
  restaurant: string | null;
  split: SplitView["split"];
  payments: PaymentsView;
  url: string;
}): string {
  const { restaurant, split, payments, url } = opts;
  const status = new Map(payments.people.map((p) => [p.participantId, p.status]));
  const lines = split.people
    .filter((p) => status.get(p.participantId) !== "HOST")
    .map((p) => {
      const s = status.get(p.participantId);
      const tag = s === "PAID" ? " ✅" : s === "NOTHING_DUE" ? " (nothing to pay)" : "";
      return `• ${p.name}: ${formatINR(p.total)}${tag}`;
    });
  return [
    `🧾 ${restaurant ?? "Our bill"}: ${formatINR(split.grandTotal)}`,
    "",
    ...lines,
    "",
    `Pay ${payments.payee.name} (UPI: ${payments.payee.upiId}).`,
    `Open this to pay in one tap: ${url}`,
  ].join("\n");
}

export function whatsappUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
