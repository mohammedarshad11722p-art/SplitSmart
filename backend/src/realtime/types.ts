// Location: backend/src/realtime/types.ts
// Typed Socket.io events. Every event name and payload is declared here, so
// `socket.emit("item:claim", ...)` (typo) or a wrong payload is a compile
// error instead of a silent bug. The frontend will reuse this file in step 7.
import type { ParticipantDto, RoomState } from "../services/room.service";

/** Who this socket is. Set once by the auth middleware, read by every handler. */
export interface SocketData {
  participantId: string;
  roomId: string;
  roomCode: string;
  isHost: boolean;
  name: string;
}

export interface AckError {
  code: string;
  message: string;
}

/**
 * Acknowledgements: the client passes a callback as the last argument and the
 * server calls it with the result. It's like an HTTP response for a socket
 * message, so the phone knows whether its tap was saved.
 */
export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: AckError };
export type Ack<T> = (response: AckResponse<T>) => void;

export interface ItemClaims {
  itemId: string;
  /** Participant ids in the order they claimed: the avatar stack order. */
  claimedBy: string[];
}

export interface ClaimSetPayload {
  itemId: string;
  /** The state you WANT (true = claimed), not "toggle". See claimHandlers.ts. */
  claimed: boolean;
  /** Host only: claim on behalf of someone without a phone. */
  participantId?: string;
}

/** Phone → server */
export interface ClientToServerEvents {
  "claim:set": (payload: ClaimSetPayload, ack: Ack<ItemClaims>) => void;
  /** Ask for the full state again (e.g. the tab was in the background for a long time). */
  "room:sync": (ack: Ack<RoomState>) => void;
}

/** Server → phones */
export interface ServerToClientEvents {
  /** Full snapshot. Sent on every (re)connect and after host edits items. */
  "room:state": (state: RoomState) => void;
  /** One item's claimers changed. Small and frequent. */
  "item:claims": (payload: ItemClaims & { changedBy: string }) => void;
  /** Which participants currently have the room open. */
  presence: (payload: { online: string[] }) => void;
  "participant:joined": (participant: ParticipantDto) => void;
  "participant:removed": (payload: { participantId: string }) => void;
  "room:updated": (room: RoomState["room"]) => void;
  /** Sent to a removed participant just before their socket is closed. */
  "session:ended": (payload: { reason: "removed" }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}
