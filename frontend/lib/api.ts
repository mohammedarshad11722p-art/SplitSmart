// Location: frontend/lib/api.ts
// Every backend call goes through here, so URLs, headers and error handling
// live in one place. Components never call fetch() directly.
import type { Bill, Participant, RoomState, SplitView } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** The backend always answers errors as { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  hostToken?: string;
  sessionToken?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.hostToken) headers["X-Host-Token"] = opts.hostToken;
  if (opts.sessionToken) headers["X-Session-Token"] = opts.sessionToken;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? "GET",
      headers,
      // FormData sets its own multipart Content-Type (with the boundary), so we don't.
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach SplitSmart. Check your internet (or that the backend is running).");
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? "UNKNOWN", e.message ?? "Something went wrong", e.details);
  }
  return json as T;
}

export interface CreatedBill {
  hostToken: string;
  bill: Bill;
  parseError?: string | null;
}

export interface JoinResult {
  rejoined: boolean;
  sessionToken: string;
  me: Participant;
  state: RoomState;
}

export const api = {
  // ── Bills ──
  uploadBill(file: Blob, filename = "bill.jpg") {
    const form = new FormData();
    form.append("image", file, filename);
    return request<CreatedBill>("/bills", { method: "POST", form });
  },
  createManualBill(restaurantName?: string) {
    return request<CreatedBill>("/bills/manual", { method: "POST", body: { restaurantName } });
  },
  getBill(billId: string) {
    return request<{ bill: Bill }>(`/bills/${billId}`);
  },
  updateBill(billId: string, hostToken: string, patch: Partial<Pick<Bill, "restaurantName" | "subtotal" | "tax" | "serviceCharge" | "discount" | "grandTotal">>) {
    return request<{ bill: Bill }>(`/bills/${billId}`, { method: "PATCH", body: patch, hostToken });
  },
  addItem(billId: string, hostToken: string, item: { name: string; quantity: number; unitPrice: number; total?: number }) {
    return request<{ bill: Bill }>(`/bills/${billId}/items`, { method: "POST", body: item, hostToken });
  },
  updateItem(billId: string, itemId: string, hostToken: string, patch: { name?: string; quantity?: number; unitPrice?: number; total?: number }) {
    return request<{ bill: Bill }>(`/bills/${billId}/items/${itemId}`, { method: "PATCH", body: patch, hostToken });
  },
  deleteItem(billId: string, itemId: string, hostToken: string) {
    return request<{ bill: Bill }>(`/bills/${billId}/items/${itemId}`, { method: "DELETE", hostToken });
  },

  // ── Rooms ──
  createRoom(hostToken: string, input: { billId: string; hostName: string; hostUpiId: string }) {
    return request<{ sessionToken: string; me: Participant; state: RoomState }>("/rooms", { method: "POST", body: input, hostToken });
  },
  getRoom(code: string) {
    return request<RoomState>(`/rooms/${code}`);
  },
  joinRoom(code: string, input: { name: string; sessionToken?: string }) {
    return request<JoinResult>(`/rooms/${code}/join`, { method: "POST", body: input });
  },
  me(code: string, sessionToken: string) {
    return request<{ me: Participant }>(`/rooms/${code}/me`, { sessionToken });
  },
  removeParticipant(code: string, hostToken: string, participantId: string) {
    return request<void>(`/rooms/${code}/participants/${participantId}`, { method: "DELETE", hostToken });
  },
  qrUrl(code: string) {
    return `${API_URL}/api/rooms/${code}/qr`;
  },

  // ── Split ──
  getSplit(code: string) {
    return request<SplitView>(`/rooms/${code}/split`);
  },
  finalize(code: string, hostToken: string, force: boolean) {
    return request<SplitView>(`/rooms/${code}/finalize`, { method: "POST", body: { force }, hostToken });
  },
  reopen(code: string, hostToken: string) {
    return request<SplitView>(`/rooms/${code}/reopen`, { method: "POST", body: {}, hostToken });
  },
};
