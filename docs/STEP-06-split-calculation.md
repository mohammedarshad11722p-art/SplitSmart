# Step 6: Split calculation (with unit tests)

## What this step adds
The money part. The backend works out exactly what each person owes, live while people are still claiming. The host then **finalizes**: the split locks, everyone's amount is saved, and every phone jumps to the summary. If the host made a mistake, they can **reopen** it (as long as nobody has paid yet).

Rules, from your brief:
- Shared items are divided equally among the people who claimed them.
- Tax, service charge and discount are shared in proportion to each person's food subtotal.
- Rounding is handled so totals **always** match the bill exactly, to the paisa.
- Unclaimed items trigger a warning before finalizing.

## Files (all inside `backend/`)

| File | New / changed | What it does |
|---|---|---|
| `src/services/split.ts` | new | **the pure split calculation**: no database, just numbers |
| `src/services/settle.service.ts` | new | preview, finalize (with warnings), reopen; saves `amountDue` |
| `src/services/roomLock.ts` | new | one shared lock for claims **and** finalize |
| `src/services/claim.service.ts` | changed | uses the shared lock |
| `src/services/bill.service.ts` | changed | manual bills now calculate their own subtotal and grand total (bug fix, see below) |
| `src/routes/rooms.routes.ts` | changed | `GET /split`, `POST /finalize`, `POST /reopen` |
| `src/realtime/types.ts` | changed | new events `room:finalized`, `room:reopened` |
| `src/index.ts` | changed | clean shutdown on the first Ctrl+C |
| `scripts/simulate-room.ts` | changed | 3 new scenarios: preview, finalize, reopen |
| `tests/split.test.ts` | new | 28 tests, including 1,000 random bills (80 total) |

No database changes this step, so no migration.

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/rooms/:code/split` | anyone with the code | live preview while claiming, or the locked amounts after finalize |
| POST | `/api/rooms/:code/finalize` | host | body `{ "force": false }`. Blocks with **409 `UNCLAIMED_ITEMS`** or **409 `BILL_MISMATCH`** and the details; send `{ "force": true }` once the host confirms |
| POST | `/api/rooms/:code/reopen` | host | unlock to fix claims. Refused with `PAYMENTS_STARTED` once anyone has paid (step 8) |

`GET /split` returns:
```jsonc
{
  "status": "OPEN",            // or FINALIZED
  "final": false,              // true = amounts are locked and saved
  "split": {
    "people": [{
      "name": "Priya", "subtotal": 49000, "tax": 2450, "serviceCharge": 4900,
      "discount": 0, "roundOff": 0, "total": 56350,        // ₹563.50
      "items": [{ "name": "Butter Naan", "share": 8000, "sharedWith": 3 }, ...]
    }, ...],
    "unclaimedItems": [], "itemsTotal": 123000, "roundOff": 0, "grandTotal": 141450,
    "balanced": true           // sum of totals === grand total
  },
  "warnings": { "unclaimedItems": [], "itemsMismatch": null }
}
```

## How the math works

`src/services/split.ts`, step by step:

1. **Food.** Each item's total is divided equally among its claimers. ₹100 between 3 people can't be 33.333…, so it becomes ₹33.34 + ₹33.33 + ₹33.33. Who gets the extra paisa **rotates from item to item**, so the same person doesn't always pay it.
2. **Unclaimed items** (only if the host forced finalize) are split equally among everyone.
3. **Each person's total** = grand total × (their food ÷ all food). If you ate 60% of the food, you pay 60% of the tax, the service charge and the bill's round-off, and get 60% of the discount. That's exactly "proportional to each person's subtotal", done in one step.
4. **Rounding: the largest remainder method.** Everyone first gets their share rounded **down**. The few paise left over go one each to the people whose rounded-off fractions were largest. Result: the totals add up to the grand total exactly, and everyone is within 1 paisa of their exact share.
5. **The breakdown** (tax, service, discount per person) is rounded the same way for the summary screen. A small **round-off** line makes each person's lines add up to their total. It also absorbs the bill's own printed round-off (the "Round Off ₹0.50" line many Indian bills have).

### Why these choices
- **A pure function.** `calculateSplit(items, participants, charges)` takes plain numbers and returns plain numbers. No database means we can test thousands of cases in a second. All the database work lives in `settle.service.ts`, which just loads data, calls it, and saves the result.
- **Round once, not four times.** Adding four separately rounded charges can push someone 3-4 paise away from their exact share, or below zero for a tiny share. One rounding keeps everyone within a paisa.
- **BigInt inside the rounding.** A ₹10 lakh bill is 10⁸ paise. Multiplying two such numbers (10¹⁶) is bigger than JavaScript can count exactly (about 9 × 10¹⁵). BigInt has no limit.
- **Deterministic.** Same claims → same amounts, every time, in every order. That's why `finalize` can save amounts and the summary can recompute them and get the same answer. If they ever disagree, the saved amount wins, because that's what people were already asked to pay.
- **Finalize uses the same lock as claiming.** A tap that lands halfway through finalizing waits, then gets "claims are locked". Saved amounts can never go stale.
- **One transaction.** Saving everyone's amount and locking the room happen together or not at all. A crash in the middle can't leave half the people with amounts.
- **Warnings, not silent fixes.** Unclaimed items and items ≠ subtotal both block finalize with a 409 and the details. The frontend will show "Masala Chaas isn't claimed. Split it among everyone?", and the host decides with `force: true`.
- **Reopen.** Hosts make mistakes. Reopening clears the saved amounts and unlocks claiming, but only until someone has paid, because after that the amounts are real money.

### The tests (`tests/split.test.ts`)
"Unit tests for the split calculation, since that's where bugs hide":
- `splitEvenly`: exact splits, leftover paise, rotation
- `allocateProportionally`: proportions, largest-remainder rounding, zero weights, negative round-off, a ₹10 lakh bill without overflow
- Food: alone, shared, ₹100 ÷ 3, someone who ate nothing owes ₹0, claims from removed people ignored, unclaimed items
- Charges: tax and service 60/40, discount, round-off up and down, a tiny share never going negative
- **A realistic dinner**: the mock "Spice Junction" bill with shared paneer, naan and chaas, checked to the paisa: Arshad ₹356.50, Priya ₹563.50, Rahul ₹494.50
- **1,000 random bills** (1-8 people, 1-12 items, random claims, tax, service, discount, round-off), each checking: totals equal the grand total exactly, nobody owes a negative amount, every person's lines add up, and the same input gives the same output

That last kind of test, checking rules that must **always** hold on lots of random inputs, is called **property-based testing**. It finds the cases you'd never think to write by hand. It caught a mistake in its own first draft: it generated a bill with a negative grand total (1 paisa of food and a −₹0.28 round-off), which no real bill has. The test now generates realistic bills, and `calculateSplit` refuses a negative grand total explicitly instead of producing negative amounts.

## Bug fixed: manual bills had a ₹0 total
Found while building the simulation for this step. A bill created with `POST /api/bills/manual` (no photo) kept `subtotal = 0` and `grandTotal = 0` while the host added items, so the split said everyone owes ₹0. Now bills with no printed totals (`MANUAL`, or `FAILED` when the AI couldn't read the photo) calculate them from their items: subtotal = sum of items, grand total = subtotal + tax + service − discount. Bills the AI read are unchanged; their printed totals are still what we check against.

## Fixed: Ctrl+C twice
Shutdown waited for idle browser/curl connections to time out. It now closes them right away, and a second Ctrl+C no longer starts a second shutdown.

## How to test

```bash
cd backend
npm test                # 80 passed. Run just the split tests: npx jest split
```

Then the live test (terminal 1: `npm run dev`, terminal 2):
```bash
npm run simulate
```
The new part of the output should look like this:
```
10. Live split preview
  ✅ preview adds up to the bill exactly
  ✅ bill total isn't ₹0 (manual bills calculate their own total)
  ✅ no warnings while every item is claimed
     Arshad   owes ₹295.00
     Priya    owes ₹535.00
     Zoya     owes ₹300.00

11. Finalize with an unclaimed item
  ✅ finalize is blocked with an UNCLAIMED_ITEMS warning
  ✅ a guest can't finalize
  ✅ host confirmed → finalized
  ✅ every phone was told
  ✅ saved amounts add up to the bill exactly
  ✅ the unclaimed raita was split among everyone
  ✅ claims are locked after finalize
  ✅ nobody new can join
  ✅ items can't be edited
     Arshad   owes ₹315.00
     Priya    owes ₹555.00
     Zoya     owes ₹320.00

12. Host reopens to fix a mistake
  ✅ room is open again and amounts are cleared
  ✅ phones were told
  ✅ claiming works again

🎉 All checks passed
```
(The simulation's bill has no tax, so totals are round numbers. Check that ₹295 + ₹535 + ₹300 = ₹1,130, the four items' total, and that after adding the ₹60 raita, ₹315 + ₹555 + ₹320 = ₹1,190.)

Try the preview by hand with the mock AI bill (5% GST + 10% service): upload a bill, create a room (step 3 and 4 commands), then open `http://localhost:4000/api/rooms/<CODE>/split` in your browser. Nothing is claimed yet, so the warnings list all 5 items and the preview shares them among everyone. The host alone owes the full ₹1,414.50, with tax ₹61.50 and service ₹123.

Press Ctrl+C once in terminal 1: the server should stop straight away.

### What I verified on my side
- Type-check passes, 80/80 tests pass, including the 1,000 random bills.
- `npm run simulate` passes all checks (sections 1-12) against a real Postgres.
- One Ctrl+C (SIGINT) with an open keep-alive connection: the server exits immediately with code 0.

## Git: branch + pull request (you run these)

**First, finish step 5.** Your repo's `main` doesn't have step 5 yet: the branch is pushed but the pull request isn't merged. On GitHub, open the PR for `step-05-realtime-claiming` and click **Merge pull request**, then:
```bash
cd ~/splitsmart
git switch main
git pull                                  # main now includes step 5
git switch -c step-06-split-calculation
```

**Then get the files**, either way:
- **I copy them in:** tell me you're on `step-06-split-calculation` and I'll write the step 6 files straight into `~/splitsmart`.
- **Or unzip yourself:** `unzip -o ~/Downloads/splitsmart-step06.zip -d ~/splitsmart`

**Then:**
```bash
cd ~/splitsmart/backend && npm test && cd ..
git status                 # .env must NOT be listed, and no zip or extra folder
git add .
git commit -m "Step 6: split calculation, finalize/reopen, unit tests"
git push -u origin step-06-split-calculation
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-06-split-calculation` → paste the `npm test` summary and the simulation output as proof → **Create pull request** → **Merge pull request**. Then `git switch main && git pull`.
