# Step 7: Frontend pages

## What this step adds
This is the part people actually see. It's a mobile-first Next.js app that talks to the backend from steps 2 to 6:

1. **Home** (`/`): snap the bill, pick a photo, or type the items by hand. Fun loading messages show while the AI reads the bill.
2. **Review & edit** (`/bill/:id/edit`): fix anything the AI got wrong (items, tax, service, discount). Warnings appear if the items don't add up to the printed total. Then **Start the split**: enter your name and UPI ID, and the room is created.
3. **Live room** (`/room/:code`):
   - Friends join by QR or code with just a name.
   - Everyone taps what they had. Changes show on every phone instantly, with avatars on each item.
   - "Your share so far" updates live and includes tax and charges.
   - The host gets the QR code, can tap **for** someone without a phone ("Tapping for"), can remove people, and can finalize.
4. **Join** (`/join`): type a 6-character code.
5. **Summary** (`/room/:code/summary`):
   - "Split done!", with everyone's final amount, you first.
   - A breakdown for each person (items, ÷N for shared items, food, tax, service, discount, round-off).
   - A note that the shares add up exactly.
   - The host can **reopen** the split.

Payment buttons (UPI link + QR + "mark paid") come in step 8.

## Design choices (the why)
- **No login.** The browser keeps the host token and the session token in `localStorage` (`lib/storage.ts`). Refreshing or closing the tab and coming back rejoins you as the same person. That's the "rejoin" feature from step 4.
- **One API client** (`lib/api.ts`). Every call goes through it, so the backend URL, headers (`X-Host-Token`, `X-Session-Token`) and error handling live in one place. Errors become `ApiError` with the backend's `code`, so pages can react, for example by jumping to an existing room on `ROOM_EXISTS`.
- **One socket hook** (`hooks/useRoom.ts`). Pages just read `state` and call `setClaim()`.
  - The hook shows your tap **instantly** (an optimistic update), then waits for the server's ack.
  - If the ack fails or takes over 5 seconds, it asks the server for the true state (`room:sync`). So the screen can never stay wrong.
  - It also handles reconnecting, being removed, and finalize/reopen.
- **The math stays on the server.** "Your share so far" comes from `GET /split` (the step 6 code), fetched 250 ms after the last tap. The frontend never does split math, so there's only one source of truth for money.
- **Money is paise everywhere.** `lib/format.ts` turns `56350` into `₹563.50` and back. No floats touch amounts.
- **Photos are shrunk in the browser** (`lib/image.ts`, max 2000px JPEG) before upload. Phone photos are 5–10 MB, and on mobile data that's slow.
- **Tailwind 4 + motion** for the look: big tap targets, bottom sheets, a sticky bottom bar, springy check marks and toasts.

## Files

| File | What it does |
|---|---|
| `frontend/package.json`, `package-lock.json` | Next 15, React 19, Tailwind 4, motion, socket.io-client |
| `frontend/.env.example` | `NEXT_PUBLIC_API_URL` (the backend address) |
| `frontend/next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `next-env.d.ts` | config |
| `frontend/app/layout.tsx`, `providers.tsx`, `globals.css`, `not-found.tsx` | font, theme colours, toasts, 404 |
| `frontend/app/page.tsx` | home: camera / gallery / manual |
| `frontend/app/bill/[billId]/edit/page.tsx` | review & edit + start room |
| `frontend/app/join/page.tsx` | enter a room code |
| `frontend/app/room/[code]/page.tsx` | the live room |
| `frontend/app/room/[code]/summary/page.tsx` | who owes what |
| `frontend/components/*` | Button, Sheet, Avatar, ClaimItemCard, ShareRoomCard (QR), JoinForm, FinalizeSheet, ItemEditor, MoneyInput, PageShell, Spinner, Toast |
| `frontend/hooks/useRoom.ts` | live socket connection |
| `frontend/lib/*` | api, types, format, storage, image, validation |
| `backend/src/app.ts` | **changed**: one-line fix so the room QR image shows (below) |

### Backend fix found while testing
The QR code image wasn't showing in the browser. Helmet sets `Cross-Origin-Resource-Policy: same-origin` by default. That tells the browser "only pages on port 4000 may show this image", so the frontend on port 3000 was blocked. In production (Vercel vs Render) it would break the same way. The fix sets it to `cross-origin`. That's safe because it only affects embedding images. API calls are still protected by CORS. All 80 backend tests still pass.

## Setup (once)

```bash
cd ~/splitsmart/frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
```
`.env.local` is already in `.gitignore`. It holds no secrets (everything starting with `NEXT_PUBLIC_` is visible in the browser anyway), but it's per-machine.

## How to test

Two terminals:
```bash
# terminal 1
cd ~/splitsmart/backend && npm run dev        # API on :4000
# terminal 2
cd ~/splitsmart/frontend && npm run dev       # app on http://localhost:3000
```
Then click through. Use Chrome DevTools' phone view (⌘⌥I → the phone icon) so it looks like a phone:

1. `http://localhost:3000` → **✍️ Type the items instead**.
2. Name it "Dosa Corner" and add: Masala Dosa ×2 ₹120, Filter Coffee ×3 ₹40, Paneer Tikka ×1 ₹260. Set Tax to 31. The bill total should read **₹651.00**.
3. **Start the split →**, enter your name and UPI (e.g. `arshad@okaxis`), then **Create room**. You land in the room.
4. **Show QR code**: the QR and the 6-letter code appear.
5. Open a **second window in Incognito** (it has its own localStorage, so it counts as another person). Go to `http://localhost:3000/join` and type the code (or open `/room/<CODE>`). Join as "Priya".
6. Priya taps Masala Dosa + Filter Coffee. You tap Paneer Tikka + Filter Coffee. Every tap shows on the other window instantly, and the coffee shows "₹60.00 each".
7. Check the bottom bar: **Priya ₹315.00, you ₹336.00**. That's food ₹300 / ₹320 plus the ₹31 tax split 15 / 16, and it adds to ₹651.
8. Host: **Finalize** → **Finalize split**. Both windows jump to "Split done!" with the same amounts.
9. Host: **Reopen for changes**. Both windows go back to the room.

Also try:
- Refresh Priya's window: she's still Priya.
- Stop the backend for a few seconds: "Reconnecting…" appears, then goes away.
- The host can remove Priya from the People sheet, and her screen says she was removed.
- With `AI_PROVIDER=mock`, **Choose a photo** with any image gives the 5-item sample bill.

### Test on your real phone (same Wi-Fi)
1. Find your Mac's LAN IP: `ipconfig getifaddr en0` (e.g. `192.168.1.23`).
2. `backend/.env`: `FRONTEND_URL=http://192.168.1.23:3000`, then restart the backend.
3. `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://192.168.1.23:4000`, then restart `npm run dev`.
4. On your phone open `http://192.168.1.23:3000`. The room QR now points at your Mac, so a friend's phone can scan it.

(The camera button opens the camera on a phone. On a laptop it opens the file picker. That's normal.)

### What I verified on my side
- `tsc` type-check and `next build` pass (all 6 routes).
- A scripted run with **two separate iPhone-sized browsers** against a real Postgres and the backend:
  - manual bill → 3 items + tax → create room → QR shows → second phone joins → both claim → live updates on both → shares ₹336 + ₹315 = ₹651 → finalize → both land on the summary → reopen → both go back to the room.
  - No console errors.
- Backend: 80/80 tests pass after the helmet change.

## Git: branch + pull request (you run these)

```bash
cd ~/splitsmart
git switch main
git pull
git switch -c step-07-frontend-pages
```

**Then get the files**, either way:
- **I copy them in:** tell me you're on `step-07-frontend-pages` and I'll write the files straight into `~/splitsmart`.
- **Or unzip yourself:** `unzip -o ~/Downloads/splitsmart-step07.zip -d ~/splitsmart` (the zip has `backend/`, `frontend/` and `docs/` at the top, so they land in the right place).

**Then:**
```bash
cd ~/splitsmart/frontend && npm install && npm run build && cd ..
cd backend && npm test && cd ..
git status        # must NOT list .env, .env.local, node_modules, .next, or any zip
git add .
git commit -m "Step 7: frontend pages (home, edit, live room, summary)"
git push -u origin step-07-frontend-pages
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-07-frontend-pages`. Add a couple of phone screenshots to the PR description (it's nice proof, and you'll reuse them in the README). Then → **Create pull request** → **Merge pull request** → `git switch main && git pull`.
