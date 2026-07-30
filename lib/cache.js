import { fetchSymbols, fetchEodSeries, fetchMarketWatch } from "./psx";
import {
  calculateRSISeries,
  lastRSIValue,
  resampleSeries,
  adjustForCorporateActions,
  RSI_INTERVALS,
} from "./rsi";

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
  seriesBySymbol: new Map(), // adjusted daily {date, close} series, server-side only (for /api/history)
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

  // Back-adjust for splits/bonuses so an artificial price jump (e.g. a 1:1
  // bonus halving the price) doesn't poison RSI for weeks — matches how
  // TradingView shows adjusted prices. Newest bars keep their scale.
  const adjustedSeries = adjustForCorporateActions(series);

  // The timeseries/eod feed's most recent "close" is stale during a live
  // session (it lags the current price), which throws the latest RSI off vs
  // TradingView. Overwrite the last bar's close with the live market-watch
  // current price (same scale as the newest, unadjusted bars).
  const price = meta.currentPrice != null && meta.currentPrice > 0 ? meta.currentPrice : latest.close;
  const adjusted = adjustedSeries.slice();
  adjusted[adjusted.length - 1] = { ...adjusted[adjusted.length - 1], close: price };

  // Latest RSI(14) at every selectable chart interval, each computed on
  // candles resampled from the full daily history — matches TradingView's
  // RSI at that chart interval. All intervals share the same closes, so
  // the grid is nearly free to compute and the frontend switches intervals
  // instantly without refetching. Chart history is NOT shipped here — the
  // /api/history endpoint computes it on demand from `seriesBySymbol`,
  // which keeps the main payload small.
  const rsi = {};
  for (const interval of RSI_INTERVALS) {
    const closes = resampleSeries(adjusted, interval).map((p) => p.close);
    rsi[interval.key] = lastRSIValue(calculateRSISeries(closes));
  }

  const record = {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    isETF: meta.isETF,
    isKse100: Boolean(meta.isKse100),
    price,
    volume: meta.volume ?? null,
    asOf: latest.date,
    rsi,
  };

  state.seriesBySymbol.set(meta.symbol, adjusted);
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

// Fetches the equity list and the market-watch data (KSE-100 membership +
// live current prices), attaches each symbol's current price to its meta, and
// splits the equities into core (KSE-100) and rest. Falls back to "first N
// symbols" as core if market-watch can't be reached, so the app still works.
async function loadPartition() {
  const symbols = await fetchSymbols();

  let marketWatch = new Map();
  try {
    marketWatch = await fetchMarketWatch();
  } catch (err) {
    console.error(`[cache] market-watch lookup failed: ${err.name}: ${err.message}`);
  }

  for (const s of symbols) {
    const info = marketWatch.get(s.symbol);
    s.currentPrice = info && info.current != null ? info.current : undefined;
    s.volume = info && info.volume != null ? info.volume : undefined;
    s.isKse100 = Boolean(info?.isKse100);
  }

  const kse100Count = [...marketWatch.values()].filter((v) => v.isKse100).length;
  if (kse100Count === 0) {
    state.usingFallback = true;
    state.coreSymbols = symbols.slice(0, FALLBACK_CORE_SIZE);
    state.restSymbols = symbols.slice(FALLBACK_CORE_SIZE);
  } else {
    state.usingFallback = false;
    state.coreSymbols = symbols.filter((s) => marketWatch.get(s.symbol)?.isKse100);
    state.restSymbols = symbols.filter((s) => !marketWatch.get(s.symbol)?.isKse100);
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
/**
 * Computes the RSI(14) trend series for one symbol at one chart interval,
 * on demand, from the server-side cached daily series. Returns the last
 * ~150 points as `[{ date, rsi }]`, or null when the symbol isn't loaded
 * yet or the interval key is unknown.
 */
export function getRsiHistory(symbol, intervalKey) {
  const interval = RSI_INTERVALS.find((iv) => iv.key === intervalKey);
  const series = state.seriesBySymbol.get(symbol);
  if (!interval || !series) return null;

  const resampled = resampleSeries(series, interval);
  const rsiSeries = calculateRSISeries(resampled.map((p) => p.close));
  return resampled
    .map((p, i) => ({ date: p.date, rsi: rsiSeries[i] }))
    .filter((p) => p.rsi !== null && p.rsi !== undefined)
    .slice(-150)
    .map((p) => ({ date: p.date, rsi: Number(p.rsi.toFixed(2)) }));
}

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
