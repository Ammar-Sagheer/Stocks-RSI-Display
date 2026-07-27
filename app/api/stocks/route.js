import { NextResponse } from "next/server";
import { getStockData } from "@/lib/cache";

export async function GET() {
  try {
    const data = await getStockData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load stock data" },
      { status: 500 }
    );
  }
}
