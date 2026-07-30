"use client";

import Link from "next/link";
import TopBar, { StarIcon } from "../components/TopBar";
import StocksView from "../components/StocksView";
import { useStocks, useWatchlist } from "../hooks";

export default function WatchlistPage() {
  const { stocks, updatedAt, usingFallback, loading, error, refresh } = useStocks();
  const { symbols: watchlist, toggle: toggleWatch } = useWatchlist();

  const watched = stocks.filter((s) => watchlist.includes(s.symbol));
  // Starred symbols whose data isn't in the current server cache scope (e.g.
  // a non-KSE-100 stock before "Load more" has run this session).
  const missing = watchlist.filter((sym) => !stocks.some((s) => s.symbol === sym));

  const emptyState = (
    <div className="rounded-xl border border-hairline bg-surface px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <StarIcon filled={false} className="h-5 w-5" />
      </div>
      <p className="font-medium text-ink">Your watchlist is empty</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">
        Star a stock on the{" "}
        <Link href="/" className="font-medium text-accent hover:underline">
          dashboard
        </Link>{" "}
        to track it here. The list is saved in this browser.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-page">
      <TopBar
        page="watchlist"
        subtitle="Your starred PSX stocks — saved in this browser"
        updatedAt={updatedAt}
        loading={loading}
        onRefresh={refresh}
        watchlistCount={watchlist.length}
      />

      <main className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 sm:px-6">
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

        {missing.length > 0 && !loading && (
          <p className="rounded-xl border border-hairline bg-surface px-4 py-2.5 text-xs text-ink-3 shadow-sm sm:text-sm">
            {missing.join(", ")} {missing.length === 1 ? "isn't" : "aren't"} loaded yet —
            open the{" "}
            <Link href="/" className="font-medium text-accent hover:underline">
              dashboard
            </Link>{" "}
            and press &ldquo;Load all other PSX stocks&rdquo; to fetch{" "}
            {missing.length === 1 ? "it" : "them"}.
          </p>
        )}

        <StocksView
          stocks={watched}
          loading={loading}
          contextLabel="watchlist"
          usingFallback={usingFallback}
          watchlist={watchlist}
          onToggleWatch={toggleWatch}
          emptyState={emptyState}
        />
      </main>
    </div>
  );
}
