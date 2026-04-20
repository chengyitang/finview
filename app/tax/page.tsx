"use client";

import { useState, useEffect } from "react";
import { TaxEntry } from "@/types";
import { loadTax, saveTax } from "@/lib/storage";
import KPICard from "@/components/ui/KPICard";

const CURRENT_YEAR = new Date().getFullYear();

export default function TaxPage() {
  const [entries, setEntries] = useState<TaxEntry[]>([]);
  const [form, setForm] = useState({
    year: CURRENT_YEAR,
    federalOwed: "",
    stateOwed: "",
    federalPaid: "",
    statePaid: "",
    notes: "",
  });

  useEffect(() => {
    setEntries(loadTax());
  }, []);

  function upsert() {
    const entry: TaxEntry = {
      id: form.year.toString(),
      year: form.year,
      federalOwed: parseFloat(form.federalOwed) || 0,
      stateOwed: parseFloat(form.stateOwed) || 0,
      federalPaid: parseFloat(form.federalPaid) || 0,
      statePaid: parseFloat(form.statePaid) || 0,
      notes: form.notes,
    };
    const updated = [...entries.filter((e) => e.year !== form.year), entry].sort((a, b) => b.year - a.year);
    setEntries(updated);
    saveTax(updated);
  }

  function remove(year: number) {
    const updated = entries.filter((e) => e.year !== year);
    setEntries(updated);
    saveTax(updated);
  }

  function loadEntry(e: TaxEntry) {
    setForm({
      year: e.year,
      federalOwed: e.federalOwed.toString(),
      stateOwed: e.stateOwed.toString(),
      federalPaid: e.federalPaid.toString(),
      statePaid: e.statePaid.toString(),
      notes: e.notes,
    });
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const current = entries.find((e) => e.year === CURRENT_YEAR);
  const totalOwed = (current?.federalOwed ?? 0) + (current?.stateOwed ?? 0);
  const totalPaid = (current?.federalPaid ?? 0) + (current?.statePaid ?? 0);
  const balance = totalOwed - totalPaid;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Tax</h1>
      <p className="text-zinc-400 text-sm mb-6">Track estimated taxes owed vs. paid by year.</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPICard label={`${CURRENT_YEAR} Total Owed`} value={fmt(totalOwed)} />
        <KPICard label={`${CURRENT_YEAR} Total Paid`} value={fmt(totalPaid)} />
        <KPICard
          label="Balance Due"
          value={fmt(Math.abs(balance))}
          positive={balance <= 0}
          negative={balance > 0}
          sub={balance <= 0 ? "Refund expected" : "Still owed"}
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Add / Update Year</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Year</label>
            <input type="number" value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: +e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Federal Owed</label>
            <input type="number" placeholder="0" value={form.federalOwed}
              onChange={(e) => setForm((f) => ({ ...f, federalOwed: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">State Owed</label>
            <input type="number" placeholder="0" value={form.stateOwed}
              onChange={(e) => setForm((f) => ({ ...f, stateOwed: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Federal Paid (Withheld)</label>
            <input type="number" placeholder="0" value={form.federalPaid}
              onChange={(e) => setForm((f) => ({ ...f, federalPaid: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">State Paid (Withheld)</label>
            <input type="number" placeholder="0" value={form.statePaid}
              onChange={(e) => setForm((f) => ({ ...f, statePaid: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
            <input type="text" placeholder="Optional" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={upsert}
          className="mt-3 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Save
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="text-left px-4 py-3">Year</th>
              <th className="text-right px-4 py-3">Fed Owed</th>
              <th className="text-right px-4 py-3">State Owed</th>
              <th className="text-right px-4 py-3">Fed Paid</th>
              <th className="text-right px-4 py-3">State Paid</th>
              <th className="text-right px-4 py-3">Balance</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No tax records yet.</td></tr>
            ) : entries.map((e) => {
              const bal = (e.federalOwed + e.stateOwed) - (e.federalPaid + e.statePaid);
              return (
                <tr key={e.year} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer" onClick={() => loadEntry(e)}>
                  <td className="px-4 py-3 font-medium">{e.year}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(e.federalOwed)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(e.stateOwed)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(e.federalPaid)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(e.statePaid)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${bal > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {bal > 0 ? `+${fmt(bal)}` : fmt(Math.abs(bal))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={(ev) => { ev.stopPropagation(); remove(e.year); }} className="text-zinc-600 hover:text-red-400 text-xs">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
