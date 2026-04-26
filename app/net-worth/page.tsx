"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NetWorthItem, NetWorthSnapshot, AssetCategory, LiabilityCategory } from "@/types";
import {
  loadNetWorthItems, saveNetWorthItems,
  loadNetWorthHistory, saveNetWorthHistory,
  loadAssetsHistory, loadRetirement,
} from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const ASSET_CATEGORIES: AssetCategory[] = ["cash", "real_estate", "vehicle", "rsu_equity", "other_asset"];
const LIABILITY_CATEGORIES: LiabilityCategory[] = ["mortgage", "student_loan", "auto_loan", "credit_card", "other_liability"];

const CATEGORY_LABELS: Record<string, string> = {
  cash: "Cash / Bank",
  real_estate: "Real Estate",
  vehicle: "Vehicle",
  rsu_equity: "RSU / Equity",
  other_asset: "Other Asset",
  mortgage: "Mortgage",
  student_loan: "Student Loan",
  auto_loan: "Auto Loan",
  credit_card: "Credit Card",
  other_liability: "Other Liability",
};

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmt2 = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function isAsset(cat: string): boolean {
  return ASSET_CATEGORIES.includes(cat as AssetCategory);
}

export default function NetWorthPage() {
  const [items, setItems] = useState<NetWorthItem[]>([]);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    category: "cash" as AssetCategory | LiabilityCategory,
    amountUSD: "",
    notes: "",
  });

  // Auto-pulled from other sections (no API calls)
  const assetsHistory = loadAssetsHistory();
  const allYears = Object.keys(assetsHistory.all ?? {}).map(Number).sort((a, b) => b - a);
  const portfolioUSD = allYears.length > 0 ? (assetsHistory.all[allYears[0]] ?? 0) : 0;
  const portfolioYear = allYears[0] ?? null;

  const retEntries = loadRetirement();
  const latestBalance = (type: string) =>
    [...retEntries.filter((e) => e.type === type)].sort((a, b) => b.year - a.year)[0]?.balance ?? 0;
  const k401 = latestBalance("401k");
  const hsa = latestBalance("HSA");
  const ira = latestBalance("IRA");
  const retirementTotal = k401 + hsa + ira;

  useEffect(() => {
    setItems(loadNetWorthItems());
    setHistory(loadNetWorthHistory());
  }, []);

  const manualAssets = items.filter((i) => isAsset(i.category)).reduce((s, i) => s + i.amountUSD, 0);
  const totalLiabilities = items.filter((i) => !isAsset(i.category)).reduce((s, i) => s + i.amountUSD, 0);
  const autoAssets = portfolioUSD + retirementTotal;
  const totalAssets = autoAssets + manualAssets;
  const netWorth = totalAssets - totalLiabilities;
  const debtToAsset = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  // Auto-save a snapshot for today whenever items or auto-pulled values change
  useEffect(() => {
    if (totalAssets === 0 && totalLiabilities === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const snapshot: NetWorthSnapshot = { date: today, netWorth, totalAssets, totalLiabilities };
    setHistory((prev) => {
      const filtered = prev.filter((s) => s.date !== today);
      const updated = [...filtered, snapshot].sort((a, b) => a.date.localeCompare(b.date));
      saveNetWorthHistory(updated);
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, portfolioUSD, retirementTotal]);

  function addItem() {
    if (!form.label || !form.amountUSD || isNaN(Number(form.amountUSD))) return;
    const item: NetWorthItem = {
      id: crypto.randomUUID(),
      label: form.label,
      category: form.category,
      amountUSD: parseFloat(form.amountUSD),
      notes: form.notes || undefined,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    const updated = [...items, item];
    setItems(updated);
    saveNetWorthItems(updated);
    setForm({ label: "", category: "cash", amountUSD: "", notes: "" });
  }

  function removeItem(id: string) {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveNetWorthItems(updated);
  }

  const chartData = history.map((s) => ({
    date: s.date.slice(0, 7), // YYYY-MM
    value: s.netWorth,
  }));

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Net Worth</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
        Total assets minus liabilities — your complete financial picture.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <KPICard
          label="Net Worth"
          value={`${netWorth < 0 ? "-" : ""}${fmt(netWorth)}`}
          positive={netWorth > 0}
          negative={netWorth < 0}
        />
        <KPICard label="Total Assets" value={fmt(totalAssets)} />
        <KPICard label="Total Liabilities" value={fmt(totalLiabilities)} negative={totalLiabilities > 0} />
        <KPICard
          label="Debt-to-Asset"
          value={totalAssets > 0 ? `${debtToAsset.toFixed(1)}%` : "—"}
          negative={debtToAsset > 50}
        />
      </div>

      {/* Net Worth Over Time */}
      {chartData.length > 1 && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">Net Worth Over Time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [fmt2(Number(v)), "Net Worth"]} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2}
                dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Auto-tracked Assets */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
          <span className="font-semibold text-sm">Auto-tracked Assets</span>
          <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">Pulled from your other pages</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100 dark:border-zinc-800/50">
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">Stock Portfolio</td>
              <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500 text-xs">
                {portfolioYear ? `as of ${portfolioYear}` : "no data"}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                {portfolioUSD > 0 ? fmt(portfolioUSD) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href="/investment/portfolio" className="text-xs text-blue-500 hover:text-blue-400">Update →</Link>
              </td>
            </tr>
            {[
              { label: "401(k)", value: k401, href: "/retirement/401k" },
              { label: "HSA", value: hsa, href: "/retirement/hsa" },
              { label: "IRA / Roth IRA", value: ira, href: "/retirement/ira" },
            ].map((row) => (
              <tr key={row.label} className="border-b border-gray-100 dark:border-zinc-800/50">
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.label}</td>
                <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500 text-xs">latest year balance</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {row.value > 0 ? fmt(row.value) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={row.href} className="text-xs text-blue-500 hover:text-blue-400">Update →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 bg-gray-50 dark:bg-zinc-800/30 border-t border-gray-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            RSU equity requires live prices — add it as a manual entry below.
          </p>
        </div>
      </div>

      {/* Manual Entries */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">Manual Entries</span>
          <span className="text-zinc-400 text-xs">{showForm ? "▲" : "▼"}</span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Label</label>
                <input type="text" placeholder="e.g. Checking account" value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Category</label>
                <select value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AssetCategory | LiabilityCategory }))}
                  className={INPUT}>
                  <optgroup label="Assets">
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Liabilities">
                    {LIABILITY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Amount (USD)</label>
                <input type="number" placeholder="0" value={form.amountUSD}
                  onChange={(e) => setForm((f) => ({ ...f, amountUSD: e.target.value }))}
                  className={INPUT} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Notes (optional)</label>
                <input type="text" placeholder="e.g. Chase Savings" value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <button onClick={addItem}
              className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="border-t border-gray-100 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                  <th className="text-left px-4 py-2">Label</th>
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-right px-4 py-2 text-xs font-normal">Updated</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{item.label}</p>
                      {item.notes && <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isAsset(item.category)
                          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                      }`}>
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      isAsset(item.category)
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500 dark:text-red-400"
                    }`}>
                      {isAsset(item.category) ? "" : "−"}{fmt(item.amountUSD)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400 dark:text-zinc-500">{item.updatedAt}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeItem(item.id)}
                        className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
