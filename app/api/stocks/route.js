import { NextResponse } from "next/server";
import { getStockData } from "@/lib/cache";
import { fetchAllStocks } from "@/lib/refresh";
import { readSnapshot, writeSnapshot, isRedisConfigured } from "@/lib/store";

// Only exercised on the Redis-backed path, for the rare case a visitor
// hits the site before the first cron run has ever populated the store.
export const maxDuration = 60;

export async function GET() {
  try {
    if (isRedisConfigured) {
      let snapshot = await readSnapshot();

      if (!snapshot) {
        // Bootstrap: nothing cached yet (first deploy, before any cron
        // run). Fetch once inline and persist it so every request after
        // this one is instant. Concurrent visitors during this window
        // will each attempt the same bootstrap — wasteful but harmless,
        // and self-resolves the moment the first one finishes.
        const result = await fetchAllStocks({
          concurrency: 12,
          retryConcurrency: 6,
          retryDelayMs: 5000,
        });
        snapshot = {
          stocks: result.stocks,
          updatedAt: Date.now(),
          totalCount: result.totalSymbols,
          failedSymbols: result.failedSymbols,
        };
        await writeSnapshot(snapshot);
      }

      return NextResponse.json({
        stocks: snapshot.stocks,
        updatedAt: snapshot.updatedAt,
        isRefreshing: false,
        loadedCount: snapshot.stocks.length,
        totalCount: snapshot.totalCount,
        failedSymbols: snapshot.failedSymbols,
      });
    }

    const data = await getStockData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load stock data" },
      { status: 500 }
    );
  }
}
