const BASE_URL = "https://dps.psx.com.pk";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://dps.psx.com.pk/",
  Accept: "application/json, text/plain, */*",
};

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The unofficial PSX feed occasionally resets connections or returns
 * 503s under load, so transient failures are retried a few times
 * with a linear backoff before giving up.
 */
async function fetchJsonWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`Request to ${url} failed: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      const cause = err.cause
        ? ` cause: ${err.cause.code || err.cause.name || ""} ${err.cause.message || err.cause}`
        : "";
      console.error(
        `[psx] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${url}: ${err.name}: ${err.message}${cause}`
      );
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

/**
 * Fetches the full list of instruments listed on PSX and returns only
 * ordinary equities/ETFs (excludes bonds, TFCs, sukuks and other debt
 * instruments, which don't have a meaningful RSI).
 */
export async function fetchSymbols() {
  const all = await fetchJsonWithRetry(`${BASE_URL}/symbols`);
  return all
    .filter((s) => !s.isDebt)
    .map((s) => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sectorName,
      isETF: Boolean(s.isETF),
    }));
}

/**
 * Fetches the daily end-of-day price history for a single symbol.
 * Returns an ascending-by-date array of { date, close } points.
 */
export async function fetchEodSeries(symbol) {
  const json = await fetchJsonWithRetry(
    `${BASE_URL}/timeseries/eod/${encodeURIComponent(symbol)}`
  );
  const rows = Array.isArray(json?.data) ? json.data : [];
  // Each row: [unixTimestampSeconds, open, volume, close]
  return rows
    .map((row) => ({
      date: row[0] * 1000,
      close: row[3],
    }))
    .sort((a, b) => a.date - b.date);
}
