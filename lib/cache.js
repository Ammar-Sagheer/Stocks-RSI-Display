import { fetchSymbols, fetchEodSeries } from "./psx";
import { calculateRSISeries, snapshotRSI, RSI_SNAPSHOT_OFFSETS } from "./rsi";

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const CONCURRENCY = 8;

const cache = {
  stocks: [],
  updatedAt: null,
  isRefreshing: false,
  refreshPromise: null,
  failedSymbols: 0,
};

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const current = nextIndex++;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    return runNext();
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(runners);
  return results;
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
  const symbols = await fetchSymbols();
  const results = await runWithConcurrency(symbols, CONCURRENCY, buildStockRecord);
  const stocks = results.filter(Boolean);

  cache.stocks = stocks;
  cache.updatedAt = Date.now();
  cache.failedSymbols = symbols.length - stocks.length;
}

/**
 * Returns cached stock data, serving stale data immediately while
 * refreshing in the background once the TTL has elapsed. On a cold
 * cache, the caller awaits the first fetch.
 */
export async function getStockData() {
  const isStale = !cache.updatedAt || Date.now() - cache.updatedAt > TTL_MS;

  if (!cache.updatedAt) {
    if (!cache.refreshPromise) {
      cache.isRefreshing = true;
      cache.refreshPromise = refresh().finally(() => {
        cache.isRefreshing = false;
        cache.refreshPromise = null;
      });
    }
    await cache.refreshPromise;
  } else if (isStale && !cache.isRefreshing) {
    cache.isRefreshing = true;
    cache.refreshPromise = refresh().finally(() => {
      cache.isRefreshing = false;
      cache.refreshPromise = null;
    });
  }

  return {
    stocks: cache.stocks,
    updatedAt: cache.updatedAt,
    isRefreshing: cache.isRefreshing,
    failedSymbols: cache.failedSymbols,
  };
}
