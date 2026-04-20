"use client";

import { useState, useEffect, useCallback } from "react";
import { Transaction, ActivePosition, ClosedPosition } from "@/types";
import { loadTransactions, saveTransactions } from "@/lib/storage";
import { normalizeTicker, detectCurrency, aggregatePortfolio, calcRealizedTrend } from "@/lib/portfolio";
import KPICard from "@/components/ui/KPICard";
import {
  PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer,
} from "recharts";

const TX_TYPES = ["Buy", "Sell", "Dividend", "Split"] as const;
const COLORS = ["#3b82f6", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6"];

const TICKER_COLORS: Record<string, string> = {
  AAPL: "#555555", MSFT: "#00a4ef", GOOGL: "#4285f4", GOOG: "#4285f4",
  META: "#0866ff", AMZN: "#ff9900", TSLA: "#e31937", NVDA: "#76b900",
  NFLX: "#e50914", AMD: "#ed1c24", INTC: "#0071c5", TSM: "#00a3e0",
  BABA: "#ff6a00", "2330.TW": "#00a3e0", "2454.TW": "#e60026",
};

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "TWD">("USD");
  const [fxRate, setFxRate] = useState<number>(30);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "closed" | "transactions">("active");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");

  useEffect(() => {
    setTransactions(loadTransactions());
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
    } catch {}

    const priceMap: Record<string, number> = {};
    await Promise.allSettled(
      activeSyms.map(async (sym) => {
        try {
          const res = await fetch(`/api/stock?ticker=${encodeURIComponent(sym)}`);
          const data = await res.json();
          if (data.price) priceMap[sym] = data.price;
        } catch {}
      })
    );
    setPrices(priceMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPricesAndFx(transactions);
  }, [transactions, fetchPricesAndFx]);

  function addTransaction() {
    if (!form.ticker || !form.date) return;
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

  function removeTransaction(id: string) {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    saveTransactions(updated);
  }

  const { active, closed } = aggregatePortfolio(transactions, prices, fxRate, displayCurrency);
  const trend = calcRealizedTrend(transactions, fxRate, displayCurrency);

  const cSym = displayCurrency === "TWD" ? "NT$" : "$";
  const totalAssets = active.reduce((s, p) => s + p.marketValue, 0);
  const totalReturn = active.reduce((s, p) => s + p.totalReturn, 0) + closed.reduce((s, p) => s + p.totalReturn, 0);
  const totalDivs = active.reduce((s, p) => s + p.totalDividends, 0) + closed.reduce((s, p) => s + p.totalDividends, 0);

  function filterByMarket<T extends ActivePosition | ClosedPosition>(list: T[]): T[] {
    if (marketFilter === "all") return list;
    return list.filter((p) =>
      marketFilter === "TW" ? p.currency === "TWD" : p.currency === "USD"
    );
  }

  const filteredActive = filterByMarket(active);
  const filteredClosed = filterByMarket(closed);
  const filteredTransactions = marketFilter === "all"
    ? transactions
    : transactions.filter((tx) => {
        const sym = normalizeTicker(tx.ticker);
        const isTW = detectCurrency(sym) === "TWD";
        return marketFilter === "TW" ? isTW : !isTW;
      });

  const pieData = active.filter((p) => p.marketValue > 0).map((p) => ({ name: p.symbol, value: p.marketValue }));
  const pieTotalValue = pieData.reduce((s, p) => s + p.value, 0);
  const trendData = Object.entries(trend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, gain]) => ({ year, gain: parseFloat(gain.toFixed(2)) }));

  const btnFilter = (f: MarketFilter) =>
    `px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
      marketFilter === f
        ? "bg-blue-600 border-blue-500 text-white"
        : "border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold">Stock Portfolio</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">All data saved in your browser. Live prices via Yahoo Finance.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Market:</span>
          {(["all", "US", "TW"] as const).map((f) => (
            <button key={f} onClick={() => setMarketFilter(f)} className={btnFilter(f)}>
              {f === "all" ? "All" : f}
            </button>
          ))}
          <span className="text-zinc-300 dark:text-zinc-600 mx-1">|</span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Currency:</span>
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
          <button onClick={() => fetchPricesAndFx(transactions)}
            className="ml-1 px-3 py-1 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {displayCurrency === "TWD" && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">USD/TWD rate: {fxRate.toFixed(2)}</p>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <KPICard label="Total Assets" value={`${cSym}${fmt2(totalAssets)}`} />
        <KPICard label="Total P/L" value={`${cSym}${fmt2(totalReturn)}`} positive={totalReturn >= 0} negative={totalReturn < 0} />
        <KPICard label="Total Dividends" value={`${cSym}${fmt2(totalDivs)}`} />
      </div>

      {(pieData.length > 0 || trendData.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {pieData.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Asset Allocation</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={TICKER_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const pct = pieTotalValue > 0 ? ((Number(value) / pieTotalValue) * 100).toFixed(1) : "0.0";
                      return [`${pct}%`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {trendData.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Realized Gain by Year (Closed)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData}>
                  <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${cSym}${fmt2(Number(v))}`} />
                  <Bar dataKey="gain" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-zinc-800">
        {(["active", "closed", "transactions"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "text-zinc-900 dark:text-white border-b-2 border-blue-500"
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}>
            {tab === "active" ? "Active Positions" : tab === "closed" ? "Closed Positions" : "Transactions"}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowForm(!showForm)}
          className="mb-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">
          + Add Transaction
        </button>
      </div>

      {/* Add Transaction Form */}
      {showForm && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              Add
            </button>
            <button onClick={() => setShowForm(false)}
              className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Positions */}
      {activeTab === "active" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-right px-4 py-3">Shares</th>
                <th className="text-right px-4 py-3">Avg Cost</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Mkt Value</th>
                <th className="text-right px-4 py-3">Cap Gain</th>
                <th className="text-right px-4 py-3">Total Return</th>
                <th className="text-right px-4 py-3">Return %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">Fetching live prices...</td></tr>
              )}
              {!loading && filteredActive.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">No active positions{marketFilter !== "all" ? ` in ${marketFilter}` : ""}. Add transactions to get started.</td></tr>
              )}
              {!loading && filteredActive.map((p) => (
                <tr key={p.symbol} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.symbol}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{p.stockName}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p.shares.toFixed(p.shares % 1 === 0 ? 0 : 2)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.avgCost)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.currentPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(p.marketValue)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${p.capitalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {cSym}{fmt2(p.capitalGain)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${p.totalReturn >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {cSym}{fmt2(p.totalReturn)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${p.totalPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {fmtPct(p.totalPct)}
                  </td>
                </tr>
              ))}
              {!loading && filteredActive.length > 1 && (() => {
                const totMktVal = filteredActive.reduce((s, p) => s + p.marketValue, 0);
                const totCapGain = filteredActive.reduce((s, p) => s + p.capitalGain, 0);
                const totReturn = filteredActive.reduce((s, p) => s + p.totalReturn, 0);
                const totCost = filteredActive.reduce((s, p) => s + p.avgCost * p.shares, 0);
                const blendedPct = totCost > 0 ? (totReturn / totCost) * 100 : 0;
                return (
                  <tr className="border-t-2 border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800/50 font-semibold">
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">TOTAL</td>
                    <td colSpan={3} />
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totMktVal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totCapGain)}</td>
                    <td className="px-4 py-3 text-right font-mono">{cSym}{fmt2(totReturn)}</td>
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
              {filteredClosed.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">No closed positions{marketFilter !== "all" ? ` in ${marketFilter}` : ""}.</td></tr>
              ) : filteredClosed.map((p) => (
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
              {filteredTransactions.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">No transactions{marketFilter !== "all" ? ` in ${marketFilter}` : ""} yet.</td></tr>
              ) : [...filteredTransactions].reverse().map((tx) => (
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
                    <button onClick={() => removeTransaction(tx.id)} className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
