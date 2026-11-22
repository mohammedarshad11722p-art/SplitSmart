"use client";
// Location: frontend/components/JoinForm.tsx
import { useEffect, useState } from "react";
import { formatINR } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { RoomState } from "@/lib/types";
import { cleanName } from "@/lib/validation";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

export function JoinForm({ room, onJoin }: { room: RoomState; onJoin: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(storage.getLastName()), []);
  const valid = cleanName(name).length > 0;

  return (
    <div className="pt-8">
      <p className="text-sm font-semibold text-orange-600">You&apos;re invited 🎉</p>
      <h1 className="mt-1 text-3xl font-extrabold">{room.bill.restaurantName ?? "Bill split"}</h1>
      <p className="mt-2 text-stone-600">
        {room.room.hostName} paid {formatINR(room.bill.grandTotal)}. Join to pick what you had.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {room.participants.map((p) => (
          <span key={p.id} className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm ring-1 ring-stone-100">
            <Avatar person={p} size="sm" />
            {p.name}
          </span>
        ))}
      </div>

      <form
        className="mt-8 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          try {
            await onJoin(cleanName(name));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Your name</span>
          <input
            autoFocus
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="So friends know it's you"
            className="w-full rounded-2xl bg-white px-4 py-4 text-lg ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-orange-500"
          />
        </label>
        <Button full type="submit" disabled={!valid} loading={busy}>
          Join the split
        </Button>
        <p className="text-center text-xs text-stone-500">No signup. Your name is only used for this bill.</p>
      </form>
    </div>
  );
}
