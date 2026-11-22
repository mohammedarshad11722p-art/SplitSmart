"use client";
// Location: frontend/app/room/[code]/summary/page.tsx
// "Who owes what". Shows every person's final share with a breakdown.
// Step 8 adds the UPI "Pay" button, payment QR and the host's "mark paid".
import { motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CenteredMessage, PageShell } from "@/components/PageShell";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useRoom } from "@/hooks/useRoom";
import { ApiError, api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { Participant, PersonSplit, RoomState, SplitView } from "@/lib/types";

export default function SummaryPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const toast = useToast();

  const [session, setSession] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [split, setSplit] = useState<SplitView | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const load = () =>
    Promise.all([api.getSplit(code), api.getRoom(code)])
      .then(([s, r]) => {
        setSplit(s);
        setRoom(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the split"));

  useEffect(() => {
    const s = storage.getSession(code);
    setSession(s);
    setHostToken(storage.getHostTokenForRoom(code));
    if (s) api.me(code, s).then(({ me }) => setMeId(me.id)).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Stay live: if the host reopens, everyone goes back to claiming.
  useRoom(code, session, {
    onReopened: () => router.push(`/room/${code}`),
    onFinalized: (view) => setSplit(view),
  });

  if (error) {
    return (
      <PageShell>
        <CenteredMessage emoji="🤔" title="Couldn't load this split">
          {error}
        </CenteredMessage>
      </PageShell>
    );
  }
  if (!split || !room) {
    return (
      <PageShell>
        <div className="flex justify-center pt-24">
          <Spinner className="h-8 w-8 text-orange-500" />
        </div>
      </PageShell>
    );
  }
  if (!split.final) {
    return (
      <PageShell>
        <CenteredMessage emoji="⏳" title="Still claiming">
          The host hasn&apos;t finalized yet.{" "}
          <Link href={`/room/${code}`} className="font-semibold text-orange-600 underline">
            Back to the room
          </Link>
        </CenteredMessage>
      </PageShell>
    );
  }

  const isHost = !!hostToken;
  const byId = new Map(room.participants.map((p) => [p.id, p]));
  // Me first, then everyone else in join order.
  const people = [...split.split.people].sort((a, b) => Number(b.participantId === meId) - Number(a.participantId === meId));

  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-4 text-center">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", delay: 0.1 }} className="text-6xl">
          🎉
        </motion.div>
        <h1 className="mt-2 text-3xl font-extrabold">Split done!</h1>
        <p className="mt-1 text-stone-600">
          {room.bill.restaurantName ?? "Your bill"} · {formatINR(split.split.grandTotal)}
        </p>
        <p className="mt-3 inline-block rounded-full bg-orange-50 px-4 py-2 text-sm text-orange-800">
          Pay <b>{room.room.hostName}</b> at <span className="font-mono">{room.room.hostUpiId}</span>
        </p>
      </motion.div>

      <ul className="mt-6 space-y-3">
        {people.map((p, i) => (
          <PersonCard key={p.participantId} person={p} participant={byId.get(p.participantId)} isMe={p.participantId === meId} index={i} />
        ))}
      </ul>

      {split.split.balanced && (
        <p className="mt-4 text-center text-xs text-stone-500">✓ Shares add up exactly to {formatINR(split.split.grandTotal)}, to the paisa.</p>
      )}

      {isHost && (
        <div className="mt-6">
          <Button
            variant="secondary"
            full
            loading={reopening}
            onClick={async () => {
              setReopening(true);
              try {
                await api.reopen(code, hostToken!);
                router.push(`/room/${code}`);
              } catch (err) {
                toast(err instanceof ApiError ? err.message : "Couldn't reopen", "error");
                setReopening(false);
              }
            }}
          >
            ↩︎ Reopen for changes
          </Button>
        </div>
      )}
    </PageShell>
  );
}

function PersonCard({ person, participant, isMe, index }: { person: PersonSplit; participant?: Participant; isMe: boolean; index: number }) {
  // null = user hasn't toggled yet; default to open for "me" (meId loads async)
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? isMe;
  const lines: Array<[string, number]> = [
    ["Food", person.subtotal],
    ["Tax", person.tax],
    ["Service", person.serviceCharge],
    ["Discount", -person.discount],
    ["Round-off", person.roundOff],
  ];
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className={`rounded-3xl bg-white p-4 ring-1 ${isMe ? "ring-2 ring-orange-400" : "ring-stone-100"}`}
    >
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        {participant && <Avatar person={participant} />}
        <span className="flex-1 font-semibold">
          {person.name} {isMe && <span className="text-stone-400">(you)</span>}
          {participant?.isHost && <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">host</span>}
        </span>
        <span className="text-xl font-extrabold tabular-nums">{formatINR(person.total)}</span>
      </button>
      {open && (
        <div className="mt-3 border-t border-dashed border-stone-200 pt-3 text-sm">
          <ul className="space-y-1">
            {person.items.map((it) => (
              <li key={it.itemId} className="flex justify-between text-stone-700">
                <span>
                  {it.name}
                  {it.sharedWith > 1 && <span className="text-stone-400"> ÷{it.sharedWith}</span>}
                </span>
                <span className="tabular-nums">{formatINR(it.share)}</span>
              </li>
            ))}
            {person.items.length === 0 && <li className="text-stone-400">No items claimed</li>}
          </ul>
          <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-stone-500">
            {lines
              .filter(([, v]) => v !== 0)
              .map(([label, v]) => (
                <li key={label} className="flex justify-between">
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {v < 0 ? "−" : ""}
                    {formatINR(Math.abs(v))}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </motion.li>
  );
}
