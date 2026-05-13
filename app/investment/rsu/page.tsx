"use client";

import { useState, useEffect, useRef } from "react";
import { Company, Grant, VestingEvent } from "@/types";
import { loadGrants, saveGrants, loadCustomCompanies, saveCustomCompanies } from "@/lib/storage";
import { BUILTIN_COMPANIES } from "@/lib/companies";
import { getVestingEvents, calcTotalValue } from "@/lib/vesting";
import { getAmazonReferenceDate, formatDateISO } from "@/lib/referenceDate";
import KPICard from "@/components/ui/KPICard";
import { useToast, ToastContainer } from "@/components/ui/Toast";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

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

const INPUT = "w-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

function PriceHistoryChart({
  company,
  cGrants,
  history,
  loading,
}: {
  company: Company;
  cGrants: Grant[];
  history: { date: string; close: number }[] | undefined;
  loading: boolean;
}) {
  if (company.private) return null;
  if (loading && !history?.length) {
    return (
      <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Loading price history…</p>
      </div>
    );
  }
  if (!history?.length) return null;

  const allEvents = cGrants.flatMap((g) => getVestingEvents(g, company));
  const grantMonths = [...new Set(cGrants.map((g) => g.grantDate.slice(0, 7)))];
  const vestedMonths = [...new Set(allEvents.filter((e) => e.vested).map((e) => e.vestDate.slice(0, 7)))];
  const upcomingMonths = [...new Set(allEvents.filter((e) => !e.vested).map((e) => e.vestDate.slice(0, 7)))];

  const chartMin = history[0].date;
  const chartMax = history[history.length - 1].date;
  const inRange = (ym: string) => ym >= chartMin.slice(0, 7) && ym <= chartMax.slice(0, 7);

  const refX = (ym: string) => history.find((p) => p.date.slice(0, 7) === ym)?.date ?? ym;

  return (
    <div className="px-5 pt-3 pb-2 border-b border-gray-100 dark:border-zinc-800">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
        Price History — {company.ticker} (5Y monthly)
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(0, 7)} interval={11} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            width={48} />
          <Tooltip
            formatter={(v) => [`$${fmt2(Number(v))}`, "Close"]}
            labelFormatter={(l) => String(l).slice(0, 7)}
          />
          <Line type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} />
          {grantMonths.filter(inRange).map((ym) => (
            <ReferenceLine key={`g-${ym}`} x={refX(ym)} stroke="#818cf8" strokeDasharray="4 3" strokeWidth={1.5} />
          ))}
          {vestedMonths.filter(inRange).map((ym) => (
            <ReferenceLine key={`v-${ym}`} x={refX(ym)} stroke="#10b981" strokeWidth={1.5} />
          ))}
          {upcomingMonths.filter(inRange).map((ym) => (
            <ReferenceLine key={`u-${ym}`} x={refX(ym)} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-indigo-400" />Grant date
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-emerald-500" />Vested
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />Upcoming vest
        </span>
      </div>
    </div>
  );
}

export default function RSUPage() {
  const { toasts, addToast, dismiss } = useToast();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [customCompanies, setCustomCompanies] = useState<Company[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, { date: string; close: number }[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const fetchedHistory = useRef(new Set<string>());
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
    allCompanies
      .filter((c) => !c.private && grants.some((g) => g.companyId === c.id))
      .forEach((c) => fetchHistory(c.ticker));
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
        setLoading((l) => ({ ...l, [ticker]: false }));
        return data.price as number;
      } else {
        addToast(`Failed to fetch price for ${ticker}.`);
      }
    } catch {
      addToast(`Failed to fetch price for ${ticker}.`);
    }
    setLoading((l) => ({ ...l, [ticker]: false }));
    return 0;
  }

  async function fetchAmazonAvg(onboardDate: string): Promise<number> {
    const refDate = getAmazonReferenceDate(new Date(onboardDate));
    const refStr = formatDateISO(refDate);
    try {
      const res = await fetch(`/api/stock/avg?ticker=AMZN&referenceDate=${refStr}`);
      const data = await res.json();
      if (data.avg) return data.avg;
      addToast("Could not load Amazon reference price — enter grant shares manually.");
      return 0;
    } catch {
      addToast("Could not load Amazon reference price — enter grant shares manually.");
      return 0;
    }
  }

  async function fetchHistory(ticker: string) {
    if (fetchedHistory.current.has(ticker)) return;
    fetchedHistory.current.add(ticker);
    setHistoryLoading((l) => ({ ...l, [ticker]: true }));
    try {
      const res = await fetch(`/api/stock/history?ticker=${encodeURIComponent(ticker)}&range=5y&interval=1mo`);
      const data = await res.json();
      if (Array.isArray(data.points) && data.points.length > 0) {
        setPriceHistory((prev) => ({ ...prev, [ticker]: data.points }));
      } else {
        addToast(`Failed to load price history for ${ticker}.`);
      }
    } catch {
      addToast(`Failed to load price history for ${ticker}.`);
    }
    setHistoryLoading((l) => ({ ...l, [ticker]: false }));
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
  const totalGrantValue = typedGroups.reduce(
    (s, { grants: cGrants }) => s + cGrants.reduce((g, gr) => g + (gr.originalValueUSD ?? 0), 0), 0
  );
  const grantPL = (totalVested + totalUnvested) - totalGrantValue;
  const grantPLPct = totalGrantValue > 0 ? (grantPL / totalGrantValue) * 100 : 0;

  const selectedCompany = allCompanies.find((c) => c.id === selectedCompanyId);

  return (
    <>
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold">RSU Tracker</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Track vesting schedules and current value across companies and grants.</p>
        </div>
      </div>

      <div className={`grid gap-3 sm:gap-4 mb-6 ${totalGrantValue > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
        <KPICard label="Total Vested Value" value={`$${fmt2(totalVested)}`} />
        <KPICard label="Total Unvested Value" value={`$${fmt2(totalUnvested)}`} />
        <KPICard label="Total Portfolio Value" value={`$${fmt2(totalVested + totalUnvested)}`} />
        {totalGrantValue > 0 && (
          <KPICard
            label="vs. Grant Value"
            value={`${grantPL >= 0 ? "+" : "-"}$${fmt2(Math.abs(grantPL))}`}
            sub={`${grantPLPct >= 0 ? "▲" : "▼"} ${Math.abs(grantPLPct).toFixed(1)}% from $${fmt2(totalGrantValue)}`}
            positive={grantPL >= 0}
            negative={grantPL < 0}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={selectedCompanyId}
          onChange={(e) => setSelectedCompanyId(e.target.value)}
          className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100">
          {allCompanies.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.ticker}){c.custom ? " *" : ""}</option>
          ))}
        </select>
        <button onClick={() => { setShowGrantForm(!showGrantForm); setShowCompanyForm(false); }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Add Grant
        </button>
        <button onClick={() => { setShowCompanyForm(!showCompanyForm); setShowGrantForm(false); }}
          className="border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
          + Custom Company
        </button>
      </div>

      {showGrantForm && selectedCompany && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-4">
          <h3 className="font-semibold mb-3">New Grant — {selectedCompany.name}</h3>
          {selectedCompany.priceMethod === "30day-trailing-avg" && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Amazon uses 30-day trailing average price. Provide your onboard date to auto-calculate.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Grant Date</label>
              <input type="date" value={grantForm.grantDate}
                onChange={(e) => setGrantForm((f) => ({ ...f, grantDate: e.target.value }))}
                className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Input Mode</label>
              <select value={grantForm.mode}
                onChange={(e) => setGrantForm((f) => ({ ...f, mode: e.target.value as "shares" | "dollars" }))}
                className={INPUT}>
                <option value="shares">By share count</option>
                <option value="dollars">By dollar value</option>
              </select>
            </div>
            {grantForm.mode === "shares" ? (
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Total Shares</label>
                <input type="number" placeholder="400" value={grantForm.totalShares}
                  onChange={(e) => setGrantForm((f) => ({ ...f, totalShares: e.target.value }))}
                  className={INPUT} />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Grant Value (USD)</label>
                  <input type="number" placeholder="200000" value={grantForm.dollarValue}
                    onChange={(e) => setGrantForm((f) => ({ ...f, dollarValue: e.target.value }))}
                    className={INPUT} />
                </div>
                {selectedCompany.priceMethod === "30day-trailing-avg" && (
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Onboard Date</label>
                    <input type="date" value={grantForm.onboardDate}
                      onChange={(e) => setGrantForm((f) => ({ ...f, onboardDate: e.target.value }))}
                      className={INPUT} />
                  </div>
                )}
              </>
            )}
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Label (optional)</label>
              <input type="text" placeholder="Signing bonus" value={grantForm.label}
                onChange={(e) => setGrantForm((f) => ({ ...f, label: e.target.value }))}
                className={INPUT} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addGrant}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add Grant
            </button>
            <button onClick={() => setShowGrantForm(false)}
              className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCompanyForm && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-4">
          <h3 className="font-semibold mb-3">Add Custom Company</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Company Name</label>
              <input type="text" placeholder="Acme Corp" value={companyForm.name}
                onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Ticker</label>
              <input type="text" placeholder="ACME" value={companyForm.ticker}
                onChange={(e) => setCompanyForm((f) => ({ ...f, ticker: e.target.value }))}
                className={`${INPUT} uppercase`} />
            </div>
            <div>
              <label className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 block">Vesting Schedule</label>
              <select value={companyForm.preset}
                onChange={(e) => setCompanyForm((f) => ({ ...f, preset: e.target.value }))}
                className={INPUT}>
                {Object.entries(VESTING_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input type="checkbox" id="private-co" checked={companyForm.isPrivate}
                onChange={(e) => setCompanyForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                className="rounded" />
              <label htmlFor="private-co" className="text-sm text-zinc-600 dark:text-zinc-300">Private company (manual price)</label>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addCustomCompany}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Add Company
            </button>
            <button onClick={() => setShowCompanyForm(false)}
              className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {companiesWithGrants.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-12 text-center text-zinc-400 dark:text-zinc-500">
          No grants yet. Select a company and click "+ Add Grant".
        </div>
      ) : (
        <div className="space-y-4">
          {typedGroups.map(({ company, grants: cGrants, price, summary }) => (
            <div key={company.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800">
                <div>
                  <span className="font-semibold">{company.name}</span>
                  <span className="ml-2 text-zinc-500 dark:text-zinc-400 text-sm">{company.ticker}</span>
                  {loading[company.ticker] && <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">Loading price...</span>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {price > 0 && (
                    <span className="text-zinc-500 dark:text-zinc-400">Price: <span className="text-zinc-900 dark:text-white font-mono">${fmt2(price)}</span></span>
                  )}
                  <span className="text-emerald-600 dark:text-emerald-400">Vested: <span className="font-mono">${fmt2(summary.vestedValue)}</span></span>
                  <span className="text-zinc-600 dark:text-zinc-300">Unvested: <span className="font-mono">${fmt2(summary.unvestedValue)}</span></span>
                  <button onClick={() => fetchPrice(company.ticker)}
                    className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-gray-300 dark:border-zinc-700 px-2 py-1 rounded">
                    Refresh
                  </button>
                </div>
              </div>
              <PriceHistoryChart
                company={company}
                cGrants={cGrants}
                history={priceHistory[company.ticker]}
                loading={!!historyLoading[company.ticker]}
              />
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                {cGrants.map((grant: Grant) => {
                  const events = getVestingEvents(grant, company);
                  const grantSummary = calcTotalValue(events, price);
                  const isExpanded = expandedGrant === grant.id;
                  return (
                    <div key={grant.id}>
                      <div
                        className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/30 cursor-pointer"
                        onClick={() => setExpandedGrant(isExpanded ? null : grant.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{isExpanded ? "▾" : "▸"}</span>
                          <div>
                            <p className="text-sm font-medium">{grant.label || `Grant — ${grant.grantDate}`}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                              {grant.totalShares.toLocaleString()} shares · Granted {grant.grantDate}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                            {grantSummary.vestedShares.toLocaleString()} vested (${fmt2(grantSummary.vestedValue)})
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                            {grantSummary.unvestedShares.toLocaleString()} unvested
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeGrant(grant.id); }}
                            className="text-zinc-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 text-xs ml-2">✕</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-zinc-400 dark:text-zinc-500">
                                <th className="text-left py-1">Vest Date</th>
                                <th className="text-right py-1">%</th>
                                <th className="text-right py-1">Shares</th>
                                <th className="text-right py-1">Value</th>
                                <th className="text-right py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {events.map((ev: VestingEvent, i: number) => (
                                <tr key={i} className={ev.vested ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}>
                                  <td className="py-1">{ev.vestDate}</td>
                                  <td className="text-right py-1">{ev.percentage}%</td>
                                  <td className="text-right py-1 font-mono">{ev.shares.toLocaleString()}</td>
                                  <td className="text-right py-1 font-mono">${fmt2(ev.shares * price)}</td>
                                  <td className="text-right py-1">
                                    {ev.vested
                                      ? <span className="text-emerald-600 dark:text-emerald-500">Vested</span>
                                      : <span className="text-zinc-400 dark:text-zinc-600">Pending</span>}
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
    <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  );
}
