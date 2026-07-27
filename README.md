# PSX Stocks RSI Dashboard

A simple Next.js dashboard listing Pakistan Stock Exchange (PSX) equities with
their RSI(14), snapshotted now and 1, 3, 7, 15 and 30 trading days ago. Click a
row to expand an RSI trend chart (Recharts, built from our own EOD data) for
that stock, plus a link to open the symbol on tradingview.com. Click a column
header to sort. Results are paginated (rows-per-page selector) and searchable
by symbol/name. Layout is responsive: a fixed-width table on desktop/tablet
with no horizontal scrolling, and stacked cards on mobile.

## Data source

Uses PSX's free, unofficial public JSON feed at `dps.psx.com.pk` (the same
endpoints that power PSX's own market-watch page):

- `GET /symbols` — full list of listed instruments (bonds/TFCs/sukuks are
  filtered out since RSI isn't meaningful for debt instruments).
- `GET /timeseries/eod/{symbol}` — daily end-of-day OHLC-ish history per
  symbol. The most recent close is shown as the current price. Symbols whose
  latest close is `0` (suspended/inactive listings the feed still lists but
  hasn't reported real prices for in a long time) are dropped, since their
  RSI would just be a meaningless flat 50.

This means prices are **end-of-day, not tick-live** — that's normal for a free
PSX data source. There is no official free PSX API; this endpoint is
undocumented and could change or rate-limit without notice, so all fetching
logic lives in `lib/psx.js` to make it easy to swap for a paid provider later
if needed.

## Architecture

- `lib/psx.js` — fetches symbols and EOD series, with retries for the
  occasional transient connection reset/503 this feed produces under load.
- `lib/rsi.js` — Wilder's RSI(14) calculation and day-offset snapshotting.
- `lib/refresh.js` — `fetchAllStocks()`, the shared logic that fetches every
  symbol with limited concurrency and retries transient failures once after
  a cool-down instead of silently dropping them. Used by both backends
  below via progress callbacks, so neither has to duplicate this logic.
- `lib/cache.js` — the in-memory backend (Render/Railway/local dev): calls
  `fetchAllStocks()` and merges records into a module-level cache one
  symbol at a time, so `getStockData()` never blocks the caller — it always
  returns whatever's currently loaded, plus `loadedCount`/`totalCount` so
  the frontend can show progress and poll faster until it's done. Needs a
  long-lived server process to work (see deployment notes below).
- `lib/store.js` — the Redis backend (Vercel): thin wrapper around Upstash
  Redis for reading/writing one JSON snapshot of the full stock list.
  Auto-disables itself (`isRedisConfigured === false`) when the Upstash env
  vars aren't set.
- `app/api/cron/refresh/route.js` — Vercel Cron-triggered route that runs
  `fetchAllStocks()` once and writes the result to Redis via `lib/store.js`.
  No-ops with a clear error if Redis isn't configured.
- `app/api/stocks/route.js` — returns the cached data as JSON. Reads from
  Redis if configured (bootstrapping it inline on the very first request if
  empty), otherwise falls back to `lib/cache.js`'s in-memory store.
- `app/page.js` + `app/components/` — client-side table, sorting, pagination,
  search, and responsive table/card layout. Polls `/api/stocks` every 2s
  while `loadedCount < totalCount` (showing a "loading X of Y" progress bar),
  then falls back to a 5-minute idle poll once the cache is fully warm.
- `app/components/RSIChart.js` — Recharts line chart of RSI(14) over time,
  built from the `history` we already computed server-side. TradingView's
  free embeddable widget was tried instead, but its public datafeed only
  covers major exchanges (NASDAQ, NYSE, forex, crypto, etc.) and doesn't
  include PSX, so it silently fell back to a default symbol. The expanded
  row instead links out to `tradingview.com/chart/?symbol=PSX:{symbol}` for
  anyone who wants the full interactive TradingView view in a new tab.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment notes

- `/api/stocks` itself always returns immediately — it never blocks on the
  full ~700-symbol fetch. But the in-memory cache lives in the server
  process, so on a platform that spins up a fresh serverless instance per
  request (rather than keeping one warm), each cold instance restarts the
  fetch from zero and visitors never see it finish filling in. For
  production use, prefer either:
  - Running on a long-lived Node server (VPS, Docker, etc.) where the
    in-memory cache persists across requests, or
  - Pre-warming the cache with a scheduled job (e.g. Vercel Cron hitting
    `/api/stocks` every 10–15 minutes) so user requests always hit warm data.
- The unofficial PSX feed can rate-limit an IP that sends many concurrent
  requests in a short window. The built-in cache/backoff is tuned to avoid
  this under normal usage, but if you see repeated 503s, wait a few minutes
  before retrying.

## Deploying on Render (manual, free tier)

This app is built around a persistent in-memory cache, so it normally wants
a long-lived server rather than a cold-starting serverless function. Render's
**Free** web services do spin down after ~15 minutes of inactivity — the next
visit after a spin-down cold-starts the service, wiping the cache and
re-triggering the ~30–90s "loading stocks in the background" fill you see on
first boot. That's a reasonable trade-off for free hosting of a personal
project; just expect that behavior instead of an always-warm cache.

Manual setup (no blueprint):

1. In the Render dashboard: **New +** → **Web Service**.
2. Connect this GitHub repo and pick the **`main`** branch.
3. **Environment**: Node.
4. **Build Command**: `npm install && npm run build`
5. **Start Command**: `npm run start`
6. **Instance Type**: **Free**.
7. Leave environment variables empty — none are required.
8. Click **Create Web Service**. Render builds and deploys automatically on
   every push to `main` from here on.

A `render.yaml` (set to the free plan) is also included in the repo if you'd
rather use Render's **Blueprint** flow (**New +** → **Blueprint**) instead of
filling in the form by hand — it fills in the same settings automatically.

**Known issue:** PSX's feed (`dps.psx.com.pk`) appears to block some cloud
providers' IP ranges outright (connections get reset at the socket level —
see `[psx]`/`[cache]` log lines with `UND_ERR_SOCKET` if this happens to you).
If the app gets permanently stuck on "Fetching PSX symbol list…", that's a
network-level block on the host's IP, not a code bug — try a different region
or a different provider (see below).

## Deploying on Railway

Railway also runs the app as a persistent container (via Nixpacks, using the
included `railway.json`), so the in-memory cache behaves the same way as on
Render — no serverless cold starts, in principle. **Note:** unlike Render,
Railway requires a payment method on file to actually allocate compute —
without one, deploys just sit "Queued" indefinitely. So this isn't a genuinely
free option; only use it if you're fine attaching billing.

1. In the Railway dashboard: **New Project** → **Deploy from GitHub repo** →
   select this repo and the **`main`** branch.
2. Railway auto-detects the Node app via `railway.json` (build:
   `npm install && npm run build`, start: `npm run start`). No environment
   variables are required.
3. Deploy. Check the **Deployments → Logs** tab the same way as Render — look
   for `[psx]`/`[cache]` lines. If PSX's feed is reachable from Railway's IP
   range, you'll see the symbol list load and the stock count climb; if you
   see repeated `UND_ERR_SOCKET`/connection-reset errors immediately, this
   provider's IPs are blocked too and it's worth trying yet another region or
   provider.

## Deploying on Vercel

Vercel runs API routes as serverless functions — there's no persistent
process for `lib/cache.js`'s in-memory cache to live in, and multiple
function instances don't share memory, so the Render/Railway approach
doesn't work here unmodified. Instead, on Vercel the app uses:

- **Upstash Redis** (via Vercel's Storage integration) as a shared, external
  cache the stock data is written to.
- **Vercel Cron** (`vercel.json`, `app/api/cron/refresh/route.js`) to
  populate that cache on a schedule, instead of fetching on each request.
- `/api/stocks` (`app/api/stocks/route.js`) just reads the last snapshot
  from Redis — fast and consistent across every function instance. If
  Redis has never been populated yet (first deploy, before any cron run),
  it does one inline fetch to bootstrap itself, then persists it.

This is auto-detected: if Redis credentials are present (either
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, or the
`KV_REST_API_URL`/`KV_REST_API_TOKEN` names Vercel's Upstash Marketplace
integration actually injects), the Redis path is used; otherwise the app
falls back to the in-memory behavior described above (so the same codebase
still works unmodified on Render/Railway/local dev). The `/api/stocks`
response includes a `backend: "redis" | "memory"` field, and the UI shows a
warning label when it's still on the in-memory fallback, so it's obvious if
this hasn't kicked in yet.

Setup:

1. **Import the project** into Vercel from this GitHub repo (`main` branch).
   No custom build/start commands needed — Vercel's Next.js support handles
   it automatically.
2. **Add Upstash Redis**: in the Vercel project → **Storage** tab → **Create
   Database** → **Upstash for Redis** (free tier). During creation, connect
   it to this project — that's what actually injects the credentials as
   environment variables (as `KV_REST_API_URL`/`KV_REST_API_TOKEN`).
3. **Add a `CRON_SECRET` env var** (any random string you generate) in
   Project Settings → Environment Variables. Vercel automatically sends it
   as a `Bearer` token on cron-triggered requests, which the refresh route
   checks to reject anyone else calling it directly.
4. Redeploy so the new env vars take effect. `vercel.json` schedules the
   refresh for `30 12 * * *` (12:30 UTC, shortly after PSX's market close) —
   **note that Vercel's Hobby (free) plan only actually executes cron jobs
   once per day**, regardless of the schedule expression; more frequent
   schedules need a paid plan.
5. The first visit before any cron run has completed will trigger the
   inline bootstrap fetch (up to the 60s function limit) — if it doesn't
   finish in time on Hobby, that request errors and the next visitor
   retries the same bootstrap, until either it completes or the daily cron
   does. You can also hit `/api/cron/refresh` manually right after setup
   (with `Authorization: Bearer <your CRON_SECRET>`) to populate it
   immediately instead of waiting.

This hasn't been verified against a live Vercel + Upstash deployment from
this environment — if the bootstrap or cron run errors, check the Vercel
function logs for `[refresh]`/`[psx]` lines the same way we debugged Render.
