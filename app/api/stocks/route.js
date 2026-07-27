import { NextResponse } from "next/server";
import { getStockData } from "@/lib/cache";

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const data = await getStockData(scope === "all");
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load stock data" },
      { status: 500 }
    );
  }
}
