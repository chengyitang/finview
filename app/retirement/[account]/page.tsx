"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { RetirementAccount } from "@/types";
import { loadRetirement, saveRetirement } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";

const ACCOUNT_META: Record<string, { label: string; type: RetirementAccount["type"]; limit2025: number }> = {
  "401k": { label: "401(k)", type: "401k", limit2025: 23500 },
  hsa: { label: "HSA", type: "HSA", limit2025: 4300 },
  ira: { label: "IRA / Roth IRA", type: "IRA", limit2025: 7000 },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

const EMPTY_FORM = {
  year: CURRENT_YEAR,
  month: CURRENT_MONTH,
  isMonthly: true,
  contributions: "",
  employerMatch: "",
  balance: "",
  notes: "",
};

function sortEntries(arr: RetirementAccount[]) {
  return [...arr].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return (b.month ?? 0) - (a.month ?? 0);
  });
}

function buildId(type: string, year: number, month?: number) {
  return month ? `${type}-${year}-${month}` : `${type}-${year}`;
}

export default function RetirementPage() {
  const { account } = useParams<{ account: string }>();
  const meta = ACCOUNT_META[account] ?? ACCOUNT_META["401k"];

  const [entries, setEntries] = useState<RetirementAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    setEntries(sortEntries(loadRetirement().filter((e) => e.type === meta.type)));
  }, [meta.type]);

  function saveEntry() {
    const newMonth = form.isMonthly ? form.month : undefined;
    const id = editingId ?? buildId(meta.type, form.year, newMonth);
    const all = loadRetirement();
    const filtered = editingId
      ? all.filter((e) => e.id !== editingId)
      : all.filter((e) => !(e.type === meta.type && e.year === form.year && e.month === newMonth));

    const entry: RetirementAccount = {
      id,
      type: meta.type,
      year: form.year,
      month: newMonth,
      contributions: parseFloat(form.contributions) || 0,
      employerMatch: parseFloat(form.employerMatch) || 0,
      balance: parseFloat(form.balance) || 0,
      notes: form.notes,
    };
    const updated = sortEntries([...filtered, entry]);
    saveRetirement(updated);
    setEntries(updated.filter((e) => e.type === meta.type));
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  }

  function startEdit(e: RetirementAccount) {
    setForm({
      year: e.year,
      month: e.month ?? CURRENT_MONTH,
      isMonthly: e.month !== undefined,
      contributions: e.contributions.toString(),
      employerMatch: (e.employerMatch ?? 0).toString(),
      balance: e.balance.toString(),
      notes: e.notes,
    });
    setEditingId(e.id);
    setShowForm(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  }

  function remove(id: string) {
    const all = loadRetirement().filter((e) => e.id !== id);
    saveRetirement(all);
    setEntries(sortEntries(all.filter((e) => e.type === meta.type)));
  }

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const latest = entries[0];
  const thisYearContrib = entries
    .filter((e) => e.year === CURRENT_YEAR)
    .reduce((s, e) => s + e.contributions, 0);
  const thisMonthEntry = entries.find(
    (e) => e.year === CURRENT_YEAR && e.month === CURRENT_MONTH
  );

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{meta.label}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
        2025 contribution limit: {fmt(meta.limit2025)}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <KPICard label="Current Balance" value={latest ? fmt(latest.balance) : "—"} />
        <KPICard label={`${CURRENT_YEAR} Contributions`} value={thisYearContrib > 0 ? fmt(thisYearContrib) : "—"} />
        <KPICard label="This Month" value={thisMonthEntry ? fmt(thisMonthEntry.contributions) : "—"} />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <button
          onClick={() => {
            if (showForm && editingId) { cancelEdit(); } else { setShowForm(!showForm); }
          }}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="font-semibold text-sm">{editingId ? "Edit Entry" : "Add Entry"}</span>
          <span className="text-zinc-400 text-xs">{showForm ? "▲" : "▼"}</span>
        </button>
        {showForm && (
          <div className="px-5 pb-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Mode:</span>
              <button
                onClick={() => setForm((f) => ({ ...f, isMonthly: true }))}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${form.isMonthly ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
              >Monthly</button>
              <button
                onClick={() => setForm((f) => ({ ...f, isMonthly: false }))}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!form.isMonthly ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
              >Annual</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Year</label>
                <input type="number" value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: +e.target.value }))}
                  className={INPUT} />
              </div>
              {form.isMonthly && (
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Month</label>
                  <select value={form.month}
                    onChange={(e) => setForm((f) => ({ ...f, month: +e.target.value }))}
                    className={INPUT}>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Contributions</label>
                <input type="number" placeholder="0" value={form.contributions}
                  onChange={(e) => setForm((f) => ({ ...f, contributions: e.target.value }))}
                  className={INPUT} />
              </div>
              {meta.type === "401k" && (
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Employer Match</label>
                  <input type="number" placeholder="0" value={form.employerMatch}
                    onChange={(e) => setForm((f) => ({ ...f, employerMatch: e.target.value }))}
                    className={INPUT} />
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Balance (end of {form.isMonthly ? "month" : "year"})
                </label>
                <input type="number" placeholder="0" value={form.balance}
                  onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                  className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Notes</label>
                <input type="text" placeholder="Optional" value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className={INPUT} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveEntry}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Save
              </button>
              {editingId && (
                <button onClick={cancelEdit}
                  className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm font-medium">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              <th className="text-left px-4 py-3">Period</th>
              <th className="text-right px-4 py-3">Contributions</th>
              {meta.type === "401k" && <th className="text-right px-4 py-3">Employer Match</th>}
              <th className="text-right px-4 py-3">Balance</th>
              <th className="text-left px-4 py-3">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={meta.type === "401k" ? 6 : 5} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">
                  No records yet.
                </td>
              </tr>
            ) : entries.map((e) => (
              <tr key={e.id}
                className={`border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30 ${editingId === e.id ? "bg-blue-50 dark:bg-blue-900/10" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {e.month ? `${MONTH_NAMES[e.month - 1]} ${e.year}` : e.year}
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmt(e.contributions)}</td>
                {meta.type === "401k" && (
                  <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                    {fmt(e.employerMatch ?? 0)}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-mono">{fmt(e.balance)}</td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{e.notes}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(e)}
                    className="text-zinc-400 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 text-xs mr-2">✎</button>
                  <button onClick={() => remove(e.id)}
                    className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
