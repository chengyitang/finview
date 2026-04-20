import { NextResponse } from "next/server";
import { yahooFxRate } from "@/lib/yahooFinance";

export async function GET() {
  try {
    const rate = await yahooFxRate();
    return NextResponse.json({ rate, pair: "USDTWD" });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
