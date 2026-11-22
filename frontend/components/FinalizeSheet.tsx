"use client";
// Location: frontend/components/FinalizeSheet.tsx
// Host reviews the split before locking it. Unclaimed items and bill
// mismatches are shown first, and "Finalize anyway" sends force: true.
import { formatINR } from "@/lib/format";
import type { SplitView } from "@/lib/types";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

export function FinalizeSheet({
  open,
  onClose,
  preview,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  preview: SplitView | null;
  busy: boolean;
  onConfirm: (force: boolean) => void;
}) {
  const unclaimed = preview?.warnings.unclaimedItems ?? [];
  const mismatch = preview?.warnings.itemsMismatch;
  const hasWarnings = unclaimed.length > 0 || !!mismatch;

  return (
    <Sheet open={open} onClose={onClose} title="Ready to finalize?">
      {!preview ? (
        <p className="text-muted">Calculating…</p>
      ) : (
        <div className="space-y-4">
          {unclaimed.length > 0 && (
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                {unclaimed.length} item{unclaimed.length > 1 ? "s" : ""} nobody claimed:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {unclaimed.map((i) => (
                  <li key={i.itemId}>
                    {i.name} ({formatINR(i.total)})
                  </li>
                ))}
              </ul>
              <p className="mt-2">If you finalize now, these are split equally among everyone.</p>
            </div>
          )}
          {mismatch && (
            <div className="rounded-2xl border border-red-200/70 bg-red-50/60 p-4 text-sm text-red-900">
              Items add up to {formatINR(mismatch.itemsTotal)} but the bill&apos;s subtotal is {formatINR(mismatch.subtotal)}. Everyone will still pay
              their share of the real total ({formatINR(preview.split.grandTotal)}).
            </div>
          )}

          <ul className="card divide-y divide-line px-4">
            {preview.split.people.map((p) => (
              <li key={p.participantId} className="flex justify-between py-3">
                <span className="font-medium">{p.name}</span>
                <span className="tabular-nums">{formatINR(p.total)}</span>
              </li>
            ))}
            <li className="flex justify-between py-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(preview.split.grandTotal)}</span>
            </li>
          </ul>

          <p className="text-sm text-muted">After this, items are locked and everyone sees what they owe.</p>
          <Button full loading={busy} onClick={() => onConfirm(hasWarnings)}>
            {hasWarnings ? "Finalize anyway" : "Finalize split"}
          </Button>
          <Button full variant="ghost" onClick={onClose}>
            Keep claiming
          </Button>
        </div>
      )}
    </Sheet>
  );
}
