import { fetchSymbols, fetchEodSeries } from "./psx";
import { calculateRSISeries, snapshotRSI, RSI_SNAPSHOT_OFFSETS } from "./rsi";

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const CONCURRENCY = 5;
const RETRY_CONCURRENCY = 3;
const RETRY_PASS_DELAY_MS = 8000; // let PSX's rate limiter cool down before retrying

// Records are merged in as each symbol finishes, so both a cold cache and a
// periodic refresh serve partial/previous results immediately instead of
// blocking until every symbol is done.
const state = {
  bySymbol: new Map(),
  totalCount: 0,
  loadedCount: 0,
  updatedAt: null, // set once a full refresh cycle has completed at least once
  startedAt: null,
  isRefreshing: false,
  failedSymbols: 0,
};

let refreshPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;

  async function runNext() {
    const current = nextIndex++;
    if (current >= items.length) return;
    await worker(items[current], current);
    return runNext();
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(runners);
}

async function buildStockRecord(meta) {
  // Network/feed errors propagate to the caller so a transient failure
  // (connection reset, 503 under load) can be distinguished from a
  // symbol that's intentionally excluded (returns null below).
  const series = await fetchEodSeries(meta.symbol);
  if (series.length < 20) return null; // not enough history to be meaningful

  const latest = series[series.length - 1];
  if (!latest.close) return null; // suspended/inactive symbol — feed reports 0 for every close

  const closes = series.map((p) => p.close);
  const rsiSeries = calculateRSISeries(closes);

  const record = {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    isETF: meta.isETF,
    price: latest.close,
    asOf: latest.date,
    history: series.slice(-120).map((p, idx, arr) => ({
      date: p.date,
      close: p.close,
      rsi: rsiSeries[series.length - arr.length + idx] ?? null,
    })),
  };

  for (const { key, daysAgo } of RSI_SNAPSHOT_OFFSETS) {
    record[key] = snapshotRSI(rsiSeries, daysAgo);
  }

  return record;
}

async function processSymbol(meta) {
  try {
    return { record: await buildStockRecord(meta), failed: false };
  } catch {
    return { record: null, failed: true };
  }
}

async function refresh() {
  state.isRefreshing = true;
  state.startedAt = Date.now();

  try {
    // Symbols come back in PSX's listing order, which is alphabetical —
    // matching the table's default sort — so the pages a visitor sees
    // first tend to fill in before the long tail of the list does.
    const symbols = await fetchSymbols();
    state.totalCount = symbols.length;
    state.loadedCount = 0;

    const retryQueue = [];

    await runWithConcurrency(symbols, CONCURRENCY, async (meta) => {
      const { record, failed } = await processSymbol(meta);
      state.loadedCount++;
      if (record) {
        state.bySymbol.set(meta.symbol, record);
      } else if (failed) {
        retryQueue.push(meta);
      }
      // record === null && !failed means intentionally excluded — not retried
    });

    // Give PSX's rate limiter a moment to ease up, then retry symbols that
    // failed transiently instead of silently dropping them for a whole
    // 15-minute cycle. totalCount grows to include the retry pass so the
    // frontend keeps showing progress (and keeps polling quickly) instead
    // of reporting "done" before the retries finish.
    if (retryQueue.length > 0) {
      state.totalCount += retryQueue.length;
      await sleep(RETRY_PASS_DELAY_MS);

      let stillFailed = 0;
      await runWithConcurrency(retryQueue, RETRY_CONCURRENCY, async (meta) => {
        const { record, failed } = await processSymbol(meta);
        state.loadedCount++;
        if (record) {
          state.bySymbol.set(meta.symbol, record);
        } else if (failed) {
          stillFailed++;
        }
      });
      state.failedSymbols = stillFailed;
    } else {
      state.failedSymbols = 0;
    }

    state.updatedAt = Date.now();
  } finally {
    state.isRefreshing = false;
  }
}

function triggerRefresh() {
  if (!refreshPromise) {
    refreshPromise = refresh()
      .catch(() => {
        // Swallow here; getStockData surfaces staleness via updatedAt/loadedCount.
        // A fresh attempt is retried on the next call once isRefreshing clears.
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Returns whatever stock data is available right now without waiting for
 * every symbol to finish. On a cold cache this kicks off a background
 * refresh and returns immediately (often with zero stocks); the caller is
 * expected to poll until `loadedCount === totalCount`. Once a full refresh
 * has completed, subsequent calls serve that data immediately while a new
 * refresh (still merged in incrementally) runs once the TTL elapses.
 */
export async function getStockData() {
  const isStale = !state.updatedAt || Date.now() - state.updatedAt > TTL_MS;

  if (!state.startedAt || (isStale && !state.isRefreshing)) {
    triggerRefresh(); // fire and forget — do not block the response on it
  }

  return {
    stocks: Array.from(state.bySymbol.values()),
    updatedAt: state.updatedAt,
    isRefreshing: state.isRefreshing,
    loadedCount: state.loadedCount,
    totalCount: state.totalCount,
    failedSymbols: state.failedSymbols,
  };
}
