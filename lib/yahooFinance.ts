const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

async function fetchChart(ticker: string, range: string) {
  const url = `${BASE}/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 },
  });
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No data from Yahoo Finance");
  return result;
}

export async function yahooQuote(ticker: string) {
  const result = await fetchChart(ticker, "1d");
  const meta = result.meta;
  const price: number = meta.regularMarketPrice;
  const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  const lastUpdated = new Date(meta.regularMarketTime * 1000).toISOString().split("T")[0];
  return { price, change, changePercent, lastUpdated };
}

export async function yahooHistory(ticker: string): Promise<{ date: string; close: number }[]> {
  const result = await fetchChart(ticker, "6mo");
  const timestamps: number[] = result.timestamp;
  const closes: number[] = result.indicators.quote[0].close;
  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      close: closes[i],
    }))
    .filter((p) => p.close != null);
}

export async function yahooFxRate(): Promise<number> {
  try {
    const result = await fetchChart("USDTWD=X", "5d");
    const closes: number[] = result.indicators.quote[0].close;
    const valid = closes.filter((c) => c != null);
    return valid.length > 0 ? valid[valid.length - 1] : 30.0;
  } catch {
    return 30.0;
  }
}
