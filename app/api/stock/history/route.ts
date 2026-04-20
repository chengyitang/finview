import { NextRequest, NextResponse } from "next/server";
import { yahooHistory } from "@/lib/yahooFinance";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      const data = await res.json();
      if (!data["Information"] && !data["Note"]) {
        const series = data["Time Series (Daily)"];
        if (series) {
          const points = Object.entries(series)
            .slice(0, 100)
            .reverse()
            .map(([date, values]) => ({
              date,
              close: parseFloat((values as Record<string, string>)["4. close"]),
            }));
          return NextResponse.json({ points, source: "alphavantage" });
        }
      }
    } catch {
      // fall through to Yahoo
    }
  }

  try {
    const points = await yahooHistory(ticker);
    return NextResponse.json({ points, source: "yahoo" });
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch history: ${e}` }, { status: 500 });
  }
}
