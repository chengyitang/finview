"use client";

import { useState, useEffect } from "react";
import { ExpenseEntry, ExpenseCategory } from "@/types";
import { loadExpenses, saveExpenses, loadIncome } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const CATEGORIES: ExpenseCategory[] = [
  "Housing", "Food", "Transport", "Healthcare",
  "Entertainment", "Subscriptions", "Education", "Shopping", "Personal", "Other",
];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Housing: "#3b82f6",
  Food: "#22d3ee",
  Transport: "#f59e0b",
  Healthcare: "#10b981",
  Entertainment: "#f43f5e",
  Subscriptions: "#8b5cf6",
  Education: "#14b8a6",
  Shopping: "#fb923c",
  Personal: "#a78bfa",
  Other: "#71717a",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function ExpensesPage() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR);
  const [form, setForm] = useState({
    year: CURRENT_YEAR,
    month: CURRENT_MONTH,
    category: "Housing" as ExpenseCategory,
    description: "",
    amountUSD: "",
  });

  useEffect(() => {
    setEntries(loadExpenses());
  }, []);

  function addEntry() {
    if (!form.amountUSD || isNaN(Number(form.amountUSD))) return;
    const entry: ExpenseEntry = {
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
    saveExpenses(updated);
    setForm((f) => ({ ...f, description: "", amountUSD: "" }));
  }

  function remove(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveExpenses(updated);
  }

  const yearEntries = entries.filter((e) => e.year === filterYear);
  const thisMonthTotal = entries
    .filter((e) => e.year === CURRENT_YEAR && e.month === CURRENT_MONTH)
    .reduce((s, e) => s + e.amountUSD, 0);
  const yearTotal = yearEntries.reduce((s, e) => s + e.amountUSD, 0);

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    total: yearEntries.filter((e) => e.category === cat).reduce((s, e) => s + e.amountUSD, 0),
  }));
  const topCategory = byCategory.reduce((best, c) => (c.total > best.total ? c : best), { cat: "Other" as ExpenseCategory, total: 0 });

  const incomeEntries = loadIncome();
  const yearIncome = incomeEntries.filter((e) => e.year === filterYear).reduce((s, e) => s + e.amountUSD, 0);
  const savingsRate = yearIncome > 0 ? ((yearIncome - yearTotal) / yearIncome) * 100 : null;

  const monthlyData = MONTHS.map((label, i) => ({
    label,
    total: yearEntries.filter((e) => e.month === i + 1).reduce((s, e) => s + e.amountUSD, 0),
  }));

  const pieData = byCategory.filter((c) => c.total > 0).map((c) => ({ name: c.cat, value: c.total }));
  const pieTotalValue = pieData.reduce((s, p) => s + p.value, 0);

  const years = Array.from(new Set([CURRENT_YEAR, ...entries.map((e) => e.year)])).sort((a, b) => b - a);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Expenses</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
        Track monthly spending by category. All amounts in USD.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <KPICard label={`${MONTHS[CURRENT_MONTH - 1]} Spending`} value={fmt(thisMonthTotal)} />
        <KPICard label={`${filterYear} Total`} value={fmt(yearTotal)} />
        <KPICard label="Top Category" value={topCategory.total > 0 ? topCategory.cat : "—"} />
        <KPICard
          label="Savings Rate"
          value={savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—"}
          positive={savingsRate !== null && savingsRate >= 20}
          negative={savingsRate !== null && savingsRate < 0}
          sub={savingsRate !== null ? `${fmt(yearIncome)} income` : "Add income data"}
        />
      </div>

      {(monthlyData.some((d) => d.total > 0) || pieData.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {monthlyData.some((d) => d.total > 0) && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">
                Monthly Spending — {filterYear}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
                  <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "Spending"]} />
                  <Bar dataKey="total" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {pieData.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-sm font-medium mb-3 text-zinc-600 dark:text-zinc-300">
                Category Breakdown — {filterYear}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                    label={({ name }) => name}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.name as ExpenseCategory] ?? "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const pct = pieTotalValue > 0 ? ((Number(value) / pieTotalValue) * 100).toFixed(1) : "0.0";
                      return [`${fmt(Number(value))} (${pct}%)`, name];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">Add Entry</span>
          <span className="text-zinc-400 text-xs">{showForm ? "▲" : "▼"}</span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                  className={INPUT}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Description</label>
                <input type="text" placeholder="e.g. Monthly rent" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Amount (USD)</label>
                <input type="number" placeholder="1500" value={form.amountUSD}
                  onChange={(e) => setForm((f) => ({ ...f, amountUSD: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <button onClick={addEntry}
              className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add
            </button>
          </div>
        )}
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
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">
                  No expenses for {filterYear}.
                </td>
              </tr>
            ) : (
              yearEntries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{MONTHS[e.month - 1]} {e.year}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: CATEGORY_COLORS[e.category] }}>
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{e.description}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-500 dark:text-red-400">{fmt(e.amountUSD)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)}
                      className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
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
