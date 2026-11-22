// Location: frontend/lib/types.ts
// Shapes of what the backend sends, copied from backend/src (DTOs + socket
// events). We chose two separate apps over a shared package (step 1), so these
// are kept in sync by hand. If you change a backend DTO, change it here too.
// All amounts are integer PAISE.

export interface TotalsCheck {
  itemsSum: number;
  itemsDiff: number;
  itemsMatchSubtotal: boolean;
  computedGrandTotal: number;
  grandTotalDiff: number;
  grandTotalMatches: boolean;
}

export type ParseStatus = "PENDING" | "PARSED" | "FAILED" | "MANUAL";
export type RoomStatus = "OPEN" | "FINALIZED" | "CLOSED";
export type PaymentStatus = "PENDING" | "PAID";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  position: number;
}

export interface Bill {
  id: string;
  imageUrl: string | null;
  restaurantName: string | null;
  currency: string;
  parseStatus: ParseStatus;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  grandTotal: number;
  items: BillItem[];
  validation: TotalsCheck;
  createdAt: string;
}

export interface Participant {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string | null;
  isHost: boolean;
  paymentStatus: PaymentStatus;
  amountDue: number | null;
  joinedAt: string;
}

export interface RoomItem extends BillItem {
  claimedBy: string[];
}

export interface RoomState {
  room: {
    code: string;
    status: RoomStatus;
    hostName: string;
    hostUpiId: string;
    expiresAt: string;
    finalizedAt: string | null;
    joinUrl: string;
  };
  bill: {
    id: string;
    restaurantName: string | null;
    imageUrl: string | null;
    currency: string;
    subtotal: number;
    tax: number;
    serviceCharge: number;
    discount: number;
    grandTotal: number;
    items: RoomItem[];
  };
  participants: Participant[];
}

export interface PersonSplit {
  participantId: string;
  name: string;
  items: Array<{ itemId: string; name: string; share: number; sharedWith: number }>;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  roundOff: number;
  total: number;
}

export interface SplitView {
  status: RoomStatus;
  final: boolean;
  split: {
    people: PersonSplit[];
    unclaimedItems: Array<{ itemId: string; name: string; total: number }>;
    itemsTotal: number;
    roundOff: number;
    grandTotal: number;
    balanced: boolean;
  };
  warnings: {
    unclaimedItems: Array<{ itemId: string; name: string; total: number }>;
    itemsMismatch: { itemsTotal: number; subtotal: number; difference: number } | null;
  };
}

// ── Socket events (same as backend/src/realtime/types.ts) ──

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export interface ItemClaims {
  itemId: string;
  claimedBy: string[];
}

export interface ClientToServerEvents {
  "claim:set": (
    payload: { itemId: string; claimed: boolean; participantId?: string },
    ack: (res: AckResponse<ItemClaims>) => void,
  ) => void;
  "room:sync": (ack: (res: AckResponse<RoomState>) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "item:claims": (payload: ItemClaims & { changedBy: string }) => void;
  presence: (payload: { online: string[] }) => void;
  "participant:joined": (participant: Participant) => void;
  "participant:removed": (payload: { participantId: string }) => void;
  "room:updated": (room: RoomState["room"]) => void;
  "room:finalized": (view: SplitView) => void;
  "room:reopened": () => void;
  "session:ended": (payload: { reason: "removed" }) => void;
}
