"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CryptoTransaction, CryptoTxType } from "@/types";
import { loadCryptoTransactions, saveCryptoTransactions, saveCryptoSnapshot, loadCryptoSnapshot } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import { useToast, ToastContainer } from "@/components/ui/Toast";
import {
  BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const TX_TYPES: CryptoTxType[] = ["Buy", "Sell", "Receive", "Send"];

const COIN_COLORS = [
  "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#22d3ee",
  "#8b5cf6", "#fb923c", "#14b8a6", "#a78bfa", "#71717a",
];

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtAmount = (n: number, sym: string) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${sym}`;

interface Holding {
  symbol: string;
  coinName: string;
  amount: number;
  totalCost: number;
  avgCost: number;
  price: number;
  marketValue: number;
  capitalGain: number;
  totalPct: number;
}

function aggregateHoldings(txs: CryptoTransaction[], prices: Record<string, number>): Holding[] {
  const map = new Map<string, { symbol: string; coinName: string; amount: number; totalCost: number }>();

  for (const tx of txs.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map.has(tx.symbol)) map.set(tx.symbol, { symbol: tx.symbol, coinName: tx.coinName, amount: 0, totalCost: 0 });
    const h = map.get(tx.symbol)!;
    if (tx.type === "Buy" || tx.type === "Receive") {
      h.totalCost += tx.amount * tx.priceUSD + tx.fee;
      h.amount += tx.amount;
    } else {
      const costPerUnit = h.amount > 0 ? h.totalCost / h.amount : 0;
      h.totalCost -= costPerUnit * tx.amount;
      h.amount -= tx.amount;
    }
  }

  return Array.from(map.values())
    .filter((h) => h.amount > 1e-9)
    .map((h) => {
      const price = prices[h.symbol] ?? 0;
      const marketValue = h.amount * price;
      const avgCost = h.amount > 0 ? h.totalCost / h.amount : 0;
      const capitalGain = marketValue - h.totalCost;
      const totalPct = h.totalCost > 0 ? (capitalGain / h.totalCost) * 100 : 0;
      return { ...h, price, marketValue, avgCost, capitalGain, totalPct };
    })
    .sort((a, b) => b.marketValue - a.marketValue);
}

const EMPTY_FORM = { date: "", symbol: "", coinName: "", type: "Buy" as CryptoTxType, amount: "", priceUSD: "", fee: "" };

export default function CryptoPage() {
  const [transactions, setTransactions] = useState<CryptoTransaction[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"holdings" | "transactions">("holdings");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const { toasts, addToast, dismiss } = useToast();
  const fetchedRef = useRef(false);

  useEffect(() => {
    setTransactions(loadCryptoTransactions());
  }, []);

  const fetchPrices = useCallback(async (syms: string[]) => {
    if (syms.length === 0) return;
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/crypto?symbols=${syms.join(",")}`);
      const data = await res.json();
      if (!res.ok) { addToast(`Price fetch failed: ${data.error ?? res.statusText}`); return; }
      setPrices((prev) => ({ ...prev, ...data }));
    } catch (err) {
      addToast(`Price fetch failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setPriceLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (fetchedRef.current || transactions.length === 0) return;
    fetchedRef.current = true;
    const symbols = [...new Set(transactions.map((t) => t.symbol))];
    fetchPrices(symbols);
  }, [transactions, fetchPrices]);

  const holdings = aggregateHoldings(transactions, prices);
  const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const totalCost = holdings.reduce((s, h) => s + h.totalCost, 0);
  const totalGain = totalValue - totalCost;
  const totalPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  // Save/clear snapshot for net worth whenever holdings change
  useEffect(() => {
    if (totalValue > 0) {
      saveCryptoSnapshot({ valueUSD: totalValue, updatedAt: new Date().toISOString().slice(0, 10) });
    } else if (transactions.length === 0 && loadCryptoSnapshot() !== null) {
      saveCryptoSnapshot({ valueUSD: 0, updatedAt: new Date().toISOString().slice(0, 10) });
    }
  }, [totalValue, transactions.length]);

  const chartData = holdings.slice(0, 10).map((h) => ({ name: h.symbol, value: h.marketValue }));

  function startEdit(tx: CryptoTransaction) {
    setEditingId(tx.id);
    setForm({ date: tx.date, symbol: tx.symbol, coinName: tx.coinName, type: tx.type, amount: String(tx.amount), priceUSD: String(tx.priceUSD), fee: String(tx.fee) });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function saveTransaction() {
    if (!form.date || !form.symbol || !form.amount || !form.priceUSD) return;
    const entry: CryptoTransaction = {
      id: editingId ?? crypto.randomUUID(),
      date: form.date,
      symbol: form.symbol.toUpperCase(),
      coinName: form.coinName || form.symbol.toUpperCase(),
      type: form.type,
      amount: parseFloat(form.amount) || 0,
      priceUSD: parseFloat(form.priceUSD) || 0,
      fee: parseFloat(form.fee) || 0,
    };
    const updated = editingId
      ? transactions.map((t) => (t.id === editingId ? entry : t))
      : [...transactions, entry].sort((a, b) => a.date.localeCompare(b.date));
    setTransactions(updated);
    saveCryptoTransactions(updated);
    // Fetch price for new symbol if not already known
    if (!prices[entry.symbol]) fetchPrices([entry.symbol]);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function remove(id: string) {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    saveCryptoTransactions(updated);
  }

  return (
    <>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Crypto</h1>
          {priceLoading && <span className="text-xs text-zinc-400 dark:text-zinc-500">Fetching prices…</span>}
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          Track crypto holdings and P&amp;L. Prices via CoinGecko.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <KPICard label="Total Value" value={fmt(totalValue)} />
          <KPICard label="Total Cost" value={fmt(totalCost)} />
          <KPICard
            label="Unrealized P&L"
            value={`${totalGain >= 0 ? "+" : ""}${fmt(totalGain)}`}
            positive={totalGain > 0}
            negative={totalGain < 0}
          />
          <KPICard
            label="Return"
            value={totalCost > 0 ? `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%` : "—"}
            positive={totalPct > 0}
            negative={totalPct < 0}
          />
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Portfolio Breakdown</p>
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 36)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="name" width={52} tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip formatter={(v) => [fmt(Number(v)), "Value"]} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COIN_COLORS[i % COIN_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Add / Edit form */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) cancelEdit(); }}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="font-semibold text-sm">{editingId ? "Edit Transaction" : "Add Transaction"}</span>
            <span className="text-zinc-400 text-xs">{showForm ? "▲" : "▼"}</span>
          </button>
          {showForm && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CryptoTxType }))} className={INPUT}>
                    {TX_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Symbol</label>
                  <input type="text" placeholder="BTC" value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Coin Name</label>
                  <input type="text" placeholder="Bitcoin" value={form.coinName}
                    onChange={(e) => setForm((f) => ({ ...f, coinName: e.target.value }))}
                    className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Amount</label>
                  <input type="number" placeholder="0.5" step="any" value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Price (USD)</label>
                  <input type="number" placeholder="60000" step="any" value={form.priceUSD}
                    onChange={(e) => setForm((f) => ({ ...f, priceUSD: e.target.value }))}
                    className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Fee (USD)</label>
                  <input type="number" placeholder="0" step="any" value={form.fee}
                    onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                    className={INPUT} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={saveTransaction}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {editingId ? "Save" : "Add"}
                </button>
                {editingId && (
                  <button onClick={cancelEdit}
                    className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        {transactions.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
            <div className="flex border-b border-gray-200 dark:border-zinc-800 px-4">
              {(["holdings", "transactions"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-3 text-sm capitalize transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 font-medium"
                      : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Holdings */}
            {activeTab === "holdings" && (
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                    <th className="text-left px-4 py-3">Coin</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-right px-4 py-3">Avg Cost</th>
                    <th className="text-right px-4 py-3">Price</th>
                    <th className="text-right px-4 py-3">Value</th>
                    <th className="text-right px-4 py-3">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.symbol} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{h.symbol}</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{h.coinName}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300 text-xs">
                        {fmtAmount(h.amount, h.symbol)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-500 dark:text-zinc-400 text-xs">
                        {h.price > 0 ? fmt(h.avgCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {h.price > 0 ? fmt(h.price) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                        {h.price > 0 ? fmt(h.marketValue) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${
                        h.capitalGain > 0 ? "text-emerald-600 dark:text-emerald-400" :
                        h.capitalGain < 0 ? "text-red-500 dark:text-red-400" : "text-zinc-400"
                      }`}>
                        {h.price > 0 ? (
                          <>
                            <p>{h.capitalGain >= 0 ? "+" : ""}{fmt(h.capitalGain)}</p>
                            <p>{h.totalPct >= 0 ? "+" : ""}{h.totalPct.toFixed(1)}%</p>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Transactions */}
            {activeTab === "transactions" && (
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Coin</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-right px-4 py-3">Price</th>
                    <th className="text-right px-4 py-3">Fee</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{tx.date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          tx.type === "Buy" || tx.type === "Receive"
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                        }`}>{tx.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{tx.symbol}</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{tx.coinName}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300 text-xs">
                        {fmtAmount(tx.amount, tx.symbol)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-300">{fmt(tx.priceUSD)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400 dark:text-zinc-500 text-xs">
                        {tx.fee > 0 ? fmt(tx.fee) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startEdit(tx)}
                            className="text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 text-xs">✎</button>
                          <button onClick={() => remove(tx.id)}
                            className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  );
}
