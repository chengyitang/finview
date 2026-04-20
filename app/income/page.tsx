"use client";

import { useState, useEffect } from "react";
import { IncomeEntry } from "@/types";
import { loadIncome, saveIncome } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";

const CATEGORIES = ["Salary", "Bonus", "Freelance", "Other"] as const;

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

export default function IncomePage() {
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR);
  const [form, setForm] = useState({
    year: CURRENT_YEAR,
    month: new Date().getMonth() + 1,
    category: "Salary" as IncomeEntry["category"],
    description: "",
    amountUSD: "",
  });

  useEffect(() => {
    setEntries(loadIncome());
  }, []);

  function addEntry() {
    if (!form.amountUSD || isNaN(Number(form.amountUSD))) return;
    const entry: IncomeEntry = {
      id: crypto.randomUUID(),
      year: form.year,
      month: form.month,
      category: form.category,
      description: form.description,
      amountUSD: parseFloat(form.amountUSD),
    };
    const updated = [...entries, entry].sort((a, b) =>
      a.year !== b.year ? b.year - a.year : b.month - a.month
    );
    setEntries(updated);
    saveIncome(updated);
    setForm((f) => ({ ...f, description: "", amountUSD: "" }));
  }

  function remove(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveIncome(updated);
  }

  const yearEntries = entries.filter((e) => e.year === filterYear);
  const totalYear = yearEntries.reduce((s, e) => s + e.amountUSD, 0);
  const bySalary = yearEntries.filter((e) => e.category === "Salary").reduce((s, e) => s + e.amountUSD, 0);
  const byBonus = yearEntries.filter((e) => e.category === "Bonus").reduce((s, e) => s + e.amountUSD, 0);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const years = Array.from(new Set([CURRENT_YEAR, ...entries.map((e) => e.year)])).sort((a, b) => b - a);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Income</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">All amounts in USD. Stored in your browser.</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPICard label={`Total ${filterYear}`} value={fmt(totalYear)} />
        <KPICard label="Salary" value={fmt(bySalary)} />
        <KPICard label="Bonus" value={fmt(byBonus)} />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Add Entry</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Year</label>
            <input type="number" value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: +e.target.value }))}
              className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Month</label>
            <select value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: +e.target.value }))}
              className={INPUT}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Category</label>
            <select value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as IncomeEntry["category"] }))}
              className={INPUT}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Description</label>
            <input type="text" placeholder="e.g. Monthly salary" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Amount (USD)</label>
            <input type="number" placeholder="5000" value={form.amountUSD}
              onChange={(e) => setForm((f) => ({ ...f, amountUSD: e.target.value }))}
              className={INPUT} />
          </div>
        </div>
        <button onClick={addEntry}
          className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Add
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Filter year:</span>
        <select value={filterYear}
          onChange={(e) => setFilterYear(+e.target.value)}
          className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {yearEntries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">No entries for {filterYear}.</td></tr>
            ) : (
              yearEntries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{MONTHS[e.month - 1]} {e.year}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 px-2 py-0.5 rounded text-xs">{e.category}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{e.description}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(e.amountUSD)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)} className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
