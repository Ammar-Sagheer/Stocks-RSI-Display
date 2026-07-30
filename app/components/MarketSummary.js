"use client";

const RSI_TFS = ["daily", "weekly", "monthly"];

function Stat({ label, value, dot, hint }) {
  return (
    <div className="flex-1 min-w-[8rem] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1.5">
        {dot && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dot }}
          />
        )}
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
          {label}
        </span>
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none text-ink">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

/**
 * Market-breadth summary computed from every currently-loaded stock (not just
 * the visible page). A stock counts as overbought/oversold if ANY of its
 * three timeframes (daily/weekly/monthly) crosses the threshold — matching
 * the table, where a signal in any column flags that stock. The distribution
 * bar below the stats mirrors the RSI axis: oversold (low) on the left,
 * overbought (high) on the right.
 */
export default function MarketSummary({ stocks, period, thresholds }) {
  const { oversold: osLimit, overbought: obLimit } = thresholds;
  const values = (s) =>
    RSI_TFS.map((tf) => s.rsi?.[period]?.[tf]).filter((v) => v !== null && v !== undefined);
  const withRsi = stocks.filter((s) => values(s).length > 0);
  const overbought = withRsi.filter((s) => values(s).some((v) => v >= obLimit)).length;
  const oversold = withRsi.filter((s) => values(s).some((v) => v <= osLimit)).length;
  // Computed independently (not total - overbought - oversold): a stock with
  // e.g. Daily=25 and Weekly=75 counts in both extremes at once, so a plain
  // subtraction could go negative.
  const neutral = withRsi.filter(
    (s) => !values(s).some((v) => v >= obLimit) && !values(s).some((v) => v <= osLimit)
  ).length;

  const denom = oversold + neutral + overbought;
  const segments = [
    { key: "oversold", count: oversold, color: "var(--up)" },
    // Neutral is deliberately quiet but must still read as part of the bar —
    // half-strength muted ink stays visible on both the light and dark surface.
    { key: "neutral", count: neutral, color: "color-mix(in srgb, var(--ink-3) 45%, transparent)" },
    { key: "overbought", count: overbought, color: "var(--down)" },
  ].filter((seg) => seg.count > 0);

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm">
      <div className="flex flex-wrap divide-x divide-hairline">
        <Stat label="Tracked" value={stocks.length} />
        <Stat
          label="Oversold"
          value={oversold}
          dot="var(--up)"
          hint={`RSI ≤ ${osLimit} · any timeframe`}
        />
        <Stat
          label="Overbought"
          value={overbought}
          dot="var(--down)"
          hint={`RSI ≥ ${obLimit} · any timeframe`}
        />
        <Stat label="Neutral" value={neutral} />
      </div>
      {denom > 0 && (
        <div className="border-t border-hairline px-4 py-2.5 sm:px-5">
          <div
            className="flex h-1.5 gap-[2px]"
            role="img"
            aria-label={`Market breadth: ${oversold} oversold, ${neutral} neutral, ${overbought} overbought`}
          >
            {segments.map((seg) => (
              <span
                key={seg.key}
                className="rounded-full"
                style={{
                  width: `${(seg.count / denom) * 100}%`,
                  backgroundColor: seg.color,
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-ink-3">
            <span>← Oversold</span>
            <span>Overbought →</span>
          </div>
        </div>
      )}
    </section>
  );
}
