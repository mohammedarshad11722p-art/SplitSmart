# Step 10: UI polish (minimal look, same features)

## What this step changes
Only the look. Every button, page, flow and API call works exactly as before. No logic, state, handlers or backend code was touched.

- **Calmer colours.** A warm off-white background (`paper`), near-black text and buttons (`ink`), soft grey borders (`line`). Orange is kept only as a small accent: the logo dot, "Done.", "₹60 each".
- **Black primary buttons** instead of orange. One strong colour per screen makes the main action obvious without shouting.
- **Line icons instead of emojis** on buttons (camera, photo, pencil, QR, copy, WhatsApp chat…), drawn as inline SVG in `components/Icon.tsx`. No icon library, so nothing new to install.
- **Cards with thin borders** instead of shadows and filled blocks. Lists (items, "How it works", charges) are one card with dividers.
- **Small uppercase labels** ("TAP WHAT YOU HAD", "EVERYONE'S SHARE") so each section is easy to scan.
- **Wordmark header:** an orange dot + "splitsmart".
- **Status colours with meaning only:** green = paid / settled, grey = pending, soft orange = host.

## Design choices (the why)
- **Design tokens in one place.** All colours live in `app/globals.css` under `@theme` (`--color-paper`, `--color-ink`, `--color-muted`, `--color-line`, `--color-accent`…). Tailwind 4 turns each into classes like `bg-paper` or `text-ink`. Want a different accent later? Change one line.
- **Reusable utilities.** `card`, `field` (all text inputs) and `eyebrow` (section labels) are defined once with `@utility`, so every screen stays consistent.
- **Minimal = fewer things competing.** Fewer colours, fewer borders, more white space, and money amounts big and bold because that's what people come for.

## Files changed (frontend only)

| File | What changed |
|---|---|
| `app/globals.css` | new colour tokens + `card`, `field`, `eyebrow` utilities |
| `app/layout.tsx` | browser theme colour |
| `components/Icon.tsx` | **new**: inline SVG icons |
| `components/PageShell.tsx`, `Button.tsx`, `Sheet.tsx`, `Toast.tsx`, `Avatar.tsx` | restyled |
| `components/ClaimItemCard.tsx`, `JoinForm.tsx`, `MoneyInput.tsx`, `FinalizeSheet.tsx`, `ItemEditor.tsx`, `PayCard.tsx`, `ShareRoomCard.tsx`, `ServerWake.tsx` | restyled |
| `app/page.tsx`, `app/join/page.tsx`, `app/not-found.tsx` | restyled |
| `app/bill/[billId]/edit/page.tsx`, `app/room/[code]/page.tsx`, `app/room/[code]/summary/page.tsx` | restyled (classNames + icons only) |

Backend: **no changes**.

## How to test
```bash
# terminal 1
cd ~/splitsmart/backend && npm run dev
# terminal 2
cd ~/splitsmart/frontend && npm run dev
```
Do the same Dosa Corner run as STEP-07/08 (host + Priya in Incognito): manual bill → start the split → join → tap items → finalize → pay card / Show QR / Copy UPI ID → Mark paid → All settled. Everything should behave exactly as before, just look cleaner.

### What I verified on my side
- `tsc` + `next build` pass.
- The full two-phone flow in iPhone-sized browsers: home, manual bill, room, QR, join, claims (live on both), finalize, summary, pay link, WhatsApp text, pay QR sheet, mark paid, settled, reopen hidden. **No console errors.**

## Things not working / to look at later (found on the live site)
Not fixed in this step, on purpose (UI only).
1. **The AI reads a sample bill, not your photo.** Render has `AI_PROVIDER=mock`, so your Plan B bill turned into the "Spice Junction" sample. To fix: add `ANTHROPIC_API_KEY` in the Render dashboard and set `AI_PROVIDER=claude`.
2. **Your Plan B bill is tricky** and worth testing once real AI is on: ₹0.00 lines for flavour names, a 10% service charge, two GST lines and a −₹0.48 round-off. These could turn into ₹0 items or a "doesn't add up" warning.
3. **Bill photo thumbnail** showed as broken in my test. Probably just my test machine being unable to reach Cloudinary. Please check on your phone.
4. **Render free tier sleeps**, so the first load can take ~50 s. The wake banner covers it; a paid plan or a ping service would remove it.
5. **Neon password reset** (from the leaked screenshot) is still to do, if you haven't yet.

## Git: branch + pull request (you run these)
```bash
cd ~/splitsmart
git switch main
git pull
git switch -c step-10-ui-polish
```
Then get the files: tell me you're on `step-10-ui-polish` and I'll copy them in, or `unzip -o ~/Downloads/splitsmart-step10.zip -d ~/splitsmart`.

```bash
cd ~/splitsmart/frontend && npm run build && cd ..
git status        # must NOT list .env, .env.local, node_modules, .next, or any zip
git add .
git commit -m "Step 10: minimal UI refresh (no feature changes)"
git push -u origin step-10-ui-polish
```
On GitHub → **Compare & pull request** → base `main` ← compare `step-10-ui-polish`. Add before/after screenshots. → **Create pull request** → **Merge** → `git switch main && git pull`. Vercel redeploys the frontend by itself after the merge.
