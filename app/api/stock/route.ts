import { NextRequest, NextResponse } from "next/server";
import { yahooQuote } from "@/lib/yahooFinance";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (apiKey) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      const data = await res.json();
      if (!data["Information"] && !data["Note"]) {
        const quote = data["Global Quote"];
        if (quote?.["05. price"]) {
          return NextResponse.json({
            price: parseFloat(quote["05. price"]),
            change: parseFloat(quote["09. change"]),
            changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
            lastUpdated: quote["07. latest trading day"],
            source: "alphavantage",
          });
        }
      }
    } catch {
      // fall through to Yahoo
    }
  }

  try {
    const quote = await yahooQuote(ticker);
    return NextResponse.json({ ...quote, source: "yahoo" });
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch price: ${e}` }, { status: 500 });
  }
}
