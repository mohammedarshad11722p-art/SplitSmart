# Step 9: Deployment (Neon + Render + Vercel)

## What this step adds
SplitSmart gets a real public link that anyone can open on their phone.

```
 phone ──► Vercel (frontend, Next.js) ──► Render (backend API + Socket.io) ──► Neon (Postgres)
           https://splitsmart-xxx.vercel.app   https://splitsmart-api.onrender.com     (Singapore)
                                                         └──► Cloudinary (photos), Claude (AI)
```

Everything here is on **free plans**. You make the accounts and paste the secrets yourself. **Never paste a secret into chat** (or into a file you commit). Secrets only go into the Render and Vercel dashboards.

## Why these choices
- **Vercel for the frontend.** It's made by the Next.js team: zero config, a global CDN, and it auto-deploys every time `main` changes.
- **Render for the backend.** Our backend is a **long-running server with WebSockets** (Socket.io). Vercel's serverless functions shut down after each request, so they can't hold a live socket open. Render runs a normal Node process and supports WebSockets. It also has a Singapore region, next to your Neon database, so each database query is ~2 ms instead of ~200 ms from the US.
- **Neon for Postgres** (already set up). It's serverless Postgres with a free tier, and it sleeps when idle.
- **The free-tier catch:** Render's free server **goes to sleep after ~15 minutes** without traffic. The next visitor waits ~30–60 s while it wakes up. So this step adds a **"Waking up the server…" banner**, and the doc has a demo-day trick for it below.

## Code changes in this step

| File | Change | Why |
|---|---|---|
| `backend/package.json` | new script `start:prod` = `prisma migrate deploy && node dist/index.js` | Every deploy applies any new migrations **before** the server starts, so the DB schema is never behind the code. It's safe to run on every boot: already-applied migrations are skipped. |
| `backend/src/config/env.ts` | in production, `FRONTEND_URL` must be an `https://` site | This catches the #1 deploy mistake (leaving `http://localhost:3000`), which would block every request with CORS and make room QR codes point at localhost. The server refuses to start and says exactly what's wrong. |
| `backend/tests/env.test.ts` | new, 6 tests (99 total) | tests that guard |
| `frontend/components/ServerWake.tsx` + `app/providers.tsx` | "Waking up the server…" banner | Pings `/api/health` on page load. If it's slow, it explains why instead of looking frozen. It disappears by itself once the server answers. |
| `frontend/next.config.ts` | on Vercel, the build fails if `NEXT_PUBLIC_API_URL` is missing | `NEXT_PUBLIC_` values are **baked into the JavaScript at build time**. If it were missing, the site would quietly call `localhost:4000` on every visitor's phone. Failing loudly is better. |
| `frontend/.env.example` | production note | |

No database migration this step.

## Before you start
1. **Get the branch and the files** (see the Git section at the bottom), and check that it all runs locally.
2. Make sure your GitHub repo's `main` has steps 1–8 merged. I checked your Mac: `main` is at "Merge pull request #6". 👍
3. Have these tabs open: Neon, Cloudinary, (Anthropic Console, if you'll use real AI), GitHub.

---

## Part A: Neon (database) ⏱ 2 min
You already have the project in Singapore. You just need the two connection strings.

1. Neon Console → your project → **Connect** (top right) / **Connection Details**.
2. With **Connection pooling ON**, copy the URL. Its host contains `-pooler`. This is `DATABASE_URL`.
3. Turn pooling **OFF** and copy again (no `-pooler`). This is `DIRECT_DATABASE_URL`.
4. At the end of **both** URLs, add `&connect_timeout=15`. Example ending: `...neon.tech/neondb?sslmode=require&connect_timeout=15`.
   - Why: Neon's free database also sleeps when idle, and waking it takes a few seconds. Prisma's default 5 s timeout can give up too early.
5. Keep them in a safe place (a password manager, or a note you'll delete afterwards). Not in chat, not in git.

> **Optional, but the professional way:** give your local laptop its own database, so local test runs (`npm run simulate`) don't add fake dinners to the live app. Neon → **Branches** → **Create branch** → name it `dev`, from `main`. Put the `dev` branch's two URLs in your **local** `backend/.env`, then run `npm run db:deploy` once. Render keeps using `main`.

## Part B: Render (backend) ⏱ 10 min
1. Go to **render.com** → **Get Started** → sign up **with GitHub** (easiest).
2. Dashboard → **+ New** → **Web Service**.
3. **Connect a repository** → if SplitSmart isn't listed, click **Configure GitHub App / Connect account**, give Render access to **only** the `SplitSmart` repo, then come back and pick it.
4. Fill in the form:

| Field | Value |
|---|---|
| Name | `splitsmart-api` (this becomes `https://splitsmart-api.onrender.com`; if the name is taken Render adds random letters, and that's fine) |
| Language / Runtime | **Node** |
| Branch | `main` |
| Region | **Singapore (Southeast Asia)**, same as Neon |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:prod` |
| Instance Type | **Free** |

   - Why `--include=dev`: we set `NODE_ENV=production` (below), and then npm skips devDependencies, but TypeScript and Prisma's CLI are devDependencies and the build needs them.

5. **Environment Variables** → **Add Environment Variable** for each of these. Paste the secret values straight from Neon/Cloudinary/Anthropic:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` (same as your Mac) |
| `FRONTEND_URL` | `https://example.com` **for now**. You'll replace it with the Vercel URL in Part D. |
| `DATABASE_URL` | Neon pooled URL (with `&connect_timeout=15`) |
| `DIRECT_DATABASE_URL` | Neon direct URL (with `&connect_timeout=15`) |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary → Settings → API Keys |
| `CLOUDINARY_API_KEY` | 〃 |
| `CLOUDINARY_API_SECRET` | 〃 |
| `AI_PROVIDER` | `mock` to start (always works, free). Switch to `claude` later, see Part F. |

   Don't add `PORT`: Render sets it itself, and our `env.ts` reads it.

6. Open **Advanced** → **Health Check Path** → `/api/health`. Auto-Deploy: **On Commit** (the default).
7. Click **Deploy Web Service**. Watch the **Logs**. You want to see, in order:
   - the `npm ci` and `prisma generate` and `tsc` lines → **Build successful 🎉**
   - `Applying migration 20261120000000_init` … (first deploy only) or `No pending migrations to apply`
   - `🚀 SplitSmart API on http://localhost:10000 (production)`. It says localhost because that's what the server sees from inside the container; Render routes the public URL to it.
   - **Your service is live 🎉**
8. Test it: open `https://splitsmart-api.onrender.com/api/health` (use your exact URL from the top of the Render page). You should get `{"status":"ok",...}`. Then open `/api/health/db`, which should say `"database":"reachable"`.

**If it fails:**
- `Invalid environment variables … FRONTEND_URL` → it must start with `https://`.
- `P1001 Can't reach database server` → check the Neon URLs, and that `sslmode=require` is still in them.
- `Cannot find module 'typescript'` → the build command is missing `--include=dev`.
- `Missing script: start:prod` → Render is building an old `main`; merge this step's PR first.

## Part C: Vercel (frontend) ⏱ 5 min
1. Go to **vercel.com** → **Sign Up** → **Continue with GitHub**. The **Hobby** (free) plan is fine.
2. **Add New…** → **Project** → **Import Git Repository**. If SplitSmart isn't listed, **Adjust GitHub App Permissions** → give access to the SplitSmart repo only → **Import**.
3. **Configure Project:**

| Field | Value |
|---|---|
| Project Name | `splitsmart` (the URL becomes `https://splitsmart-<something>.vercel.app`, or `splitsmart.vercel.app` if it's free) |
| Framework Preset | Next.js (auto-detected) |
| Root Directory | click **Edit** → choose `frontend` → **Continue** |
| Build / Output settings | leave the defaults |
| Environment Variables | `NEXT_PUBLIC_API_URL` = your Render URL, e.g. `https://splitsmart-api.onrender.com`, **with no trailing slash** |

4. **Deploy**. After ~1 minute you get confetti and a preview. Click **Continue to Dashboard** and copy the **production domain** under "Domains", e.g. `https://splitsmart-abc123.vercel.app`.

## Part D: Connect them ⏱ 2 min
The backend has to know the frontend's address. CORS only lets that site call the API, and the room QR codes point there.

1. Render → `splitsmart-api` → **Environment** → edit `FRONTEND_URL` → paste the Vercel production domain, e.g. `https://splitsmart-abc123.vercel.app` → **Save, rebuild, and deploy** (or **Save Changes**; Render redeploys either way).
2. Wait until the deploy is **Live**.

> Only the production domain works. Vercel also makes **preview** URLs for every branch/PR (long `...-git-step-10...vercel.app` addresses). Those are blocked by CORS on purpose. Test previews locally, and use production for the real thing.

## Part E: Smoke test (the real thing!) ⏱ 5 min
**1. From your Mac, run the full robot test against production:**
```bash
cd ~/splitsmart/backend
API_URL=https://splitsmart-api.onrender.com npm run simulate
```
All 14 sections should pass, ending with `🎉 All checks passed`. That proves the API, database, WebSockets, split math and payments all work on the real servers.
- The first run may take a minute if the server was asleep.
- It creates a test dinner called "Simulation Dhaba". It's harmless, and rooms expire after 24 h.

**2. With real phones:**
1. On your phone, open the Vercel URL. If the server was asleep you'll see "Waking up the server…" for up to a minute, then it disappears.
2. **Type the items instead**, add 2–3 items, then **Start the split** with your **real UPI ID**.
3. **Show QR code**, and scan it with a friend's phone (or a second phone). It opens the Vercel site and joins the room.
4. Both of you tap items. They show on both phones instantly.
5. **Finalize.** Your friend taps **Pay with UPI**: GPay/PhonePe should open with your name and the amount. (They can back out, or actually send you ₹1 😄.) Tap **Mark paid** → **All settled! 🥳** on both phones.
6. **Choose a photo** of any bill. With `AI_PROVIDER=mock` you get the sample bill; with `claude` it reads the real one.

**3. Add to your phone's home screen** (Safari Share → Add to Home Screen / Chrome ⋮ → Add to Home screen). Then it feels like an app at the demo.

## Part F: Turning on real AI (optional, when you have a key)
1. **console.anthropic.com** → sign up → **Billing**: add credits (a few dollars covers hundreds of bills). Set a **monthly spend limit** under **Limits**, so a bug or a spammer can never surprise you.
2. **API Keys** → **Create Key** → name it `splitsmart-render` → copy it. It's shown once.
3. Render → **Environment**:
   - add `ANTHROPIC_API_KEY` = the key
   - change `AI_PROVIDER` to `claude`
   - optionally set `AI_MODEL` = `claude-sonnet-5-5` for a cheaper cost per bill
   - **Save**
4. Snap a real bill on your phone. If anything goes wrong on demo day, switch `AI_PROVIDER` back to `mock` (it redeploys in about a minute). That's your Wi-Fi-proof backup.

Use **separate keys** for your laptop and for Render. Then if one leaks, you delete just that key.

## How deploys work from now on
- You merge a PR into `main` → **Render and Vercel both redeploy automatically** (~2–4 min). Render runs any new migrations on start.
- A branch push alone doesn't touch production. Vercel only makes a preview.
- If a deploy breaks: Render → **Events** / Vercel → **Deployments** → pick the last good one → **Rollback** / **Promote to Production**.
- The logs are where to look first: Render → **Logs** (backend errors, including the AI parse logs), Vercel → **Logs**.

## Demo-day checklist ✅
- **10 minutes before:** open the Vercel URL and `/api/health` on your phone to wake both Render and Neon. (The free server sleeps after ~15 min idle, so do it again if there's a long gap before your slot.)
- Do a dry run with a teammate's phone **on the venue Wi-Fi / mobile data**.
- Keep `AI_PROVIDER=mock` ready as a backup, and have a printed bill or a clear bill photo in your gallery.
- Keep the Render dashboard open in a tab so you can glance at the logs.
- If someone asks "is it really live?": hand them the QR. That's your best moment.

## What I verified on my side
- Backend: type-check and **99/99 tests** pass, including the 6 new env-guard tests.
- **Production dry run** against a fresh empty Postgres:
  - built the backend exactly as Render will (`npm run build`), then `npm run start:prod` with `NODE_ENV=production` and an https `FRONTEND_URL`
  - it applied both migrations on boot, then started
  - CORS allowed the https frontend and refused a random site
  - `/api/health/db` OK
  - the full 14-section simulation passed against it
- Frontend:
  - a Vercel-style build (`VERCEL=1`) **fails** with a clear message when `NEXT_PUBLIC_API_URL` is missing, and passes when it's set
  - the "Waking up the server…" banner showed while the backend was off and disappeared by itself once it started
- On your Mac: `backend/package-lock.json` and `frontend/package-lock.json` are committed (Render's `npm ci` needs them), no `.env` is tracked, and Node is v22.
- I can't log in to Render, Vercel or Neon for you, so Parts A–F are yours. Send me a screenshot of any red error and I'll tell you the fix.

## Git: branch + pull request (you run these)

```bash
cd ~/splitsmart
git switch main
git pull
git switch -c step-09-deployment
```

**Then get the files**, either way:
- **I copy them in:** tell me you're on `step-09-deployment` and I'll write the files straight into `~/splitsmart`.
- **Or unzip yourself:** `unzip -o ~/Downloads/splitsmart-step09.zip -d ~/splitsmart`

**Then:**
```bash
cd ~/splitsmart/backend && npm test && cd ../frontend && npm run build && cd ..
git status        # must NOT list .env, .env.local, node_modules, .next, or any zip
git add .
git commit -m "Step 9: deploy-ready (prod start, env guard, wake banner)"
git push -u origin step-09-deployment
```
On GitHub, open the PR (base `main` ← compare `step-09-deployment`) → **Merge**, then `git switch main && git pull`.

**Merge first, then do Parts A–F.** Render builds from `main`, and the `start:prod` script only exists after this merge.

Then put the live link here 👉 so it can go in the README: **Live demo:** `https://splitsmart-....vercel.app`

**Next up, step 10:** the README (with a Mermaid architecture diagram and the live link), the 2-minute pitch script, and 3 sample bills.
