import { NextRequest, NextResponse } from "next/server";
import { OKX_BASE } from "@/lib/okx";

// Public OKX market data — no auth needed
export async function GET(req: NextRequest) {
  const symbols = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (symbols.length === 0) return NextResponse.json({});

  const STABLES = new Set(["USDT", "USDC", "USDG", "DAI", "TUSD", "BUSD", "USD"]);

  try {
    const res = await fetch(`${OKX_BASE}/api/v5/market/tickers?instType=SPOT`, {
      next: { revalidate: 30 },
    });
    const data = await res.json();
    if (data.code !== "0") return NextResponse.json({ error: data.msg }, { status: 502 });

    const result: Record<string, { price: number; change24h: number; high24h: number; low24h: number; vol24h: number }> = {};

    for (const ticker of data.data) {
      const [base, quote] = (ticker.instId as string).split("-");
      if (!["USDT", "USDC", "USD"].includes(quote)) continue;
      if (!symbols.includes(base)) continue;

      const price = parseFloat(ticker.last);
      const open24h = parseFloat(ticker.open24h);
      const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

      // Prefer USDT pairs
      if (!result[base] || quote === "USDT") {
        result[base] = {
          price,
          change24h,
          high24h: parseFloat(ticker.high24h),
          low24h: parseFloat(ticker.low24h),
          vol24h: parseFloat(ticker.volCcy24h ?? "0"),
        };
      }
    }

    // Stablecoins: always $1, 0% change
    for (const sym of symbols) {
      if (STABLES.has(sym) && !result[sym]) {
        result[sym] = { price: 1, change24h: 0, high24h: 1, low24h: 1, vol24h: 0 };
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
