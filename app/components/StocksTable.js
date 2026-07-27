"use client";

import { Fragment } from "react";
import RSIChart from "./RSIChart";
import { RSI_SNAPSHOT_OFFSETS } from "@/lib/rsi";

const COLUMNS = [
  { key: "symbol", label: "Symbol", sortable: true },
  { key: "name", label: "Name", sortable: false },
  { key: "sector", label: "Sector", sortable: false },
  { key: "price", label: "Price", sortable: true },
  ...RSI_SNAPSHOT_OFFSETS.map((o) => ({ key: o.key, label: o.label, sortable: true })),
];

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

export default function StocksTable({
  stocks,
  sortKey,
  sortDir,
  onSort,
  expandedSymbol,
  onToggleExpand,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-900">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable && onSort(col.key)}
                className={`px-3 py-2 text-left whitespace-nowrap ${
                  col.sortable ? "cursor-pointer select-none hover:bg-zinc-200 dark:hover:bg-zinc-800" : ""
                }`}
              >
                {col.label}
                {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
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
                <td className="px-3 py-2 font-medium whitespace-nowrap">{stock.symbol}</td>
                <td className="px-3 py-2 max-w-[220px] truncate">{stock.name}</td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{stock.sector}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatValue("price", stock.price)}</td>
                {RSI_SNAPSHOT_OFFSETS.map((o) => (
                  <td key={o.key} className={`px-3 py-2 whitespace-nowrap ${rsiColor(stock[o.key])}`}>
                    {formatValue(o.key, stock[o.key])}
                  </td>
                ))}
              </tr>
              {expandedSymbol === stock.symbol && (
                <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                  <td colSpan={COLUMNS.length} className="px-4 py-3">
                    <p className="text-xs text-zinc-500 mb-1">
                      RSI(14) trend — {stock.symbol}
                    </p>
                    <RSIChart history={stock.history} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {stocks.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-zinc-500">
                No stocks match your filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
