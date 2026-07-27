import { fetchAllStocks } from "./refresh";

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const CONCURRENCY = 8;
const RETRY_CONCURRENCY = 4;
const RETRY_PASS_DELAY_MS = 8000; // let PSX's rate limiter cool down before retrying

// Records are merged in as each symbol finishes, so both a cold cache and a
// periodic refresh serve partial/previous results immediately instead of
// blocking until every symbol is done. This in-memory backend is used when
// no external store (Redis) is configured — it needs a long-lived server
// process (Render, Railway, a VPS) to work, since the cache lives only in
// this module's memory.
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

async function refresh() {
  state.isRefreshing = true;
  state.startedAt = Date.now();
  state.loadedCount = 0;

  try {
    // Symbols come back in PSX's listing order, which is alphabetical —
    // matching the table's default sort — so the pages a visitor sees
    // first tend to fill in before the long tail of the list does.
    const result = await fetchAllStocks({
      concurrency: CONCURRENCY,
      retryConcurrency: RETRY_CONCURRENCY,
      retryDelayMs: RETRY_PASS_DELAY_MS,
      onSymbolsLoaded: (count) => {
        state.totalCount = count;
      },
      onRetryStart: (retryCount) => {
        // totalCount grows to include the retry pass so the frontend keeps
        // showing progress (and keeps polling quickly) instead of
        // reporting "done" before the retries finish.
        state.totalCount += retryCount;
      },
      onRecord: (meta, record) => {
        state.loadedCount++;
        if (record) state.bySymbol.set(meta.symbol, record);
      },
    });

    state.failedSymbols = result.failedSymbols;
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
