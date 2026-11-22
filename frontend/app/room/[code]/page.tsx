"use client";
// Location: frontend/app/room/[code]/page.tsx
// The live room: join with a name, then tap items. Host also gets the QR,
// "claim for someone", people management and Finalize.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ClaimItemCard } from "@/components/ClaimItemCard";
import { FinalizeSheet } from "@/components/FinalizeSheet";
import { Icon } from "@/components/Icon";
import { JoinForm } from "@/components/JoinForm";
import { CenteredMessage, PageShell } from "@/components/PageShell";
import { ShareRoomCard } from "@/components/ShareRoomCard";
import { Sheet } from "@/components/Sheet";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useRoom } from "@/hooks/useRoom";
import { ApiError, api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { RoomState, SplitView } from "@/lib/types";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const toast = useToast();

  // undefined = still reading localStorage, null = not joined yet
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoomState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [claimFor, setClaimFor] = useState<string | null>(null); // host: who am I tapping for?
  const [showQr, setShowQr] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [split, setSplit] = useState<SplitView | null>(null);

  // 1. Who are we? (tokens saved by earlier visits)
  useEffect(() => {
    setSession(storage.getSession(code));
    setHostToken(storage.getHostTokenForRoom(code));
    api
      .getRoom(code)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this room"));
  }, [code]);

  // 2. Live connection (only once joined)
  const { state, online, status, setClaim } = useRoom(code, session ?? null, {
    onFinalized: () => router.push(`/room/${code}/summary`),
    onError: (message) => toast(message, "error"),
  });

  // 3. Find out which participant we are
  useEffect(() => {
    if (!session) return;
    api
      .me(code, session)
      .then(({ me }) => setMeId(me.id))
      .catch(() => {
        storage.clearSession(code);
        setSession(null);
      });
  }, [code, session]);

  // Server doesn't recognise our token any more → join again
  useEffect(() => {
    if (status === "invalid") {
      storage.clearSession(code);
      setSession(null);
    }
  }, [status, code]);

  const room = state ?? preview;

  // Already finalized? Go to the summary.
  useEffect(() => {
    if (session && state && state.room.status !== "OPEN") router.replace(`/room/${code}/summary`);
  }, [session, state, code, router]);

  // Live "your share so far": re-fetch the split preview whenever claims change.
  const claimsKey = useMemo(
    () => JSON.stringify(state ? [state.participants.length, state.bill.items.map((i) => [i.id, i.claimedBy, i.total])] : null),
    [state],
  );
  useEffect(() => {
    if (claimsKey === "null") return;
    const t = setTimeout(() => api.getSplit(code).then(setSplit).catch(() => {}), 250); // debounce bursts of taps
    return () => clearTimeout(t);
  }, [claimsKey, code]);

  if (loadError) {
    return (
      <PageShell>
        <CenteredMessage emoji="🤔" title="Room not found">
          {loadError}{" "}
          <Link href="/join" className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4">
            Try another code
          </Link>
        </CenteredMessage>
      </PageShell>
    );
  }
  if (!room || session === undefined) {
    return (
      <PageShell>
        <div className="flex justify-center pt-24">
          <Spinner className="h-6 w-6 text-faint" />
        </div>
      </PageShell>
    );
  }
  if (status === "removed") {
    return (
      <PageShell>
        <CenteredMessage emoji="👋" title="You were removed from this split">
          Ask the host if this was a mistake.
        </CenteredMessage>
      </PageShell>
    );
  }

  // ── Not joined yet ──
  if (!session) {
    if (room.room.status !== "OPEN") {
      return (
        <PageShell>
          <CenteredMessage emoji="🔒" title="This split is already finalized">
            <Link href={`/room/${code}/summary`} className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4">
              See who owes what
            </Link>
          </CenteredMessage>
        </PageShell>
      );
    }
    return (
      <PageShell>
        <JoinForm
          room={room}
          onJoin={async (name) => {
            try {
              const result = await api.joinRoom(code, { name });
              storage.setSession(code, result.sessionToken);
              storage.setLastName(name);
              setMeId(result.me.id);
              setSession(result.sessionToken);
            } catch (err) {
              toast(err instanceof ApiError ? err.message : "Couldn't join", "error");
            }
          }}
        />
      </PageShell>
    );
  }

  // ── Joined ──
  const isHost = !!hostToken;
  const people = room.participants;
  const byId = new Map(people.map((p) => [p.id, p]));
  const target = claimFor ?? meId; // whose items the taps change
  const targetPerson = target ? byId.get(target) : undefined;
  const myShare = split?.split.people.find((p) => p.participantId === meId)?.total ?? 0;
  const unclaimedCount = room.bill.items.filter((i) => i.claimedBy.length === 0).length;

  return (
    <PageShell
      bottomBar={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Your share so far</div>
            <motion.div key={myShare} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="mt-0.5 origin-left text-2xl font-semibold tracking-tight tabular-nums">
              {formatINR(myShare)}
            </motion.div>
            <div className="text-xs text-faint">incl. tax &amp; charges</div>
          </div>
          {isHost ? (
            <Button onClick={() => setFinalizeOpen(true)}>Finalize</Button>
          ) : (
            <span className="rounded-full border border-line bg-white px-3 py-2 text-xs font-medium text-muted">
              {unclaimedCount === 0 ? "All items claimed 🎉" : `${unclaimedCount} unclaimed`}
            </span>
          )}
        </div>
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold tracking-tight">{room.bill.restaurantName ?? "Bill split"}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Room <span className="font-mono font-medium text-ink">{code}</span> · {formatINR(room.bill.grandTotal)} total
          </p>
        </div>
        <AnimatePresence>
          {status !== "live" && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
            >
              {status === "connecting" ? "Connecting…" : "Reconnecting…"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* People */}
      <button onClick={() => setPeopleOpen(true)} className="card mt-5 flex w-full items-center gap-3 px-4 py-3 transition-colors hover:border-faint">
        <div className="flex -space-x-2">
          {people.slice(0, 6).map((p) => (
            <motion.span key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <Avatar person={p} size="md" ring online={online.includes(p.id)} />
            </motion.span>
          ))}
        </div>
        <span className="flex-1 text-left text-sm text-muted">
          {people.length} {people.length === 1 ? "person" : "people"}
          {isHost && people.length === 1 && " · invite friends"}
        </span>
        <Icon name="users" className="h-4 w-4 text-faint" />
      </button>

      {isHost && (
        <div className="mt-2.5">
          <button
            onClick={() => setShowQr((s) => !s)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-wash"
          >
            <Icon name="qr" className="h-4 w-4 text-muted" />
            {showQr ? "Hide QR code" : "Show QR code to invite friends"}
          </button>
          <AnimatePresence>
            {showQr && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="pt-2.5">
                  <ShareRoomCard code={code} joinUrl={room.room.joinUrl} restaurant={room.bill.restaurantName} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Host: claim on behalf of someone without a phone */}
      {isHost && people.length > 1 && (
        <div className="mt-7">
          <p className="eyebrow mb-2.5">Tapping for</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {people.map((p) => {
              const active = p.id === target;
              return (
                <button
                  key={p.id}
                  onClick={() => setClaimFor(p.id === meId ? null : p.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-medium transition-colors ${
                    active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/80 hover:border-faint"
                  }`}
                >
                  <Avatar person={p} size="sm" />
                  {p.id === meId ? "Me" : p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Items */}
      <h2 className="eyebrow mt-8 mb-3">
        {targetPerson && target !== meId ? `Tap what ${targetPerson.name} had` : "Tap what you had"}
      </h2>
      <ul className="space-y-2">
        {room.bill.items.map((item) => {
          const claimers = item.claimedBy.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
          const mine = !!target && item.claimedBy.includes(target);
          return (
            <ClaimItemCard
              key={item.id}
              item={item}
              claimers={claimers}
              mine={mine}
              disabled={!target || status !== "live"}
              onToggle={() => target && setClaim(item.id, !mine, target, target !== meId)}
            />
          );
        })}
      </ul>
      <p className="mt-5 text-center text-xs text-faint">Shared a dish? Everyone who had it taps it, and it&apos;s split equally.</p>

      {/* People sheet */}
      <Sheet open={peopleOpen} onClose={() => setPeopleOpen(false)} title="People">
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <Avatar person={p} online={online.includes(p.id)} />
              <span className="flex-1 font-medium">
                {p.name} {p.id === meId && <span className="text-faint">(you)</span>}
                {p.isHost && <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">host</span>}
              </span>
              <span className="text-sm tabular-nums text-muted">
                {formatINR(split?.split.people.find((s) => s.participantId === p.id)?.total ?? 0)}
              </span>
              {isHost && !p.isHost && (
                <button
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm(`Remove ${p.name}? Their claims will be removed too.`)) return;
                    try {
                      await api.removeParticipant(code, hostToken!, p.id);
                    } catch (err) {
                      toast(err instanceof ApiError ? err.message : "Couldn't remove", "error");
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </Sheet>

      {isHost && (
        <FinalizeSheet
          open={finalizeOpen}
          onClose={() => setFinalizeOpen(false)}
          preview={split}
          busy={finalizing}
          onConfirm={async (force) => {
            setFinalizing(true);
            try {
              await api.finalize(code, hostToken!, force);
              router.push(`/room/${code}/summary`);
            } catch (err) {
              toast(err instanceof ApiError ? err.message : "Couldn't finalize", "error");
              setFinalizing(false);
            }
          }}
        />
      )}
    </PageShell>
  );
}
