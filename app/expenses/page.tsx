"use client";

import { useState, useEffect } from "react";
import { ExpenseEntry, ExpenseCategory } from "@/types";
import { loadExpenses, saveExpenses, loadIncome } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from "recharts";

const CATEGORIES: ExpenseCategory[] = [
  "Housing", "Food", "Transport", "Healthcare",
  "Entertainment", "Subscriptions", "Education", "Shopping", "Personal", "Other",
];

const SUBCATEGORIES: Record<ExpenseCategory, string[]> = {
  Housing:       ["Rent", "Mortgage", "Utilities", "Insurance", "Maintenance", "HOA", "Other"],
  Food:          ["Grocery", "Dining Out", "Drinks", "Snacks", "Coffee", "Other"],
  Transport:     ["Gas", "Public Transit", "Taxi / Ride Share", "Parking", "Flight", "Car Insurance", "Other"],
  Healthcare:    ["Doctor Visit", "Pharmacy", "Dental", "Vision", "Insurance", "Gym / Fitness", "Other"],
  Entertainment: ["Movies / Shows", "Games", "Sports", "Events / Concerts", "Books", "Other"],
  Subscriptions: ["Streaming", "Software", "News / Media", "Membership", "Cloud Storage", "Other"],
  Education:     ["Tuition", "Books / Materials", "Online Course", "Training", "Other"],
  Shopping:      ["Clothing", "Electronics", "Furniture", "Household", "Accessories", "Other"],
  Personal:      ["Haircut / Salon", "Beauty / Skincare", "Laundry", "Gifts", "Other"],
  Other:         ["Other"],
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Housing:       "#3b82f6",
  Food:          "#22d3ee",
  Transport:     "#f59e0b",
  Healthcare:    "#10b981",
  Entertainment: "#f43f5e",
  Subscriptions: "#8b5cf6",
  Education:     "#14b8a6",
  Shopping:      "#fb923c",
  Personal:      "#a78bfa",
  Other:         "#71717a",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpensesPage() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drillCat, setDrillCat] = useState<ExpenseCategory | null>(null);
  const [filterMonth, setFilterMonth] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    year: CURRENT_YEAR,
    month: CURRENT_MONTH,
    category: "Housing" as ExpenseCategory,
    subCategory: SUBCATEGORIES["Housing"][0],
    description: "",
    amountUSD: "",
  });

  useEffect(() => {
    setEntries(loadExpenses());
  }, []);

  function handleCategoryChange(cat: ExpenseCategory) {
    setForm((f) => ({ ...f, category: cat, subCategory: SUBCATEGORIES[cat][0] }));
  }

  function startEdit(entry: ExpenseEntry) {
    setEditingId(entry.id);
    setShowForm(true);
    setForm({
      year: entry.year,
      month: entry.month,
      category: entry.category,
      subCategory: entry.subCategory ?? SUBCATEGORIES[entry.category][0],
      description: entry.description,
      amountUSD: String(entry.amountUSD),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ year: CURRENT_YEAR, month: CURRENT_MONTH, category: "Housing", subCategory: SUBCATEGORIES["Housing"][0], description: "", amountUSD: "" });
  }

  function saveEntry() {
    if (!form.amountUSD || isNaN(Number(form.amountUSD))) return;
    if (editingId) {
      const updated = entries
        .map((e) => e.id === editingId
          ? { ...e, year: form.year, month: form.month, category: form.category, subCategory: form.subCategory || undefined, description: form.description, amountUSD: parseFloat(form.amountUSD) }
          : e
        )
        .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month);
      setEntries(updated);
      saveExpenses(updated);
      setEditingId(null);
      setShowForm(false);
      setForm({ year: CURRENT_YEAR, month: CURRENT_MONTH, category: "Housing", subCategory: SUBCATEGORIES["Housing"][0], description: "", amountUSD: "" });
    } else {
      const entry: ExpenseEntry = {
        id: crypto.randomUUID(),
        year: form.year,
        month: form.month,
        category: form.category,
        subCategory: form.subCategory || undefined,
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
  }

  function remove(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    saveExpenses(updated);
  }

  const yearEntries = entries.filter((e) => e.year === filterYear);
  const periodEntries = yearEntries.filter((e) => filterMonth === 0 || e.month === filterMonth);
  const thisMonthTotal = entries
    .filter((e) => e.year === CURRENT_YEAR && e.month === CURRENT_MONTH)
    .reduce((s, e) => s + e.amountUSD, 0);
  const yearTotal = yearEntries.reduce((s, e) => s + e.amountUSD, 0);

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    total: periodEntries.filter((e) => e.category === cat).reduce((s, e) => s + e.amountUSD, 0),
  }));

  const monthsWithData = new Set(yearEntries.map((e) => e.month)).size;
  const avgMonthly = monthsWithData > 0 ? yearTotal / monthsWithData : 0;

  const incomeEntries = loadIncome();
  const yearIncome = incomeEntries
    .filter((e) => e.year === filterYear)
    .reduce((s, e) => s + e.amountUSD, 0);
  const savingsRate = yearIncome > 0 ? ((yearIncome - yearTotal) / yearIncome) * 100 : null;

  const monthlyData = MONTHS.map((label, i) => ({
    label,
    total: yearEntries.filter((e) => e.month === i + 1).reduce((s, e) => s + e.amountUSD, 0),
  }));

  const pieData = byCategory.filter((c) => c.total > 0).map((c) => ({ name: c.cat, value: c.total }));
  const pieTotalValue = pieData.reduce((s, p) => s + p.value, 0);

  const years = Array.from(new Set([CURRENT_YEAR, ...entries.map((e) => e.year)])).sort((a, b) => b - a);

  // Subcategory drill-down
  const catsWithData = CATEGORIES.filter((cat) =>
    periodEntries.some((e) => e.category === cat)
  );
  const topCat = byCategory.reduce((best, c) => (c.total > best.total ? c : best), { cat: "Other" as ExpenseCategory, total: 0 });
  const activeDrillCat = drillCat ?? (topCat.total > 0 ? topCat.cat : null);
  const DRILL_COLORS = ["#6366f1", "#22d3ee", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#fb923c", "#14b8a6"];
  const drillData = activeDrillCat
    ? Object.entries(
        periodEntries
          .filter((e) => e.category === activeDrillCat)
          .reduce<Record<string, number>>((acc, e) => {
            const sub = e.subCategory ?? "Other";
            acc[sub] = (acc[sub] ?? 0) + e.amountUSD;
            return acc;
          }, {})
      )
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    : [];
  const drillTotal = drillData.reduce((s, d) => s + d.value, 0);

  // Table: year → month → category → search → pagination
  const q = searchQuery.trim().toLowerCase();
  const tableEntries = periodEntries
    .filter((e) => filterCategory === "All" || e.category === filterCategory)
    .filter((e) =>
      !q ||
      e.description.toLowerCase().includes(q) ||
      (e.subCategory ?? "").toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );

  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(tableEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEntries = tableEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Expenses</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
        Track monthly spending by category. All amounts in USD.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <KPICard label={`${MONTHS[CURRENT_MONTH - 1]} Spending`} value={fmt(thisMonthTotal)} />
        <KPICard label={`${filterYear} Total`} value={fmt(yearTotal)} />
        <KPICard label="Avg Monthly" value={avgMonthly > 0 ? fmt(avgMonthly) : "—"} />
        <KPICard
          label={`${filterYear} Savings Rate`}
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
              <ResponsiveContainer width="100%" height={Math.max(180, pieData.length * 32)}>
                <BarChart data={pieData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => {
                      const pct = pieTotalValue > 0 ? ((Number(value) / pieTotalValue) * 100).toFixed(1) : "0.0";
                      return [`${fmt(Number(value))} (${pct}%)`, name];
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.name as ExpenseCategory] ?? "#71717a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Subcategory drill-down */}
      {catsWithData.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 mb-6">
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Subcategory Breakdown</p>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {catsWithData.map((cat) => (
              <button key={cat} onClick={() => setDrillCat(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeDrillCat === cat
                    ? "text-white border-transparent"
                    : "border-gray-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                }`}
                style={activeDrillCat === cat ? { backgroundColor: CATEGORY_COLORS[cat] } : {}}>
                {cat}
              </button>
            ))}
          </div>

          {/* Chart */}
          {drillData.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">No subcategory data for {activeDrillCat}.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={drillData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-700" />
                <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip formatter={(v) => [fmt(Number(v)), "Amount"]} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {drillData.map((_, i) => (
                    <Cell key={i} fill={DRILL_COLORS[i % DRILL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Summary legend */}
          {drillData.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {drillData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DRILL_COLORS[i % DRILL_COLORS.length] }} />
                  {d.name}: {fmt(d.value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Entry Form */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => { if (editingId) cancelEdit(); setShowForm(!showForm); }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">{editingId ? "Edit Entry" : "Add Entry"}</span>
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
                  onChange={(e) => handleCategoryChange(e.target.value as ExpenseCategory)}
                  className={INPUT}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Subcategory</label>
                <select value={form.subCategory}
                  onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))}
                  className={INPUT}>
                  {SUBCATEGORIES[form.category].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2 md:col-span-1">
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
            <div className="flex gap-2 mt-3">
              <button onClick={saveEntry}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {editingId ? "Save Changes" : "Add"}
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

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Year:</span>
        <select value={filterYear}
          onChange={(e) => { setFilterYear(+e.target.value); setPage(1); }}
          className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>

        <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">Month:</span>
        <select value={filterMonth}
          onChange={(e) => { setFilterMonth(+e.target.value); setPage(1); }}
          className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
          <option value={0}>All</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>

        <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">Category:</span>
        <select value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value as ExpenseCategory | "All"); setPage(1); }}
          className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">
          <option value="All">All</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>

        <div className="relative ml-auto">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-7 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 w-32 focus:w-48 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
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
            {tableEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">
                  {q || filterCategory !== "All"
                    ? "No entries match your filters."
                    : `No expenses for ${filterYear}.`}
                </td>
              </tr>
            ) : (
              pageEntries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{MONTHS[e.month - 1]} {e.year}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: CATEGORY_COLORS[e.category] }}>
                      {e.category}
                    </span>
                    {e.subCategory && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{e.subCategory}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{e.description}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-500 dark:text-red-400">{fmt(e.amountUSD)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(e)}
                        className="text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 text-xs">✎</button>
                      <button onClick={() => remove(e.id)}
                        className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tableEntries.length)} of {tableEntries.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-default transition-colors"
              >‹ Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1 text-xs text-zinc-400">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)}
                      className={`w-7 h-7 text-xs rounded-md transition-colors ${
                        safePage === p
                          ? "bg-blue-600 text-white"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                      }`}>
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-default transition-colors"
              >Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
