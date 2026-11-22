"use client";
// Location: frontend/components/ServerWake.tsx
// Render's free plan puts the backend to sleep after ~15 minutes without
// traffic, and the first request then takes up to a minute while it boots.
// Without this banner the app would just look frozen. We ping /api/health as
// soon as the page loads; if it's slow, we tell people what's going on.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type WakeState = "checking" | "slow" | "ok" | "down";

export function ServerWake() {
  const [state, setState] = useState<WakeState>("checking");

  useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => !cancelled && setState((s) => (s === "checking" ? "slow" : s)), 2500);
    const started = Date.now();

    async function ping() {
      // Keep trying for ~90 s: a cold start usually takes 30–60 s.
      while (!cancelled && Date.now() - started < 90_000) {
        try {
          const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
          if (res.ok) {
            if (!cancelled) setState("ok");
            return;
          }
        } catch {
          /* still booting: the request failed outright */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) setState("down");
    }
    ping();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  const show = state === "slow" || state === "down";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          role="status"
          className={`fixed inset-x-3 top-3 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-sm shadow-lg ${
            state === "down" ? "bg-red-600 text-white" : "bg-stone-900 text-white"
          }`}
        >
          {state === "slow" ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400" />
              Waking up the server… free hosting naps when nobody&apos;s using it. Give it up to a minute.
            </span>
          ) : (
            <span>Can&apos;t reach the SplitSmart server right now. Check your internet and refresh.</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
