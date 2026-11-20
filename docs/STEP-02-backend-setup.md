# Step 2: Backend setup

## Files (all inside `backend/`, plus the root `.gitignore`)

| File | What it does |
|---|---|
| `../.gitignore` | Keeps `node_modules`, `dist`, `.env` out of git |
| `package.json` | Dependencies + scripts (`dev`, `build`, `start`, `test`, `db:*`) |
| `tsconfig.json` | TypeScript settings for editor, tests, scripts |
| `tsconfig.build.json` | Compiles only `src/` to `dist/` for production |
| `jest.config.js` | Test runner config (ts-jest) |
| `.env.example` | Every env var, with where to get it |
| `src/config/env.ts` | Validates env vars with zod at startup, exports typed `env` |
| `src/lib/prisma.ts` | The single shared PrismaClient |
| `src/middleware/errorHandler.ts` | `AppError`, `asyncHandler`, JSON 404 + error responses |
| `src/routes/health.routes.ts` | `GET /api/health` and `GET /api/health/db` |
| `src/app.ts` | Builds Express app: helmet, CORS, JSON, routes, errors |
| `src/socket.ts` | Socket.io server skeleton (claiming handlers come in step 5) |
| `src/index.ts` | Starts one HTTP server for Express + Socket.io, graceful shutdown |
| `tests/setupEnv.ts` | Fake env vars so tests run without a database |
| `tests/app.test.ts` | 4 smoke tests |

## Why it's built this way

- **Env validated at startup (`config/env.ts`).** A missing `DATABASE_URL` crashes immediately with "DATABASE_URL: Required", instead of a confusing error the first time someone uploads a bill during the demo.
- **One PrismaClient.** Each client holds a pool of DB connections. Neon's free tier has a connection limit, and `tsx watch` reloads files on every save, so we cache the client on `globalThis`.
- **Pooled vs direct URL.** The app uses Neon's pooler (many short connections are cheap). Migrations need a direct connection because they use features the pooler doesn't support. That's why the schema has both `url` and `directUrl`.
- **One error shape.** Every failure returns `{ error: { code, message } }`. The frontend writes one error handler, and production never leaks stack traces.
- **`asyncHandler`.** Express 4 doesn't catch errors thrown inside `async` functions; without this wrapper a failed DB query would hang the request forever.
- **Express and Socket.io share one HTTP server.** Render gives each service one port. Socket.io starts with HTTP long-polling and upgrades to WebSocket on the same port.
- **`connectionStateRecovery`.** Phones drop connections when switching networks. Socket.io replays events missed in the last 2 minutes, so nobody's screen silently goes out of sync.
- **Graceful shutdown.** Render sends `SIGTERM` on every deploy; we finish in-flight requests and close DB connections before exiting.
- **`app.ts` vs `index.ts`.** Tests import `createApp()` and hit it with supertest, no port needed.

## How to test

You need Node 20+.

1. **Install**
   ```bash
   cd backend
   npm install          # also runs `prisma generate`
   ```
2. **Create the Neon database** at neon.tech → New project → copy the pooled and direct connection strings.
3. **Configure**
   ```bash
   cp .env.example .env   # paste both Neon URLs into .env
   ```
4. **Create the tables** from the step 1 schema:
   ```bash
   npx prisma migrate dev --name init
   ```
   You should see "Your database is now in sync with your schema". Optional: `npm run db:studio` opens a browser view of the empty tables.
5. **Run the tests** (no DB needed): `npm test` → 4 passed.
6. **Start the server**: `npm run dev` → `🚀 SplitSmart API on http://localhost:4000`
7. **Check the endpoints**
   ```bash
   curl http://localhost:4000/api/health      # {"status":"ok",...}
   curl http://localhost:4000/api/health/db   # {"status":"ok","database":"reachable",...}
   curl http://localhost:4000/api/nope        # {"error":{"code":"NOT_FOUND",...}}
   curl "http://localhost:4000/socket.io/?EIO=4&transport=polling"   # starts with 0{"sid":...  → Socket.io is alive
   ```
   If `/api/health/db` returns `DB_UNREACHABLE` (503), recheck `DATABASE_URL`.
8. **Break it on purpose:** delete `DATABASE_URL` from `.env` and run `npm run dev`. You should see the clear validation error and an exit. Put it back.
