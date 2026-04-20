import { NextRequest, NextResponse } from "next/server";
import { yahooHistory } from "@/lib/yahooFinance";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const referenceDate = req.nextUrl.searchParams.get("referenceDate");
  if (!ticker || !referenceDate)
    return NextResponse.json({ error: "ticker and referenceDate are required" }, { status: 400 });

  async function compute30DayAvg(entries: { date: string; close: number }[]) {
    const tradingDays = entries
      .filter((p) => p.date <= referenceDate!)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
    if (tradingDays.length < 30) throw new Error("Not enough historical data for 30-day average");
    const avg = tradingDays.reduce((s, p) => s + p.close, 0) / tradingDays.length;
    return {
      avg: parseFloat(avg.toFixed(4)),
      periodStart: tradingDays[tradingDays.length - 1].date,
      periodEnd: tradingDays[0].date,
      tradingDays: tradingDays.length,
    };
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      const data = await res.json();
      if (!data["Information"] && !data["Note"]) {
        const series = data["Time Series (Daily)"];
        if (series) {
          const entries = Object.entries(series).map(([date, v]) => ({
            date,
            close: parseFloat((v as Record<string, string>)["4. close"]),
          }));
          const result = await compute30DayAvg(entries);
          return NextResponse.json({ ...result, source: "alphavantage" });
        }
      }
    } catch {
      // fall through to Yahoo
    }
  }

  try {
    const entries = await yahooHistory(ticker);
    const result = await compute30DayAvg(entries);
    return NextResponse.json({ ...result, source: "yahoo" });
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 });
  }
}
