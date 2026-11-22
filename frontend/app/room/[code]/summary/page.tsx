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
import { Icon } from "@/components/Icon";
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
          <Spinner className="h-6 w-6 text-faint" />
        </div>
      </PageShell>
    );
  }
  if (!split.final || !split.payments) {
    return (
      <PageShell>
        <CenteredMessage emoji="⏳" title="Still claiming">
          The host hasn&apos;t finalized yet.{" "}
          <Link href={`/room/${code}`} className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4">
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
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-10 text-center">
        <motion.div
          key={payments.settled ? "settled" : "done"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white ${payments.settled ? "bg-emerald-600" : "bg-ink"}`}
        >
          <Icon name="check" className="h-6 w-6" strokeWidth={2.25} />
        </motion.div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{payments.settled ? "All settled!" : "Split done!"}</h1>
        <p className="mt-1.5 text-muted">
          {room.bill.restaurantName ?? "Your bill"} · {formatINR(split.split.grandTotal)}
        </p>
      </motion.div>

      {/* Guest: the big Pay button */}
      {myPayment && (myPayment.status === "PENDING" || myPayment.status === "PAID") && (
        <div className="mt-8">
          <PayCard code={code} payment={myPayment} payee={payments.payee} />
        </div>
      )}

      {/* Progress: how much the host has collected */}
      {payments.dueCount > 0 && (
        <div className="card mt-4 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">
              {isHost ? "Collected" : `${payments.payee.name} has received`}
            </span>
            <span className="text-xs text-muted tabular-nums">
              {payments.paidCount} of {payments.dueCount} paid
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {formatINR(payments.collected)} <span className="text-sm font-normal text-faint">of {formatINR(totalDue)}</span>
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-wash">
            <motion.div
              className={`h-full rounded-full ${payments.settled ? "bg-emerald-600" : "bg-ink"}`}
              initial={false}
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          {isHost && !payments.settled && (
            <p className="mt-3 text-xs text-muted">Check your bank app, then tap &quot;Mark paid&quot; for each person.</p>
          )}
        </div>
      )}

      <button
        onClick={shareOnWhatsApp}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-medium transition-colors hover:bg-wash"
      >
        <Icon name="chat" className="h-4 w-4 text-[#1faa53]" /> Share on WhatsApp
      </button>

      <p className="eyebrow mt-10 mb-3">Everyone&apos;s share</p>
      <ul className="space-y-2.5">
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
        <p className="mt-5 text-center text-xs text-faint">✓ Shares add up exactly to {formatINR(split.split.grandTotal)}, to the paisa.</p>
      )}

      {isHost && (
        <div className="mt-8">
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
            <p className="text-center text-xs text-faint">The split can&apos;t be reopened once someone has paid.</p>
          )}
        </div>
      )}

      {/* Host: show a friend's payment QR on your own phone (friend scans it) */}
      <Sheet open={!!qrFor} onClose={() => setQrFor(null)} title={`${qrFor ? byId.get(qrFor.participantId)?.name : ""} pays you`}>
        {qrFor && (
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={api.payQrUrl(code, qrFor.participantId, qrFor.amount)} alt="UPI payment QR" width={240} height={240} className="h-56 w-56" />
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatINR(qrFor.amount)}</p>
            <p className="mt-1.5 text-sm text-muted">They scan this with any UPI app. The amount is filled in.</p>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}

function StatusBadge({ payment }: { payment?: PersonPayment }) {
  if (!payment) return null;
  const styles: Record<PersonPayment["status"], [string, string]> = {
    PAID: ["Paid ✓", "bg-emerald-50 text-emerald-700"],
    PENDING: ["Pending", "bg-wash text-muted"],
    HOST: ["Paid the bill", "bg-accent-soft text-accent"],
    NOTHING_DUE: ["Nothing to pay", "bg-wash text-faint"],
  };
  const [label, cls] = styles[payment.status];
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={payment.status}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
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
      className={`rounded-2xl border bg-white p-4 ${isMe ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line"}`}
    >
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        {participant && <Avatar person={participant} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {person.name} {isMe && <span className="text-faint">(you)</span>}
          </span>
          <StatusBadge payment={payment} />
        </span>
        <span className={`text-lg font-semibold tracking-tight tabular-nums ${paid ? "text-emerald-700" : ""}`}>{formatINR(person.total)}</span>
      </button>

      {canMark && (
        <div className="mt-3 flex gap-2">
          {!paid && (
            <button onClick={onShowQr} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-wash">
              <Icon name="qr" className="h-4 w-4 text-muted" />
              Show pay QR
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            onClick={() => onSetPaid(!paid)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
              paid ? "border border-line bg-white text-muted hover:text-ink" : "bg-ink text-white hover:bg-ink/90"
            }`}
          >
            {busy ? "Saving…" : paid ? "Undo paid" : "Mark paid"}
          </motion.button>
        </div>
      )}

      {open && (
        <div className="mt-4 border-t border-dashed border-line pt-3 text-sm">
          <ul className="space-y-1">
            {person.items.map((it) => (
              <li key={it.itemId} className="flex justify-between text-ink/80">
                <span>
                  {it.name}
                  {it.sharedWith > 1 && <span className="text-faint"> ÷{it.sharedWith}</span>}
                </span>
                <span className="tabular-nums">{formatINR(it.share)}</span>
              </li>
            ))}
            {person.items.length === 0 && <li className="text-faint">No items claimed</li>}
          </ul>
          <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5 text-muted">
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
