import { NextResponse } from "next/server";
import { fetchAllStocks } from "@/lib/refresh";
import { writeSnapshot, isRedisConfigured } from "@/lib/store";

// Fetching ~700+ symbols can take a while even at higher concurrency;
// this is the max Vercel allows on the Hobby plan for a Node.js function.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Triggered by Vercel Cron (see vercel.json). Not meant to be called
 * directly by the browser — protected by CRON_SECRET when that env var
 * is set, per Vercel's recommended pattern for securing cron endpoints.
 */
export async function GET(request) {
  if (!isRedisConfigured) {
    return NextResponse.json(
      {
        error:
          "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not configured — this route only applies to the Redis-backed deployment (e.g. Vercel).",
      },
      { status: 500 }
    );
  }

  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await fetchAllStocks({ concurrency: 12, retryConcurrency: 6, retryDelayMs: 5000 });
    await writeSnapshot({
      stocks: result.stocks,
      updatedAt: Date.now(),
      totalCount: result.totalSymbols,
      failedSymbols: result.failedSymbols,
    });
    return NextResponse.json({
      ok: true,
      stocks: result.stocks.length,
      totalSymbols: result.totalSymbols,
      failedSymbols: result.failedSymbols,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Refresh failed" }, { status: 500 });
  }
}
