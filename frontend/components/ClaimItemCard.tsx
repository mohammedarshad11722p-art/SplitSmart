"use client";
// Location: frontend/components/ClaimItemCard.tsx
// One item in the room. Tap = "I had this". Avatars show who claimed it.
import { motion } from "motion/react";
import { formatINR } from "@/lib/format";
import type { Participant, RoomItem } from "@/lib/types";
import { AvatarStack } from "./Avatar";

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
        whileTap={{ scale: disabled ? 1 : 0.97 }}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={mine}
        className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
          mine ? "bg-orange-50 ring-2 ring-orange-400" : claimers.length === 0 ? "bg-white ring-1 ring-stone-200" : "bg-white ring-1 ring-stone-100"
        }`}
      >
        <motion.span
          animate={{ scale: mine ? 1 : 0.85, backgroundColor: mine ? "#f97316" : "#ffffff" }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${mine ? "ring-orange-500" : "ring-stone-300"}`}
        >
          {mine && <span className="text-xs font-bold text-white">✓</span>}
        </motion.span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{item.name}</span>
          <span className="text-sm text-stone-500">
            {item.quantity > 1 ? `${item.quantity} × ${formatINR(item.unitPrice)}` : formatINR(item.total)}
            {each !== null && <span className="text-orange-600"> · {formatINR(each)} each</span>}
          </span>
        </span>

        <span className="flex flex-col items-end gap-1">
          <span className="font-semibold tabular-nums">{formatINR(item.total)}</span>
          {claimers.length > 0 ? <AvatarStack people={claimers} /> : <span className="text-xs font-medium text-amber-600">Unclaimed</span>}
        </span>
      </motion.button>
    </motion.li>
  );
}
