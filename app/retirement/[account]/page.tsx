"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { RetirementAccount } from "@/types";
import { loadRetirement, saveRetirement } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";

const ACCOUNT_META: Record<string, { label: string; type: RetirementAccount["type"]; limit2024: number }> = {
  "401k": { label: "401(k)", type: "401k", limit2024: 23000 },
  hsa: { label: "HSA", type: "HSA", limit2024: 4150 },
  ira: { label: "IRA / Roth IRA", type: "IRA", limit2024: 7000 },
};

const CURRENT_YEAR = new Date().getFullYear();

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

export default function RetirementPage() {
  const { account } = useParams<{ account: string }>();
  const meta = ACCOUNT_META[account] ?? ACCOUNT_META["401k"];

  const [entries, setEntries] = useState<RetirementAccount[]>([]);
  const [form, setForm] = useState({
    year: CURRENT_YEAR,
    contributions: "",
    employerMatch: "",
    balance: "",
    notes: "",
  });

  useEffect(() => {
    setEntries(loadRetirement().filter((e) => e.type === meta.type));
  }, [meta.type]);

  function upsert() {
    const all = loadRetirement().filter((e) => !(e.type === meta.type && e.year === form.year));
    const entry: RetirementAccount = {
      id: `${meta.type}-${form.year}`,
      type: meta.type,
      year: form.year,
      contributions: parseFloat(form.contributions) || 0,
      employerMatch: parseFloat(form.employerMatch) || 0,
      balance: parseFloat(form.balance) || 0,
      notes: form.notes,
    };
    const updated = [...all, entry].sort((a, b) => b.year - a.year);
    saveRetirement(updated);
    setEntries(updated.filter((e) => e.type === meta.type));
  }

  function remove(year: number) {
    const all = loadRetirement().filter((e) => !(e.type === meta.type && e.year === year));
    saveRetirement(all);
    setEntries(all.filter((e) => e.type === meta.type));
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const latest = entries[0];
  const totalContrib = entries.reduce((s, e) => s + e.contributions, 0);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{meta.label}</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
        {CURRENT_YEAR} contribution limit: {fmt(meta.limit2024)}
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPICard label="Current Balance" value={latest ? fmt(latest.balance) : "—"} />
        <KPICard label={`${CURRENT_YEAR} Contributions`} value={latest?.year === CURRENT_YEAR ? fmt(latest.contributions) : "—"} />
        <KPICard label="All-Time Contributions" value={fmt(totalContrib)} />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Add / Update Year</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Year</label>
            <input type="number" value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: +e.target.value }))}
              className={INPUT} />
          </div>
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
            <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Balance (end of year)</label>
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
        <button onClick={upsert}
          className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Save
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
              <th className="text-left px-4 py-3">Year</th>
              <th className="text-right px-4 py-3">Contributions</th>
              {meta.type === "401k" && <th className="text-right px-4 py-3">Employer Match</th>}
              <th className="text-right px-4 py-3">Balance</th>
              <th className="text-left px-4 py-3">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500">No records yet.</td></tr>
            ) : entries.map((e) => (
              <tr key={e.year} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium">{e.year}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(e.contributions)}</td>
                {meta.type === "401k" && <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(e.employerMatch ?? 0)}</td>}
                <td className="px-4 py-3 text-right font-mono">{fmt(e.balance)}</td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{e.notes}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(e.year)} className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
