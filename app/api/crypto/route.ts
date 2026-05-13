import { NextRequest, NextResponse } from "next/server";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2", DOT: "polkadot",
  MATIC: "matic-network", LINK: "chainlink", UNI: "uniswap", LTC: "litecoin",
  DOGE: "dogecoin", SHIB: "shiba-inu", ATOM: "cosmos", NEAR: "near",
  APT: "aptos", ARB: "arbitrum", OP: "optimism", SUI: "sui",
  TIA: "celestia", INJ: "injective-protocol", PEPE: "pepe",
  FTM: "fantom", ALGO: "algorand", XLM: "stellar", VET: "vechain",
  HBAR: "hedera-hashgraph", ICP: "internet-computer", FIL: "filecoin",
  AAVE: "aave", MKR: "maker", CRV: "curve-dao-token", GRT: "the-graph",
  MANA: "decentraland", SAND: "the-sandbox", AXS: "axie-infinity",
  TON: "the-open-network", TRX: "tron", XTZ: "tezos",
  BCH: "bitcoin-cash", ETC: "ethereum-classic", XMR: "monero",
  USDT: "tether", USDC: "usd-coin", DAI: "dai", STETH: "staked-ether",
  WBTC: "wrapped-bitcoin", NOT: "notcoin", WIF: "dogwifcoin",
  BONK: "bonk", JUP: "jupiter-exchange-solana", PYTH: "pyth-network",
  WLD: "worldcoin-wld", TAO: "bittensor", RENDER: "render-token",
  FET: "fetch-ai", AGIX: "singularitynet",
};

export async function GET(req: NextRequest) {
  const symbols = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (symbols.length === 0) return NextResponse.json({});

  const idToSymbol: Record<string, string> = {};
  const ids = symbols.map((s) => {
    const id = COINGECKO_IDS[s] ?? s.toLowerCase();
    idToSymbol[id] = s;
    return id;
  }).join(",");

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return NextResponse.json({ error: "CoinGecko unavailable" }, { status: 502 });
    const data = await res.json();

    const result: Record<string, number> = {};
    for (const [id, sym] of Object.entries(idToSymbol)) {
      if ((data[id] as { usd?: number })?.usd != null) {
        result[sym] = (data[id] as { usd: number }).usd;
      }
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 502 });
  }
}
