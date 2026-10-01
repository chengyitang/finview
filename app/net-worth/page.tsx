"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NetWorthItem, NetWorthSnapshot, AssetCategory, LiabilityCategory, VehicleEntry, VehicleOffer } from "@/types";
import {
  loadNetWorthItems, saveNetWorthItems,
  loadNetWorthHistory, saveNetWorthHistory,
  loadAssetsHistory, loadRetirement, loadCryptoSnapshot,
  loadVehicles, saveVehicles,
} from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
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

const fmtTWD = (n: number) =>
  `NT$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function isAsset(cat: string): boolean {
  return ASSET_CATEGORIES.includes(cat as AssetCategory);
}

function vehicleCurrentValue(v: VehicleEntry): number {
  if (v.offers.length === 0) return v.purchasePrice;
  return v.offers.reduce((s, o) => s + o.amountUSD, 0) / v.offers.length;
}

function vehicleChartData(v: VehicleEntry) {
  const byDate: Record<string, number[]> = {};
  for (const o of v.offers) {
    if (!byDate[o.date]) byDate[o.date] = [];
    byDate[o.date].push(o.amountUSD);
  }
  return [
    { date: v.purchaseDate, value: v.purchasePrice },
    ...Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amounts]) => ({
        date,
        value: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
      })),
  ];
}

const TODAY = new Date().toISOString().slice(0, 10);
const EMPTY_VEHICLE_FORM = { label: "", purchasePrice: "", purchaseDate: TODAY };
const EMPTY_OFFER_FORM = { date: TODAY, source: "", amount: "" };

export default function NetWorthPage() {
  const [items, setItems] = useState<NetWorthItem[]>([]);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [fxRate, setFxRate] = useState(30);
  const [form, setForm] = useState({
    label: "",
    category: "cash" as AssetCategory | LiabilityCategory,
    amount: "",
    currency: "USD" as "USD" | "TWD",
    notes: "",
  });

  // Vehicle state
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [addOfferVehicleId, setAddOfferVehicleId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState(EMPTY_OFFER_FORM);

  // Auto-pulled from other sections
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

  const cryptoSnap = loadCryptoSnapshot();
  const cryptoUSD = cryptoSnap && cryptoSnap.valueUSD > 0 ? cryptoSnap.valueUSD : 0;

  useEffect(() => {
    setItems(loadNetWorthItems());
    setHistory(loadNetWorthHistory());
    setVehicles(loadVehicles());
    fetch("/api/fx").then((r) => r.json()).then((d) => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
  }, []);

  const itemToUSD = (item: NetWorthItem) =>
    item.currency === "TWD" ? item.amountUSD / fxRate : item.amountUSD;

  const vehicleTotal = vehicles.reduce((s, v) => s + vehicleCurrentValue(v), 0);
  const manualAssets = items.filter((i) => isAsset(i.category)).reduce((s, i) => s + itemToUSD(i), 0);
  const totalLiabilities = items.filter((i) => !isAsset(i.category)).reduce((s, i) => s + itemToUSD(i), 0);
  const autoAssets = portfolioUSD + retirementTotal + cryptoUSD;
  const totalAssets = autoAssets + vehicleTotal + manualAssets;
  const netWorth = totalAssets - totalLiabilities;
  const debtToAsset = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

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
  }, [items, vehicles, portfolioUSD, retirementTotal, cryptoUSD]);

  const EMPTY_FORM = { label: "", category: "cash" as AssetCategory | LiabilityCategory, amount: "", currency: "USD" as "USD" | "TWD", notes: "" };

  function startEditItem(item: NetWorthItem) {
    setEditingItemId(item.id);
    setForm({ label: item.label, category: item.category, amount: String(item.amountUSD), currency: item.currency ?? "USD", notes: item.notes ?? "" });
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingItemId(null);
    setForm(EMPTY_FORM);
  }

  function saveItem() {
    if (!form.label || !form.amount || isNaN(Number(form.amount))) return;
    const today = new Date().toISOString().slice(0, 10);
    if (editingItemId) {
      const updated = items.map((i) =>
        i.id === editingItemId
          ? { ...i, label: form.label, category: form.category, amountUSD: parseFloat(form.amount), currency: form.currency, notes: form.notes || undefined, updatedAt: today }
          : i
      );
      setItems(updated);
      saveNetWorthItems(updated);
      setEditingItemId(null);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } else {
      const item: NetWorthItem = {
        id: crypto.randomUUID(),
        label: form.label,
        category: form.category,
        amountUSD: parseFloat(form.amount),
        currency: form.currency,
        notes: form.notes || undefined,
        updatedAt: today,
      };
      const updated = [...items, item];
      setItems(updated);
      saveNetWorthItems(updated);
      setForm({ ...EMPTY_FORM, currency: form.currency });
    }
  }

  function removeItem(id: string) {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveNetWorthItems(updated);
  }

  // Vehicle functions
  function addVehicle() {
    if (!vehicleForm.label || !vehicleForm.purchasePrice || !vehicleForm.purchaseDate) return;
    const v: VehicleEntry = {
      id: crypto.randomUUID(),
      label: vehicleForm.label,
      purchasePrice: parseFloat(vehicleForm.purchasePrice),
      purchaseDate: vehicleForm.purchaseDate,
      offers: [],
    };
    const updated = [...vehicles, v];
    setVehicles(updated);
    saveVehicles(updated);
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setShowAddVehicle(false);
  }

  function removeVehicle(id: string) {
    const updated = vehicles.filter((v) => v.id !== id);
    setVehicles(updated);
    saveVehicles(updated);
    if (expandedVehicleId === id) setExpandedVehicleId(null);
    if (addOfferVehicleId === id) setAddOfferVehicleId(null);
  }

  function addOffer(vehicleId: string) {
    if (!offerForm.amount || isNaN(parseFloat(offerForm.amount))) return;
    const offer: VehicleOffer = {
      id: crypto.randomUUID(),
      date: offerForm.date,
      source: offerForm.source.trim(),
      amountUSD: parseFloat(offerForm.amount),
    };
    const updated = vehicles.map((v) =>
      v.id === vehicleId ? { ...v, offers: [...v.offers, offer] } : v
    );
    setVehicles(updated);
    saveVehicles(updated);
    setOfferForm(EMPTY_OFFER_FORM);
    setAddOfferVehicleId(null);
  }

  function removeOffer(vehicleId: string, offerId: string) {
    const updated = vehicles.map((v) =>
      v.id === vehicleId ? { ...v, offers: v.offers.filter((o) => o.id !== offerId) } : v
    );
    setVehicles(updated);
    saveVehicles(updated);
  }

  const byMonth: Record<string, NetWorthSnapshot> = {};
  for (const s of history) {
    const mo = s.date.slice(0, 7);
    if (!byMonth[mo] || s.date > byMonth[mo].date) byMonth[mo] = s;
  }
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const chartData = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mo, s]) => ({
      date: `${MONTH_NAMES[parseInt(mo.slice(5)) - 1]} '${mo.slice(2, 4)}`,
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
              <Tooltip formatter={(v) => [fmt2(Number(v)), "Net Worth"]} labelStyle={{ color: "#111" }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }} activeDot={{ r: 6 }} />
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
            <tr className="border-b border-gray-100 dark:border-zinc-800/50">
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">Crypto</td>
              <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500 text-xs">
                {cryptoSnap ? `as of ${cryptoSnap.updatedAt}` : "no data"}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                {cryptoUSD > 0 ? fmt(cryptoUSD) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href="/investment/crypto" className="text-xs text-blue-500 hover:text-blue-400">Update →</Link>
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

      {/* Vehicles */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <span className="font-semibold text-sm">Vehicles</span>
            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
              {vehicleTotal > 0 ? `Current value: ${fmt(vehicleTotal)}` : "Track car value with dealer offers"}
            </span>
          </div>
          <button
            onClick={() => { setShowAddVehicle(!showAddVehicle); setVehicleForm(EMPTY_VEHICLE_FORM); }}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            {showAddVehicle ? "Cancel" : "+ Add Vehicle"}
          </button>
        </div>

        {/* Add vehicle form */}
        {showAddVehicle && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Vehicle Name</label>
                <input type="text" placeholder="2021 Tesla Model 3" value={vehicleForm.label}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, label: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Purchase Price (USD)</label>
                <input type="number" placeholder="45000" value={vehicleForm.purchasePrice}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Purchase Date</label>
                <input type="date" value={vehicleForm.purchaseDate}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <button onClick={addVehicle}
              className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add Vehicle
            </button>
          </div>
        )}

        {vehicles.length === 0 && !showAddVehicle && (
          <div className="px-5 py-8 text-center text-zinc-400 dark:text-zinc-500 text-sm">
            No vehicles added yet. Click &ldquo;+ Add Vehicle&rdquo; to track your car&apos;s value.
          </div>
        )}

        {vehicles.map((v) => {
          const currentVal = vehicleCurrentValue(v);
          const deprPct = v.purchasePrice > 0 ? ((currentVal - v.purchasePrice) / v.purchasePrice) * 100 : 0;
          const isExpanded = expandedVehicleId === v.id;
          const isAddingOffer = addOfferVehicleId === v.id;
          const chartPoints = vehicleChartData(v);

          return (
            <div key={v.id} className="border-t border-gray-100 dark:border-zinc-800">
              {/* Vehicle row */}
              <div className="px-5 py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{v.label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Purchased {fmt(v.purchasePrice)} · {v.purchaseDate}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmt(currentVal)}</p>
                  {v.offers.length > 0 && (
                    <p className={`text-xs ${deprPct < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-500"}`}>
                      {deprPct >= 0 ? "+" : ""}{deprPct.toFixed(1)}% vs purchase
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {v.offers.length === 0 ? "no offers yet" : v.offers.length === 1 ? "1 offer" : `avg of ${v.offers.length} offers`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  <button
                    onClick={() => {
                      if (isAddingOffer) { setAddOfferVehicleId(null); } else {
                        setAddOfferVehicleId(v.id);
                        setOfferForm(EMPTY_OFFER_FORM);
                        if (!isExpanded) setExpandedVehicleId(v.id);
                      }
                    }}
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
                  >
                    {isAddingOffer ? "Cancel" : "+ Offer"}
                  </button>
                  <button
                    onClick={() => setExpandedVehicleId(isExpanded ? null : v.id)}
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                  >
                    {isExpanded ? "▲" : "▼"}
                  </button>
                  <button
                    onClick={() => removeVehicle(v.id)}
                    className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Add offer form */}
              {isAddingOffer && (
                <div className="mx-5 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/40 border border-gray-200 dark:border-zinc-700">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Add Dealer Offer</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Date</label>
                      <input type="date" value={offerForm.date}
                        onChange={(e) => setOfferForm((f) => ({ ...f, date: e.target.value }))}
                        className={INPUT} />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Source (optional)</label>
                      <input type="text" placeholder="CarMax, KBB…" value={offerForm.source}
                        onChange={(e) => setOfferForm((f) => ({ ...f, source: e.target.value }))}
                        className={INPUT} />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Offer Amount (USD)</label>
                      <input type="number" placeholder="28000" value={offerForm.amount}
                        onChange={(e) => setOfferForm((f) => ({ ...f, amount: e.target.value }))}
                        className={INPUT} />
                    </div>
                  </div>
                  <button onClick={() => addOffer(v.id)}
                    className="mt-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                    Add Offer
                  </button>
                </div>
              )}

              {/* Expanded: depreciation chart + offer history */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-800 px-5 py-4">
                  {/* Depreciation chart */}
                  {chartPoints.length >= 2 && (
                    <div className="mb-5">
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Depreciation Chart</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartPoints} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
                          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                          <YAxis
                            tick={{ fill: "#71717a", fontSize: 11 }}
                            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                            domain={["auto", "auto"]}
                            width={40}
                          />
                          <Tooltip
                            formatter={(val) => [fmt2(Number(val)), "Value"]}
                            labelStyle={{ color: "#111" }}
                          />
                          <ReferenceLine
                            y={v.purchasePrice}
                            stroke="#94a3b8"
                            strokeDasharray="4 3"
                            strokeWidth={1}
                            label={{ value: "Purchase price", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
                          />
                          <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2}
                            dot={{ fill: "#f59e0b", r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Offer history */}
                  {v.offers.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                        Offers ({v.offers.length}) · avg {fmt(currentVal)}
                      </p>
                      <div className="space-y-0">
                        {[...v.offers].sort((a, b) => b.date.localeCompare(a.date)).map((o) => (
                          <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-zinc-800/50 last:border-0 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0">{o.date}</span>
                              <span className="text-zinc-600 dark:text-zinc-300">{o.source || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-zinc-800 dark:text-zinc-200">{fmt(o.amountUSD)}</span>
                              <button
                                onClick={() => removeOffer(v.id, o.id)}
                                className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      No offers recorded yet. Click &ldquo;+ Offer&rdquo; to add a dealer quote.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Entries */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => { if (editingItemId) cancelEdit(); setShowForm(!showForm); }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">{editingItemId ? "Edit Entry" : "Manual Entries"}</span>
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
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Amount</label>
                <div className="flex gap-2">
                  <input type="number" placeholder="0" value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className={INPUT} />
                  <select value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "USD" | "TWD" }))}
                    className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-900 dark:text-zinc-100 w-20 shrink-0">
                    <option value="USD">USD</option>
                    <option value="TWD">TWD</option>
                  </select>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Notes (optional)</label>
                <input type="text" placeholder="e.g. Chase Savings" value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveItem}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {editingItemId ? "Save Changes" : "Add"}
              </button>
              {editingItemId && (
                <button onClick={cancelEdit}
                  className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
                  Cancel
                </button>
              )}
            </div>
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
                      <p>{isAsset(item.category) ? "" : "−"}{item.currency === "TWD" ? fmtTWD(item.amountUSD) : fmt(item.amountUSD)}</p>
                      {item.currency === "TWD" && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">≈ {fmt(item.amountUSD / fxRate)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-400 dark:text-zinc-500">{item.updatedAt}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEditItem(item)}
                          className="text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 text-xs">✎</button>
                        <button onClick={() => removeItem(item.id)}
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
    </div>
  );
}
