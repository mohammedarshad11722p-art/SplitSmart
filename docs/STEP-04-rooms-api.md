# Step 4: Rooms API

## What this step adds
The host turns a bill into a live **room** with a 6-character code and a QR code. Guests join with only a name. Each guest gets a colour + emoji avatar and a private session token, so a refresh or a dropped connection brings them back as the same person.

## Files (all inside `backend/`)

| File | New / changed | What it does |
|---|---|---|
| `package.json` | changed | adds `qrcode` (+ `@types/qrcode`) |
| `prisma/schema.prisma` | changed | `Participant.sessionToken` → `sessionTokenHash` (we store a hash, like the host token) |
| `prisma/migrations/20261122090000_hash_session_tokens/migration.sql` | new | hand-written migration that **renames** the column |
| `src/utils/hostToken.ts` → `src/utils/tokens.ts` | renamed | generic `generateToken` / `hashToken` / `verifyToken`, now used for hosts and guests |
| `tests/hostToken.test.ts` → `tests/tokens.test.ts` | renamed | matching tests |
| `src/services/bill.service.ts` | changed | uses the renamed token helpers (3 lines) |
| `src/utils/roomCode.ts` | new | 6-char codes without look-alike characters |
| `src/utils/avatar.ts` | new | 12 distinct colours + emojis |
| `src/services/room.service.ts` | new | create / join / rejoin / state / host edits |
| `src/middleware/hostAuth.ts` | changed | `requireHost` also reads `billId` from the body; new `requireRoomHost` |
| `src/socket.ts` | changed | `roomChannel()`, `ServerEvents`, `emitToRoom()` helpers |
| `src/routes/rooms.routes.ts` | new | the 7 endpoints below |
| `src/app.ts` | changed | mounts `/api/rooms` |
| `tests/roomCode.test.ts`, `tests/avatar.test.ts`, `tests/rooms.routes.test.ts` | new | 22 new tests (45 total) |

**Delete the old files** after copying: `src/utils/hostToken.ts` and `tests/hostToken.test.ts`. Copying the zip over your folder adds the new files but doesn't remove the old ones, and the old test would fail because it imports a file that no longer exists. Use `git mv` (see the Git section) and Git records it as a rename.

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/rooms` | host (`X-Host-Token`) | body `{billId, hostName, hostUpiId}` → room + host's own session |
| GET | `/api/rooms/:code` | anyone with the code | full state: room, bill, items with `claimedBy`, participants |
| POST | `/api/rooms/:code/join` | anyone (30/min/IP) | body `{name, sessionToken?}` → new guest (201) or rejoin (200) |
| GET | `/api/rooms/:code/me` | guest (`X-Session-Token`) | "who am I?" on page load |
| GET | `/api/rooms/:code/qr` | anyone | 512×512 PNG QR of the join link |
| PATCH | `/api/rooms/:code` | host | change `hostName` / `hostUpiId` |
| DELETE | `/api/rooms/:code/participants/:id` | host | remove someone who joined by mistake |

Codes are case-insensitive: `/api/rooms/jzs99a` works the same as `/api/rooms/JZS99A`.

### Two tokens, two jobs
| Token | Header | Who has it | Proves |
|---|---|---|---|
| host token (from step 3) | `X-Host-Token` | the host's browser | "I own this bill/room": edit items, edit room, remove people, (later) finalize and mark paid |
| session token (new) | `X-Session-Token` | every participant, host included | "I am participant X": claim items (step 5) |

The host has both, because the host is also a person at the table who claims their own food.

## Why it's built this way

- **Codes skip 0/O/1/I/L.** People read the code off one phone and type it into another across a noisy table. "Is that a zero or an O?" turns into "room not found". 31 characters ^ 6 = 887 million codes.
- **`crypto.randomInt`, not `Math.random`.** `Math.random` is predictable if you see enough outputs. Room codes are the only thing between a stranger and your table's bill.
- **Insert-and-retry, not check-then-insert.** "Is code X free? Yes → insert X" has a race: two requests can both see "free". We insert directly and let the database's `@unique` reject a collision, then retry with a new code. Same idea for the double-tapped "Create room" button (`billId` is unique) and two people typing the same name at once (`@@unique([roomId, name])`). **The database is the final judge of uniqueness. App-level checks are only for friendly error messages.**
- **Rejoin with a session token.** The token lives in the guest's localStorage. If they refresh, lose signal, or close the tab, the frontend sends it with the join request and they get their old identity back (same avatar, same claims) instead of a duplicate "Priya (2)". Rejoining works even after finalize, so people can always see what they owe.
- **Session tokens are hashed too.** The rename migration (`sessionToken` → `sessionTokenHash`) makes that explicit. SHA-256 is deterministic, so we can still look a guest up with `WHERE sessionTokenHash = hash(token)`. A slow hash like bcrypt isn't needed because the token is 256 random bits, not a guessable password.
- **A hand-written migration.** Prisma sees a renamed field as "drop the old column, add a new one", which deletes data, and it stops to ask you to confirm. Writing `RENAME COLUMN` ourselves keeps the data. Always read a migration that touches existing columns before applying it.
- **Name rules.** Trimmed, multiple spaces collapsed, max 30 characters, and duplicates are case-insensitive ("priya" can't join next to "Priya"), with a helpful message: "Add an initial?"
- **UPI ID validation.** The format is `handle@bank` (`arshad.k@okaxis`, `9876543210@ybl`). Catching a typo here matters because it's where everyone's money goes.
- **`router.param("code")`** runs before every route with `:code`. It uppercases the code and returns 404 for impossible codes, so no handler deals with messy input and junk codes never hit the database.
- **Broadcasting from REST routes.** When someone joins, the route calls `emitToRoom(..., "participant:joined", ...)` so everyone's screen can show the new avatar. Nothing listens yet. Step 5 makes phones subscribe to their room's channel. Event names live in one `ServerEvents` object, so a typo can't silently break real-time updates.
- **QR from the backend.** `GET /api/rooms/:code/qr` returns a PNG, so you can test it in a browser right now. Error correction level M still scans with screen glare. (The frontend may draw its own QR later for styling, but this endpoint stays useful for testing and sharing.)
- **Limits.** 30 participants per room, 24-hour expiry, 30 joins per minute per IP. Each one stops an abuse case without getting in a real group's way.

## How to test

### 0. Install, migrate, run the tests
```bash
cd backend
npm install
ls prisma/migrations     # you should see your "..._init" folder AND "20261122090000_hash_session_tokens"
npx prisma migrate dev   # applies the rename. Expect "Your database is now in sync with your schema."
npm test                 # 45 passed
```
If `prisma/migrations` has no `_init` folder (step 2's migration was never run), delete the `20261122090000_hash_session_tokens` folder and run `npx prisma migrate dev --name init` instead.

### 1. Create a bill and a room (mock AI is fine)
```bash
npm run dev
```
In a second terminal (`jq` makes JSON readable: `brew install jq`):
```bash
API=http://localhost:4000/api

# Bill (from step 3)
R=$(curl -s -F "image=@/path/to/any-photo.jpg" $API/bills)
TOKEN=$(echo "$R" | jq -r .hostToken)
BILL=$(echo "$R" | jq -r .bill.id)

# Room (use your real UPI ID)
C=$(curl -s -X POST -H "X-Host-Token: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"billId\":\"$BILL\",\"hostName\":\"Arshad\",\"hostUpiId\":\"yourname@okaxis\"}" $API/rooms)
echo "$C" | jq '.state.room'
CODE=$(echo "$C" | jq -r .state.room.code)
```
You should see a 6-character `code` and a `joinUrl`.

### 2. See the QR code
Open `http://localhost:4000/api/rooms/<CODE>/qr` in your browser and scan it with your phone camera. It opens `http://localhost:3000/room/<CODE>`. That page doesn't exist until step 7, so a "can't connect" error is expected.

### 3. Join as guests
```bash
# Lowercase code works too
G=$(curl -s -X POST -H "Content-Type: application/json" -d '{"name":"Priya"}' $API/rooms/$(echo $CODE | tr A-Z a-z)/join)
echo "$G" | jq '{name: .me.name, color: .me.avatarColor, emoji: .me.avatarEmoji}'
GUEST=$(echo "$G" | jq -r .sessionToken)

# Same name again → 409 NAME_TAKEN
curl -s -X POST -H "Content-Type: application/json" -d '{"name":"priya"}' $API/rooms/$CODE/join | jq .error

# Rejoin with the token → 200, "rejoined": true, still Priya
curl -s -X POST -H "Content-Type: application/json" -d "{\"name\":\"x\",\"sessionToken\":\"$GUEST\"}" $API/rooms/$CODE/join | jq '{rejoined, name: .me.name}'

# Who am I?
curl -s -H "X-Session-Token: $GUEST" $API/rooms/$CODE/me | jq .me.name

# Full room state
curl -s $API/rooms/$CODE | jq '{people: [.participants[].name], items: [.bill.items[].name]}'
```

### 4. Host actions and safety checks
```bash
# Creating a second room for the same bill → 409 ROOM_EXISTS (includes the existing code)
curl -s -X POST -H "X-Host-Token: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"billId\":\"$BILL\",\"hostName\":\"Arshad\",\"hostUpiId\":\"yourname@okaxis\"}" $API/rooms | jq .error

# Bad UPI ID → 400 with a friendly message
curl -s -X PATCH -H "X-Host-Token: $TOKEN" -H "Content-Type: application/json" -d '{"hostUpiId":"arshad"}' $API/rooms/$CODE | jq .error.details

# Remove Priya → 204
PRIYA=$(echo "$G" | jq -r .me.id)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "X-Host-Token: $TOKEN" $API/rooms/$CODE/participants/$PRIYA
```
In `npm run db:studio`, the `Participant` table shows `sessionTokenHash` as 64 hex characters, never the token itself.

### What I verified on my side
- Type-check passes, 45/45 tests pass.
- Applied your step-1 schema as an `init` migration, then this step's rename migration, on a real Postgres. Prisma reports no drift between the database and the schema.
- Ran every command above against that database: create room, wrong token → 403, bad UPI → 400, duplicate room → 409 with the existing code, lowercase join → 201, duplicate name → 409, rejoin → 200 same person, `/me` with good and bad tokens, QR → valid 512×512 PNG, unknown room → 404, UPI update, can't remove host, remove guest → 204, room for a bill with no items → 400 `NO_ITEMS`, and no token hashes ever appear in responses.
- **Not verified yet:** the `participant:joined` broadcast reaching phones. Nothing subscribes until step 5.

## Git: branch + pull request (you run these)
```bash
cd ~/SplitSmart
git switch main
git pull
git switch -c step-04-rooms-api

# Record the renames first, so Git shows them as renames, not delete + add:
git mv backend/src/utils/hostToken.ts backend/src/utils/tokens.ts
git mv backend/tests/hostToken.test.ts backend/tests/tokens.test.ts

# Now copy the step 4 files in (overwrite when asked), then:
git status                 # .env must NOT be listed; you should see "renamed:" lines
git add .
git commit -m "Step 4: rooms API with join codes, QR, guest sessions"
git push -u origin step-04-rooms-api
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-04-rooms-api` → write what changed and how you tested → **Create pull request** → review **Files changed** → **Merge pull request**. Then:
```bash
git switch main
git pull
```
