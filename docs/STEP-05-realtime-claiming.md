# Step 5: Real-time item claiming (Socket.io)

## What this step adds
Every phone in a room opens a live connection. When someone taps an item, every other phone sees their avatar on it almost instantly. Several people can share one item. The host can claim for a friend without a phone, and can edit items or remove someone while everyone is watching. A phone that drops off and comes back catches up automatically.

You'll test it with a **simulation script** that plays a host and 3 friends on separate "phones", because the real screens arrive in step 7.

**This step needs a real database**, so start with Neon below.

---

## Part A: Set up Neon (about 5 minutes, one time)

1. Go to **neon.tech** → **Sign up** (the "Continue with GitHub" option is quickest).
2. **Create project**:
   - Project name: `splitsmart`
   - Postgres version: leave the default
   - Region: **AWS Asia Pacific (Singapore)**. It's closest to India, and we'll put the Render backend in Singapore too, so database calls stay fast.
3. On the project dashboard, click **Connect**. A box shows a connection string.
   - Make sure **Connection pooling** is **ON**. Copy the string (its host contains `-pooler`). This is your `DATABASE_URL`.
   - Turn **Connection pooling OFF** and copy the string again (no `-pooler`). This is your `DIRECT_DATABASE_URL`.
4. Open `backend/.env` and paste them in:
   ```
   DATABASE_URL=postgresql://...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   DIRECT_DATABASE_URL=postgresql://....ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Keep the quotes off and keep `?sslmode=require` at the end. `.env` is git-ignored, so the password never goes to GitHub.
5. Create the tables:
   ```bash
   cd backend
   npx prisma migrate dev
   ```
   You should see two migrations applied, `20261120000000_init` and `20261122090000_hash_session_tokens`, then **"Your database is now in sync with your schema."**
6. Check it: `npm run dev`, then `curl http://localhost:4000/api/health/db` → `"database":"reachable"`. Run `npm run db:studio` to browse the (empty) tables.

**Why the new `_init` migration?** Step 4's rename migration expects the tables to already exist. Your step 2 migration never ran (there was no database yet), so this zip includes the step 1 schema as a proper first migration. Migrations run in name order, which is why the date prefix matters. If you have any other `*_init` folder in `backend/prisma/migrations` from earlier, delete it. It was never applied anywhere.

---

## Part B: What changed

### Files (all inside `backend/`)

| File | New / changed | What it does |
|---|---|---|
| `package.json` | changed | `socket.io-client` (dev only, for the simulation) + `npm run simulate` |
| `tsconfig.json` | changed | includes the new `scripts/` folder |
| `prisma/migrations/20261120000000_init/` | new | step 1 schema as the first migration |
| `prisma/migrations/migration_lock.toml` | new | Prisma's marker that these migrations are for PostgreSQL |
| `src/realtime/types.ts` | new | every socket event name + payload, typed |
| `src/realtime/io.ts` | new | `AppServer` / `AppSocket` typed aliases |
| `src/realtime/auth.ts` | new | socket middleware: checks room code + session token on connect |
| `src/realtime/claimHandlers.ts` | new | `claim:set` and `room:sync` handlers, acks, rate limit |
| `src/realtime/broadcast.ts` | new | `roomChannel`, typed `emitToRoom`, presence, room refresh, kick |
| `src/services/claim.service.ts` | new | the one function that changes claims |
| `src/utils/keyedLock.ts` | new | one change at a time per room |
| `src/socket.ts` | rewritten | wires up auth, handlers, snapshot on connect, presence |
| `src/routes/rooms.routes.ts` | changed | typed emits; removing someone also disconnects their phone |
| `src/routes/bills.routes.ts` | changed | host edits refresh every phone in the room |
| `scripts/simulate-room.ts` | new | the 4-phone dinner simulation |
| `tests/keyedLock.test.ts`, `tests/realtime.test.ts` | new | 7 new tests (52 total) |

### The events

**Phone → server** (each with an acknowledgement callback):

| Event | Payload | Answer |
|---|---|---|
| `claim:set` | `{ itemId, claimed: true/false, participantId? }` | `{ ok: true, data: { itemId, claimedBy } }` or `{ ok: false, error: { code, message } }` |
| `room:sync` | none | `{ ok: true, data: <full room state> }` |

**Server → phones:**

| Event | When |
|---|---|
| `room:state` | on every (re)connect, and after the host edits the bill |
| `item:claims` | someone claimed or unclaimed: `{ itemId, claimedBy, changedBy }` |
| `presence` | someone opened or closed the room: `{ online: [participantIds] }` |
| `participant:joined` / `participant:removed` | people arriving and leaving |
| `room:updated` | host changed their name or UPI ID |
| `session:ended` | sent to a removed person just before disconnecting them |

A phone connects like this (the frontend will do it in step 7):
```ts
const socket = io(API_URL, { auth: { roomCode: "K7P2QX", sessionToken } });
socket.emit("claim:set", { itemId, claimed: true }, (res) => { /* saved or error */ });
```

## Why it's built this way

- **Authentication happens once, at connect time.** `io.use(socketAuth)` checks the room code and session token before the connection is accepted, then stores "who you are" in `socket.data`. Every later event trusts `socket.data`, never an id the phone sends, so a guest can't pretend to be someone else by editing a payload.
- **One Socket.io "room" per SplitSmart room.** `socket.join("room:K7P2QX")` puts the phone on that room's channel, and `io.to("room:K7P2QX").emit(...)` reaches exactly the people at that table.
- **`claim:set` with the desired state, not "toggle".** If a phone sends "toggle" twice (a double tap, or a retry after a network blip), the item flips twice and ends up wrong. "Set claimed = true" sent twice gives the same result. This property is called **idempotency**, and it's what makes real-time apps feel reliable on flaky mobile networks. In the database it's `createMany(..., skipDuplicates: true)`, which runs as SQL `ON CONFLICT DO NOTHING`, plus `deleteMany` for unclaiming, which doesn't fail when there's nothing to delete.
- **Acknowledgements.** Every `claim:set` gets an answer: saved, or why not ("finalized", "not your item"). The frontend can show the tap optimistically and undo it if the answer is an error.
- **Two kinds of updates.** `item:claims` is tiny and frequent (one item's list). `room:state` is the full snapshot, sent on connect and after big changes like a price edit. Small updates keep things fast, and snapshots stop phones drifting out of sync.
- **A full snapshot on every connect = free reconnect handling.** A phone that refreshes or loses signal gets the current truth when it comes back, so we don't have to replay what it missed. The simulation tests exactly this (part 8).
- **One change at a time per room (`KeyedLock`).** Two taps on the same item at the same moment are processed in order, so the last broadcast always shows the latest list. Different rooms never wait for each other. The lock lives in memory, which is fine for our single Render server. Several servers would need Redis.
- **Validate socket payloads with zod.** TypeScript types disappear at runtime, and anyone can open a socket and send `{ itemId: 42 }`. The simulation sends junk on purpose to check this (part 6).
- **Typed events.** `ClientToServerEvents` / `ServerToClientEvents` make `socket.emit("item:claim")` (typo) a compile error. The frontend will import the same types.
- **The host can claim for others.** Not everyone has a charged phone. Only the host may pass `participantId`; a guest trying it gets `NOT_HOST`.
- **Removing someone kicks their phone.** They get `session:ended`, their socket is closed, and their claims are deleted (database cascade), so everyone's screen updates.
- **Per-socket rate limit.** 30 events per 10 seconds is faster than any human taps, but it stops a script from flooding the room.

## How to test

```bash
cd backend
npm install          # adds socket.io-client
npm test             # 52 passed (no database needed)
```

**The main test** (needs the Neon setup from part A). In terminal 1:
```bash
npm run dev
```
In terminal 2:
```bash
npm run simulate
```
It creates a bill and a room, connects a host and friends as separate phones, and runs 9 scenarios: simultaneous taps, shared items, double taps, unclaiming, the host claiming for someone, rejected bad input, a host edit going live, a reconnect catching up, and removing someone. You should end with:
```
Final claims:
  Chicken Biryani  Arshad, Priya
  Butter Naan      Priya
  Paneer Tikka     Zoya
  Mango Lassi      Arshad, Priya
  ✅ Rahul is gone from every item

🎉 All checks passed
```
Watch terminal 1 while it runs: you'll see `🔌 Priya connected to ...` and `left` lines as the phones come and go. Open `npm run db:studio` afterwards and look at the `Claim` table.

### What I verified on my side
- Type-check passes, 52/52 tests pass.
- On a brand-new empty Postgres (like your new Neon database), `npx prisma migrate dev` applied both migrations and Prisma reported no difference between the database and the schema.
- `npm run simulate` passed every check, 6 runs in a row.
- **Not verified:** your actual Neon project, since I don't have its URL. Part A step 6 checks that.

---

## Part C: Copy the files in and push (you run these)

The zip contains `backend/` and `docs/` at the top level, the same layout as your repo.

**Option 1, Terminal (recommended):** leave the zip in Downloads and unzip it straight into your repo:
```bash
cd ~/SplitSmart
git switch main
git pull
git switch -c step-05-realtime-claiming
unzip -o ~/Downloads/splitsmart-step05.zip -d ~/SplitSmart
```
`-o` overwrites existing files without asking. Nothing extra lands in your repo.

**Option 2, Finder:** if you double-clicked the zip *inside* `~/SplitSmart`, you now have a `splitsmart-step05/` folder there. Copy its contents over, then delete the folder and the zip:
```bash
cd ~/SplitSmart
git switch main
git pull
git switch -c step-05-realtime-claiming
cp -R splitsmart-step05/backend splitsmart-step05/docs .
rm -rf splitsmart-step05 splitsmart-step05.zip
```

**Then, either way:**
```bash
git status
```
Check three things before adding:
- `.env` is **not** listed (it holds your Neon password)
- no `splitsmart-step05.zip` or `splitsmart-step05/` folder is listed
- you see the new `backend/src/realtime/`, `backend/scripts/` and `backend/prisma/migrations/20261120000000_init/`

```bash
git add .
git commit -m "Step 5: real-time item claiming with Socket.io"
git push -u origin step-05-realtime-claiming
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-05-realtime-claiming` → describe what changed and paste the simulation's final output as proof it works → **Create pull request** → review **Files changed** → **Merge pull request**. Then:
```bash
git switch main
git pull
```
