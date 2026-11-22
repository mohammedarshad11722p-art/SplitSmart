"use client";
// Location: frontend/components/ClaimItemCard.tsx
// One item in the room. Tap = "I had this". Avatars show who claimed it.
import { motion } from "motion/react";
import { formatINR } from "@/lib/format";
import type { Participant, RoomItem } from "@/lib/types";
import { AvatarStack } from "./Avatar";
import { Icon } from "./Icon";

export function ClaimItemCard({
  item,
  claimers,
  mine,
  disabled,
  onToggle,
}: {
  item: RoomItem;
  claimers: Participant[];
  mine: boolean; // claimed by whoever we're tapping for
  disabled?: boolean;
  onToggle: () => void;
}) {
  const each = claimers.length > 1 ? Math.round(item.total / claimers.length) : null;

  return (
    <motion.li layout>
      <motion.button
        whileTap={{ scale: disabled ? 1 : 0.985 }}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={mine}
        className={`flex w-full items-center gap-3.5 rounded-2xl border bg-white px-4 py-3.5 text-left transition-colors ${
          mine ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-faint"
        }`}
      >
        <motion.span
          animate={{ backgroundColor: mine ? "#1c1b19" : "#ffffff", borderColor: mine ? "#1c1b19" : "#d6d2cc" }}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
        >
          {mine && <Icon name="check" className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />}
        </motion.span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="text-[13px] text-muted">
            {item.quantity > 1 ? `${item.quantity} × ${formatINR(item.unitPrice)}` : formatINR(item.total)}
            {each !== null && <span className="text-accent"> · {formatINR(each)} each</span>}
          </span>
        </span>

        <span className="flex flex-col items-end gap-1">
          <span className="font-medium tabular-nums">{formatINR(item.total)}</span>
          {claimers.length > 0 ? <AvatarStack people={claimers} /> : <span className="text-[11px] font-medium text-faint">Unclaimed</span>}
        </span>
      </motion.button>
    </motion.li>
  );
}
