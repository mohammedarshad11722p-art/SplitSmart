"use client";
// Location: frontend/components/MoneyInput.tsx
// A rupee input that reports paise. Users type "245.5", we get 24550.
import { useEffect, useState } from "react";
import { paiseToInput, parseRupees } from "@/lib/format";

export function MoneyInput({
  value,
  onChange,
  label,
  className = "",
  autoFocus,
}: {
  value: number;
  onChange: (paise: number | null) => void;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(paiseToInput(value));
  // If the value changes from outside (server response), show it.
  useEffect(() => setText(paiseToInput(value)), [value]);

  return (
    <label className={`flex items-center rounded-xl border border-line bg-white px-3 transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/5 ${className}`}>
      <span className="text-faint">₹</span>
      <input
        aria-label={label}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseRupees(e.target.value));
        }}
        className="w-full bg-transparent px-1 py-2.5 text-right tabular-nums outline-none"
      />
    </label>
  );
}
