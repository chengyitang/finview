"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CryptoTransaction, CryptoTxType } from "@/types";
import { loadCryptoTransactions, saveCryptoTransactions, saveCryptoSnapshot, loadCryptoSnapshot } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import { useToast, ToastContainer } from "@/components/ui/Toast";
import {
  BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie,
} from "recharts";

const COIN_COLORS = [
  "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#22d3ee",
  "#8b5cf6", "#fb923c", "#14b8a6", "#a78bfa", "#e879f9",
];

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

interface OkxTickerData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
}

type OkxBalances = Record<string, { trading: number; funding: number; valueUSD: number }>;

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

interface OkxTrade {
  tradeId: string;
  date: string;
  symbol: string;
  coinName: string;
  type: string;
  amount: number;
  priceUSD: number;
  fee: number;
}

function aggregateHoldings(txs: CryptoTransaction[], prices: Record<string, number>): Holding[] {
  const map = new Map<string, { symbol: string; coinName: string; amount: number; totalCost: number }>();

  for (const tx of txs.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map.has(tx.symbol))
      map.set(tx.symbol, { symbol: tx.symbol, coinName: tx.coinName, amount: 0, totalCost: 0 });
    const h = map.get(tx.symbol)!;

    if (tx.type === "Buy" || tx.type === "Receive") {
      // WAVG: blend new purchase into running cost
      h.totalCost += tx.amount * tx.priceUSD + tx.fee;
      h.amount += tx.amount;
    } else {
      // Sell/Send: reduce cost proportionally, then reset if position fully closed
      const cpu = h.amount > 0 ? h.totalCost / h.amount : 0;
      h.totalCost -= cpu * tx.amount;
      h.amount -= tx.amount;
      if (h.amount < 1e-9) {
        // Position fully closed — reset so a future rebuy starts fresh
        h.amount = 0;
        h.totalCost = 0;
      }
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

export default function CryptoPage() {
  const [transactions, setTransactions] = useState<CryptoTransaction[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [tickers, setTickers] = useState<Record<string, OkxTickerData>>({});
  const [activeTab, setActiveTab] = useState<"holdings" | "transactions">("holdings");

  const [okxKey, setOkxKey] = useState("");
  const [okxSecret, setOkxSecret] = useState("");
  const [okxPassphrase, setOkxPassphrase] = useState("");
  const [showOkxPanel, setShowOkxPanel] = useState(false);
  const [okxBalances, setOkxBalances] = useState<OkxBalances | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  const { toasts, addToast, dismiss } = useToast();
  const didAutoSync = useRef(false);

  const fetchOkxPrices = useCallback(async (syms: string[]) => {
    if (syms.length === 0) return;
    try {
      const res = await fetch(`/api/okx/prices?symbols=${syms.join(",")}`);
      if (!res.ok) return;
      const data: Record<string, OkxTickerData> = await res.json();
      const priceMap: Record<string, number> = {};
      for (const [sym, td] of Object.entries(data)) priceMap[sym] = td.price;
      setPrices((p) => ({ ...p, ...priceMap }));
      setTickers((t) => ({ ...t, ...data }));
    } catch { /* silent */ }
  }, []);

  // Load data + auto-sync OKX on mount
  useEffect(() => {
    setTransactions(loadCryptoTransactions());
    if (typeof window === "undefined") return;
    const key = localStorage.getItem("fv_okx_key") ?? "";
    const secret = localStorage.getItem("fv_okx_secret") ?? "";
    const pass = localStorage.getItem("fv_okx_passphrase") ?? "";
    setOkxKey(key);
    setOkxSecret(secret);
    setOkxPassphrase(pass);

    if (key && secret && pass && !didAutoSync.current) {
      didAutoSync.current = true;
      const hdrs = { "x-okx-key": key, "x-okx-secret": secret, "x-okx-passphrase": pass };
      setSyncing(true);
      fetch("/api/okx/balances", { headers: hdrs })
        .then((r) => r.json())
        .then((data: OkxBalances) => {
          setOkxBalances(data);
          setLastSynced(new Date().toLocaleTimeString());
          const syms = Object.keys(data);
          if (syms.length) fetchOkxPrices(syms);
        })
        .catch(() => {})
        .finally(() => setSyncing(false));
    }
  }, [fetchOkxPrices]);

  // Fetch CoinGecko prices for transaction symbols not covered by OKX prices
  useEffect(() => {
    if (transactions.length === 0) return;
    const syms = [...new Set(transactions.map((t) => t.symbol))];
    const missing = syms.filter((s) => !prices[s]);
    if (missing.length === 0) return;
    // Try OKX first, then CoinGecko fallback
    fetchOkxPrices(missing).then(() => {
      const stillMissing = missing.filter((s) => !prices[s]);
      if (stillMissing.length === 0) return;
      fetch(`/api/crypto?symbols=${stillMissing.join(",")}`)
        .then((r) => r.json())
        .then((data) => { if (data) setPrices((p) => ({ ...p, ...data })); })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const holdings = aggregateHoldings(transactions, prices);
  const okxTotalUSD = okxBalances
    ? Object.values(okxBalances).reduce((s, b) => s + b.valueUSD, 0)
    : 0;
  const liveValue = okxBalances ? okxTotalUSD : holdings.reduce((s, h) => s + h.marketValue, 0);

  // All-time P&L:
  //   For each coin in OKX balance:
  //     - If we have fills → cost = OKX amount × WAVG cost from fills; gain = OKX value − cost
  //     - If no fills (deposit, stablecoin) → cost = current OKX value; gain = 0
  //   Return % = total gain / total cost (includes stablecoin cost in denominator)
  //   Without OKX balances, falls back to transaction-only computation.
  const holdingsBySymbol = new Map(holdings.map((h) => [h.symbol, h]));
  let plGain = 0;
  let plCost = 0;

  if (okxBalances) {
    for (const [ccy, bal] of Object.entries(okxBalances)) {
      const mktValue = bal.valueUSD;
      const h = holdingsBySymbol.get(ccy);
      if (h && h.avgCost > 0) {
        const totalAmt = bal.trading + bal.funding;
        const cost = totalAmt * h.avgCost;
        plCost += cost;
        plGain += mktValue - cost;
      } else {
        // No fills for this coin — treat cost = market value so it contributes
        // to the return denominator but adds 0 to the gain numerator
        plCost += mktValue;
      }
    }
  } else {
    plCost = holdings.reduce((s, h) => s + h.totalCost, 0);
    plGain = holdings.reduce((s, h) => s + h.capitalGain, 0);
  }

  const allTimeGain = plGain;
  const allTimePct = plCost > 0 ? (plGain / plCost) * 100 : 0;

  // 24h portfolio change from OKX ticker data
  const dayGain = okxBalances
    ? Object.entries(okxBalances).reduce((sum, [ccy, bal]) => {
        const tk = tickers[ccy];
        if (!tk || tk.change24h === 0) return sum;
        const totalAmt = bal.trading + bal.funding;
        const open24h = tk.price / (1 + tk.change24h / 100);
        return sum + totalAmt * (tk.price - open24h);
      }, 0)
    : 0;
  const dayPct = liveValue > 0 ? (dayGain / (liveValue - dayGain)) * 100 : 0;

  useEffect(() => {
    if (liveValue > 0) {
      saveCryptoSnapshot({ valueUSD: liveValue, updatedAt: new Date().toISOString().slice(0, 10) });
    } else if (transactions.length === 0 && loadCryptoSnapshot() !== null) {
      saveCryptoSnapshot({ valueUSD: 0, updatedAt: new Date().toISOString().slice(0, 10) });
    }
  }, [liveValue, transactions.length]);

  // Chart data — prefer OKX live balances, fall back to computed holdings
  const pieData = (okxBalances
    ? Object.entries(okxBalances)
        .filter(([, b]) => b.valueUSD > 0.01)
        .sort(([, a], [, b]) => b.valueUSD - a.valueUSD)
        .map(([ccy, b]) => ({ name: ccy, value: b.valueUSD }))
    : holdings.map((h) => ({ name: h.symbol, value: h.marketValue }))
  ).slice(0, 10);

  const totalPieValue = pieData.reduce((s, d) => s + d.value, 0);

  function okxCreds() {
    return { "x-okx-key": okxKey, "x-okx-secret": okxSecret, "x-okx-passphrase": okxPassphrase };
  }

  function saveOkxCredentials() {
    localStorage.setItem("fv_okx_key", okxKey);
    localStorage.setItem("fv_okx_secret", okxSecret);
    localStorage.setItem("fv_okx_passphrase", okxPassphrase);
    addToast("Credentials saved");
  }

  async function syncOkxBalances() {
    if (!okxKey || !okxSecret || !okxPassphrase) { addToast("Enter credentials first"); return; }
    setSyncing(true);
    try {
      const res = await fetch("/api/okx/balances", { headers: okxCreds() });
      const data = await res.json();
      if (!res.ok) { addToast(`Sync failed: ${data.error}`); return; }
      setOkxBalances(data);
      setLastSynced(new Date().toLocaleTimeString());
      const syms = Object.keys(data);
      if (syms.length) fetchOkxPrices(syms);
    } catch (err) {
      addToast(`Sync failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function importOkxTrades() {
    if (!okxKey || !okxSecret || !okxPassphrase) { addToast("Enter credentials first"); return; }
    setImporting(true);
    try {
      const res = await fetch("/api/okx/trades", { headers: okxCreds() });
      const data = await res.json();
      if (!res.ok) { addToast(`Import failed: ${data.error}`); return; }

      const existingIds = new Set(transactions.map((t) => t.id));
      const newTrades: CryptoTransaction[] = (data.trades as OkxTrade[])
        .filter((t) => !existingIds.has(`okx-${t.tradeId}`))
        .map((t) => ({
          id: `okx-${t.tradeId}`,
          date: t.date,
          symbol: t.symbol,
          coinName: t.coinName,
          type: t.type as CryptoTxType,
          amount: t.amount,
          priceUSD: t.priceUSD,
          fee: t.fee,
        }));

      if (newTrades.length === 0) { addToast("No new trades to import"); return; }

      const updated = [...transactions, ...newTrades].sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(updated);
      saveCryptoTransactions(updated);
      addToast(`Imported ${newTrades.length} of ${data.total} trades from OKX`);

      const newSyms = [...new Set(newTrades.map((t) => t.symbol))].filter((s) => !prices[s]);
      if (newSyms.length) fetchOkxPrices(newSyms);
    } catch (err) {
      addToast(`Import failed: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setImporting(false);
    }
  }

  function remove(id: string) {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    saveCryptoTransactions(updated);
  }

  const okxConnected = !!(okxKey && okxSecret && okxPassphrase);

  return (
    <>
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Crypto</h1>
            {okxConnected && (
              <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${syncing ? "animate-pulse" : ""}`} />
                {syncing ? "Syncing…" : "OKX Live"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastSynced && <span className="text-xs text-zinc-400 dark:text-zinc-500">Updated {lastSynced}</span>}
            {okxConnected && (
              <button onClick={syncOkxBalances} disabled={syncing}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium">
                ↻ Refresh
              </button>
            )}
          </div>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          Live balances via OKX. Import trades for P&amp;L tracking.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <KPICard label="Total Value" value={fmt(liveValue)} />
          <KPICard
            label="24h Change"
            value={okxBalances ? `${dayGain >= 0 ? "+" : ""}${fmt(dayGain)}` : "—"}
            positive={dayGain > 0}
            negative={dayGain < 0}
          />
          <KPICard
            label="All-time P&L"
            value={plCost > 0 ? `${allTimeGain >= 0 ? "+" : ""}${fmt(allTimeGain)}` : "—"}
            positive={plCost > 0 && allTimeGain > 0}
            negative={plCost > 0 && allTimeGain < 0}
          />
          <KPICard
            label="Return"
            value={plCost > 0 ? `${allTimePct >= 0 ? "+" : ""}${allTimePct.toFixed(1)}%` : "—"}
            positive={plCost > 0 && allTimePct > 0}
            negative={plCost > 0 && allTimePct < 0}
          />
        </div>

        {/* Ticker Strip */}
        {okxBalances && pieData.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: "none" }}>
            {pieData.map((d, i) => {
              const tk = tickers[d.name];
              const chg = tk?.change24h ?? 0;
              return (
                <div key={d.name} className="flex-shrink-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 min-w-[148px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COIN_COLORS[i % COIN_COLORS.length] }} />
                      <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{d.name}</span>
                    </div>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      chg > 0 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" :
                      chg < 0 ? "bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400" :
                      "bg-gray-100 dark:bg-zinc-800 text-zinc-500"
                    }`}>
                      {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-base font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {tk ? fmt(tk.price) : "—"}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {fmt(d.value)} · {totalPieValue > 0 ? ((d.value / totalPieValue) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Charts — Donut + Bar */}
        {pieData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            {/* Donut Pie */}
            <div className="md:col-span-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col">
              <p className="text-sm font-medium mb-2 text-zinc-600 dark:text-zinc-300">Allocation</p>
              <div className="flex-1 flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COIN_COLORS[i % COIN_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [fmt(Number(v)), "Value"]}
                      labelStyle={{ color: "#111" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COIN_COLORS[i % COIN_COLORS.length] }} />
                      <span className="text-zinc-600 dark:text-zinc-400">{d.name}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {totalPieValue > 0 ? ((d.value / totalPieValue) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="md:col-span-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Holdings by Value</p>
              <ResponsiveContainer width="100%" height={Math.max(180, pieData.length * 36)}>
                <BarChart data={pieData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                  <YAxis type="category" dataKey="name" width={52} tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "Value"]} labelStyle={{ color: "#111" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {pieData.map((_, i) => <Cell key={i} fill={COIN_COLORS[i % COIN_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* OKX Account Panel */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => setShowOkxPanel(!showOkxPanel)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">OKX Account</span>
              {okxConnected && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                  Connected
                </span>
              )}
              {okxBalances && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">— {fmt(okxTotalUSD)} total</span>
              )}
            </div>
            <span className="text-zinc-400 text-xs">{showOkxPanel ? "▲" : "▼"}</span>
          </button>

          {showOkxPanel && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                Credentials stored locally. Create a read-only key at{" "}
                <a href="https://app.okx.com/en-us/account/my-api" target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:underline">
                  OKX → Account → API
                </a>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">API Key</label>
                  <input type="text" value={okxKey} onChange={(e) => setOkxKey(e.target.value)} placeholder="API Key" className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Secret Key</label>
                  <input type="password" value={okxSecret} onChange={(e) => setOkxSecret(e.target.value)} placeholder="Secret Key" className={INPUT} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Passphrase</label>
                  <input type="password" value={okxPassphrase} onChange={(e) => setOkxPassphrase(e.target.value)} placeholder="Passphrase" className={INPUT} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={saveOkxCredentials}
                  className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded-lg text-xs font-medium">
                  Save Credentials
                </button>
                <button onClick={syncOkxBalances} disabled={syncing}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium">
                  {syncing ? "Syncing…" : "Sync Balances"}
                </button>
                <button onClick={importOkxTrades} disabled={importing}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium">
                  {importing ? "Importing…" : "Import All Trades"}
                </button>
              </div>

              {/* Live balances table */}
              {okxBalances && Object.keys(okxBalances).length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Live Balances</p>
                  <table className="w-full text-sm min-w-[400px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                        <th className="text-left px-2 py-2">Coin</th>
                        <th className="text-right px-2 py-2">Trading</th>
                        <th className="text-right px-2 py-2">Funding</th>
                        <th className="text-right px-2 py-2">24h</th>
                        <th className="text-right px-2 py-2">Value (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(okxBalances)
                        .sort(([, a], [, b]) => b.valueUSD - a.valueUSD)
                        .map(([ccy, bal]) => {
                          const tk = tickers[ccy];
                          const chg = tk?.change24h ?? 0;
                          return (
                            <tr key={ccy} className="border-b border-gray-100 dark:border-zinc-800/50">
                              <td className="px-2 py-2 font-medium">{ccy}</td>
                              <td className="px-2 py-2 text-right font-mono text-xs text-zinc-600 dark:text-zinc-300">
                                {bal.trading > 0 ? fmtAmt(bal.trading) : "—"}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-xs text-zinc-600 dark:text-zinc-300">
                                {bal.funding > 0 ? fmtAmt(bal.funding) : "—"}
                              </td>
                              <td className={`px-2 py-2 text-right text-xs font-medium ${
                                chg > 0 ? "text-emerald-600 dark:text-emerald-400" :
                                chg < 0 ? "text-red-500 dark:text-red-400" : "text-zinc-400"
                              }`}>
                                {tk ? fmtPct(chg) : "—"}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {bal.valueUSD > 0 ? fmt(bal.valueUSD) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      <tr className="border-t border-gray-200 dark:border-zinc-800">
                        <td colSpan={3} className="px-2 py-2 text-right text-xs text-zinc-500 dark:text-zinc-400">
                          24h Portfolio Change
                        </td>
                        <td className={`px-2 py-2 text-right text-xs font-semibold ${
                          dayGain > 0 ? "text-emerald-600 dark:text-emerald-400" :
                          dayGain < 0 ? "text-red-500 dark:text-red-400" : "text-zinc-400"
                        }`}>
                          {dayGain !== 0 ? fmtPct(dayPct) : "—"}
                        </td>
                        <td className={`px-2 py-2 text-right font-mono font-semibold ${
                          dayGain > 0 ? "text-emerald-600 dark:text-emerald-400" :
                          dayGain < 0 ? "text-red-500 dark:text-red-400" : ""
                        }`}>
                          {dayGain !== 0 ? `${dayGain >= 0 ? "+" : ""}${fmt(dayGain)}` : fmt(okxTotalUSD)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Holdings / Transactions */}
        {(holdings.length > 0 || transactions.length > 0) && (
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
                  {tab === "transactions" && transactions.length > 0 && (
                    <span className="ml-1.5 text-xs bg-gray-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">
                      {transactions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Holdings Tab */}
            {activeTab === "holdings" && (
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                    <th className="text-left px-4 py-3">Coin</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-right px-4 py-3">Avg Cost</th>
                    <th className="text-right px-4 py-3">Price</th>
                    <th className="text-right px-4 py-3">24h</th>
                    <th className="text-right px-4 py-3">Value</th>
                    <th className="text-right px-4 py-3">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const tk = tickers[h.symbol];
                    const chg = tk?.change24h ?? 0;
                    const alloc = totalPieValue > 0 ? (h.marketValue / totalPieValue) * 100 : 0;
                    return (
                      <tr key={h.symbol} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-200">{h.symbol}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="h-1 rounded-full bg-gray-100 dark:bg-zinc-800 w-16 overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(alloc, 100)}%` }} />
                            </div>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">{alloc.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300 text-xs">
                          {fmtAmt(h.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-500 dark:text-zinc-400 text-xs">
                          {h.price > 0 ? fmt(h.avgCost) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                          {h.price > 0 ? fmt(h.price) : "—"}
                        </td>
                        <td className={`px-4 py-3 text-right text-xs font-medium ${
                          chg > 0 ? "text-emerald-600 dark:text-emerald-400" :
                          chg < 0 ? "text-red-500 dark:text-red-400" : "text-zinc-400"
                        }`}>
                          {tk ? fmtPct(chg) : "—"}
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
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Transactions Tab */}
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
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap text-xs">
                        {tx.date}
                        {tx.id.startsWith("okx-") && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">OKX</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          tx.type === "Buy" || tx.type === "Receive"
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                        }`}>{tx.type}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">{tx.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-700 dark:text-zinc-300 text-xs">
                        {fmtAmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-300 text-xs">{fmt(tx.priceUSD)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400 dark:text-zinc-500 text-xs">
                        {tx.fee > 0 ? fmt(tx.fee) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => remove(tx.id)}
                          className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
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
