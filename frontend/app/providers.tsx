"use client";
// Location: frontend/app/providers.tsx
// Client-side providers. layout.tsx is a Server Component, so anything that
// uses React state/context goes in here.
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";

export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
