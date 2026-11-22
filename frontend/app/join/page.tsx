"use client";
// Location: frontend/app/join/page.tsx
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { PageShell } from "@/components/PageShell";
import { ROOM_CODE_REGEX } from "@/lib/validation";

export default function JoinByCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.trim().toUpperCase();
  const valid = ROOM_CODE_REGEX.test(clean);

  return (
    <PageShell>
      <h1 className="pt-8 text-3xl font-extrabold">Join a split</h1>
      <p className="mt-2 text-stone-600">Type the 6-character code on the host&apos;s screen.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) router.push(`/room/${clean}`);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="K7P2QX"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          aria-label="Room code"
          className="w-full rounded-2xl bg-white px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] uppercase ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-orange-500"
        />
        {code.length === 6 && !valid && <p className="text-sm text-red-600">Codes never contain 0, O, 1, I or L. Check the host&apos;s screen?</p>}
        <Button full type="submit" disabled={!valid}>
          Join
        </Button>
      </form>
    </PageShell>
  );
}
