import { fetchSymbols, fetchEodSeries, fetchKse100Symbols } from "./psx";
import { calculateRSISeries, snapshotRSI, RSI_SNAPSHOT_OFFSETS } from "./rsi";

const TTL_MS = 15 * 60 * 1000; // 15 minutes
// From a non-blocked IP (localhost in Pakistan, or a Pakistan-based VPS) PSX
// serves requests fine and tolerates plenty of parallelism, so the default is
// tuned for a fast fill. Foreign cloud IPs (Render, etc.) get their
// connections reset (UND_ERR_SOCKET) under load — if you must run there, set
// PSX_FETCH_CONCURRENCY=4 (or lower) to avoid tripping PSX's rate limiter.
const CONCURRENCY = Number(process.env.PSX_FETCH_CONCURRENCY) || 16;
const RETRY_CONCURRENCY = Number(process.env.PSX_RETRY_CONCURRENCY) || 8;
const RETRY_PASS_DELAY_MS = Number(process.env.PSX_RETRY_DELAY_MS) || 5000; // cool-down before retrying
const FALLBACK_CORE_SIZE = 100; // if KSE-100 can't be identified, use the first N symbols

// Two-phase, in-memory cache. "Core" = the KSE-100 index stocks, fetched up
// front so the meaningful ~100 stocks appear fast without hammering PSX with
// all ~750 requests at once. "Rest" = every other equity, fetched only once
// the user asks for it via the "Load more" button. Both phases merge records
// in one symbol at a time so the API never blocks on a full fetch. Because
// this lives in the server process's memory, it needs a long-lived server.
const state = {
  bySymbol: new Map(), // all loaded records, keyed by symbol (core + rest)
  coreSymbols: [], // KSE-100 metas (or the fallback first-N)
  restSymbols: [], // every other equity meta
  partitionReady: false, // symbol list + KSE-100 set fetched, partition known
  usingFallback: false, // KSE-100 couldn't be identified; core = first N symbols

  coreStarted: false,
  coreLoaded: 0,
  coreTotal: 0,
  coreDone: false,
  coreFailed: 0,

  restRequested: false, // user clicked "Load more" at least once
  restStarted: false,
  restLoaded: 0,
  restTotal: 0,
  restDone: false,
  restFailed: 0,

  updatedAt: null, // set whenever a phase finishes a full pass
};

let coreRefreshing = false;
let restRefreshing = false;

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
 * Fetches RSI for a group of symbols with limited concurrency, retrying
 * symbols that fail transiently once after a cool-down. `bumpLoaded` and
 * `bumpTotal` update the relevant phase's progress counters. Returns the
 * count still failing after the retry pass.
 */
async function fetchGroup(symbols, bumpLoaded, bumpTotal) {
  const retryQueue = [];

  await runWithConcurrency(symbols, CONCURRENCY, async (meta) => {
    const { record, failed } = await processSymbol(meta);
    bumpLoaded();
    if (record) state.bySymbol.set(meta.symbol, record);
    else if (failed) retryQueue.push(meta);
    // record === null && !failed means intentionally excluded — not retried
  });

  if (retryQueue.length === 0) return 0;

  // Grow the phase total to include the retry pass so the frontend keeps
  // showing progress (and polling quickly) until the retries finish.
  bumpTotal(retryQueue.length);
  await sleep(RETRY_PASS_DELAY_MS);

  let stillFailed = 0;
  await runWithConcurrency(retryQueue, RETRY_CONCURRENCY, async (meta) => {
    const { record, failed } = await processSymbol(meta);
    bumpLoaded();
    if (record) state.bySymbol.set(meta.symbol, record);
    else if (failed) stillFailed++;
  });
  return stillFailed;
}

// Fetches the equity list and the KSE-100 membership set, then splits the
// equities into core (KSE-100) and rest. Falls back to "first N symbols" as
// core if the KSE-100 set can't be identified, so the app still works.
async function loadPartition() {
  const symbols = await fetchSymbols();

  let kse100 = new Set();
  try {
    kse100 = await fetchKse100Symbols();
  } catch (err) {
    console.error(`[cache] KSE-100 lookup failed: ${err.name}: ${err.message}`);
  }

  if (kse100.size === 0) {
    state.usingFallback = true;
    state.coreSymbols = symbols.slice(0, FALLBACK_CORE_SIZE);
    state.restSymbols = symbols.slice(FALLBACK_CORE_SIZE);
  } else {
    state.usingFallback = false;
    state.coreSymbols = symbols.filter((s) => kse100.has(s.symbol));
    state.restSymbols = symbols.filter((s) => !kse100.has(s.symbol));
  }

  state.coreTotal = state.coreSymbols.length;
  state.restTotal = state.restSymbols.length;
  state.partitionReady = true;
}

async function refreshCore() {
  state.coreLoaded = 0;
  state.coreDone = false;
  try {
    await loadPartition();
  } catch (err) {
    console.error(`[cache] loadPartition failed after retries: ${err.name}: ${err.message}`);
    throw err;
  }
  state.coreFailed = await fetchGroup(
    state.coreSymbols,
    () => state.coreLoaded++,
    (n) => (state.coreTotal += n)
  );
  state.coreDone = true;
  state.updatedAt = Date.now();
}

async function refreshRest() {
  state.restLoaded = 0;
  state.restDone = false;
  state.restFailed = await fetchGroup(
    state.restSymbols,
    () => state.restLoaded++,
    (n) => (state.restTotal += n)
  );
  state.restDone = true;
  state.updatedAt = Date.now();
}

function triggerCore() {
  if (coreRefreshing) return;
  coreRefreshing = true;
  state.coreStarted = true;
  refreshCore()
    .catch(() => {})
    .finally(() => {
      coreRefreshing = false;
    });
}

function triggerRest() {
  if (restRefreshing || !state.partitionReady) return;
  restRefreshing = true;
  state.restStarted = true;
  refreshRest()
    .catch(() => {})
    .finally(() => {
      restRefreshing = false;
    });
}

/**
 * Returns whatever data is loaded right now without blocking. By default
 * only the KSE-100 "core" is fetched; pass `includeRest` (set once the user
 * clicks "Load more") to also fetch every other equity. `loadedCount` /
 * `totalCount` reflect the currently-active scope so the frontend's progress
 * bar works unchanged, and `hasMore` tells it when to show the button.
 */
export async function getStockData(includeRest = false) {
  const stale = !state.updatedAt || Date.now() - state.updatedAt > TTL_MS;

  if (!state.coreStarted || (stale && !coreRefreshing)) {
    triggerCore();
  }

  if (includeRest) state.restRequested = true;
  if (state.restRequested && state.partitionReady) {
    if (!state.restStarted || (stale && !restRefreshing)) {
      triggerRest();
    }
  }

  const showRest = state.restRequested;
  const loadedCount = showRest ? state.coreLoaded + state.restLoaded : state.coreLoaded;
  const totalCount = showRest ? state.coreTotal + state.restTotal : state.coreTotal;
  const failedSymbols = state.coreFailed + (showRest ? state.restFailed : 0);

  return {
    stocks: Array.from(state.bySymbol.values()),
    updatedAt: state.updatedAt,
    loadedCount,
    totalCount,
    failedSymbols,
    scope: showRest ? "all" : "core",
    hasMore: state.coreDone && !state.restRequested && state.restTotal > 0,
    restTotal: state.restTotal,
    usingFallback: state.usingFallback,
  };
}
