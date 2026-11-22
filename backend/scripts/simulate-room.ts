// Location: backend/scripts/simulate-room.ts
// Simulates a real dinner: a host and 3 friends on their own "phones"
// (socket connections) claiming items at the same time.
// It checks the whole backend flow (steps 4-8) in a few seconds.
//
//   1. start the server:   npm run dev
//   2. in another terminal: npm run simulate
//
// Works with AI_PROVIDER=mock or claude: it creates a manual bill, no photo needed.
import { io, type Socket } from "socket.io-client";
import type { RoomState } from "../src/services/room.service";
import type { SplitView } from "../src/services/settle.service";
import type { AckResponse, ClientToServerEvents, ItemClaims, ServerToClientEvents } from "../src/realtime/types";

const API = process.env.API_URL ?? "http://localhost:4000";
type Phone = Socket<ServerToClientEvents, ClientToServerEvents>;

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "  ✅" : "  ❌"} ${label}`);
  if (!condition) failures++;
}

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T; // "No Content": success with no body
  const json = (await res.json()) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "?", `${method} ${path} → ${res.status}: ${json.error?.message}`);
  return json;
}

/** Calls the API and returns the error code it fails with (or "OK"). */
async function errorCodeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (err) {
    return err instanceof ApiError ? err.code : String(err);
  }
}

/** Connects one "phone" and resolves once it has received the first room snapshot. */
function connectPhone(label: string, roomCode: string, sessionToken: string) {
  return new Promise<{ socket: Phone; events: string[]; state: () => RoomState }>((resolve, reject) => {
    const socket: Phone = io(API, { auth: { roomCode, sessionToken }, transports: ["websocket"] });
    const events: string[] = [];
    let latest: RoomState | undefined;
    socket.on("room:state", (s) => {
      events.push("room:state");
      const first = !latest;
      latest = s;
      if (first) resolve({ socket, events, state: () => latest! });
    });
    socket.on("item:claims", (p) => {
      events.push("item:claims");
      if (!latest) return;
      // Apply the small update to our local copy, as the real frontend will.
      latest = {
        ...latest,
        bill: {
          ...latest.bill,
          items: latest.bill.items.map((it) => (it.id === p.itemId ? { ...it, claimedBy: p.claimedBy } : it)),
        },
      };
    });
    socket.on("presence", () => events.push("presence"));
    socket.on("participant:joined", (p) => events.push(`joined:${p.name}`));
    socket.on("participant:removed", () => events.push("participant:removed"));
    socket.on("session:ended", () => events.push("session:ended"));
    socket.on("room:finalized", () => events.push("room:finalized"));
    socket.on("room:reopened", () => events.push("room:reopened"));
    socket.on("payment:updated", (p) => events.push(`payment:${p.payment.status}`));
    socket.on("connect_error", (err) => reject(new Error(`${label}: ${err.message}`)));
  });
}

function claim(phone: Phone, payload: { itemId: string; claimed: boolean; participantId?: string }) {
  return new Promise<AckResponse<ItemClaims>>((resolve) => phone.emit("claim:set", payload, resolve));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n🍽️  Simulating a dinner against ${API}\n`);

  // ── Host sets up a bill and a room ──
  const { hostToken, bill } = await api<{ hostToken: string; bill: { id: string } }>("POST", "/bills/manual", {
    restaurantName: "Simulation Dhaba",
  });
  const H = { "X-Host-Token": hostToken };
  for (const [name, quantity, unitPrice] of [
    ["Chicken Biryani", 1, 32000],
    ["Butter Naan", 4, 6000],
    ["Paneer Tikka", 1, 28000],
    ["Mango Lassi", 3, 9000],
  ] as const) {
    await api("POST", `/bills/${bill.id}/items`, { name, quantity, unitPrice }, H);
  }
  const room = await api<{ sessionToken: string; me: { id: string }; state: RoomState }>(
    "POST", "/rooms", { billId: bill.id, hostName: "Arshad", hostUpiId: "arshad@okaxis" }, H,
  );
  const code = room.state.room.code;
  const [biryani, naan, tikka, lassi] = room.state.bill.items;
  console.log(`Room ${code} created with ${room.state.bill.items.length} items`);

  // ── Phones connect ──
  const host = await connectPhone("host", code, room.sessionToken);
  const guests: Record<string, { id: string; token: string }> = {};
  for (const name of ["Priya", "Rahul", "Zoya"]) {
    const j = await api<{ sessionToken: string; me: { id: string } }>("POST", `/rooms/${code}/join`, { name });
    guests[name] = { id: j.me.id, token: j.sessionToken };
  }
  const priya = await connectPhone("Priya", code, guests.Priya!.token);
  const rahul = await connectPhone("Rahul", code, guests.Rahul!.token);
  await wait(300);

  console.log("\n1. Connecting");
  check("every phone got the full room snapshot", [host, priya, rahul].every((p) => p.state().bill.items.length === 4));
  check("host saw guests join live", host.events.includes("joined:Priya") && host.events.includes("joined:Zoya"));

  console.log("\n2. Everyone taps at the same time");
  await Promise.all([
    claim(host.socket, { itemId: biryani!.id, claimed: true }),
    claim(priya.socket, { itemId: naan!.id, claimed: true }),
    claim(rahul.socket, { itemId: naan!.id, claimed: true }), // shared naan
    claim(priya.socket, { itemId: lassi!.id, claimed: true }),
    claim(rahul.socket, { itemId: lassi!.id, claimed: true }),
    claim(host.socket, { itemId: lassi!.id, claimed: true }), // lassi shared 3 ways
  ]);
  await wait(300);
  const naanOnHost = host.state().bill.items.find((i) => i.id === naan!.id)!.claimedBy;
  check("shared naan shows 2 claimers on the HOST's phone", naanOnHost.length === 2);
  check("all phones agree on every item", JSON.stringify(host.state().bill.items) === JSON.stringify(rahul.state().bill.items));
  check("lassi has 3 claimers", host.state().bill.items.find((i) => i.id === lassi!.id)!.claimedBy.length === 3);

  console.log("\n3. Double tap (idempotency)");
  const a = await claim(priya.socket, { itemId: naan!.id, claimed: true });
  const b = await claim(priya.socket, { itemId: naan!.id, claimed: true });
  check("claiming twice is still one claim", a.ok && b.ok && b.data.claimedBy.filter((id) => id === guests.Priya!.id).length === 1);

  console.log("\n4. Unclaim");
  const un = await claim(rahul.socket, { itemId: naan!.id, claimed: false });
  check("Rahul unclaimed the naan", un.ok && !un.data.claimedBy.includes(guests.Rahul!.id));

  console.log("\n5. Host claims for Zoya (no phone)");
  const forZoya = await claim(host.socket, { itemId: tikka!.id, claimed: true, participantId: guests.Zoya!.id });
  check("host can claim on behalf of Zoya", forZoya.ok && forZoya.data.claimedBy.includes(guests.Zoya!.id));
  const sneaky = await claim(priya.socket, { itemId: biryani!.id, claimed: false, participantId: room.me.id });
  check("a guest can NOT change someone else's claim", !sneaky.ok && sneaky.error.code === "NOT_HOST");

  console.log("\n6. Bad input");
  const bogus = await claim(priya.socket, { itemId: "not-a-real-item", claimed: true });
  check("unknown item is rejected", !bogus.ok && bogus.error.code === "ITEM_NOT_FOUND");
  const junk = await new Promise<AckResponse<ItemClaims>>((r) =>
    (priya.socket as unknown as Socket).emit("claim:set", { itemId: 42 }, r),
  );
  check("malformed payload is rejected", !junk.ok && junk.error.code === "VALIDATION_ERROR");
  const intruder = await connectPhone("intruder", code, "x".repeat(43)).then(() => "connected", (e: Error) => e.message);
  check("a made-up session token can't connect", intruder !== "connected");

  console.log("\n7. Host edits an item while everyone is watching");
  const before = rahul.events.filter((e) => e === "room:state").length;
  await api("PATCH", `/bills/${bill.id}/items/${tikka!.id}`, { unitPrice: 30000 }, H);
  await wait(300);
  check("Rahul's phone got a fresh snapshot", rahul.events.filter((e) => e === "room:state").length === before + 1);
  check("...with the new price", rahul.state().bill.items.find((i) => i.id === tikka!.id)!.unitPrice === 30000);

  console.log("\n8. Reconnect (refresh / lost signal)");
  rahul.socket.disconnect();
  await claim(priya.socket, { itemId: biryani!.id, claimed: true }); // happens while Rahul is away
  const rahulAgain = await connectPhone("Rahul again", code, guests.Rahul!.token);
  const biryaniSeen = rahulAgain.state().bill.items.find((i) => i.id === biryani!.id)!.claimedBy;
  check("Rahul catches up on what he missed", biryaniSeen.includes(guests.Priya!.id));

  console.log("\n9. Host removes Rahul");
  await api("DELETE", `/rooms/${code}/participants/${guests.Rahul!.id}`, undefined, H);
  await wait(300);
  check("Rahul's phone was told and disconnected", rahulAgain.events.includes("session:ended") && !rahulAgain.socket.connected);

  // ── Final table ──
  const claimsNow = await api<RoomState>("GET", `/rooms/${code}`);
  const names = new Map(claimsNow.participants.map((p) => [p.id, p.name]));
  console.log("\nClaims so far:");
  for (const it of claimsNow.bill.items) {
    console.log(`  ${it.name.padEnd(16)} ${it.claimedBy.map((id) => names.get(id)).join(", ") || "(unclaimed)"}`);
  }
  check("Rahul is gone from every item", !claimsNow.bill.items.some((i) => i.claimedBy.includes(guests.Rahul!.id)));

  // ── Step 6: the split ──
  console.log("\n10. Live split preview");
  const preview = await api<SplitView>("GET", `/rooms/${code}/split`);
  const previewSum = preview.split.people.reduce((s, p) => s + p.total, 0);
  check("preview adds up to the bill exactly", preview.split.balanced && previewSum === preview.split.grandTotal);
  check("bill total isn't ₹0 (manual bills calculate their own total)", preview.split.grandTotal > 0);
  check("no warnings while every item is claimed", preview.warnings.unclaimedItems.length === 0);
  for (const p of preview.split.people) console.log(`     ${p.name.padEnd(8)} owes ₹${(p.total / 100).toFixed(2)}`);

  console.log("\n11. Finalize with an unclaimed item");
  await api("POST", `/bills/${bill.id}/items`, { name: "Extra Raita", quantity: 1, unitPrice: 6000 }, H);
  check(
    "finalize is blocked with an UNCLAIMED_ITEMS warning",
    (await errorCodeOf(api("POST", `/rooms/${code}/finalize`, {}, H))) === "UNCLAIMED_ITEMS",
  );
  check("a guest can't finalize", (await errorCodeOf(api("POST", `/rooms/${code}/finalize`, { force: true }))) === "HOST_TOKEN_MISSING");
  const final = await api<SplitView>("POST", `/rooms/${code}/finalize`, { force: true }, H);
  await wait(300);
  check("host confirmed → finalized", final.final && final.status === "FINALIZED");
  check("every phone was told", host.events.includes("room:finalized") && priya.events.includes("room:finalized"));
  const lockedRoom = await api<RoomState>("GET", `/rooms/${code}`);
  const savedSum = lockedRoom.participants.reduce((s, p) => s + (p.amountDue ?? 0), 0);
  check("saved amounts add up to the bill exactly", savedSum === lockedRoom.bill.grandTotal);
  const raitaShares = final.split.people.map((p) => p.items.find((i) => i.name === "Extra Raita")?.share ?? 0);
  check("the unclaimed raita was split among everyone", raitaShares.every((x) => x > 0));
  const late = await claim(priya.socket, { itemId: naan!.id, claimed: false });
  check("claims are locked after finalize", !late.ok && late.error.code === "ROOM_CLOSED");
  check("nobody new can join", (await errorCodeOf(api("POST", `/rooms/${code}/join`, { name: "Latecomer" }))) === "ROOM_CLOSED");
  check("items can't be edited", (await errorCodeOf(api("PATCH", `/bills/${bill.id}/items/${naan!.id}`, { unitPrice: 1 }, H))) === "BILL_LOCKED");
  for (const p of final.split.people) console.log(`     ${p.name.padEnd(8)} owes ₹${(p.total / 100).toFixed(2)}`);

  console.log("\n12. Host reopens to fix a mistake");
  await api("POST", `/rooms/${code}/reopen`, {}, H);
  await wait(300);
  const reopened = await api<RoomState>("GET", `/rooms/${code}`);
  check("room is open again and amounts are cleared", reopened.room.status === "OPEN" && reopened.participants.every((p) => p.amountDue === null));
  check("phones were told", priya.events.includes("room:reopened"));
  const again = await claim(priya.socket, { itemId: naan!.id, claimed: true });
  check("claiming works again", again.ok);

  // ── Step 8: payments ──
  console.log("\n13. UPI payment links");
  const settled0 = await api<SplitView>("POST", `/rooms/${code}/finalize`, { force: true }, H);
  const pay = settled0.payments!;
  const hostPay = pay.people.find((p) => p.status === "HOST")!;
  const owing = pay.people.filter((p) => p.status === "PENDING");
  check("finalize returns payments, everyone starts unpaid", !!pay && pay.paidCount === 0 && owing.length === pay.dueCount);
  check("the host owes nobody (no link)", hostPay.participantId === room.me.id && hostPay.upiLink === null);
  const g0 = owing[0]!;
  check(
    "each guest gets a UPI link to the host for their exact amount",
    owing.every((g) => g.upiLink!.startsWith("upi://pay?pa=arshad@okaxis&pn=Arshad&am=" + (g.amount / 100).toFixed(2) + "&cu=INR")),
  );
  console.log(`     ${g0.upiLink}`);
  const qr = await fetch(`${API}/api/rooms/${code}/participants/${g0.participantId}/pay-qr`);
  check("payment QR is a PNG", qr.status === 200 && qr.headers.get("content-type") === "image/png");
  check(
    "no payment QR for the host",
    (await fetch(`${API}/api/rooms/${code}/participants/${hostPay.participantId}/pay-qr`)).status === 404,
  );

  console.log("\n14. Host marks people paid");
  const payPath = (id: string) => `/rooms/${code}/participants/${id}/payment`;
  check("a guest can't mark payments", (await errorCodeOf(api("PATCH", payPath(g0.participantId), { paid: true }))) === "HOST_TOKEN_MISSING");
  check("the host can't be marked paid", (await errorCodeOf(api("PATCH", payPath(hostPay.participantId), { paid: true }, H))) === "HOST_DOES_NOT_PAY");
  const afterOne = await api<SplitView>("PATCH", payPath(g0.participantId), { paid: true }, H);
  await wait(300);
  check("marked paid, collected amount updated", afterOne.payments!.paidCount === 1 && afterOne.payments!.collected === g0.amount);
  check("every phone was told", priya.events.includes("payment:PAID") && host.events.includes("payment:PAID"));
  check("can't reopen once someone has paid", (await errorCodeOf(api("POST", `/rooms/${code}/reopen`, {}, H))) === "PAYMENTS_STARTED");
  const undone = await api<SplitView>("PATCH", payPath(g0.participantId), { paid: false }, H);
  check("host can undo a mistake", undone.payments!.paidCount === 0);
  let last = undone;
  for (const g of owing) last = await api<SplitView>("PATCH", payPath(g.participantId), { paid: true }, H);
  check("everyone paid → settled, room CLOSED", last.payments!.settled && last.status === "CLOSED" && last.payments!.outstanding === 0);
  check("collected = everything the guests owed", last.payments!.collected === owing.reduce((s, g) => s + g.amount, 0));
  const reopenedOne = await api<SplitView>("PATCH", payPath(g0.participantId), { paid: false }, H);
  check("undo after settling → back to FINALIZED", reopenedOne.status === "FINALIZED" && !reopenedOne.payments!.settled);

  [host, priya, rahulAgain].forEach((p) => p.socket.disconnect());
  console.log(failures === 0 ? "\n🎉 All checks passed\n" : `\n💥 ${failures} check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n💥 Simulation crashed:", err.message);
  console.error("   Is the server running (npm run dev) and the database migrated?");
  process.exit(1);
});
