"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StocksTable from "./components/StocksTable";
import MarketSummary from "./components/MarketSummary";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const IDLE_POLL_MS = 5 * 60 * 1000;
const LOADING_POLL_MS = 2000;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "oversold", label: "Oversold", hint: "RSI ≤ 30 on any timeframe" },
  { key: "overbought", label: "Overbought", hint: "RSI ≥ 70 on any timeframe" },
  { key: "kse100", label: "KSE-100" },
];

const RSI_TIMEFRAME_KEYS = ["rsiDaily", "rsiWeekly", "rsiMonthly"];
function rsiValues(stock) {
  return RSI_TIMEFRAME_KEYS.map((k) => stock[k]).filter((v) => v !== null && v !== undefined);
}

export default function Home() {
  const [stocks, setStocks] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [failedSymbols, setFailedSymbols] = useState(0);
  const [scope, setScope] = useState("core");
  const [hasMore, setHasMore] = useState(false);
  const [restTotal, setRestTotal] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [sortKey, setSortKey] = useState("symbol");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  // Read by the polling loop (whose closure is fixed on first render), so
  // clicking "Load more" switches every subsequent poll to the full scope.
  const wantAllRef = useRef(false);

  async function load() {
    try {
      const url = wantAllRef.current ? "/api/stocks?scope=all" : "/api/stocks";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load data");
      setStocks(json.stocks);
      setUpdatedAt(json.updatedAt);
      setLoadedCount(json.loadedCount);
      setTotalCount(json.totalCount);
      setFailedSymbols(json.failedSymbols);
      setScope(json.scope);
      setHasMore(json.hasMore);
      setRestTotal(json.restTotal);
      setUsingFallback(json.usingFallback);
      setError(null);
      return json;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  const timerRef = useRef(null);
  const pollCancelledRef = useRef(false);

  async function runPoll() {
    if (pollCancelledRef.current) return;
    const result = await load();
    if (pollCancelledRef.current) return;
    const stillFilling =
      !result || result.totalCount === 0 || result.loadedCount < result.totalCount;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runPoll, stillFilling ? LOADING_POLL_MS : IDLE_POLL_MS);
  }

  useEffect(() => {
    pollCancelledRef.current = false;
    runPoll();
    return () => {
      pollCancelledRef.current = true;
      clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLoadMore() {
    wantAllRef.current = true;
    setHasMore(false); // hide the button immediately; server confirms on next poll
    // Cancel any pending slow idle poll and immediately resume fast polling so
    // the rest of the stocks visibly fill in.
    clearTimeout(timerRef.current);
    runPoll();
  }

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleQuickFilter(key) {
    setQuickFilter(key);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stocks.filter((s) => {
      if (q && !s.symbol.toLowerCase().includes(q) && !(s.name || "").toLowerCase().includes(q)) {
        return false;
      }
      if (quickFilter === "oversold") return rsiValues(s).some((v) => v <= 30);
      if (quickFilter === "overbought") return rsiValues(s).some((v) => v >= 70);
      if (quickFilter === "kse100") return s.isKse100;
      return true;
    });
  }, [stocks, search, quickFilter]);

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

  const scopeLabel =
    scope === "all" ? "all PSX stocks" : usingFallback ? "top stocks" : "KSE-100 stocks";

  const visibleFilters = usingFallback ? FILTERS.filter((f) => f.key !== "kse100") : FILTERS;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/70 dark:supports-[backdrop-filter]:bg-zinc-950/70">
        <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                R
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                  PSX RSI Dashboard
                </h1>
                <p className="hidden sm:block text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight">
                  Daily / Weekly / Monthly RSI(14) — matches TradingView timeframes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500">
              {updatedAt && (
                <span className="hidden sm:inline whitespace-nowrap">
                  Updated {new Date(updatedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => {
                  setLoading(true);
                  load();
                }}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 py-4 space-y-4">
        <MarketSummary stocks={stocks} />

        {stillFilling && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2">
            <div className="flex items-center justify-between text-xs sm:text-sm text-blue-800 dark:text-blue-300 mb-1.5">
              <span>
                {totalCount === 0
                  ? "Fetching PSX symbol list…"
                  : `Loading ${scopeLabel} in the background — ${loadedCount} of ${totalCount} (${fillPercent}%)`}
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
          <p className="rounded-xl bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Search + quick filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <input
            type="text"
            placeholder="Search symbol or name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-64 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {visibleFilters.map((f) => {
              const active = quickFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => handleQuickFilter(f.key)}
                  title={f.hint}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

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

        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={handleLoadMore}
              className="rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              Load all other PSX stocks ({restTotal} more)
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs sm:text-sm text-zinc-500">
          <span>
            {sorted.length} stocks ({scope === "all" ? "all PSX" : usingFallback ? "top 100" : "KSE-100"})
            {" — "}page {currentPage} of {totalPages}
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
