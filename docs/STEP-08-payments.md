# Step 8: UPI payments + mark paid

## What this step adds
Once the host finalizes, people can pay the host in one tap, and the host can see who has paid.

- **Guests see a "Pay ₹315 with UPI" button.** On a phone, it opens GPay, PhonePe, Paytm or BHIM with the host's UPI ID, the exact amount and a note ("SplitSmart Dosa Corner") already filled in. Next to it:
  - **Show QR**, to pay from another phone, or from a laptop, where the QR shows straight away.
  - **Copy UPI ID**, as a backup.
- **The host sees a "Collected ₹X of ₹Y" progress bar.**
  - Each person has a **Mark paid** button, and **Undo paid** to fix a mistake.
  - **Show pay QR** puts a friend's QR on the host's own phone, for someone who never joined (e.g. the host tapped for them).
- **Everything updates live on every phone.** When the host marks Priya paid, her screen flips to "✅ You're all paid up". When everyone has paid, all screens say **"All settled! 🥳"**.
- **Share on WhatsApp** (from your nice-to-haves): sends the group a message with each person's amount and the summary link.
- **Reopen** is hidden once someone has paid, and the backend blocks it too (step 6's `PAYMENTS_STARTED`).

## Design choices (the why)
- **What a UPI link is:** `upi://pay?pa=arshad@okaxis&pn=Arshad&am=315.00&cu=INR&tn=SplitSmart%20Dosa%20Corner`. This is the standard NPCI format, so every UPI app understands it.
  - `pa` = who gets paid, `pn` = their name, `am` = rupees with exactly 2 decimals, `cu` = INR, `tn` = note.
  - Put the same text in a QR code and it's the "scan & pay" QR you see at shop counters.
- **The link is built on the backend** (`src/utils/upi.ts`), and the API returns a ready link for each person. That's one place to get it right, with 13 unit tests:
  - Spaces are written as `%20`, not `+`. Some apps show "Arshad+Khan" otherwise.
  - The `@` in the UPI ID is kept as-is.
  - `&`, `?`, `#` and `%` are stripped from names, so they can't break the link.
  - Long names and notes are shortened.
  - The amount always has 2 decimals, and ₹0 or negative amounts are refused.
- **Why the host marks people paid by hand.** A web page gets **no "payment succeeded" signal** back from the UPI app. The app just opens, and the page never hears what happened. Confirming payments automatically needs a payment gateway (Razorpay, Cashfree…), with KYC and fees. For splitting dinner with friends, "host checks the bank app, taps Mark paid" is honest and free. Good to say in the pitch: *"we don't touch money: it goes straight from friend to host over UPI."*
- **The host doesn't pay themselves.** They're shown as "Paid the bill". People whose share is ₹0 are "Nothing to pay".
- **Settled = room CLOSED.** When the last person is marked paid, the room's status becomes `CLOSED`. Undo sets it back to `FINALIZED`. We used the enum that was already in the step 1 schema, so **no database migration** this step.
- **Heads-up from the real world:** some UPI apps (GPay especially) sometimes show a warning or refuse pay links between two people, depending on the app version and the amounts. That's why the QR and Copy UPI ID are always there as backups.

## Files

| File | New / changed | What it does |
|---|---|---|
| `backend/src/utils/upi.ts` | new | builds `upi://pay` links safely |
| `backend/tests/upi.test.ts` | new | 13 tests (93 total) |
| `backend/src/services/settle.service.ts` | changed | `payments` in the split view; `setPaid()`; `getUpiLink()`; finalize now returns payments |
| `backend/src/routes/rooms.routes.ts` | changed | `PATCH …/payment`, `GET …/pay-qr` |
| `backend/src/realtime/types.ts` | changed | new event `payment:updated` |
| `backend/scripts/simulate-room.ts` | changed | sections 13–14: links, QR, mark paid, settle |
| `frontend/components/PayCard.tsx` | new | the guest's Pay button / QR / copy |
| `frontend/lib/share.ts` | new | WhatsApp message text |
| `frontend/lib/device.ts` | new | "is this a phone?" (laptops get the QR instead) |
| `frontend/app/room/[code]/summary/page.tsx` | changed | progress, badges, mark paid, pay QR sheet, WhatsApp |
| `frontend/hooks/useRoom.ts`, `lib/api.ts`, `lib/types.ts` | changed | payment event + API calls |

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/rooms/:code/split` | anyone | now also has `payments` (after finalize) |
| PATCH | `/api/rooms/:code/participants/:id/payment` | host | body `{ "paid": true }` or `false`. Errors: `NOT_FINALIZED`, `HOST_DOES_NOT_PAY`, `NOTHING_DUE` |
| GET | `/api/rooms/:code/participants/:id/pay-qr` | anyone with the code | PNG QR of that person's UPI link |

```jsonc
"payments": {
  "payee": { "name": "Arshad", "upiId": "arshad@okaxis" },
  "people": [
    { "participantId": "…", "status": "HOST", "amount": 33600, "paidAt": null, "upiLink": null },
    { "participantId": "…", "status": "PENDING", "amount": 31500, "paidAt": null,
      "upiLink": "upi://pay?pa=arshad@okaxis&pn=Arshad&am=315.00&cu=INR&tn=SplitSmart%20Dosa%20Corner" }
  ],
  "dueCount": 1, "paidCount": 0, "collected": 0, "outstanding": 31500, "settled": false
}
```

## How to test

**1. Backend**
```bash
cd ~/splitsmart/backend
npm test                       # 93 passed
npm run dev                    # terminal 1
npm run simulate               # terminal 2
```
The new part of the output:
```
13. UPI payment links
  ✅ finalize returns payments, everyone starts unpaid
  ✅ the host owes nobody (no link)
  ✅ each guest gets a UPI link to the host for their exact amount
     upi://pay?pa=arshad@okaxis&pn=Arshad&am=555.00&cu=INR&tn=SplitSmart%20Simulation%20Dhaba
  ✅ payment QR is a PNG
  ✅ no payment QR for the host

14. Host marks people paid
  ✅ a guest can't mark payments
  ✅ the host can't be marked paid
  ✅ marked paid, collected amount updated
  ✅ every phone was told
  ✅ can't reopen once someone has paid
  ✅ host can undo a mistake
  ✅ everyone paid → settled, room CLOSED
  ✅ collected = everything the guests owed
  ✅ undo after settling → back to FINALIZED

🎉 All checks passed
```

**2. In the browser** (backend + `cd frontend && npm run dev`). Do the same Dosa Corner run as in step 7: you're the host, Priya is in an Incognito window, then finalize. Then:
1. **Priya's window:** you see "You owe Arshad ₹315.00". On a laptop the QR shows straight away, because laptops can't open UPI apps. **Copy UPI ID** works.
2. **Your window:** "Collected ₹0.00 of ₹315.00, 0 of 1 paid". Priya's card has **Show pay QR** and **Mark paid**.
3. Tap **Mark paid**. Priya's window flips to "✅ You're all paid up", and both windows say **All settled! 🥳**. Reopen is gone.
4. **Undo paid** → back to "Split done!", pending.
5. **Share on WhatsApp** opens WhatsApp Web with the message typed in.

**3. The real test: your phone (best part!)** Use the LAN setup from STEP-07 (FRONTEND_URL / NEXT_PUBLIC_API_URL with your Mac's IP). Use **your own real UPI ID** as the host, and join from your phone as a guest. Tapping **Pay** should open GPay/PhonePe with your name and the amount filled in. You can back out without paying. Or pay yourself ₹1 to see the whole thing work 😄

### What I verified on my side
- Backend: type-check, **93/93 tests**, and the simulation passes every section (1–14) against a real Postgres.
- Frontend: type-check + `next build` pass.
- Two iPhone-sized browsers:
  - the guest's Pay link was exactly `upi://pay?pa=arshad@okaxis&pn=Arshad&am=315.00&cu=INR&tn=SplitSmart%20Dosa%20Corner`
  - the pay QR loads
  - the WhatsApp text is correct
  - the host's Show pay QR sheet works
  - Mark paid → the guest's screen flipped to "paid up" and both went "All settled!" live
  - Reopen was hidden
  - no console errors

## Git: branch + pull request (you run these)

```bash
cd ~/splitsmart
git switch main
git pull
git switch -c step-08-upi-payments
```

**Then get the files**, either way:
- **I copy them in:** tell me you're on `step-08-upi-payments` and I'll write the files straight into `~/splitsmart`.
- **Or unzip yourself:** `unzip -o ~/Downloads/splitsmart-step08.zip -d ~/splitsmart`

**Then:**
```bash
cd ~/splitsmart/backend && npm test && cd ../frontend && npm run build && cd ..
git status        # must NOT list .env, .env.local, node_modules, .next, or any zip
git add .
git commit -m "Step 8: UPI pay links, payment QR, mark paid, WhatsApp share"
git push -u origin step-08-upi-payments
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-08-upi-payments`. Paste the simulation output, and add a screenshot from your phone's UPI app opening if you tried it. Then → **Create pull request** → **Merge pull request** → `git switch main && git pull`.

**Next up, step 9: deployment** (Neon + Render + Vercel), so the app gets a real public link for the demo.
