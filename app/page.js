"use client";

import { useEffect, useMemo, useState } from "react";
import StocksTable from "./components/StocksTable";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const IDLE_POLL_MS = 5 * 60 * 1000;
const LOADING_POLL_MS = 2000;

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [failedSymbols, setFailedSymbols] = useState(0);
  const [backend, setBackend] = useState(null);
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
      setLoadedCount(json.loadedCount);
      setTotalCount(json.totalCount);
      setFailedSymbols(json.failedSymbols);
      setBackend(json.backend);
      setError(null);
      return json;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      if (cancelled) return;
      const result = await load();
      if (cancelled) return;
      const stillFilling =
        !result || result.totalCount === 0 || result.loadedCount < result.totalCount;
      timer = setTimeout(tick, stillFilling ? LOADING_POLL_MS : IDLE_POLL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
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

  const stillFilling = totalCount === 0 || loadedCount < totalCount;
  const fillPercent = totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 0;

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
            {updatedAt && (
              <span className="whitespace-nowrap">
                Updated {new Date(updatedAt).toLocaleString()}
              </span>
            )}
            {backend === "memory" && (
              <span
                className="whitespace-nowrap text-amber-600 dark:text-amber-500"
                title="No shared cache (Redis) is configured — each server instance keeps its own cache in memory, which doesn't work reliably on serverless hosts like Vercel."
              >
                (in-memory cache — no Redis configured)
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

        {stillFilling && (
          <div className="mb-3 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 px-3 py-2">
            <div className="flex items-center justify-between text-xs sm:text-sm text-blue-800 dark:text-blue-300 mb-1.5">
              <span>
                {totalCount === 0
                  ? "Fetching PSX symbol list…"
                  : `Loading stocks in the background — ${loadedCount} of ${totalCount} (${fillPercent}%)`}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-blue-100 dark:bg-blue-900 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${totalCount === 0 ? 5 : fillPercent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-md bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500 py-6 text-center">Loading…</p>
        ) : (
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
        )}

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm text-zinc-500">
          <span>
            {sorted.length} stocks — page {currentPage} of {totalPages}
            {!stillFilling && failedSymbols > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                {" "}
                · {failedSymbols} symbol{failedSymbols === 1 ? "" : "s"} unavailable
                (PSX feed error) — will retry on next refresh
              </span>
            )}
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
