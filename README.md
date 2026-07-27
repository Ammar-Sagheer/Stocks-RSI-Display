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
- `lib/cache.js` — an in-memory cache that fetches all symbols with limited
  concurrency (4 at a time) so the unofficial feed isn't hammered, merging
  records into a module-level store one symbol at a time so `getStockData()`
  never blocks the caller — it always returns whatever's currently loaded,
  plus `loadedCount`/`totalCount` so the frontend can show progress and poll
  faster until it's done. Symbols that fail transiently (connection
  reset/503 under load) are queued and retried once, after an 8s cool-down,
  instead of being silently dropped for the rest of the 15-minute cycle;
  whatever's still unavailable after that retry is reported as
  `failedSymbols` and surfaced in the UI. Because this lives in the server
  process's memory, it needs a long-lived server (see deployment below).
- `app/api/stocks/route.js` — returns the cached data as JSON.
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

## Deploying on Render (free tier)

This app keeps its cache in the server process's memory, so it needs a
long-lived server — **not** a per-request serverless function (that's why
Vercel/Netlify don't fit without an external store). Render's Web Services
are a persistent container, which is exactly right.

**Pick the region carefully — this is the one thing that trips people up.**
PSX's feed (`dps.psx.com.pk`) is in Pakistan, so Singapore looks like the
obvious closest choice — but PSX **blocks Render's Singapore IP range**
outright (connections reset with `UND_ERR_SOCKET` and the app hangs forever
on "Fetching PSX symbol list…"). **Use Frankfurt** — it's the closest region
to Pakistan that PSX does *not* block, and latency doesn't matter much anyway
since the fetch is a one-time-per-refresh batch that gets cached. If Frankfurt
ever starts getting blocked too, a US region (Oregon/Ohio/Virginia) is the
next thing to try. Do **not** use Singapore.

Manual setup:

1. In the Render dashboard: **New +** → **Web Service**.
2. Connect this GitHub repo and pick the **`main`** branch.
3. **Region**: **Frankfurt (EU Central)** — see the warning above.
4. **Environment**: Node.
5. **Build Command**: `npm install && npm run build`
6. **Start Command**: `npm run start`
7. **Instance Type**: **Free**.
8. Leave environment variables empty — none are required.
9. Click **Create Web Service**.

A `render.yaml` (free plan, Frankfurt region) is also included if you'd rather
use Render's **Blueprint** flow (**New +** → **Blueprint**) instead of filling
in the form by hand.

**Free-tier note:** Render's free web services spin down after ~15 minutes of
inactivity. The next visit after a spin-down cold-starts the service, wiping
the in-memory cache and re-triggering the ~30–90s "loading stocks in the
background" fill you see on first boot. That's the trade-off for free hosting;
the first page or two of stocks still appear within ~10–15s while the rest
loads behind the progress bar.

**Diagnosing feed issues:** if the app hangs on "Fetching PSX symbol list…",
check the Render **Logs** tab for `[psx]`/`[cache]` lines. `UND_ERR_SOCKET` /
`other side closed` means PSX is blocking that region's IP (change region);
other errors point at a genuine transient feed problem.
