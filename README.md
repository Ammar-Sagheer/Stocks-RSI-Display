# PSX Stocks RSI Dashboard

A simple Next.js dashboard listing Pakistan Stock Exchange (PSX) equities with
their RSI(14), snapshotted now and 1, 3, 7, 15 and 30 trading days ago. Click a
row to expand an RSI trend chart (Recharts). Click a column header to sort.
Results are paginated (25 per page) and searchable by symbol/name.

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
- `lib/cache.js` — an in-memory, stale-while-revalidate cache (15 min TTL)
  that fetches all symbols with limited concurrency (8 at a time) so the
  unofficial feed isn't hammered. The first request after the server starts
  has to build this cache cold, which can take 30–90 seconds for ~700+
  symbols; subsequent requests are served instantly from cache while a
  refresh happens in the background once stale.
- `app/api/stocks/route.js` — returns the cached data as JSON.
- `app/page.js` + `app/components/` — client-side table, sorting, pagination,
  search, and the per-stock RSI chart.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment notes

- The cold-cache fetch (~30–90s) can exceed default serverless function
  timeouts on platforms like Vercel. For production use, consider either:
  - Running on a long-lived Node server (VPS, Docker, etc.) where the
    in-memory cache persists across requests, or
  - Pre-warming the cache with a scheduled job (e.g. Vercel Cron hitting
    `/api/stocks` every 10–15 minutes) so user requests always hit warm data.
- The unofficial PSX feed can rate-limit an IP that sends many concurrent
  requests in a short window. The built-in cache/backoff is tuned to avoid
  this under normal usage, but if you see repeated 503s, wait a few minutes
  before retrying.
