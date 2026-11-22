"use client";
// Location: frontend/hooks/useRoom.ts
// Owns the live connection to a room. Components just read `state` and call
// `setClaim()`; this hook deals with sockets, reconnects and optimistic updates.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/api";
import type { ClientToServerEvents, PaymentsView, RoomState, ServerToClientEvents, SplitView } from "@/lib/types";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "invalid" | "removed";

interface Options {
  onFinalized?: (view: SplitView) => void;
  onReopened?: () => void;
  onPaymentUpdated?: (payments: PaymentsView) => void;
  onError?: (message: string) => void;
}

export function useRoom(code: string, sessionToken: string | null, options: Options = {}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<RoomSocket | null>(null);
  // Keep the latest callbacks without reconnecting when they change.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!sessionToken) return;
    const socket: RoomSocket = io(API_URL, {
      auth: { roomCode: code, sessionToken },
      // Start straight on WebSocket; fall back to long-polling if a network blocks it.
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setStatus("live"));
    socket.on("disconnect", () => setStatus((s) => (s === "removed" ? s : "reconnecting")));
    socket.on("connect_error", (err) => {
      const code = (err as Error & { data?: { code?: string } }).data?.code;
      if (code === "SESSION_INVALID") {
        setStatus("invalid");
        socket.disconnect(); // stop retrying with a token the server doesn't know
      } else {
        setStatus("reconnecting");
      }
    });

    // Full snapshot: on every (re)connect and after host edits. Just replace.
    socket.on("room:state", (s) => setState(s));

    // One item changed: patch just that item.
    socket.on("item:claims", ({ itemId, claimedBy }) =>
      setState((s) =>
        s && { ...s, bill: { ...s.bill, items: s.bill.items.map((it) => (it.id === itemId ? { ...it, claimedBy } : it)) } },
      ),
    );

    socket.on("participant:joined", (p) =>
      setState((s) => (s && !s.participants.some((x) => x.id === p.id) ? { ...s, participants: [...s.participants, p] } : s)),
    );

    socket.on("participant:removed", ({ participantId }) =>
      setState(
        (s) =>
          s && {
            ...s,
            participants: s.participants.filter((p) => p.id !== participantId),
            bill: {
              ...s.bill,
              items: s.bill.items.map((it) => ({ ...it, claimedBy: it.claimedBy.filter((id) => id !== participantId) })),
            },
          },
      ),
    );

    socket.on("room:updated", (room) => setState((s) => s && { ...s, room }));
    socket.on("presence", ({ online }) => setOnline(online));
    socket.on("room:finalized", (view) => optionsRef.current.onFinalized?.(view));
    socket.on("room:reopened", () => optionsRef.current.onReopened?.());
    socket.on("session:ended", () => setStatus("removed"));
    socket.on("payment:updated", ({ payment, payments, status }) => {
      setState(
        (s) =>
          s && {
            ...s,
            room: { ...s.room, status },
            participants: s.participants.map((p) =>
              p.id === payment.participantId ? { ...p, paymentStatus: payment.status === "PAID" ? "PAID" : "PENDING" } : p,
            ),
          },
      );
      optionsRef.current.onPaymentUpdated?.(payments);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, sessionToken]);

  /**
   * Optimistic update: show the change immediately, then confirm with the server.
   * If the server says no (or doesn't answer in 5 s), ask for the true state again.
   */
  const setClaim = useCallback((itemId: string, claimed: boolean, forParticipantId: string, onBehalf = false) => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((s) => {
      if (!s) return s;
      return {
        ...s,
        bill: {
          ...s.bill,
          items: s.bill.items.map((it) => {
            if (it.id !== itemId) return it;
            const without = it.claimedBy.filter((id) => id !== forParticipantId);
            return { ...it, claimedBy: claimed ? [...without, forParticipantId] : without };
          }),
        },
      };
    });

    const payload = onBehalf ? { itemId, claimed, participantId: forParticipantId } : { itemId, claimed };
    socket.timeout(5000).emit("claim:set", payload, (err, res) => {
      if (err || !res?.ok) {
        optionsRef.current.onError?.(res && !res.ok ? res.error.message : "Couldn't save that tap, retrying sync…");
        socket.emit("room:sync", (sync) => {
          if (sync.ok) setState(sync.data);
        });
      }
    });
  }, []);

  return { state, setState, online, status, setClaim };
}
