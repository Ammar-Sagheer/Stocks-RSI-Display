import { NextResponse } from "next/server";
import { getRsiHistory } from "@/lib/cache";

// RSI(14) trend series for one symbol at one chart interval, computed on
// demand from the server-side price cache (so the main /api/stocks payload
// doesn't have to carry every stock's chart history at every interval).
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const symbol = params.get("symbol");
    const interval = params.get("interval") || "1D";
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    const history = getRsiHistory(symbol, interval);
    if (!history) {
      return NextResponse.json(
        { error: "Unknown symbol/interval or data not loaded yet" },
        { status: 404 }
      );
    }
    return NextResponse.json({ symbol, interval, history });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load history" },
      { status: 500 }
    );
  }
}
