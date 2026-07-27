"use client";

import { Fragment } from "react";
import RSIChart from "./RSIChart";
import { RSI_SNAPSHOT_OFFSETS } from "@/lib/rsi";

const RSI_COLUMNS = RSI_SNAPSHOT_OFFSETS.map((o) => ({
  key: o.key,
  label: o.label.replace("RSI (", "").replace(")", ""),
  fullLabel: o.label,
}));

const COLUMN_COUNT = 3 + RSI_COLUMNS.length; // symbol, name, price + RSI columns

function rsiColor(value) {
  if (value === null || value === undefined) return "text-zinc-400";
  if (value >= 70) return "text-red-600 font-semibold";
  if (value <= 30) return "text-green-600 font-semibold";
  return "text-zinc-700 dark:text-zinc-200";
}

function formatValue(key, value) {
  if (value === null || value === undefined) return "—";
  if (key === "price") return Number(value).toFixed(2);
  return Number(value).toFixed(1);
}

function SortIndicator({ active, dir }) {
  if (!active) return null;
  return <span>{dir === "asc" ? " ▲" : " ▼"}</span>;
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
      {/* Desktop / tablet: fixed-width table, sized to never need horizontal scroll */}
      <div className="hidden sm:block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full table-fixed text-xs md:text-sm">
          <colgroup>
            <col style={{ width: "9%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "10%" }} />
            {RSI_COLUMNS.map((c) => (
              <col key={c.key} style={{ width: `${54 / RSI_COLUMNS.length}%` }} />
            ))}
          </colgroup>
          <thead className="bg-zinc-100 dark:bg-zinc-900">
            <tr>
              <th
                onClick={() => onSort("symbol")}
                className="px-2 py-2 text-left cursor-pointer select-none hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                Symbol
                <SortIndicator active={sortKey === "symbol"} dir={sortDir} />
              </th>
              <th className="px-2 py-2 text-left">Name</th>
              <th
                onClick={() => onSort("price")}
                className="px-2 py-2 text-left cursor-pointer select-none hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                Price
                <SortIndicator active={sortKey === "price"} dir={sortDir} />
              </th>
              {RSI_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  title={c.fullLabel}
                  className="px-2 py-2 text-left cursor-pointer select-none hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  {c.label}
                  <SortIndicator active={sortKey === c.key} dir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => (
              <Fragment key={stock.symbol}>
                <tr
                  onClick={() => onToggleExpand(stock.symbol)}
                  className="border-t border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-2 py-2 font-medium truncate">{stock.symbol}</td>
                  <td className="px-2 py-2 truncate" title={`${stock.name} — ${stock.sector}`}>
                    {stock.name}
                  </td>
                  <td className="px-2 py-2 truncate">{formatValue("price", stock.price)}</td>
                  {RSI_COLUMNS.map((c) => (
                    <td key={c.key} className={`px-2 py-2 truncate ${rsiColor(stock[c.key])}`}>
                      {formatValue(c.key, stock[c.key])}
                    </td>
                  ))}
                </tr>
                {expandedSymbol === stock.symbol && (
                  <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                    <td colSpan={COLUMN_COUNT} className="px-4 py-3">
                      <p className="text-xs text-zinc-500 mb-1">
                        {stock.sector} — RSI(14) trend for {stock.symbol}
                      </p>
                      <RSIChart history={stock.history} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {stocks.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-zinc-500">
                  No stocks match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards instead of a cramped scrolling table */}
      <div className="sm:hidden space-y-2">
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          >
            <button
              onClick={() => onToggleExpand(stock.symbol)}
              className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 active:bg-zinc-50 dark:active:bg-zinc-900/50"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {stock.symbol}{" "}
                  <span className="font-normal text-zinc-500 text-xs">{stock.name}</span>
                </div>
                <div className="text-xs text-zinc-400 truncate">{stock.sector}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm">{formatValue("price", stock.price)}</div>
                <div className={`text-xs ${rsiColor(stock.rsiNow)}`}>
                  RSI {formatValue("rsiNow", stock.rsiNow)}
                </div>
              </div>
            </button>
            <div className="px-3 pb-2 grid grid-cols-3 gap-y-1 text-center text-xs">
              {RSI_COLUMNS.map((c) => (
                <div key={c.key}>
                  <div className="text-zinc-400">{c.label}</div>
                  <div className={rsiColor(stock[c.key])}>{formatValue(c.key, stock[c.key])}</div>
                </div>
              ))}
            </div>
            {expandedSymbol === stock.symbol && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2">
                <RSIChart history={stock.history} />
              </div>
            )}
          </div>
        ))}
        {stocks.length === 0 && (
          <p className="text-center text-zinc-500 py-6">No stocks match your filter.</p>
        )}
      </div>
    </>
  );
}
