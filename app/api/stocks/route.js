import { NextResponse } from "next/server";
import { getStockData, refreshLivePrices } from "@/lib/cache";

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    // A user-pressed Refresh passes refresh=1: re-fetch live prices from the
    // single market-watch page and recompute RSI before answering (the heavy
    // per-symbol history crawl stays on its own TTL — intraday, history
    // bars don't change, only current prices do).
    if (params.get("refresh") === "1") {
      await refreshLivePrices();
    }
    const data = await getStockData(params.get("scope") === "all");
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load stock data" },
      { status: 500 }
    );
  }
}
