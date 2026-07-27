import { fetchSymbols, fetchEodSeries } from "./psx";
import { calculateRSISeries, snapshotRSI, RSI_SNAPSHOT_OFFSETS } from "./rsi";

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

/**
 * Fetches every PSX symbol's data once, with limited concurrency, retrying
 * transient failures (connection resets/503s) after a cool-down instead of
 * dropping them for a whole cycle.
 *
 * Callbacks let callers observe progress incrementally (used by the
 * in-memory cache for its progressive-loading UI) without forcing every
 * caller to care about that — a caller that just wants the final list can
 * ignore them and use the returned `stocks` array.
 */
export async function fetchAllStocks({
  concurrency = 8,
  retryConcurrency = 4,
  retryDelayMs = 8000,
  onSymbolsLoaded,
  onRetryStart,
  onRecord,
} = {}) {
  let symbols;
  try {
    symbols = await fetchSymbols();
  } catch (err) {
    console.error(`[refresh] fetchSymbols failed after retries: ${err.name}: ${err.message}`);
    throw err;
  }
  onSymbolsLoaded?.(symbols.length);

  const bySymbol = new Map();
  const retryQueue = [];

  await runWithConcurrency(symbols, concurrency, async (meta) => {
    const { record, failed } = await processSymbol(meta);
    if (record) bySymbol.set(meta.symbol, record);
    else if (failed) retryQueue.push(meta);
    onRecord?.(meta, record, failed);
    // record === null && !failed means intentionally excluded — not retried
  });

  let failedSymbols = 0;
  if (retryQueue.length > 0) {
    onRetryStart?.(retryQueue.length);
    await sleep(retryDelayMs);

    await runWithConcurrency(retryQueue, retryConcurrency, async (meta) => {
      const { record, failed } = await processSymbol(meta);
      if (record) bySymbol.set(meta.symbol, record);
      else if (failed) failedSymbols++;
      onRecord?.(meta, record, failed);
    });
  }

  return {
    stocks: Array.from(bySymbol.values()),
    totalSymbols: symbols.length,
    failedSymbols,
  };
}
