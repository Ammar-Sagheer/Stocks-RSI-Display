const RSI_PERIOD = 14;

/**
 * Computes Wilder's RSI(14) for a series of closing prices.
 * Returns an array the same length as `closes`, where entries before
 * enough history has accumulated are `null`.
 */
export function calculateRSISeries(closes, period = RSI_PERIOD) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length <= period) return rsi;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += -change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi[period] = toRSI(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = toRSI(avgGain, avgLoss);
  }

  return rsi;
}

function toRSI(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Returns the most recent non-null RSI value in a series, rounded, or null. */
export function lastRSIValue(rsiSeries) {
  for (let i = rsiSeries.length - 1; i >= 0; i--) {
    const v = rsiSeries[i];
    if (v !== null && v !== undefined) return Number(v.toFixed(2));
  }
  return null;
}

/** Computes RSI(14) for a series of closes and returns its latest value. */
export function latestRSI(closes) {
  return lastRSIValue(calculateRSISeries(closes));
}

/**
 * Resamples a daily price series (ascending by date, `[{ date, close }]`)
 * into weekly or monthly closing prices — the close of the last trading day
 * in each period — matching how TradingView builds weekly/monthly candles.
 * The current (still-forming) week/month is included with its latest close,
 * just like TradingView's live candle.
 */
export function resampleCloses(series, granularity) {
  const buckets = new Map(); // period key -> last close seen (series is ascending)
  for (const p of series) {
    const d = new Date(p.date);
    let key;
    if (granularity === "month") {
      key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    } else {
      // Monday of this date's week (days-since-Monday back from the date).
      const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const daysSinceMonday = (day.getUTCDay() + 6) % 7;
      day.setUTCDate(day.getUTCDate() - daysSinceMonday);
      key = day.getTime();
    }
    buckets.set(key, p.close);
  }
  return [...buckets.values()];
}

/**
 * Back-adjusts a daily series (ascending `[{ date, close }]`) for stock splits
 * and bonus issues. On PSX the normal daily price limit is ~10%, so any
 * single-day move beyond ±20% is almost always a corporate action, not real
 * trading — e.g. a 1:1 bonus halves the quoted price overnight. All prices
 * before such a day are scaled by the gap ratio so the series is continuous,
 * the same split/bonus-adjusted prices TradingView shows. Without this, the
 * artificial jump poisons Wilder's RSI for weeks. Series with no such gap are
 * returned unchanged, so only stocks with an actual split/bonus are affected.
 */
export function adjustForCorporateActions(series) {
  const n = series.length;
  if (n < 2) return series;

  const factors = new Array(n).fill(1);
  let factor = 1;
  for (let i = n - 1; i >= 1; i--) {
    const ratio = series[i].close / series[i - 1].close;
    // Number.isFinite also rejects a zero/invalid close producing Infinity
    // or NaN here — such a ratio is a data glitch, not a real corporate
    // action, and must never be allowed to poison the scaling factor for
    // every earlier price in the series.
    if (Number.isFinite(ratio) && ratio > 0 && (ratio < 0.8 || ratio > 1.25)) {
      factor *= ratio;
    }
    factors[i - 1] = factor;
  }

  if (factor === 1) return series; // no corporate action detected
  return series.map((p, i) => ({ ...p, close: p.close * factors[i] }));
}

// The RSI columns shown in the table: RSI(14) on daily, weekly and monthly
// candles — the same values TradingView shows when the chart timeframe is set
// to 1D / 1W / 1M. (Intraday timeframes aren't possible: PSX's free feed is
// end-of-day only.)
export const RSI_TIMEFRAMES = [
  { key: "rsiDaily", label: "Daily", granularity: "day" },
  { key: "rsiWeekly", label: "Weekly", granularity: "week" },
  { key: "rsiMonthly", label: "Monthly", granularity: "month" },
];
