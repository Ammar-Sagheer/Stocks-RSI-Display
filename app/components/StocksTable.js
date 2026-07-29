"use client";

import { Fragment } from "react";
import RSIChart from "./RSIChart";
import { RSI_TIMEFRAMES } from "@/lib/rsi";

function tradingViewUrl(symbol) {
  return `https://www.tradingview.com/chart/?symbol=PSX:${encodeURIComponent(symbol)}`;
}

const RSI_COLUMNS = RSI_TIMEFRAMES.map((o) => ({
  key: o.key,
  label: o.label,
  fullLabel: `RSI(14) — ${o.label}`,
}));

const COLUMN_COUNT = 4 + RSI_COLUMNS.length; // symbol, name, price, RSI cols, volume

// Continuous green -> amber -> red heatmap keyed on RSI value, used for both
// the pill background and its text color. Oversold (low RSI) reads as green
// (a "buy" signal color), overbought (high RSI) as red — standard RSI
// convention — with a neutral amber around 50.
function rsiHeat(value) {
  if (value === null || value === undefined) {
    return { background: "transparent", color: "var(--rsi-muted, #71717a)" };
  }
  const v = Math.max(0, Math.min(100, value));
  const hue = v <= 50 ? 142 - (v / 50) * (142 - 45) : 45 - ((v - 50) / 50) * 45;
  return {
    backgroundColor: `hsla(${hue}, 72%, 45%, 0.16)`,
    color: `hsl(${hue}, 75%, 62%)`,
    border: `1px solid hsla(${hue}, 72%, 45%, 0.35)`,
  };
}

function formatValue(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "price") return Number(value).toFixed(2);
  return Number(value).toFixed(1);
}

function formatVolume(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (value >= 1e3) return (value / 1e3).toFixed(1) + "K";
  return String(value);
}

function SortIndicator({ active, dir }) {
  if (!active) return null;
  return <span className="text-blue-500 dark:text-blue-400">{dir === "asc" ? " ▲" : " ▼"}</span>;
}

function RSIBadge({ value }) {
  return (
    <span
      className="inline-block min-w-[3.2rem] rounded-md px-2 py-0.5 text-center font-medium tabular-nums"
      style={rsiHeat(value)}
    >
      {formatValue("rsi", value)}
    </span>
  );
}

function Kse100Tag() {
  return (
    <span className="ml-1.5 rounded border border-blue-400/30 bg-blue-500/10 px-1 py-px text-[10px] font-semibold tracking-wide text-blue-600 dark:text-blue-400 align-middle">
      100
    </span>
  );
}

export default function StocksTable({
  stocks,
  sortKey,
  sortDir,
  onSort,
  expandedSymbol,
  onToggleExpand,
}) {
  return (
    <>
      {/* Desktop / tablet: fixed-width table, sized to never need horizontal
          scroll, with a sticky header inside a scrollable body so long pages
          (e.g. 100 rows) keep the column headers in view. */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full table-fixed text-xs md:text-sm">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "8%" }} />
              {RSI_COLUMNS.map((c) => (
                <col key={c.key} style={{ width: `${39 / RSI_COLUMNS.length}%` }} />
              ))}
              <col style={{ width: "21%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-100/80 dark:supports-[backdrop-filter]:bg-zinc-900/80">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th
                  onClick={() => onSort("symbol")}
                  className="px-3 py-2.5 text-left font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-white"
                >
                  Symbol
                  <SortIndicator active={sortKey === "symbol"} dir={sortDir} />
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-zinc-600 dark:text-zinc-300">
                  Name
                </th>
                <th
                  onClick={() => onSort("price")}
                  className="px-3 py-2.5 text-right font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-white"
                >
                  Price
                  <SortIndicator active={sortKey === "price"} dir={sortDir} />
                </th>
                {RSI_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    title={c.fullLabel}
                    className="px-3 py-2.5 text-center font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-white"
                  >
                    {c.label}
                    <SortIndicator active={sortKey === c.key} dir={sortDir} />
                  </th>
                ))}
                <th
                  onClick={() => onSort("volume")}
                  title="Shares traded today"
                  className="px-3 py-2.5 text-right font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-white"
                >
                  Volume
                  <SortIndicator active={sortKey === "volume"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <Fragment key={stock.symbol}>
                  <tr
                    onClick={() => onToggleExpand(stock.symbol)}
                    className="border-t border-zinc-100 dark:border-zinc-800/70 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
                  >
                    <td className="px-3 py-2 font-semibold text-zinc-900 dark:text-zinc-50 whitespace-nowrap">
                      {stock.symbol}
                      {stock.isKse100 && <Kse100Tag />}
                    </td>
                    <td
                      className="px-3 py-2 truncate text-zinc-500 dark:text-zinc-400"
                      title={`${stock.name} — ${stock.sector}`}
                    >
                      {stock.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-100">
                      {formatValue("price", stock.price)}
                    </td>
                    {RSI_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-2 text-center">
                        <RSIBadge value={stock[c.key]} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatVolume(stock.volume)}
                    </td>
                  </tr>
                  {expandedSymbol === stock.symbol && (
                    <tr className="border-t border-zinc-100 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-900/40">
                      <td colSpan={COLUMN_COUNT} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-zinc-500">
                            {stock.sector} — RSI(14) trend for {stock.symbol}
                          </p>
                          <a
                            href={tradingViewUrl(stock.symbol)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                          >
                            Open on TradingView ↗
                          </a>
                        </div>
                        <RSIChart history={stock.history} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {stocks.length === 0 && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-3 py-10 text-center text-zinc-500">
                    No stocks match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards instead of a cramped scrolling table */}
      <div className="sm:hidden space-y-2">
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm"
          >
            <button
              onClick={() => onToggleExpand(stock.symbol)}
              className="w-full text-left active:bg-zinc-50 dark:active:bg-zinc-900/50"
            >
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                    {stock.symbol}
                    {stock.isKse100 && <Kse100Tag />}{" "}
                    <span className="font-normal text-zinc-500 text-xs">{stock.name}</span>
                  </div>
                  <div className="text-xs text-zinc-400 truncate">{stock.sector}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
                    {formatValue("price", stock.price)}
                  </div>
                  <div className="text-xs text-zinc-400">Vol {formatVolume(stock.volume)}</div>
                </div>
              </div>
              <div className="px-3 pb-2.5 grid grid-cols-3 gap-1.5 text-center text-xs">
                {RSI_COLUMNS.map((c) => (
                  <div key={c.key}>
                    <div className="text-zinc-400 mb-0.5">{c.label}</div>
                    <RSIBadge value={stock[c.key]} />
                  </div>
                ))}
              </div>
            </button>
            {expandedSymbol === stock.symbol && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2">
                <div className="flex justify-end mb-1">
                  <a
                    href={tradingViewUrl(stock.symbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Open on TradingView ↗
                  </a>
                </div>
                <RSIChart history={stock.history} />
              </div>
            )}
          </div>
        ))}
        {stocks.length === 0 && (
          <p className="text-center text-zinc-500 py-10">No stocks match your filter.</p>
        )}
      </div>
    </>
  );
}
