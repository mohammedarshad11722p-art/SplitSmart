// Location: frontend/components/PageShell.tsx
// Centres content in a phone-width column on every screen size.
import Link from "next/link";
import type { ReactNode } from "react";

export function PageShell({ children, bottomBar }: { children: ReactNode; bottomBar?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
          splitsmart
        </Link>
      </header>
      <main className={`flex-1 px-5 ${bottomBar ? "pb-36" : "pb-12"}`}>{children}</main>
      {bottomBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/85 backdrop-blur-md">
          <div className="mx-auto w-full max-w-lg px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}

export function CenteredMessage({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 pt-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white text-2xl">{emoji}</div>
      <h1 className="mb-2 text-xl font-semibold tracking-tight">{title}</h1>
      <div className="max-w-xs text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
