import { Transaction, ActivePosition, ClosedPosition } from "@/types";

export function normalizeTicker(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  return /^\d+$/.test(t) ? `${t}.TW` : t;
}

export function detectCurrency(symbol: string): "USD" | "TWD" {
  return symbol.endsWith(".TW") || symbol.endsWith(".TWO") ? "TWD" : "USD";
}

export function computeCashFlow(tx: Transaction): number {
  if (tx.cashFlow !== undefined && tx.cashFlow !== 0) return tx.cashFlow;
  const { shares, price, fee, type } = tx;
  if (type === "Buy") return -(shares * price + fee);
  if (type === "Sell") return shares * price - fee;
  if (type === "Dividend") return price; // price field holds dividend amount
  return 0;
}

export function aggregatePortfolio(
  transactions: Transaction[],
  prices: Record<string, number>,
  fxRate: number,
  displayCurrency: "USD" | "TWD"
): { active: ActivePosition[]; closed: ClosedPosition[] } {
  const grouped: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    const sym = normalizeTicker(tx.ticker);
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push({ ...tx, ticker: sym });
  }

  const active: ActivePosition[] = [];
  const closed: ClosedPosition[] = [];

  for (const [symbol, txs] of Object.entries(grouped)) {
    const nativeCurrency = detectCurrency(symbol);
    const conversionRate =
      nativeCurrency === "USD" && displayCurrency === "TWD"
        ? fxRate
        : nativeCurrency === "TWD" && displayCurrency === "USD"
        ? 1 / fxRate
        : 1;

    const stockName = txs[txs.length - 1].stockName || symbol;

    let totalBuyShares = 0;
    let totalSellShares = 0;
    let totalBuyCostNative = 0;
    let totalSellProceedsNative = 0;
    let dividendsNative = 0;
    let sumCashFlowsNative = 0;

    for (const tx of txs) {
      const cf = computeCashFlow(tx);
      sumCashFlowsNative += cf;

      if (tx.type === "Buy") {
        totalBuyShares += tx.shares;
        totalBuyCostNative += Math.abs(cf);
      } else if (tx.type === "Sell") {
        totalSellShares += tx.shares;
        totalSellProceedsNative += cf;
      } else if (tx.type === "Dividend") {
        dividendsNative += cf;
      } else if (tx.type === "Split") {
        totalBuyShares += tx.shares;
      }
    }

    const currentShares = totalBuyShares - totalSellShares;

    if (currentShares > 0.0001) {
      const avgCostNative = totalBuyShares > 0 ? totalBuyCostNative / totalBuyShares : 0;
      const currPriceNative = prices[symbol] ?? 0;
      const marketValueNative = currentShares * currPriceNative;
      const capitalGainNative = (currPriceNative - avgCostNative) * currentShares;
      const totalReturnNative = marketValueNative + sumCashFlowsNative;
      const netInvestedNative = totalBuyCostNative - totalSellProceedsNative - dividendsNative;
      const adjAvgCostNative = netInvestedNative / currentShares;
      const totalPct = avgCostNative > 0 ? ((currPriceNative - avgCostNative) / avgCostNative) * 100 : 0;

      active.push({
        symbol,
        stockName,
        currency: nativeCurrency,
        shares: currentShares,
        avgCost: avgCostNative * conversionRate,
        currentPrice: currPriceNative * conversionRate,
        marketValue: marketValueNative * conversionRate,
        totalDividends: dividendsNative * conversionRate,
        capitalGain: capitalGainNative * conversionRate,
        totalReturn: totalReturnNative * conversionRate,
        adjustedAvgCost: adjAvgCostNative * conversionRate,
        totalPct,
      });
    } else if (totalBuyShares > 0 || dividendsNative > 0) {
      const totalReturnNative = sumCashFlowsNative;
      const totalPct = totalBuyCostNative > 0 ? (totalReturnNative / totalBuyCostNative) * 100 : 0;

      closed.push({
        symbol,
        stockName,
        currency: nativeCurrency,
        realizedPL: (totalReturnNative - dividendsNative) * conversionRate,
        totalReturn: totalReturnNative * conversionRate,
        totalDividends: dividendsNative * conversionRate,
        totalInvested: totalBuyCostNative * conversionRate,
        totalPct,
      });
    }
  }

  return { active, closed };
}

export function calcRealizedTrend(
  transactions: Transaction[],
  fxRate: number,
  displayCurrency: "USD" | "TWD"
): Record<string, number> {
  const grouped: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    const sym = normalizeTicker(tx.ticker);
    if (!grouped[sym]) grouped[sym] = [];
    grouped[sym].push({ ...tx, ticker: sym });
  }

  // Find closed symbols
  const closedSymbols = new Set<string>();
  for (const [sym, txs] of Object.entries(grouped)) {
    const buys = txs.filter((t) => t.type === "Buy" || t.type === "Split").reduce((s, t) => s + t.shares, 0);
    const sells = txs.filter((t) => t.type === "Sell").reduce((s, t) => s + t.shares, 0);
    if (Math.abs(buys - sells) < 1e-6 && buys > 0) closedSymbols.add(sym);
  }

  const yearlyGains: Record<string, number> = {};

  for (const sym of closedSymbols) {
    const txs = grouped[sym].sort((a, b) => a.date.localeCompare(b.date));
    const nativeCurrency = detectCurrency(sym);
    const convRate =
      nativeCurrency === "USD" && displayCurrency === "TWD"
        ? fxRate
        : nativeCurrency === "TWD" && displayCurrency === "USD"
        ? 1 / fxRate
        : 1;

    let shares = 0;
    let totalCost = 0;

    for (const tx of txs) {
      const year = tx.date.slice(0, 4);
      if (tx.type === "Buy") {
        shares += tx.shares;
        totalCost += Math.abs(computeCashFlow(tx));
      } else if (tx.type === "Split") {
        shares += tx.shares;
      } else if (tx.type === "Sell") {
        const avgCost = shares > 0 ? totalCost / shares : 0;
        const proceeds = tx.shares * tx.price - tx.fee;
        const gain = (proceeds - tx.shares * avgCost) * convRate;
        shares -= tx.shares;
        totalCost -= tx.shares * avgCost;
        yearlyGains[year] = (yearlyGains[year] ?? 0) + gain;
      } else if (tx.type === "Dividend") {
        const gain = computeCashFlow(tx) * convRate;
        yearlyGains[year] = (yearlyGains[year] ?? 0) + gain;
      }
    }
  }

  return yearlyGains;
}
