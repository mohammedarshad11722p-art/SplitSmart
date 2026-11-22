# Step 3: Bill upload and AI parsing

## What this step adds
A host can upload a bill photo. The backend stores it on Cloudinary, asks Claude to read it, converts the result to paise, checks the numbers add up, and saves the bill + items. The host can then fix anything with edit/add/delete endpoints.

## Files (all inside `backend/`)

| File | New / changed | What it does |
|---|---|---|
| `package.json` | changed | adds `@anthropic-ai/sdk`, `cloudinary`, `multer`, `express-rate-limit`; zod upgraded to v4 |
| `.env.example` | changed | Cloudinary + AI variables |
| `src/config/env.ts` | changed | validates the new vars; Claude mode requires the API key and Cloudinary |
| `src/middleware/errorHandler.ts` | changed | friendly messages for upload errors; zod v4 error format |
| `src/app.ts` | changed | mounts `/api/bills` |
| `src/utils/money.ts` | new | rupees ↔ paise (the only place that conversion happens) |
| `src/utils/hostToken.ts` | new | generate / hash / verify the host's secret token |
| `src/lib/cloudinary.ts` | new | upload a photo, build a resized JPEG URL for the AI |
| `src/lib/ai/types.ts` | new | `ParsedBillSchema` (your JSON shape) + the `BillParser` interface |
| `src/lib/ai/claude.ts` | new | Claude vision + structured outputs |
| `src/lib/ai/mock.ts` | new | fake parser with a fixed sample bill (tests + offline demo) |
| `src/lib/ai/index.ts` | new | picks the provider from `AI_PROVIDER` |
| `src/services/billMath.ts` | new | pure functions: normalise AI output, check totals |
| `src/services/bill.service.ts` | new | create / read / edit bills in the database |
| `src/middleware/upload.ts` | new | multer: accepts one image, max 10 MB, JPG/PNG/WEBP/HEIC |
| `src/middleware/hostAuth.ts` | new | checks `X-Host-Token` for host-only routes |
| `src/routes/bills.routes.ts` | new | the 7 endpoints below |
| `tests/setupEnv.ts` | changed | tests always use the mock AI |
| `tests/money.test.ts`, `tests/billMath.test.ts`, `tests/hostToken.test.ts`, `tests/bills.routes.test.ts` | new | 19 new tests (23 total) |

No database schema change in this step, so no new migration is needed.

## Endpoints (all amounts are integer paise)

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/bills` | anyone (10/min/IP) | multipart upload, field `image` → AI parse |
| POST | `/api/bills/manual` | anyone | empty bill if the photo/AI fails |
| GET | `/api/bills/:billId` | anyone with the id | bill + items + `validation` |
| PATCH | `/api/bills/:billId` | host | edit restaurant name, subtotal, tax, service charge, discount, grand total |
| POST | `/api/bills/:billId/items` | host | add item (`total` optional, defaults to qty × unit price) |
| PATCH | `/api/bills/:billId/items/:itemId` | host | edit item |
| DELETE | `/api/bills/:billId/items/:itemId` | host | delete item |

The upload response contains `hostToken`. The frontend saves it (localStorage) and sends it as the `X-Host-Token` header on host routes. It's only ever shown once.

## Why it's built this way

- **The AI hides behind an interface (`BillParser`).** The rest of the app calls `getBillParser().parse(url)` and never mentions Claude. Switching to another provider means one new file plus one `case` in `lib/ai/index.ts`.
- **Structured outputs, not "please reply in JSON".** We hand Claude the zod schema through `output_config.format`, and the API guarantees the reply matches it. No regex-ing JSON out of a chatty answer, no crashes on a missing bracket. We still re-validate with zod, because we never trust external input blindly.
- **One schema, two jobs.** `ParsedBillSchema` is both the format we send to Claude and the validator for what comes back. The `.describe()` text on each field is effectively part of the prompt ("discount as a POSITIVE number", "never include tax lines as items").
- **Claude sees a Cloudinary-resized JPEG.** Phone photos are 3-8 MB, and iPhones send HEIC. The URL transformation `w_1600,c_limit,f_jpg,q_auto` turns that into a ~300 KB JPEG on the fly: faster, cheaper, and every model accepts it.
- **The AI returns rupees and we convert immediately.** The model reads what's printed (₹245.50). `normalizeParsedBill` converts to paise and also cleans up: fills a missing unit price or total, drops zero-price "complimentary" lines, makes discounts positive, and uses the items' sum if the subtotal is missing.
- **Two validation checks, computed on every response:**
  - `itemsMatchSubtotal` / `itemsDiff`: do the items add up to the printed subtotal? If not, the AI misread something, or the host's edits don't match yet. The UI will show "Items are ₹30 more than the subtotal".
  - `grandTotalMatches` / `grandTotalDiff`: does subtotal + tax + service − discount equal the printed total? Indian bills often have a ±₹1 "round off". We'll handle that difference in the split step.
- **AI failure is not a dead end.** If Claude fails, the bill is saved as `FAILED` and the response still includes `hostToken`, so the host can add items by hand. `POST /api/bills/manual` skips the photo entirely.
- **`AI_PROVIDER=mock` = your backup demo.** It returns a fixed bill instantly, with no key and no internet. If the venue Wi-Fi dies mid-pitch, flip one env var.
- **Rate limiting the upload route.** Each upload is a paid AI call. 10 per minute per IP is plenty for a real host and stops anyone draining your credits with a script.
- **Host token is hashed and compared in constant time.** It's the same idea as password storage. `timingSafeEqual` prevents timing attacks that guess a hash byte by byte.
- **Edits are locked after finalize.** `assertEditable` returns 409 if the room is no longer OPEN, so an amount already sent in a UPI link can't change. Rooms arrive in step 4, but the guard is ready now.
- **`deleteMany({ id, billId })`.** Filtering by both ids means a host can't delete another bill's item by guessing its id.
- **Model choice.** Defaults to `claude-opus-5-5` for the best reading accuracy. Set `AI_MODEL=claude-sonnet-5-5` in `.env` for cheaper parses. Fallbacks are enabled: in the very unlikely case Claude's safety filter declines an image, the API automatically retries it on a suitable fallback model.

## How to test

### 0. Install the new packages
```bash
cd backend
npm install
npm test            # 23 passed (no database or API key needed)
```

### 1. Offline first, with the mock AI (no keys needed)
In `.env` set:
```
AI_PROVIDER=mock
```
and put a `#` in front of the three `CLOUDINARY_` lines (in mock mode the upload is skipped when Cloudinary isn't configured; placeholder values would make it try a real upload and fail). Then:
```bash
npm run dev
```
Upload any JPG (the mock ignores its content):
```bash
curl -F "image=@/path/to/any-photo.jpg" http://localhost:4000/api/bills
```
You should get `"parseStatus":"PARSED"`, 5 items from "Spice Junction", and `"validation": {"itemsMatchSubtotal": true, ...}`. Copy `hostToken`, `bill.id` and one item `id` from the response:
```bash
TOKEN=paste-host-token
BILL=paste-bill-id
ITEM=paste-item-id

# Change an item price to ₹350 → itemsMatchSubtotal becomes false, itemsDiff 3000 (₹30)
curl -X PATCH -H "X-Host-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"unitPrice":35000}' http://localhost:4000/api/bills/$BILL/items/$ITEM

# Add an item
curl -X POST -H "X-Host-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Extra Raita","quantity":1,"unitPrice":5000}' http://localhost:4000/api/bills/$BILL/items

# Wrong token → 403 NOT_HOST
curl -X DELETE -H "X-Host-Token: wrong" http://localhost:4000/api/bills/$BILL/items/$ITEM

# Delete the item
curl -X DELETE -H "X-Host-Token: $TOKEN" http://localhost:4000/api/bills/$BILL/items/$ITEM
```
Open `npm run db:studio` to see the rows in the `Bill` and `Item` tables. Note that `hostTokenHash` is a hash, not your token.

### 2. Real AI with a real bill photo
1. **Cloudinary:** sign up at cloudinary.com (free) → Dashboard → copy Cloud name, API key, API secret into `.env`.
2. **Claude:** console.anthropic.com → API Keys → create a key → `ANTHROPIC_API_KEY=` in `.env`.
3. Set `AI_PROVIDER=claude` and restart `npm run dev`. If something is missing, the server tells you exactly which variable.
4. Take a photo of a real restaurant bill and upload it:
   ```bash
   curl -F "image=@/path/to/bill.jpg" http://localhost:4000/api/bills
   ```
   It takes a few seconds. Compare the items and totals with the paper bill, and look at `validation`. In Prisma Studio, `rawAiResponse` shows exactly what Claude returned, which is handy when a number looks wrong.
5. Try a non-bill photo (a selfie): you should get an empty items list and `itemsMatchSubtotal` reflecting zeros, not a crash.

### What I verified on my side
- Type-check passes and all 23 tests pass.
- Ran the full mock flow against a real Postgres database: upload → PARSED with 5 items, edit price → mismatch flagged with the right difference, add/delete item, wrong token → 403, invalid body → 400 with field errors, missing bill → 404, and the API never returns `hostTokenHash` or `rawAiResponse`.
- **Not verified:** a real Claude call and a real Cloudinary upload, because I don't have your keys. Step 2 above is that test.

## Git: branch + pull request (you run these)
```bash
cd ~/SplitSmart
git switch main
git pull
git switch -c step-03-bill-parsing
# copy the step 3 files in (same paths as in the table), then:
git status                 # .env must NOT be listed
git add .
git commit -m "Step 3: bill upload, Cloudinary storage and AI parsing"
git push -u origin step-03-bill-parsing
```
Then on GitHub → **Compare & pull request** → base `main` ← compare `step-03-bill-parsing` → describe what changed and how you tested → **Create pull request** → review **Files changed** → **Merge pull request**. Afterwards:
```bash
git switch main
git pull
```
