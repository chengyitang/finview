import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=trailingPE,epsTrailingTwelveMonths,forwardPE`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    const result = data?.quoteResponse?.result?.[0];
    if (!result) return NextResponse.json({ pe: null, eps: null, forwardPE: null });

    return NextResponse.json({
      pe: result.trailingPE ?? null,
      eps: result.epsTrailingTwelveMonths ?? null,
      forwardPE: result.forwardPE ?? null,
    });
  } catch {
    return NextResponse.json({ pe: null, eps: null, forwardPE: null });
  }
}
