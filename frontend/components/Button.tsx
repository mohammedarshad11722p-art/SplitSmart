"use client";
// Location: frontend/components/Button.tsx
import { motion, type HTMLMotionProps } from "motion/react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-orange-500 text-white shadow-md shadow-orange-500/25 hover:bg-orange-600",
  secondary: "bg-white text-stone-900 ring-1 ring-stone-200 hover:bg-stone-50",
  ghost: "bg-transparent text-stone-600 hover:bg-stone-100",
  danger: "bg-red-50 text-red-700 hover:bg-red-100",
};

interface Props extends HTMLMotionProps<"button"> {
  variant?: Variant;
  loading?: boolean;
  full?: boolean;
}

export function Button({ variant = "primary", loading, full, className = "", disabled, children, ...rest }: Props) {
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-colors disabled:opacity-50 ${
        styles[variant]
      } ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children as React.ReactNode}
    </motion.button>
  );
}
