"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StocksTable from "./components/StocksTable";
import MarketSummary from "./components/MarketSummary";
import { RSI_PERIODS } from "@/lib/rsi";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PERIOD = 14;
const IDLE_POLL_MS = 5 * 60 * 1000;
const LOADING_POLL_MS = 2000;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "oversold", label: "Oversold" },
  { key: "overbought", label: "Overbought" },
  { key: "kse100", label: "KSE-100" },
];

const RSI_TFS = ["daily", "weekly", "monthly"];
function rsiValues(stock, period) {
  return RSI_TFS.map((tf) => stock.rsi?.[period]?.[tf]).filter(
    (v) => v !== null && v !== undefined
  );
}

// The RSI sort columns keep stable keys across period switches; everything
// else sorts on the stock record's own field.
const TF_BY_SORT_KEY = { rsiDaily: "daily", rsiWeekly: "weekly", rsiMonthly: "monthly" };
function sortValue(stock, key, period) {
  const tf = TF_BY_SORT_KEY[key];
  if (tf) return stock.rsi?.[period]?.[tf] ?? null;
  return stock[key];
}

function BrandMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <polyline points="2 12 6.5 12 9.5 5 14.5 19 17.5 12 22 12" />
      </svg>
    </div>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`}
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  );
}

function ThresholdLegend({ thresholds }) {
  return (
    <div className="hidden items-center gap-3 text-[11px] text-ink-3 lg:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--up)" }} />
        ≤ {thresholds.oversold} oversold
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--down)" }} />
        ≥ {thresholds.overbought} overbought
      </span>
    </div>
  );
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
  const [period, setPeriod] = useState(DEFAULT_PERIOD);

  const periodConfig =
    RSI_PERIODS.find((p) => p.period === period) ?? RSI_PERIODS[0];
  const thresholds = {
    oversold: periodConfig.oversold,
    overbought: periodConfig.overbought,
  };

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
      if (quickFilter === "oversold")
        return rsiValues(s, period).some((v) => v <= thresholds.oversold);
      if (quickFilter === "overbought")
        return rsiValues(s, period).some((v) => v >= thresholds.overbought);
      if (quickFilter === "kse100") return s.isKse100;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, search, quickFilter, period]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey, period);
      const bv = sortValue(b, sortKey, period);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortDir, period]);

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
    <div className="min-h-screen bg-page">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-page/90 backdrop-blur supports-[backdrop-filter]:bg-page/75">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <div>
                <h1 className="text-base font-semibold leading-tight text-ink sm:text-lg">
                  PSX RSI Dashboard
                </h1>
                <p className="hidden text-[11px] leading-tight text-ink-3 sm:block">
                  Daily / Weekly / Monthly RSI({period}) — matches TradingView timeframes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-3 sm:text-sm">
              {updatedAt && (
                <span className="hidden items-center gap-1.5 whitespace-nowrap sm:flex">
                  <span
                    className="animate-live-pulse h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--up)" }}
                  />
                  Updated {new Date(updatedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => {
                  setLoading(true);
                  load();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm transition-colors hover:bg-surface-2 hover:text-ink sm:text-sm"
              >
                <RefreshIcon spinning={loading} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 sm:px-6">
        <MarketSummary stocks={stocks} period={period} thresholds={thresholds} />

        {stillFilling && (
          <div className="rounded-xl border border-hairline bg-surface px-4 py-2.5 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2 sm:text-sm">
              <span>
                {totalCount === 0
                  ? "Fetching PSX symbol list…"
                  : `Loading ${scopeLabel} in the background — ${loadedCount} of ${totalCount} (${fillPercent}%)`}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${totalCount === 0 ? 5 : fillPercent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p
            className="rounded-xl border px-4 py-2.5 text-sm"
            style={{
              borderColor: "color-mix(in srgb, var(--down) 30%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--down) 8%, var(--surface))",
              color: "var(--down)",
            }}
          >
            {error}
          </p>
        )}

        {/* Search + quick filters + threshold legend */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="relative block w-full sm:w-64">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
                <SearchIcon />
              </span>
              <input
                type="text"
                placeholder="Search symbol or name…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-hairline bg-surface py-1.5 pl-9 pr-3 text-sm text-ink shadow-sm outline-none placeholder:text-ink-3 focus:border-accent/50 focus:ring-2 focus:ring-accent/25"
              />
            </label>
            {/* RSI look-back period. Shorter periods = faster, wider-threshold
                signals suited to shorter holds (RSI(2)/RSI(5) for swing entries). */}
            <label className="flex w-fit items-center gap-1.5 text-xs text-ink-3">
              Period:
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(Number(e.target.value));
                  setPage(1);
                }}
                title="RSI look-back period — shorter reacts faster (better for short holds)"
                className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs font-medium text-ink shadow-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/25"
              >
                {RSI_PERIODS.map((p) => (
                  <option key={p.period} value={p.period}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex w-fit gap-0.5 rounded-lg bg-surface-2 p-0.5">
              {visibleFilters.map((f) => {
                const hint =
                  f.key === "oversold"
                    ? `RSI(${period}) ≤ ${thresholds.oversold} on any timeframe`
                    : f.key === "overbought"
                      ? `RSI(${period}) ≥ ${thresholds.overbought} on any timeframe`
                      : undefined;
                const active = quickFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => handleQuickFilter(f.key)}
                    title={hint}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-surface text-ink shadow-sm"
                        : "text-ink-3 hover:text-ink-2"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ThresholdLegend thresholds={thresholds} />
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-ink-3">Loading…</p>
        ) : (
          <StocksTable
            stocks={pageItems}
            period={period}
            thresholds={thresholds}
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
              className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/50"
            >
              Load all other PSX stocks ({restTotal} more)
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 pb-4 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <span>
            {sorted.length} stocks ({scope === "all" ? "all PSX" : usingFallback ? "top 100" : "KSE-100"})
            {" — "}page {currentPage} of {totalPages}
            {!stillFilling && failedSymbols > 0 && (
              <span style={{ color: "var(--warning)" }}>
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
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-ink-2"
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
                className="rounded-md border border-hairline bg-surface px-3 py-1 text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-hairline bg-surface px-3 py-1 text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
