"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Transaction, ActivePosition, ClosedPosition } from "@/types";
import { loadTransactions, saveTransactions, loadAssetsHistory, saveAssetsHistory } from "@/lib/storage";
import { normalizeTicker, detectCurrency, aggregatePortfolio } from "@/lib/portfolio";
import KPICard from "@/components/ui/KPICard";
import { useToast, ToastContainer } from "@/components/ui/Toast";
import {
  PieChart, Pie, Cell, Tooltip, LineChart, Line, CartesianGrid, XAxis, YAxis,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const CURRENT_YEAR = new Date().getFullYear();

const TX_TYPES = ["Buy", "Sell", "Dividend", "Split"] as const;
const COLORS = ["#3b82f6", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6"];

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  ticker: "",
  stockName: "",
  type: "Buy" as Transaction["type"],
  shares: "",
  price: "",
  fee: "0",
};

const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

type MarketFilter = "all" | "US" | "TW";

export default function PortfolioPage() {
  const { toasts, addToast, dismiss } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "TWD">("USD");
  const [fxRate, setFxRate] = useState<number>(30);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "closed" | "transactions">("active");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [assetsHistory, setAssetsHistory] = useState<Record<string, Record<number, number>>>({});
  const [chartPos, setChartPos] = useState<ActivePosition | null>(null);
  const [chartPoints, setChartPoints] = useState<{ date: string; close: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    setTransactions(loadTransactions());
    setAssetsHistory(loadAssetsHistory());
  }, []);

  const fetchPricesAndFx = useCallback(async (txns: Transaction[]) => {
    if (txns.length === 0) return;
    setLoading(true);

    const symbolMap: Record<string, { buy: number; sell: number }> = {};
    for (const tx of txns) {
      const sym = normalizeTicker(tx.ticker);
      if (!symbolMap[sym]) symbolMap[sym] = { buy: 0, sell: 0 };
      if (tx.type === "Buy" || tx.type === "Split") symbolMap[sym].buy += tx.shares;
      if (tx.type === "Sell") symbolMap[sym].sell += tx.shares;
    }
    const activeSyms = Object.entries(symbolMap)
      .filter(([, v]) => v.buy - v.sell > 0.0001)
      .map(([s]) => s);

    try {
      const fxRes = await fetch("/api/fx");
      const fxData = await fxRes.json();
      if (fxData.rate) setFxRate(fxData.rate);
      else addToast("Failed to load USD/TWD exchange rate — using fallback rate of 30.");
    } catch {
      addToast("Failed to load USD/TWD exchange rate — using fallback rate of 30.");
    }

    const priceMap: Record<string, number> = {};
    const changeMap: Record<string, number> = {};
    const failedTickers: string[] = [];
    await Promise.allSettled(
      activeSyms.map(async (sym) => {
        try {
          const res = await fetch(`/api/stock?ticker=${encodeURIComponent(sym)}`);
          const data = await res.json();
          if (data.price) {
            priceMap[sym] = data.price;
          } else {
            failedTickers.push(sym);
          }
          if (data.change != null) changeMap[sym] = data.change;
        } catch {
          failedTickers.push(sym);
        }
      })
    );
    if (failedTickers.length > 0) {
      addToast(`Failed to fetch price for: ${failedTickers.join(", ")}`);
    }
    setPrices(priceMap);
    setChanges(changeMap);
    setLoading(false);
  }, [addToast]);

  useEffect(() => {
    fetchPricesAndFx(transactions);
  }, [transactions, fetchPricesAndFx]);

  // Refs hold latest per-market USD totals; updated each render, read in effects.
  const snapshotAllRef = useRef(0);
  const snapshotUSRef = useRef(0);
  const snapshotTWRef = useRef(0);
  const fxRateRef = useRef(fxRate);
  fxRateRef.current = fxRate;

  useEffect(() => {
    if (loading || snapshotAllRef.current === 0) return;
    const fmt = (n: number) => parseFloat(n.toFixed(2));
    setAssetsHistory((prev) => {
      const updated = {
        all: { ...prev.all, [CURRENT_YEAR]: fmt(snapshotAllRef.current) },
        US:  { ...prev.US,  [CURRENT_YEAR]: fmt(snapshotUSRef.current) },
        TW:  { ...prev.TW,  [CURRENT_YEAR]: fmt(snapshotTWRef.current) },
      };
      saveAssetsHistory(updated);
      return updated;
    });
  }, [loading]);

  const hasFetchedHistory = useRef(false);

  const fetchHistoricalAssets = useCallback(async (txns: Transaction[]) => {
    if (txns.length === 0) return;
    const allSymbols = [...new Set(txns.map((tx) => normalizeTicker(tx.ticker)))];
    const earliestYear = Math.min(...txns.map((tx) => Number(tx.date.slice(0, 4))));
    const years: number[] = [];
    for (let y = earliestYear; y < CURRENT_YEAR; y++) years.push(y);
    if (years.length === 0) return;

    const pricesByYear: Record<string, Record<number, number>> = {};
    let hadHistoryError = false;
    await Promise.allSettled(
      allSymbols.map(async (sym) => {
        try {
          const res = await fetch(`/api/stock/history?ticker=${encodeURIComponent(sym)}&range=5y&interval=1mo`);
          const data = await res.json();
          if (data.error) { hadHistoryError = true; return; }
          const points: { date: string; close: number }[] = data.points ?? [];
          const byYear: Record<number, number> = {};
          for (const p of points) {
            if (p.close == null) continue;
            const mo = p.date.slice(5, 7);
            const yr = Number(p.date.slice(0, 4));
            if (mo === "12") byYear[yr] = p.close;
          }
          pricesByYear[sym] = byYear;
        } catch {
          hadHistoryError = true;
        }
      })
    );
    if (hadHistoryError) {
      addToast("Some historical price data could not be loaded. Asset growth chart may be incomplete.");
    }

    const currentFxRate = fxRateRef.current;
    const fmt = (n: number) => parseFloat(n.toFixed(2));
    const newAll: Record<number, number> = {};
    const newUS: Record<number, number> = {};
    const newTW: Record<number, number> = {};

    for (const year of years) {
      const cutoff = `${year}-12-31`;
      const shares: Record<string, number> = {};
      for (const tx of txns) {
        if (tx.date > cutoff) continue;
        const sym = normalizeTicker(tx.ticker);
        if (!shares[sym]) shares[sym] = 0;
        if (tx.type === "Buy" || tx.type === "Split") shares[sym] += tx.shares;
        if (tx.type === "Sell") shares[sym] -= tx.shares;
      }
      let totAll = 0, totUS = 0, totTW = 0;
      for (const [sym, sh] of Object.entries(shares)) {
        if (sh <= 0.0001) continue;
        const price = pricesByYear[sym]?.[year];
        if (!price) continue;
        const isTW = detectCurrency(sym) === "TWD";
        const usd = isTW ? (sh * price) / currentFxRate : sh * price;
        totAll += usd;
        if (isTW) totTW += usd; else totUS += usd;
      }
      if (totAll > 0) {
        newAll[year] = fmt(totAll);
        if (totUS > 0) newUS[year] = fmt(totUS);
        if (totTW > 0) newTW[year] = fmt(totTW);
      }
    }

    if (Object.keys(newAll).length > 0) {
      setAssetsHistory((prev) => {
        const updated = { all: { ...newAll }, US: { ...newUS }, TW: { ...newTW } };
        if (prev.all?.[CURRENT_YEAR] !== undefined) updated.all[CURRENT_YEAR] = prev.all[CURRENT_YEAR];
        if (prev.US?.[CURRENT_YEAR]  !== undefined) updated.US[CURRENT_YEAR]  = prev.US[CURRENT_YEAR];
        if (prev.TW?.[CURRENT_YEAR]  !== undefined) updated.TW[CURRENT_YEAR]  = prev.TW[CURRENT_YEAR];
        saveAssetsHistory(updated);
        return updated;
      });
    }
  }, [addToast]);

  useEffect(() => {
    if (loading || hasFetchedHistory.current || transactions.length === 0) return;
    hasFetchedHistory.current = true;
    fetchHistoricalAssets(transactions);
  }, [loading, transactions, fetchHistoricalAssets]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setChartPos(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function startEditTx(tx: Transaction) {
    setEditingTxId(tx.id);
    setShowForm(true);
    setForm({
      date: tx.date,
      ticker: tx.ticker,
      stockName: tx.stockName ?? "",
      type: tx.type,
      shares: String(tx.shares),
      price: String(tx.price),
      fee: String(tx.fee),
    });
  }

  function cancelEditTx() {
    setEditingTxId(null);
    setForm(EMPTY_FORM);
  }

  async function openChart(p: ActivePosition) {
    setChartPos(p);
    setChartPoints([]);
    setChartLoading(true);
    try {
      const res = await fetch(`/api/stock/history?ticker=${encodeURIComponent(p.symbol)}`);
      const data = await res.json();
      setChartPoints(data.points ?? []);
    } catch {
      // leave empty
    }
    setChartLoading(false);
  }

  function addTransaction() {
    if (!form.ticker || !form.date) return;
    if (editingTxId) {
      const updated = transactions
        .map((t) => t.id === editingTxId
          ? { ...t, date: form.date, ticker: form.ticker.trim().toUpperCase(), stockName: form.stockName.trim(), type: form.type, shares: parseFloat(form.shares) || 0, price: parseFloat(form.price) || 0, fee: parseFloat(form.fee) || 0 }
          : t
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(updated);
      saveTransactions(updated);
      setEditingTxId(null);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } else {
      const tx: Transaction = {
        id: crypto.randomUUID(),
        date: form.date,
        ticker: form.ticker.trim().toUpperCase(),
        stockName: form.stockName.trim(),
        type: form.type,
        shares: parseFloat(form.shares) || 0,
        price: parseFloat(form.price) || 0,
        fee: parseFloat(form.fee) || 0,
      };
      const updated = [...transactions, tx].sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(updated);
      saveTransactions(updated);
      setForm(EMPTY_FORM);
      setShowForm(false);
    }
  }

  function removeTransaction(id: string) {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    saveTransactions(updated);
  }

  function exportCSV() {
    const header = "Date,Ticker,Stock Name,Type,Shares,Price,Fee,Cash Flow";
    const rows = transactions.map((tx) => {
      const fields = [tx.date, tx.ticker, tx.stockName, tx.type, tx.shares, tx.price, tx.fee, tx.cashFlow ?? ""];
      return fields.map((f) => { const s = String(f); return s.includes(",") ? `"${s}"` : s; }).join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finview-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateReport() {
    const totalMktValue = active.reduce((s, p) => s + p.marketValue, 0);
    if (totalMktValue === 0) {
      alert("No portfolio data to generate a report. Make sure prices are loaded.");
      return;
    }
    const cur = displayCurrency === "TWD" ? "NT$" : "$";
    const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const totalCapGain = active.reduce((s, p) => s + p.capitalGain, 0);
    const totalDivs = active.reduce((s, p) => s + p.totalDividends, 0) + closed.reduce((s, p) => s + p.totalDividends, 0);
    const totalCost = active.reduce((s, p) => s + p.avgCost * p.shares, 0);
    const blendedReturn = totalCost > 0 ? (totalCapGain / totalCost) * 100 : 0;

    const alloc = [...active]
      .map((p) => ({ ...p, allocPct: (p.marketValue / totalMktValue) * 100 }))
      .sort((a, b) => b.marketValue - a.marketValue);

    const usValue = active.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValue, 0);
    const twValue = active.filter((p) => p.currency === "TWD").reduce((s, p) => s + p.marketValue, 0);
    const usPct = (usValue / totalMktValue) * 100;
    const twPct = (twValue / totalMktValue) * 100;

    const byReturn = [...alloc].sort((a, b) => b.totalPct - a.totalPct);
    const best = byReturn.filter((p) => p.totalPct > 0).slice(0, 3);
    const worst = byReturn.filter((p) => p.totalPct < 0).reverse().slice(0, 3);

    // Auto-generated observations
    const obs: string[] = [];
    const top = alloc[0];
    if (top && top.allocPct > 30) obs.push(`⚠️ <strong>Concentration risk:</strong> ${top.symbol} makes up ${top.allocPct.toFixed(1)}% of your portfolio — a single stock drawdown could significantly impact overall performance.`);
    if (alloc.length <= 3) obs.push(`⚠️ <strong>Low diversification:</strong> Only ${alloc.length} active position${alloc.length !== 1 ? "s" : ""}. A broader spread across sectors or markets may reduce single-stock risk.`);
    if (alloc.length >= 10) obs.push(`✓ <strong>Well diversified:</strong> ${alloc.length} positions across your portfolio.`);
    if (usPct > 0 && twPct > 0) obs.push(`✓ <strong>Cross-market exposure:</strong> Portfolio spans US (${usPct.toFixed(1)}%) and TW (${twPct.toFixed(1)}%) markets, providing geographic diversification.`);
    else if (usPct >= 99) obs.push(`ℹ️ <strong>US-only portfolio:</strong> 100% US equities. Consider whether international exposure fits your strategy.`);
    else if (twPct >= 99) obs.push(`ℹ️ <strong>TW-only portfolio:</strong> 100% Taiwan equities. Consider whether international exposure fits your strategy.`);
    if (blendedReturn >= 20) obs.push(`✓ <strong>Strong performance:</strong> Overall portfolio is up <strong>+${blendedReturn.toFixed(2)}%</strong> on average cost basis.`);
    else if (blendedReturn < -10) obs.push(`⚠️ <strong>Significant unrealized losses:</strong> Portfolio is down <strong>${blendedReturn.toFixed(2)}%</strong>. Review whether fundamentals support holding each position.`);
    else if (blendedReturn < 0) obs.push(`ℹ️ <strong>Slight underperformance:</strong> Portfolio is down ${blendedReturn.toFixed(2)}% on average cost. Monitor closely.`);
    if (totalDivs > 0) obs.push(`✓ <strong>Dividend income:</strong> ${cur}${fmt2(totalDivs)} received — contributing to total return beyond capital gains.`);
    if (closed.length > 0) {
      const realizedPL = closed.reduce((s, p) => s + p.realizedPL, 0);
      obs.push(`ℹ️ <strong>Closed positions:</strong> ${closed.length} realized position${closed.length !== 1 ? "s" : ""} with ${realizedPL >= 0 ? "+" : ""}${cur}${fmt2(realizedPL)} total realized P/L.`);
    }
    if (obs.length === 0) obs.push(`✓ Portfolio looks balanced. Continue monitoring your positions regularly.`);

    const f = (n: number) => `${cur}${fmt2(Math.abs(n))}`;
    const sign = (n: number) => n >= 0 ? "+" : "−";
    const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
    const clr = (n: number) => n >= 0 ? "#16a34a" : "#dc2626";

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Portfolio Report — ${reportDate}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:40px 32px;color:#111;font-size:14px;line-height:1.6}
.print-btn{background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:28px;font-weight:500}
h1{font-size:26px;font-weight:700;margin-bottom:3px}
.sub{color:#666;font-size:13px;margin-bottom:32px}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.kpi{background:#f8f8f8;border-radius:10px;padding:14px 16px}
.kpi-l{font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.kpi-v{font-size:19px;font-weight:700}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:28px}
.sc{background:#f0f4ff;border-radius:10px;padding:14px 16px}
.sc-l{font-size:10px;font-weight:700;color:#5567a0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.sc-v{font-size:16px;font-weight:700;margin-bottom:1px}
.sc-p{font-size:12px;color:#666}
h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#555;border-bottom:1px solid #e5e5e5;padding-bottom:6px;margin:24px 0 12px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:7px 10px;background:#f3f4f6;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.04em}
th.r,td.r{text-align:right}
td{padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px}
td.m{font-family:'SF Mono','Fira Code',monospace;font-size:12px}
.bar-bg{background:#e5e7eb;border-radius:3px;height:5px;margin-top:4px}
.bar-f{background:#3b82f6;border-radius:3px;height:5px}
.perf-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.obs{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px}
.obs p{margin:5px 0;font-size:13px}
.foot{margin-top:40px;font-size:11px;color:#aaa;text-align:center}
@media print{.print-btn{display:none!important}body{padding:16px}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<h1>Portfolio Report</h1>
<p class="sub">Generated ${reportDate} · ${displayCurrency} · Prices via Yahoo Finance</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-l">Market Value</div><div class="kpi-v">${cur}${fmt2(totalMktValue)}</div></div>
  <div class="kpi"><div class="kpi-l">Capital Gain</div><div class="kpi-v" style="color:${clr(totalCapGain)}">${sign(totalCapGain)}${f(totalCapGain)}</div></div>
  <div class="kpi"><div class="kpi-l">Blended Return</div><div class="kpi-v" style="color:${clr(blendedReturn)}">${pct(blendedReturn)}</div></div>
  <div class="kpi"><div class="kpi-l">Positions</div><div class="kpi-v">${active.length}${closed.length > 0 ? ` <span style="font-size:13px;color:#888">+${closed.length} closed</span>` : ""}</div></div>
</div>

${usPct > 0 || twPct > 0 ? `<div class="split">
  ${usPct > 0 ? `<div class="sc"><div class="sc-l">🇺🇸 US Market</div><div class="sc-v">${cur}${fmt2(usValue)}</div><div class="sc-p">${usPct.toFixed(1)}% of portfolio</div></div>` : ""}
  ${twPct > 0 ? `<div class="sc"><div class="sc-l">🇹🇼 TW Market</div><div class="sc-v">${cur}${fmt2(twValue)}</div><div class="sc-p">${twPct.toFixed(1)}% of portfolio</div></div>` : ""}
  ${totalDivs > 0 ? `<div class="sc"><div class="sc-l">Total Dividends</div><div class="sc-v" style="color:#16a34a">+${cur}${fmt2(totalDivs)}</div><div class="sc-p">across all positions</div></div>` : ""}
</div>` : ""}

<h2>Asset Allocation</h2>
<table>
  <thead><tr>
    <th>Symbol</th><th>Name</th><th class="r">Shares</th>
    <th class="r">Avg Cost</th><th class="r">Price</th>
    <th class="r">Market Value</th><th class="r">Cap Gain</th><th class="r">Return %</th>
    <th>Allocation</th>
  </tr></thead>
  <tbody>
  ${alloc.map((p) => `<tr>
    <td><strong>${p.symbol}</strong></td>
    <td style="color:#666;font-size:12px">${p.stockName || "—"}</td>
    <td class="r m">${p.shares.toFixed(p.shares % 1 === 0 ? 0 : 2)}</td>
    <td class="r m">${cur}${fmt2(p.avgCost)}</td>
    <td class="r m">${cur}${fmt2(p.currentPrice)}</td>
    <td class="r m">${cur}${fmt2(p.marketValue)}</td>
    <td class="r m" style="color:${clr(p.capitalGain)}">${sign(p.capitalGain)}${f(p.capitalGain)}</td>
    <td class="r m" style="color:${clr(p.totalPct)}">${pct(p.totalPct)}</td>
    <td style="width:90px;padding-left:12px">
      <span style="font-size:11px;color:#444">${p.allocPct.toFixed(1)}%</span>
      <div class="bar-bg"><div class="bar-f" style="width:${Math.min(p.allocPct, 100).toFixed(1)}%"></div></div>
    </td>
  </tr>`).join("")}
  </tbody>
</table>

${best.length > 0 || worst.length > 0 ? `<h2>Performance Highlights</h2>
<div class="perf-grid">
  ${best.length > 0 ? `<div>
    <div style="font-size:12px;font-weight:600;color:#16a34a;margin-bottom:8px">▲ Top Performers</div>
    <table><thead><tr><th>Symbol</th><th class="r">Return %</th><th class="r">Cap Gain</th></tr></thead><tbody>
    ${best.map((p) => `<tr><td><strong>${p.symbol}</strong></td><td class="r m" style="color:#16a34a">+${p.totalPct.toFixed(2)}%</td><td class="r m" style="color:#16a34a">+${f(p.capitalGain)}</td></tr>`).join("")}
    </tbody></table>
  </div>` : ""}
  ${worst.length > 0 ? `<div>
    <div style="font-size:12px;font-weight:600;color:#dc2626;margin-bottom:8px">▼ Underperformers</div>
    <table><thead><tr><th>Symbol</th><th class="r">Return %</th><th class="r">Cap Gain</th></tr></thead><tbody>
    ${worst.map((p) => `<tr><td><strong>${p.symbol}</strong></td><td class="r m" style="color:#dc2626">${p.totalPct.toFixed(2)}%</td><td class="r m" style="color:#dc2626">−${f(p.capitalGain)}</td></tr>`).join("")}
    </tbody></table>
  </div>` : ""}
</div>` : ""}

${closed.length > 0 ? `<h2>Closed Positions</h2>
<table>
  <thead><tr><th>Symbol</th><th class="r">Invested</th><th class="r">Realized P/L</th><th class="r">Dividends</th><th class="r">Return %</th></tr></thead>
  <tbody>
  ${closed.map((p) => `<tr>
    <td><strong>${p.symbol}</strong>${p.stockName ? `<span style="color:#888;font-size:11px;margin-left:6px">${p.stockName}</span>` : ""}</td>
    <td class="r m">${cur}${fmt2(p.totalInvested)}</td>
    <td class="r m" style="color:${clr(p.realizedPL)}">${sign(p.realizedPL)}${f(p.realizedPL)}</td>
    <td class="r m">${p.totalDividends > 0 ? `+${f(p.totalDividends)}` : "—"}</td>
    <td class="r m" style="color:${clr(p.totalPct)}">${pct(p.totalPct)}</td>
  </tr>`).join("")}
  </tbody>
</table>` : ""}

<h2>Analysis &amp; Observations</h2>
<div class="obs">${obs.map((o) => `<p>${o}</p>`).join("")}</div>

<div class="foot">FinView · Portfolio Report · ${reportDate}</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current); current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      transactions.length > 0 &&
      !window.confirm(
        `Importing will replace all ${transactions.length} existing transaction${transactions.length === 1 ? "" : "s"} with the data from your CSV. This cannot be undone.\n\nContinue?`
      )
    ) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = (ev.target?.result as string).trim().split(/\r?\n/);
      if (lines.length < 2) return;
      const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ""));
      const col = (name: string) => headers.indexOf(name);
      const iDate = col("date");
      const iTicker = col("ticker");
      const iStockName = col("stockname");
      const iType = col("type");
      const iShares = col("shares");
      const iPrice = col("price");
      const iFee = col("fee");
      const iCashFlow = col("cashflow");
      if (iDate === -1 || iTicker === -1 || iType === -1) return;
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      const newTxs: Transaction[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]).map((p) => p.trim());
        const ticker = parts[iTicker] ?? "";
        if (!ticker) continue;
        const type = capitalize(parts[iType] ?? "") as Transaction["type"];
        if (!TX_TYPES.includes(type)) continue;
        const date = parts[iDate] ?? "";
        if (!date) continue;
        const cashFlow = iCashFlow >= 0 ? parseFloat(parts[iCashFlow]) || 0 : 0;
        newTxs.push({
          id: crypto.randomUUID(),
          date,
          ticker: ticker.toUpperCase(),
          stockName: iStockName >= 0 ? (parts[iStockName] ?? "") : "",
          type,
          shares: iShares >= 0 ? parseFloat(parts[iShares]) || 0 : 0,
          price: iPrice >= 0 ? parseFloat(parts[iPrice]) || 0 : 0,
          fee: iFee >= 0 ? parseFloat(parts[iFee]) || 0 : 0,
          ...(cashFlow !== 0 ? { cashFlow } : {}),
        });
      }
      if (newTxs.length === 0) return;
      const updated = newTxs.sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(updated);
      saveTransactions(updated);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const { active, closed } = aggregatePortfolio(transactions, prices, fxRate, displayCurrency);

  const filteredActive = marketFilter === "all" ? active
    : active.filter((p) => marketFilter === "TW" ? p.currency === "TWD" : p.currency === "USD");
  const filteredClosed = marketFilter === "all" ? closed
    : closed.filter((p) => marketFilter === "TW" ? p.currency === "TWD" : p.currency === "USD");
  const filteredTransactions = marketFilter === "all"
    ? transactions
    : transactions.filter((tx) => {
        const sym = normalizeTicker(tx.ticker);
        const isTW = detectCurrency(sym) === "TWD";
        return marketFilter === "TW" ? isTW : !isTW;
      });

  const q = searchQuery.trim().toLowerCase();
  const searchedActive = q
    ? filteredActive.filter((p) => p.symbol.toLowerCase().includes(q) || p.stockName?.toLowerCase().includes(q))
    : filteredActive;
  const searchedClosed = q
    ? filteredClosed.filter((p) => p.symbol.toLowerCase().includes(q) || p.stockName?.toLowerCase().includes(q))
    : filteredClosed;
  const searchedTransactions = q
    ? filteredTransactions.filter((tx) =>
        normalizeTicker(tx.ticker).toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q) ||
        (tx.stockName ?? "").toLowerCase().includes(q)
      )
    : filteredTransactions;

  const cSym = "$";
  const totalAssets = filteredActive.reduce((s, p) => s + p.marketValue, 0);
  const totalReturn = filteredActive.reduce((s, p) => s + p.totalReturn, 0) + filteredClosed.reduce((s, p) => s + p.totalReturn, 0);
  const totalDivs = filteredActive.reduce((s, p) => s + p.totalDividends, 0) + filteredClosed.reduce((s, p) => s + p.totalDividends, 0);

  const todayPL = filteredActive.reduce((s, p) => {
    const dailyChange = (changes[p.symbol] ?? 0) * p.shares;
    const inDisplay =
      p.currency === "TWD" && displayCurrency === "USD" ? dailyChange / fxRate :
      p.currency === "USD" && displayCurrency === "TWD" ? dailyChange * fxRate :
      dailyChange;
    return s + inDisplay;
  }, 0);
  const prevTotal = totalAssets - todayPL;
  const todayPLPct = prevTotal !== 0 ? (todayPL / prevTotal) * 100 : 0;

  // Keep per-market refs current for snapshot effect
  const toUSD = (v: number) => displayCurrency === "TWD" ? v / fxRate : v;
  snapshotAllRef.current = toUSD(active.reduce((s, p) => s + p.marketValue, 0));
  snapshotUSRef.current  = toUSD(active.filter((p) => p.currency === "USD").reduce((s, p) => s + p.marketValue, 0));
  snapshotTWRef.current  = toUSD(active.filter((p) => p.currency === "TWD").reduce((s, p) => s + p.marketValue, 0));

  const pieData = filteredActive.filter((p) => p.marketValue > 0).map((p) => ({ name: p.symbol, value: p.marketValue }));
  const pieTotalValue = pieData.reduce((s, p) => s + p.value, 0);

  const marketHistory = assetsHistory[marketFilter] ?? {};
  const assetsChartData = Object.entries(marketHistory)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, usd]) => ({
      year: Number(year) === CURRENT_YEAR ? `${year} YTD` : String(year),
      value: parseFloat((displayCurrency === "TWD" ? usd * fxRate : usd).toFixed(2)),
    }));

  const btnFilter = (f: MarketFilter) =>
    `px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
      marketFilter === f
        ? "bg-blue-600 border-blue-500 text-white"
        : "border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <>
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Stock Portfolio</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Live prices via Yahoo Finance.</p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">Filters</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              {marketFilter === "all" ? "All markets" : marketFilter} · {displayCurrency}
            </span>
            <span className="text-zinc-400 text-xs">{showFilters ? "▲" : "▼"}</span>
          </div>
        </button>
        {showFilters && (
          <div className="px-5 pb-4 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Market:</span>
                {(["all", "US", "TW"] as const).map((f) => (
                  <button key={f} onClick={() => setMarketFilter(f)} className={btnFilter(f)}>
                    {f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Currency:</span>
                {(["USD", "TWD"] as const).map((c) => (
                  <button key={c} onClick={() => setDisplayCurrency(c)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
                      displayCurrency === c
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchPricesAndFx(transactions)}
                className="px-3 py-1 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                {loading ? "Refreshing..." : "Refresh Prices"}
              </button>
            </div>
            {displayCurrency === "TWD" && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">USD/TWD rate: {fxRate.toFixed(2)}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPICard label="Total Assets" value={`${cSym}${fmt2(totalAssets)}`} />
        <KPICard label="Total P/L" value={`${cSym}${fmt2(totalReturn)}`} positive={totalReturn >= 0} negative={totalReturn < 0} />
        <KPICard label="Total Dividends" value={`${cSym}${fmt2(totalDivs)}`} />
        <KPICard
          label="Today's P/L"
          value={`${todayPL >= 0 ? "+" : ""}${cSym}${fmt2(Math.abs(todayPL))}`}
          sub={loading ? "Loading..." : fmtPct(todayPLPct)}
          positive={todayPL > 0}
          negative={todayPL < 0}
        />
      </div>

      {(pieData.length > 0 || assetsChartData.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {assetsChartData.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Total Assets Growth</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={assetsChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
                  <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`${cSym}${fmt2(Number(v))}`, "Total Assets"]} labelStyle={{ color: "#111" }} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {pieData.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Asset Allocation</p>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const pct = pieTotalValue > 0 ? ((Number(value) / pieTotalValue) * 100).toFixed(1) : "0.0";
                      return [`${pct}%`, name];
                    }}
                    labelStyle={{ color: "#111" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Transaction Form */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => { if (editingTxId) cancelEditTx(); setShowForm(!showForm); }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">{editingTxId ? "Edit Transaction" : "Add Transaction"}</span>
          <span className="text-zinc-400 text-xs">{showForm ? "▲" : "▼"}</span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Date</label>
                <input type="date" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Ticker</label>
                <input type="text" placeholder="AAPL / 2330" value={form.ticker}
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                  className={`${INPUT} uppercase`} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Stock Name</label>
                <input type="text" placeholder="Apple Inc." value={form.stockName}
                  onChange={(e) => setForm((f) => ({ ...f, stockName: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Type</label>
                <select value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Transaction["type"] }))}
                  className={INPUT}>
                  {TX_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">
                  {form.type === "Dividend" ? "Shares (0 ok)" : "Shares"}
                </label>
                <input type="number" placeholder="100" value={form.shares}
                  onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">
                  {form.type === "Dividend" ? "Dividend Amount" : "Price per Share"}
                </label>
                <input type="number" placeholder="0.00" value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Fee</label>
                <input type="number" placeholder="0" value={form.fee}
                  onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addTransaction}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {editingTxId ? "Save Changes" : "Add"}
              </button>
              {editingTxId && (
                <button onClick={cancelEditTx}
                  className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-zinc-800">
        {(["active", "closed", "transactions"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "text-zinc-900 dark:text-white border-b-2 border-blue-500"
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}>
            {tab === "active" ? "Active" : tab === "closed" ? "Closed" : "Transactions"}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 mb-1">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1 text-sm bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 w-32 focus:w-44 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button onClick={generateReport}
            className="px-3 py-1 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            Report
          </button>
          <button onClick={exportCSV}
            className="px-3 py-1 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            Export
          </button>
          <label className="px-3 py-1 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            Import
            <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
          </label>
        </div>
      </div>

      {/* Active Positions */}
      {activeTab === "active" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-right px-4 py-3">Shares</th>
                <th className="text-right px-4 py-3">Avg Cost</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Mkt Value</th>
                <th className="text-right px-4 py-3">Cap Gain</th>
                <th className="text-right px-4 py-3">Realized P/L</th>
                <th className="text-right px-4 py-3">Return %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">Fetching live prices...</td></tr>
              )}
              {!loading && searchedActive.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">{q ? `No results for "${searchQuery}".` : `No active positions${marketFilter !== "all" ? ` in ${marketFilter}` : ""}. Add transactions to get started.`}</td></tr>
              )}
              {!loading && searchedActive.map((p) => (
                <tr key={p.symbol} onClick={() => openChart(p)} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{p.symbol}</p>
                      <span className="text-zinc-300 dark:text-zinc-600 text-xs">↗</span>
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{p.stockName}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p.shares.toFixed(p.shares % 1 === 0 ? 0 : 2)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.avgCost)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.currentPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.marketValue)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${p.capitalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {cSym}{fmt2(p.capitalGain)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${p.realizedPL === 0 ? "text-zinc-400 dark:text-zinc-600" : p.realizedPL > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {p.realizedPL === 0 ? "—" : `${cSym}${fmt2(p.realizedPL)}`}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${p.totalPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {fmtPct(p.totalPct)}
                  </td>
                </tr>
              ))}
              {!loading && searchedActive.length > 1 && (() => {
                const totMktVal = searchedActive.reduce((s, p) => s + p.marketValue, 0);
                const totCapGain = searchedActive.reduce((s, p) => s + p.capitalGain, 0);
                const totRealized = searchedActive.reduce((s, p) => s + p.realizedPL, 0);
                const totCost = searchedActive.reduce((s, p) => s + p.avgCost * p.shares, 0);
                const blendedPct = totCost > 0 ? (totCapGain / totCost) * 100 : 0;
                return (
                  <tr className="border-t-2 border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800/50 font-semibold">
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">TOTAL</td>
                    <td colSpan={3} />
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totMktVal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totCapGain)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${totRealized === 0 ? "text-zinc-400 dark:text-zinc-600" : totRealized > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {totRealized === 0 ? "—" : `${cSym}${fmt2(totRealized)}`}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${blendedPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {fmtPct(blendedPct)}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Closed Positions */}
      {activeTab === "closed" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-right px-4 py-3">Invested</th>
                <th className="text-right px-4 py-3">Realized P/L</th>
                <th className="text-right px-4 py-3">Dividends</th>
                <th className="text-right px-4 py-3">Total Return</th>
                <th className="text-right px-4 py-3">Return %</th>
              </tr>
            </thead>
            <tbody>
              {searchedClosed.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">{q ? `No results for "${searchQuery}".` : `No closed positions${marketFilter !== "all" ? ` in ${marketFilter}` : ""}.`}</td></tr>
              ) : (<>
                {searchedClosed.map((p) => (
                  <tr key={p.symbol} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.symbol}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">{p.stockName}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.totalInvested)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${p.realizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {cSym}{fmt2(p.realizedPL)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{cSym}{fmt2(p.totalDividends)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${p.totalReturn >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {cSym}{fmt2(p.totalReturn)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${p.totalPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {fmtPct(p.totalPct)}
                    </td>
                  </tr>
                ))}
                {searchedClosed.length > 1 && (() => {
                  const totInvested = searchedClosed.reduce((s, p) => s + p.totalInvested, 0);
                  const totRealized = searchedClosed.reduce((s, p) => s + p.realizedPL, 0);
                  const totDivs     = searchedClosed.reduce((s, p) => s + p.totalDividends, 0);
                  const totReturn   = searchedClosed.reduce((s, p) => s + p.totalReturn, 0);
                  const blendedPct  = totInvested > 0 ? (totRealized / totInvested) * 100 : 0;
                  return (
                    <tr className="border-t-2 border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800/50 font-semibold">
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">TOTAL</td>
                      <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totInvested)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${totRealized >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        {cSym}{fmt2(totRealized)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{cSym}{fmt2(totDivs)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${totReturn >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        {cSym}{fmt2(totReturn)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${blendedPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        {fmtPct(blendedPct)}
                      </td>
                    </tr>
                  );
                })()}
              </>)}
            </tbody>
          </table>
        </div>
      )}

      {/* Transactions */}
      {activeTab === "transactions" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Ticker</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Shares</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Fee</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {searchedTransactions.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">{q ? `No results for "${searchQuery}".` : `No transactions${marketFilter !== "all" ? ` in ${marketFilter}` : ""} yet.`}</td></tr>
              ) : [...searchedTransactions].reverse().map((tx) => (
                <tr key={tx.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{tx.date}</td>
                  <td className="px-4 py-3 font-medium">{normalizeTicker(tx.ticker)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      tx.type === "Buy" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" :
                      tx.type === "Sell" ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400" :
                      tx.type === "Dividend" ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400" :
                      "bg-gray-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                    }`}>{tx.type}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{tx.shares}</td>
                  <td className="px-4 py-3 text-right font-mono">{tx.price}</td>
                  <td className="px-4 py-3 text-right font-mono">{tx.fee}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { startEditTx(tx); setActiveTab("transactions"); }}
                        className="text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 text-xs">✎</button>
                      <button onClick={() => removeTransaction(tx.id)}
                        className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    <ToastContainer toasts={toasts} dismiss={dismiss} />

    {/* Price chart modal */}
    {chartPos && (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => setChartPos(null)}
      >
        <div
          className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{chartPos.symbol}</h2>
                <span className={`text-sm font-medium ${(changes[chartPos.symbol] ?? 0) >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                  {fmtPct(changes[chartPos.symbol] ?? 0)} today
                </span>
              </div>
              {chartPos.stockName && <p className="text-xs text-zinc-400 mt-0.5">{chartPos.stockName}</p>}
              <p className="text-2xl font-semibold mt-1">
                {chartPos.currency === "TWD" ? "NT$" : "$"}{fmt2(chartPos.currentPrice)}
              </p>
            </div>
            <button onClick={() => setChartPos(null)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 text-lg leading-none">✕</button>
          </div>

          {chartLoading ? (
            <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">Loading chart...</div>
          ) : chartPoints.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-400 text-sm">No chart data available</div>
          ) : (() => {
            const cur = chartPos.currency === "TWD" ? "NT$" : "$";
            const allValues = chartPoints.map((p) => p.close).concat(chartPos.avgCost);
            const minVal = Math.min(...allValues) * 0.98;
            const maxVal = Math.max(...allValues) * 1.02;
            return (
              <>
                <p className="text-xs text-zinc-400 mb-2">6-month price chart</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartPoints}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
                    <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(d) => d.slice(5)} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Number(v).toFixed(0)}
                      domain={[minVal, maxVal]}
                      width={48}
                    />
                    <Tooltip
                      formatter={(v) => [`${cur}${fmt2(Number(v))}`, "Close"]}
                      labelStyle={{ color: "#111" }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine
                      y={chartPos.avgCost}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{ value: `Avg ${cur}${fmt2(chartPos.avgCost)}`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
                    />
                    <Line type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            );
          })()}

          <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
            <div className="text-center">
              <p className="text-xs text-zinc-400">Avg Cost</p>
              <p className="text-sm font-semibold mt-0.5">{chartPos.currency === "TWD" ? "NT$" : "$"}{fmt2(chartPos.avgCost)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400">Shares</p>
              <p className="text-sm font-semibold mt-0.5">{chartPos.shares.toFixed(chartPos.shares % 1 === 0 ? 0 : 2)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-zinc-400">Cap Gain</p>
              <p className={`text-sm font-semibold mt-0.5 ${chartPos.capitalGain >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                {chartPos.capitalGain >= 0 ? "+" : ""}{chartPos.currency === "TWD" ? "NT$" : "$"}{fmt2(Math.abs(chartPos.capitalGain))}
              </p>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
