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

/**
 * Market-breadth summary computed from every currently-loaded stock (not just
 * the visible page), based on the Daily RSI(14) — mirrors how a trading
 * dashboard shows overbought/oversold breadth at a glance.
 */
export default function MarketSummary({ stocks }) {
  const withRsi = stocks.filter((s) => s.rsiDaily !== null && s.rsiDaily !== undefined);
  const overbought = withRsi.filter((s) => s.rsiDaily >= 70).length;
  const oversold = withRsi.filter((s) => s.rsiDaily <= 30).length;
  const neutral = withRsi.length - overbought - oversold;

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <StatTile label="Tracked" value={stocks.length} accent="text-zinc-900 dark:text-zinc-50" />
      <StatTile
        label="Overbought"
        value={overbought}
        accent="text-red-500 dark:text-red-400"
        hint="Daily RSI ≥ 70"
      />
      <StatTile
        label="Oversold"
        value={oversold}
        accent="text-emerald-500 dark:text-emerald-400"
        hint="Daily RSI ≤ 30"
      />
      <StatTile label="Neutral" value={neutral} accent="text-zinc-500 dark:text-zinc-400" />
    </div>
  );
}
