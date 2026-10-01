import { NextRequest, NextResponse } from "next/server";
import { OKX_BASE, okxHeaders, credsFromReq } from "@/lib/okx";

interface OKXFill {
  instId: string;
  side: string;
  fillSz: string;
  fillPx: string;
  fee: string;
  feeCcy: string;
  ts: string;
  tradeId: string;
  billId: string;
}

function normalizeFill(fill: OKXFill) {
  const [base, quote] = fill.instId.split("-");
  const amount = parseFloat(fill.fillSz);
  const priceUSD = parseFloat(fill.fillPx);
  const feeAbs = Math.abs(parseFloat(fill.fee));
  // If fee is in base currency (e.g. BTC on a BTC-USDT buy), convert to USD
  const feeUSD = fill.feeCcy === quote ? feeAbs : feeAbs * priceUSD;
  return {
    tradeId: fill.tradeId,
    date: new Date(parseInt(fill.ts)).toISOString().slice(0, 10),
    symbol: base,
    coinName: base,
    type: fill.side === "buy" ? "Buy" : "Sell",
    amount,
    priceUSD,
    fee: Math.max(0, feeUSD),
  };
}

// Paginate fills-history: up to 3 years, 100 per page, rate limit 10 req/2s
async function fetchFillsHistory(
  key: string,
  secret: string,
  passphrase: string
): Promise<OKXFill[]> {
  const all: OKXFill[] = [];
  let after = "";

  for (let page = 0; page < 100; page++) {
    const qs = `instType=SPOT&limit=100${after ? `&after=${after}` : ""}`;
    const path = `/api/v5/trade/fills-history?${qs}`;

    const res = await fetch(OKX_BASE + path, {
      headers: okxHeaders("GET", path, key, secret, passphrase),
    });
    const data = await res.json();

    if (data.code !== "0") throw new Error(`fills-history: ${data.msg ?? "OKX error"}`);
    if (!Array.isArray(data.data) || data.data.length === 0) break;

    all.push(...(data.data as OKXFill[]));
    if (data.data.length < 100) break; // last page

    // Use billId as cursor; if missing fall back to tradeId
    const last = (data.data as OKXFill[])[data.data.length - 1];
    const cursor = last.billId || last.tradeId;
    if (!cursor) break;
    after = cursor;

    await new Promise((r) => setTimeout(r, 220)); // stay within 10 req/2s
  }

  return all;
}

// Also fetch recent fills (last 3 months) to cover any gap
async function fetchRecentFills(
  key: string,
  secret: string,
  passphrase: string
): Promise<OKXFill[]> {
  const all: OKXFill[] = [];
  let after = "";

  for (let page = 0; page < 10; page++) {
    const qs = `instType=SPOT&limit=100${after ? `&after=${after}` : ""}`;
    const path = `/api/v5/trade/fills?${qs}`;

    const res = await fetch(OKX_BASE + path, {
      headers: okxHeaders("GET", path, key, secret, passphrase),
    });
    const data = await res.json();

    if (data.code !== "0") break; // non-fatal: fills-history covers this range too
    if (!Array.isArray(data.data) || data.data.length === 0) break;

    all.push(...(data.data as OKXFill[]));
    if (data.data.length < 100) break;

    const last = (data.data as OKXFill[])[data.data.length - 1];
    const cursor = last.billId || last.tradeId;
    if (!cursor) break;
    after = cursor;

    await new Promise((r) => setTimeout(r, 40)); // fills rate limit: 60 req/2s
  }

  return all;
}

export async function GET(req: NextRequest) {
  const { key, secret, passphrase } = credsFromReq(req);
  if (!key || !secret || !passphrase)
    return NextResponse.json({ error: "Missing OKX credentials" }, { status: 400 });

  try {
    // Fetch both history and recent; deduplicate by tradeId
    const [history, recent] = await Promise.all([
      fetchFillsHistory(key, secret, passphrase),
      fetchRecentFills(key, secret, passphrase),
    ]);

    const seen = new Set<string>();
    const merged: OKXFill[] = [];
    for (const fill of [...history, ...recent]) {
      if (!seen.has(fill.tradeId)) {
        seen.add(fill.tradeId);
        merged.push(fill);
      }
    }

    // Sort oldest → newest so WAVG cost basis is computed correctly on import
    merged.sort((a, b) => parseInt(a.ts) - parseInt(b.ts));

    const trades = merged.map(normalizeFill);
    return NextResponse.json({ trades, total: trades.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 502 }
    );
  }
}
