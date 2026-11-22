// Location: frontend/components/PageShell.tsx
// Centres content in a phone-width column on every screen size.
import Link from "next/link";
import type { ReactNode } from "react";

export function PageShell({ children, bottomBar }: { children: ReactNode; bottomBar?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          Split<span className="text-orange-500">Smart</span>
        </Link>
      </header>
      <main className={`flex-1 px-4 ${bottomBar ? "pb-36" : "pb-10"}`}>{children}</main>
      {bottomBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto w-full max-w-lg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}

export function CenteredMessage({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 pt-24 text-center">
      <div className="mb-4 text-5xl">{emoji}</div>
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <div className="text-stone-600">{children}</div>
    </div>
  );
}
