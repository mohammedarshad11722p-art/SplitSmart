"use client";
// Location: frontend/components/ItemEditor.tsx
// One bill line on the edit screen: tap to edit, save or delete.
import { motion } from "motion/react";
import { useState } from "react";
import { formatINR } from "@/lib/format";
import type { BillItem } from "@/lib/types";
import { Icon } from "./Icon";
import { MoneyInput } from "./MoneyInput";

export interface ItemDraft {
  name: string;
  quantity: number;
  unitPrice: number;
}

export function ItemEditor({
  item,
  onSave,
  onDelete,
}: {
  item: BillItem;
  onSave: (draft: ItemDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice });
  const [priceValid, setPriceValid] = useState(true);

  if (!editing) {
    return (
      <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -40 }}>
        <button
          onClick={() => {
            setDraft({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice });
            setEditing(true);
          }}
          className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-wash"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.name}</span>
            <span className="text-[13px] text-muted">
              {item.quantity} × {formatINR(item.unitPrice)}
            </span>
          </span>
          <span className="font-medium tabular-nums">{formatINR(item.total)}</span>
          <Icon name="pencil" className="h-4 w-4 text-faint transition-colors group-hover:text-ink" />
        </button>
      </motion.li>
    );
  }

  const save = async () => {
    if (!draft.name.trim() || !priceValid || draft.quantity < 1) return;
    setBusy(true);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.li layout className="space-y-3 bg-wash/60 p-4">
      <input
        aria-label="Item name"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className="field py-2.5"
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-white">
          <button aria-label="Less" className="px-3 py-2.5 text-lg" onClick={() => setDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })}>
            −
          </button>
          <span className="w-8 text-center font-semibold tabular-nums">{draft.quantity}</span>
          <button aria-label="More" className="px-3 py-2.5 text-lg" onClick={() => setDraft({ ...draft, quantity: Math.min(999, draft.quantity + 1) })}>
            +
          </button>
        </div>
        <span className="text-faint">×</span>
        <MoneyInput
          label="Price per item"
          value={draft.unitPrice}
          className="flex-1"
          onChange={(p) => {
            setPriceValid(p !== null);
            if (p !== null) setDraft({ ...draft, unitPrice: p });
          }}
        />
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Line total</span>
        <span className="font-medium text-ink tabular-nums">{formatINR(draft.quantity * draft.unitPrice)}</span>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete();
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete
        </button>
        <span className="flex-1" />
        <button className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          disabled={busy || !priceValid || !draft.name.trim()}
          onClick={save}
        >
          Save
        </button>
      </div>
    </motion.li>
  );
}
