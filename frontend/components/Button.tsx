"use client";
// Location: frontend/components/Button.tsx
import { motion, type HTMLMotionProps } from "motion/react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90",
  secondary: "border border-line bg-white text-ink hover:bg-wash",
  ghost: "bg-transparent text-muted hover:bg-wash hover:text-ink",
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
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-colors disabled:opacity-40 ${
        styles[variant]
      } ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children as React.ReactNode}
    </motion.button>
  );
}
