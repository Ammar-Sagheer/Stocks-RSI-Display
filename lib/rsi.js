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

/**
 * Given a price series (ascending by date) and the RSI series computed
 * from it, snapshots the RSI value as of `daysAgo` trading days before
 * the most recent point.
 */
export function snapshotRSI(rsiSeries, daysAgo) {
  const index = rsiSeries.length - 1 - daysAgo;
  if (index < 0) return null;
  const value = rsiSeries[index];
  return value === null || value === undefined ? null : Number(value.toFixed(2));
}

export const RSI_SNAPSHOT_OFFSETS = [
  { key: "rsiNow", label: "RSI (Now)", daysAgo: 0 },
  { key: "rsi1d", label: "RSI (1D)", daysAgo: 1 },
  { key: "rsi3d", label: "RSI (3D)", daysAgo: 3 },
  { key: "rsi7d", label: "RSI (7D)", daysAgo: 7 },
  { key: "rsi15d", label: "RSI (15D)", daysAgo: 15 },
  { key: "rsi1m", label: "RSI (1M)", daysAgo: 30 },
];
