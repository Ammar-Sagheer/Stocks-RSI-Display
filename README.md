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
  symbol. The most recent close is shown as the current price.

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
  concurrency (8 at a time) so the unofficial feed isn't hammered. Every
  fetch (including the initial cold cache and later 15-minute-TTL refreshes)
  merges records in one symbol at a time rather than swapping in one big
  batch at the end, so `getStockData()` never blocks the caller — it always
  returns whatever's currently loaded, plus `loadedCount`/`totalCount` so
  the frontend can show progress and poll faster until it's done.
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
