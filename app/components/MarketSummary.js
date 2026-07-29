"use client";

function StatTile({ label, value, accent, hint }) {
  return (
    <div className="flex-1 min-w-[7rem] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2.5 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {hint && <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</div>}
    </div>
  );
}

const RSI_KEYS = ["rsiDaily", "rsiWeekly", "rsiMonthly"];

/**
 * Market-breadth summary computed from every currently-loaded stock (not just
 * the visible page). A stock counts as overbought/oversold if ANY of its
 * three timeframes (daily/weekly/monthly) crosses the threshold — matching
 * the heatmap, where a red or green pill in any column signals that stock,
 * rather than only ever looking at the Daily column.
 */
export default function MarketSummary({ stocks }) {
  const values = (s) => RSI_KEYS.map((k) => s[k]).filter((v) => v !== null && v !== undefined);
  const withRsi = stocks.filter((s) => values(s).length > 0);
  const overbought = withRsi.filter((s) => values(s).some((v) => v >= 70)).length;
  const oversold = withRsi.filter((s) => values(s).some((v) => v <= 30)).length;
  // Computed independently (not total - overbought - oversold): a stock with
  // e.g. Daily=25 and Weekly=75 counts in both extremes at once, so a plain
  // subtraction could go negative.
  const neutral = withRsi.filter(
    (s) => !values(s).some((v) => v >= 70) && !values(s).some((v) => v <= 30)
  ).length;

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <StatTile label="Tracked" value={stocks.length} accent="text-zinc-900 dark:text-zinc-50" />
      <StatTile
        label="Overbought"
        value={overbought}
        accent="text-red-500 dark:text-red-400"
        hint="RSI ≥ 70 on any timeframe"
      />
      <StatTile
        label="Oversold"
        value={oversold}
        accent="text-emerald-500 dark:text-emerald-400"
        hint="RSI ≤ 30 on any timeframe"
      />
      <StatTile label="Neutral" value={neutral} accent="text-zinc-500 dark:text-zinc-400" />
    </div>
  );
}
