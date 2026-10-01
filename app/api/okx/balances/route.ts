import { NextRequest, NextResponse } from "next/server";
import { OKX_BASE, okxHeaders, credsFromReq } from "@/lib/okx";

export async function GET(req: NextRequest) {
  const { key, secret, passphrase } = credsFromReq(req);
  if (!key || !secret || !passphrase)
    return NextResponse.json({ error: "Missing OKX credentials" }, { status: 400 });

  const tradingPath = "/api/v5/account/balance";
  const fundingPath = "/api/v5/asset/balances";

  try {
    const [tradingRes, fundingRes] = await Promise.all([
      fetch(OKX_BASE + tradingPath, { headers: okxHeaders("GET", tradingPath, key, secret, passphrase) }),
      fetch(OKX_BASE + fundingPath, { headers: okxHeaders("GET", fundingPath, key, secret, passphrase) }),
    ]);

    const [trading, funding] = await Promise.all([tradingRes.json(), fundingRes.json()]);

    if (trading.code !== "0")
      return NextResponse.json({ error: trading.msg ?? "OKX error" }, { status: 502 });

    const result: Record<string, { trading: number; funding: number; valueUSD: number }> = {};

    for (const d of trading.data?.[0]?.details ?? []) {
      const amt = parseFloat(d.cashBal ?? d.availBal ?? "0");
      const usd = parseFloat(d.eqUsd ?? "0");
      if (amt > 1e-9) result[d.ccy] = { trading: amt, funding: 0, valueUSD: usd };
    }

    if (funding.code === "0") {
      for (const d of funding.data ?? []) {
        const amt = parseFloat(d.bal ?? "0");
        if (amt < 1e-9) continue;
        if (result[d.ccy]) {
          result[d.ccy].funding = amt;
        } else {
          result[d.ccy] = { trading: 0, funding: amt, valueUSD: 0 };
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Request failed" }, { status: 502 });
  }
}
