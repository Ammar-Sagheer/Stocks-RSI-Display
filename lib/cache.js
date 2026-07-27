import { fetchSymbols, fetchEodSeries } from "./psx";
import { calculateRSISeries, snapshotRSI, RSI_SNAPSHOT_OFFSETS } from "./rsi";

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const CONCURRENCY = 8;

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
  try {
    const series = await fetchEodSeries(meta.symbol);
    if (series.length < 20) return null; // not enough history to be meaningful

    const closes = series.map((p) => p.close);
    const rsiSeries = calculateRSISeries(closes);
    const latest = series[series.length - 1];

    const record = {
      symbol: meta.symbol,
      name: meta.name,
      sector: meta.sector,
      isETF: meta.isETF,
      price: latest.close,
      asOf: latest.date,
    };

    for (const { key, daysAgo } of RSI_SNAPSHOT_OFFSETS) {
      record[key] = snapshotRSI(rsiSeries, daysAgo);
    }

    return record;
  } catch {
    return null;
  }
}

async function refresh() {
  state.isRefreshing = true;
  state.startedAt = Date.now();
  let failed = 0;

  try {
    // Symbols come back in PSX's listing order, which is alphabetical —
    // matching the table's default sort — so the pages a visitor sees
    // first tend to fill in before the long tail of the list does.
    const symbols = await fetchSymbols();
    state.totalCount = symbols.length;
    state.loadedCount = 0;

    await runWithConcurrency(symbols, CONCURRENCY, async (meta) => {
      const record = await buildStockRecord(meta);
      state.loadedCount++;
      if (record) {
        state.bySymbol.set(meta.symbol, record);
      } else {
        failed++;
      }
    });

    state.failedSymbols = failed;
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
