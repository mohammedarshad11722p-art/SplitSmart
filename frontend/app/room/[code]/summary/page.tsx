"use client";
// Location: frontend/app/room/[code]/summary/page.tsx
// "Who owes what" + paying. Guests get a one-tap UPI Pay button; the host
// sees who has paid, ticks people off, and can share the summary on WhatsApp.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CenteredMessage, PageShell } from "@/components/PageShell";
import { PayCard } from "@/components/PayCard";
import { Sheet } from "@/components/Sheet";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useRoom } from "@/hooks/useRoom";
import { ApiError, api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { summaryShareText, whatsappUrl } from "@/lib/share";
import { storage } from "@/lib/storage";
import type { Participant, PersonPayment, PersonSplit, RoomState, SplitView } from "@/lib/types";

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
  const [busyId, setBusyId] = useState<string | null>(null); // whose "mark paid" is saving
  const [qrFor, setQrFor] = useState<PersonPayment | null>(null); // host showing someone's pay QR

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

  // Stay live: payments tick in on every phone; if the host reopens, everyone goes back.
  useRoom(code, session, {
    onReopened: () => router.push(`/room/${code}`),
    onFinalized: () => load(),
    onPaymentUpdated: (payments) => setSplit((s) => s && { ...s, payments }),
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
  if (!split.final || !split.payments) {
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

  const payments = split.payments;
  const isHost = !!hostToken;
  const byId = new Map(room.participants.map((p) => [p.id, p]));
  const payById = new Map(payments.people.map((p) => [p.participantId, p]));
  const myPayment = meId ? payById.get(meId) : undefined;
  // Me first, then everyone else in join order.
  const people = [...split.split.people].sort((a, b) => Number(b.participantId === meId) - Number(a.participantId === meId));
  const totalDue = payments.collected + payments.outstanding;
  const progress = totalDue === 0 ? 1 : payments.collected / totalDue;

  async function setPaid(participantId: string, paid: boolean) {
    setBusyId(participantId);
    try {
      setSplit(await api.setPaid(code, hostToken!, participantId, paid));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save", "error");
    } finally {
      setBusyId(null);
    }
  }

  function shareOnWhatsApp() {
    const text = summaryShareText({
      restaurant: room!.bill.restaurantName,
      split: split!.split,
      payments,
      url: `${window.location.origin}/room/${code}/summary`,
    });
    window.open(whatsappUrl(text), "_blank", "noopener");
  }

  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-4 text-center">
        <motion.div
          key={payments.settled ? "settled" : "done"}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", delay: 0.1 }}
          className="text-6xl"
        >
          {payments.settled ? "🥳" : "🎉"}
        </motion.div>
        <h1 className="mt-2 text-3xl font-extrabold">{payments.settled ? "All settled!" : "Split done!"}</h1>
        <p className="mt-1 text-stone-600">
          {room.bill.restaurantName ?? "Your bill"} · {formatINR(split.split.grandTotal)}
        </p>
      </motion.div>

      {/* Guest: the big Pay button */}
      {myPayment && (myPayment.status === "PENDING" || myPayment.status === "PAID") && (
        <div className="mt-6">
          <PayCard code={code} payment={myPayment} payee={payments.payee} />
        </div>
      )}

      {/* Progress: how much the host has collected */}
      {payments.dueCount > 0 && (
        <div className="mt-6 rounded-3xl bg-white p-4 ring-1 ring-stone-100">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-stone-600">
              {isHost ? "Collected" : `${payments.payee.name} has received`}
            </span>
            <span className="text-sm text-stone-500">
              {payments.paidCount} of {payments.dueCount} paid
            </span>
          </div>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">
            {formatINR(payments.collected)} <span className="text-base font-semibold text-stone-400">of {formatINR(totalDue)}</span>
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100">
            <motion.div
              className={`h-full rounded-full ${payments.settled ? "bg-emerald-500" : "bg-orange-500"}`}
              initial={false}
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          {isHost && !payments.settled && (
            <p className="mt-2 text-xs text-stone-500">Check your bank app, then tap &quot;Mark paid&quot; for each person.</p>
          )}
        </div>
      )}

      <button
        onClick={shareOnWhatsApp}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3 font-semibold text-white"
      >
        <span aria-hidden>💬</span> Share on WhatsApp
      </button>

      <ul className="mt-6 space-y-3">
        {people.map((p, i) => (
          <PersonCard
            key={p.participantId}
            person={p}
            participant={byId.get(p.participantId)}
            payment={payById.get(p.participantId)}
            isMe={p.participantId === meId}
            isHost={isHost}
            busy={busyId === p.participantId}
            onSetPaid={(paid) => setPaid(p.participantId, paid)}
            onShowQr={() => setQrFor(payById.get(p.participantId) ?? null)}
            index={i}
          />
        ))}
      </ul>

      {split.split.balanced && (
        <p className="mt-4 text-center text-xs text-stone-500">✓ Shares add up exactly to {formatINR(split.split.grandTotal)}, to the paisa.</p>
      )}

      {isHost && (
        <div className="mt-6">
          {payments.paidCount === 0 ? (
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
          ) : (
            <p className="text-center text-xs text-stone-400">The split can&apos;t be reopened once someone has paid.</p>
          )}
        </div>
      )}

      {/* Host: show a friend's payment QR on your own phone (friend scans it) */}
      <Sheet open={!!qrFor} onClose={() => setQrFor(null)} title={`${qrFor ? byId.get(qrFor.participantId)?.name : ""} pays you`}>
        {qrFor && (
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={api.payQrUrl(code, qrFor.participantId, qrFor.amount)} alt="UPI payment QR" width={240} height={240} className="h-60 w-60" />
            <p className="mt-2 text-3xl font-extrabold tabular-nums">{formatINR(qrFor.amount)}</p>
            <p className="mt-1 text-sm text-stone-500">They scan this with any UPI app. The amount is filled in.</p>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}

function StatusBadge({ payment }: { payment?: PersonPayment }) {
  if (!payment) return null;
  const styles: Record<PersonPayment["status"], [string, string]> = {
    PAID: ["Paid ✓", "bg-emerald-100 text-emerald-700"],
    PENDING: ["Pending", "bg-amber-100 text-amber-800"],
    HOST: ["Paid the bill", "bg-orange-100 text-orange-700"],
    NOTHING_DUE: ["Nothing to pay", "bg-stone-100 text-stone-500"],
  };
  const [label, cls] = styles[payment.status];
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={payment.status}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

function PersonCard({
  person,
  participant,
  payment,
  isMe,
  isHost,
  busy,
  onSetPaid,
  onShowQr,
  index,
}: {
  person: PersonSplit;
  participant?: Participant;
  payment?: PersonPayment;
  isMe: boolean;
  isHost: boolean;
  busy: boolean;
  onSetPaid: (paid: boolean) => void;
  onShowQr: () => void;
  index: number;
}) {
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
  const paid = payment?.status === "PAID";
  const canMark = isHost && (payment?.status === "PENDING" || paid);
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className={`rounded-3xl bg-white p-4 ring-1 ${isMe ? "ring-2 ring-orange-400" : "ring-stone-100"} ${paid ? "bg-emerald-50/40" : ""}`}
    >
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        {participant && <Avatar person={participant} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {person.name} {isMe && <span className="text-stone-400">(you)</span>}
          </span>
          <StatusBadge payment={payment} />
        </span>
        <span className={`text-xl font-extrabold tabular-nums ${paid ? "text-emerald-700" : ""}`}>{formatINR(person.total)}</span>
      </button>

      {canMark && (
        <div className="mt-3 flex gap-2">
          {!paid && (
            <button onClick={onShowQr} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700">
              Show pay QR
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            onClick={() => onSetPaid(!paid)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
              paid ? "bg-white text-stone-500 ring-1 ring-stone-200" : "bg-emerald-600 text-white"
            }`}
          >
            {busy ? "Saving…" : paid ? "Undo paid" : "Mark paid"}
          </motion.button>
        </div>
      )}

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
