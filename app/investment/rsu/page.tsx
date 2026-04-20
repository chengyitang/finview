"use client";

import { useState, useEffect } from "react";
import { Company, Grant, VestingEvent } from "@/types";
import { loadGrants, saveGrants, loadCustomCompanies, saveCustomCompanies } from "@/lib/storage";
import { BUILTIN_COMPANIES } from "@/lib/companies";
import { getVestingEvents, calcTotalValue } from "@/lib/vesting";
import { getAmazonReferenceDate, formatDateISO } from "@/lib/referenceDate";
import KPICard from "@/components/ui/KPICard";

const VESTING_PRESETS: Record<string, { label: string; tranches: Company["tranches"] }> = {
  annual4: {
    label: "Annual 4-year (25/25/25/25)",
    tranches: [12, 24, 36, 48].map((m) => ({ monthsFromGrant: m, percentage: 25 })),
  },
  amazon: {
    label: "Amazon (5/15/20/20/20/20)",
    tranches: BUILTIN_COMPANIES.find((c) => c.id === "amazon")!.tranches,
  },
  google: {
    label: "Google quarterly (25 → quarterly)",
    tranches: BUILTIN_COMPANIES.find((c) => c.id === "google")!.tranches,
  },
  nvidia: {
    label: "NVIDIA quarterly",
    tranches: BUILTIN_COMPANIES.find((c) => c.id === "nvidia")!.tranches,
  },
};

const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RSUPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [customCompanies, setCustomCompanies] = useState<Company[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(BUILTIN_COMPANIES[0].id);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [expandedGrant, setExpandedGrant] = useState<string | null>(null);
  const [grantForm, setGrantForm] = useState({
    grantDate: new Date().toISOString().slice(0, 10),
    mode: "shares" as "shares" | "dollars",
    totalShares: "",
    dollarValue: "",
    label: "",
    onboardDate: new Date().toISOString().slice(0, 10),
  });
  const [companyForm, setCompanyForm] = useState({
    name: "",
    ticker: "",
    preset: "annual4",
    isPrivate: false,
  });

  const allCompanies = [...BUILTIN_COMPANIES, ...customCompanies];

  useEffect(() => {
    setGrants(loadGrants());
    setCustomCompanies(loadCustomCompanies());
  }, []);

  useEffect(() => {
    fetchPricesForVisible(grants, allCompanies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grants]);

  async function fetchPrice(ticker: string) {
    if (prices[ticker]) return prices[ticker];
    setLoading((l) => ({ ...l, [ticker]: true }));
    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (data.price) {
        setPrices((p) => ({ ...p, [ticker]: data.price }));
        return data.price as number;
      }
    } catch {}
    setLoading((l) => ({ ...l, [ticker]: false }));
    return 0;
  }

  async function fetchAmazonAvg(onboardDate: string): Promise<number> {
    const refDate = getAmazonReferenceDate(new Date(onboardDate));
    const refStr = formatDateISO(refDate);
    try {
      const res = await fetch(`/api/stock/avg?ticker=AMZN&referenceDate=${refStr}`);
      const data = await res.json();
      return data.avg ?? 0;
    } catch {
      return 0;
    }
  }

  async function fetchPricesForVisible(grantList: Grant[], companies: Company[]) {
    const tickers = [...new Set(
      grantList.map((g) => companies.find((c) => c.id === g.companyId)?.ticker).filter(Boolean) as string[]
    )];
    await Promise.allSettled(tickers.map(fetchPrice));
  }

  async function addGrant() {
    const company = allCompanies.find((c) => c.id === selectedCompanyId);
    if (!company || !grantForm.grantDate) return;

    let totalShares = parseInt(grantForm.totalShares) || 0;
    let originalValueUSD: number | undefined;

    if (grantForm.mode === "dollars" && grantForm.dollarValue) {
      originalValueUSD = parseFloat(grantForm.dollarValue);
      let priceForCalc: number;
      if (company.priceMethod === "30day-trailing-avg") {
        priceForCalc = await fetchAmazonAvg(grantForm.onboardDate);
      } else {
        priceForCalc = await fetchPrice(company.ticker);
      }
      totalShares = priceForCalc > 0 ? Math.round(originalValueUSD / priceForCalc) : 0;
    }

    if (!totalShares) return;

    const grant: Grant = {
      id: crypto.randomUUID(),
      companyId: selectedCompanyId,
      grantDate: grantForm.grantDate,
      totalShares,
      label: grantForm.label || undefined,
      originalValueUSD,
    };

    const updated = [...grants, grant];
    setGrants(updated);
    saveGrants(updated);
    setGrantForm((f) => ({ ...f, totalShares: "", dollarValue: "", label: "" }));
    setShowGrantForm(false);
    await fetchPrice(company.ticker);
  }

  function removeGrant(id: string) {
    const updated = grants.filter((g) => g.id !== id);
    setGrants(updated);
    saveGrants(updated);
  }

  function addCustomCompany() {
    if (!companyForm.name || !companyForm.ticker) return;
    const preset = VESTING_PRESETS[companyForm.preset];
    const company: Company = {
      id: `custom-${Date.now()}`,
      name: companyForm.name,
      ticker: companyForm.ticker.toUpperCase(),
      tranches: preset.tranches,
      private: companyForm.isPrivate,
      custom: true,
    };
    const updated = [...customCompanies, company];
    setCustomCompanies(updated);
    saveCustomCompanies(updated);
    setCompanyForm({ name: "", ticker: "", preset: "annual4", isPrivate: false });
    setShowCompanyForm(false);
    setSelectedCompanyId(company.id);
  }

  // Group grants by company
  const companiesWithGrants = allCompanies
    .map((company) => {
      const companyGrants = grants.filter((g) => g.companyId === company.id);
      if (companyGrants.length === 0) return null;
      const price = prices[company.ticker] ?? 0;
      const allEvents = companyGrants.flatMap((g) => getVestingEvents(g, company));
      const summary = calcTotalValue(allEvents, price);
      return { company, grants: companyGrants, price, summary };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof allCompanies.map>>[number][];

  type CompanyGroup = { company: Company; grants: Grant[]; price: number; summary: ReturnType<typeof calcTotalValue> };
  const typedGroups = companiesWithGrants as CompanyGroup[];
  const totalVested = typedGroups.reduce((s, c) => s + c.summary.vestedValue, 0);
  const totalUnvested = typedGroups.reduce((s, c) => s + c.summary.unvestedValue, 0);

  const selectedCompany = allCompanies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold">RSU Tracker</h1>
          <p className="text-zinc-400 text-sm">Track vesting schedules across companies. Data stored in your browser.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <KPICard label="Total Vested Value" value={`$${fmt2(totalVested)}`} />
        <KPICard label="Total Unvested Value" value={`$${fmt2(totalUnvested)}`} />
        <KPICard label="Total Portfolio Value" value={`$${fmt2(totalVested + totalUnvested)}`} />
      </div>

      {/* Company selector + add grant */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
        >
          {allCompanies.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.ticker}){c.custom ? " *" : ""}</option>
          ))}
        </select>
        <button onClick={() => { setShowGrantForm(!showGrantForm); setShowCompanyForm(false); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Add Grant
        </button>
        <button onClick={() => { setShowCompanyForm(!showCompanyForm); setShowGrantForm(false); }}
          className="border border-zinc-700 hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm">
          + Custom Company
        </button>
      </div>

      {/* Add Grant Form */}
      {showGrantForm && selectedCompany && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <h3 className="font-semibold mb-3">New Grant — {selectedCompany.name}</h3>
          {selectedCompany.priceMethod === "30day-trailing-avg" && (
            <p className="text-xs text-amber-400 mb-3">Amazon uses 30-day trailing average price. Provide your onboard date to auto-calculate.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Grant Date</label>
              <input type="date" value={grantForm.grantDate}
                onChange={(e) => setGrantForm((f) => ({ ...f, grantDate: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Input Mode</label>
              <select value={grantForm.mode}
                onChange={(e) => setGrantForm((f) => ({ ...f, mode: e.target.value as "shares" | "dollars" }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
                <option value="shares">By share count</option>
                <option value="dollars">By dollar value</option>
              </select>
            </div>
            {grantForm.mode === "shares" ? (
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Total Shares</label>
                <input type="number" placeholder="400" value={grantForm.totalShares}
                  onChange={(e) => setGrantForm((f) => ({ ...f, totalShares: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Grant Value (USD)</label>
                  <input type="number" placeholder="200000" value={grantForm.dollarValue}
                    onChange={(e) => setGrantForm((f) => ({ ...f, dollarValue: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
                </div>
                {selectedCompany.priceMethod === "30day-trailing-avg" && (
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Onboard Date</label>
                    <input type="date" value={grantForm.onboardDate}
                      onChange={(e) => setGrantForm((f) => ({ ...f, onboardDate: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
              </>
            )}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Label (optional)</label>
              <input type="text" placeholder="Signing bonus" value={grantForm.label}
                onChange={(e) => setGrantForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addGrant}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add Grant
            </button>
            <button onClick={() => setShowGrantForm(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Custom Company Form */}
      {showCompanyForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <h3 className="font-semibold mb-3">Add Custom Company</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Company Name</label>
              <input type="text" placeholder="Acme Corp" value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Ticker</label>
              <input type="text" placeholder="ACME" value={companyForm.ticker}
                onChange={(e) => setCompanyForm((f) => ({ ...f, ticker: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm uppercase" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Vesting Schedule</label>
              <select value={companyForm.preset}
                onChange={(e) => setCompanyForm((f) => ({ ...f, preset: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
                {Object.entries(VESTING_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input type="checkbox" id="private-co" checked={companyForm.isPrivate}
                onChange={(e) => setCompanyForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                className="rounded" />
              <label htmlFor="private-co" className="text-sm text-zinc-300">Private company (manual price)</label>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addCustomCompany}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add Company
            </button>
            <button onClick={() => setShowCompanyForm(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grants list */}
      {companiesWithGrants.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
          No grants yet. Select a company and click "+ Add Grant".
        </div>
      ) : (
        <div className="space-y-4">
          {typedGroups.map(({ company, grants: cGrants, price, summary }) => (
            <div key={company.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <div>
                  <span className="font-semibold">{company.name}</span>
                  <span className="ml-2 text-zinc-400 text-sm">{company.ticker}</span>
                  {loading[company.ticker] && <span className="ml-2 text-xs text-zinc-500">Loading price...</span>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {price > 0 && (
                    <span className="text-zinc-400">Price: <span className="text-white font-mono">${fmt2(price)}</span></span>
                  )}
                  <span className="text-emerald-400">Vested: <span className="font-mono">${fmt2(summary.vestedValue)}</span></span>
                  <span className="text-zinc-300">Unvested: <span className="font-mono">${fmt2(summary.unvestedValue)}</span></span>
                  <button onClick={() => fetchPrice(company.ticker)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-2 py-1 rounded">
                    Refresh
                  </button>
                </div>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {cGrants.map((grant: Grant) => {
                  const events = getVestingEvents(grant, company);
                  const grantSummary = calcTotalValue(events, price);
                  const isExpanded = expandedGrant === grant.id;
                  return (
                    <div key={grant.id}>
                      <div
                        className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/30 cursor-pointer"
                        onClick={() => setExpandedGrant(isExpanded ? null : grant.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{isExpanded ? "▾" : "▸"}</span>
                          <div>
                            <p className="text-sm font-medium">{grant.label || `Grant — ${grant.grantDate}`}</p>
                            <p className="text-xs text-zinc-500">
                              {grant.totalShares.toLocaleString()} shares · Granted {grant.grantDate}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-emerald-400 font-mono">
                            {grantSummary.vestedShares.toLocaleString()} vested (${fmt2(grantSummary.vestedValue)})
                          </span>
                          <span className="text-zinc-400 font-mono">
                            {grantSummary.unvestedShares.toLocaleString()} unvested
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeGrant(grant.id); }}
                            className="text-zinc-600 hover:text-red-400 text-xs ml-2">✕</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-zinc-500">
                                <th className="text-left py-1">Vest Date</th>
                                <th className="text-right py-1">%</th>
                                <th className="text-right py-1">Shares</th>
                                <th className="text-right py-1">Value</th>
                                <th className="text-right py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {events.map((ev: VestingEvent, i: number) => (
                                <tr key={i} className={ev.vested ? "text-zinc-300" : "text-zinc-500"}>
                                  <td className="py-1">{ev.vestDate}</td>
                                  <td className="text-right py-1">{ev.percentage}%</td>
                                  <td className="text-right py-1 font-mono">{ev.shares.toLocaleString()}</td>
                                  <td className="text-right py-1 font-mono">${fmt2(ev.shares * price)}</td>
                                  <td className="text-right py-1">
                                    {ev.vested
                                      ? <span className="text-emerald-500">Vested</span>
                                      : <span className="text-zinc-600">Pending</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
