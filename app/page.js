"use client";

import { useEffect, useMemo, useState } from "react";
import StocksTable from "./components/StocksTable";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("symbol");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  async function load() {
    try {
      const res = await fetch("/api/stocks");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load data");
      setStocks(json.stocks);
      setUpdatedAt(json.updatedAt);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!cancelled) await load();
    }

    run();
    const interval = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        (s.name || "").toLowerCase().includes(q)
    );
  }, [stocks, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-screen-xl">
        <header className="mb-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            PSX Stocks RSI Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            RSI(14) for all Pakistan Stock Exchange equities, snapshotted now
            and 1, 3, 7, 15 and 30 trading days ago. Data source: PSX free
            end-of-day feed.
          </p>
        </header>

        <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <input
            type="text"
            placeholder="Search symbol or name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-64 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-zinc-500">
            {loading && <span>Loading — first load can take up to a minute…</span>}
            {!loading && updatedAt && (
              <span className="whitespace-nowrap">
                Updated {new Date(updatedAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <StocksTable
          stocks={pageItems}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          expandedSymbol={expandedSymbol}
          onToggleExpand={(symbol) =>
            setExpandedSymbol((cur) => (cur === symbol ? null : symbol))
          }
        />

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm text-zinc-500">
          <span>
            {sorted.length} stocks — page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              Rows:
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
