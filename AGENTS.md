<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: PSX RSI Dashboard

A short-term swing-trading dashboard for Pakistan Stock Exchange equities —
buy oversold, sell within 1–2 weeks. **Read these two files before making
any change**, in this order:

1. **`README.md`** — what the app does today, full architecture, every env
   var, deployment instructions. The current-state reference.
2. **`docs/PROGRESS.md`** — chronological history of every feature and bug
   fix, with the reasoning behind each. Several fixes in `lib/rsi.js` and
   `lib/cache.js` look like they could be "simplified" or "reverted" from
   the code alone, but exist because of a specific real-data bug found by
   comparing output against TradingView — the reasoning isn't visible in
   the code, only in that log. Check it before touching RSI calculation,
   corporate-action adjustment, or volume-filtering logic.

## The five things most likely to bite you

- **This sandbox's IP is rate-limited by PSX** (`dps.psx.com.pk` 503s under
  sustained load). Expected, not a bug — verify data-layer logic with small
  offline Node scripts or a mocked `/api/stocks` route (see prior Playwright
  screenshot scripts in the repo's history) rather than hammering the live
  feed from here.
- **Env var changes need a full server restart.** `lib/cache.js` reads
  `process.env.*` in top-level `const`s evaluated once at process boot.
  `.env.local` must sit in the project root, and is never hot-reloaded —
  editing it while the old process is still running does nothing.
- **The corporate-action adjuster only fires on price DROPS**
  (`adjustForCorporateActions` in `lib/rsi.js`), never rises — a real bug
  (see `docs/PROGRESS.md` item 10) came from treating large rises as false
  splits and erasing genuine rallies from RSI history.
- **The buy-signal screener rule is intentionally fixed** (daily RSI(14) ≤
  35 & RSI(2) ≤ 10), independent of whatever period/interval the user has
  selected in the view dropdowns. Don't parameterize it by the view — that
  was the source of a real user-confusion bug (item 9 in the progress log).
- **The liquidity floor (`PSX_MIN_VOLUME`) tracks volume as a tri-state**
  (`number` / confirmed-`null` / unknown-`undefined`), not a boolean —
  collapsing that back to a simple "is it a small number" check will
  silently break the KSE-100-outage safety net (see item 12 in the
  progress log).

## Verifying UI changes without live PSX access

Prior sessions built visual verification against fixture data (Playwright +
a mocked `/api/stocks`/`/api/history` route) rather than a live server —
search recent commits/PR descriptions for the pattern if you need to
screenshot a UI change.
