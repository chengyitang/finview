"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";

const sections = [
  { title: "Net Worth",  href: "/net-worth", desc: "Your total assets minus liabilities — the single most important financial number.", icon: "📋", color: "border-indigo-600 dark:border-indigo-700" },
  { title: "Income",    href: "/income",    desc: "Track salary, bonuses, and other income sources.", icon: "💵", color: "border-emerald-600 dark:border-emerald-700" },
  { title: "Expenses",  href: "/expenses",  desc: "Track monthly spending by category and see your savings rate.", icon: "💸", color: "border-orange-600 dark:border-orange-700" },
  { title: "Tax", href: "/tax", desc: "Track federal and state taxes owed and withheld by year.", icon: "🧾", color: "border-yellow-600 dark:border-yellow-700" },
  { title: "401(k)", href: "/retirement/401k", desc: "Log contributions, employer match, and balance.", icon: "🏦", color: "border-blue-600 dark:border-blue-700" },
  { title: "HSA", href: "/retirement/hsa", desc: "Track health savings account contributions and balance.", icon: "🏥", color: "border-teal-600 dark:border-teal-700" },
  { title: "IRA / Roth IRA", href: "/retirement/ira", desc: "Log IRA and Roth IRA contributions and year-end balance.", icon: "📑", color: "border-purple-600 dark:border-purple-700" },
  { title: "Stock Portfolio", href: "/investment/portfolio", desc: "Track US and Taiwan stocks with live prices. CSV import/export supported.", icon: "📊", color: "border-blue-600 dark:border-blue-700" },
  { title: "RSU", href: "/investment/rsu", desc: "Calculate vested and unvested RSU value across multiple grants and companies.", icon: "📈", color: "border-pink-600 dark:border-pink-700" },
];

const HOW_IT_WORKS = [
  {
    title: "Stock Portfolio",
    items: [
      { label: "Cost basis", detail: "Weighted Average (WAVG) — every new buy blends purchase price + fees into the running average. Subsequent buys raise or lower the avg proportionally." },
      { label: "Sells", detail: "Reduce the remaining cost basis proportionally (WAVG cost × shares sold). When all shares are sold the position fully closes and the cost resets to zero, so a future rebuy starts a brand-new cost cycle." },
      { label: "Dividends", detail: "Tracked separately and improve the adjusted avg cost, but do not change the raw cost basis or the Capital Gain figure." },
      { label: "Taiwan stocks", detail: "Pure-numeric tickers automatically get a .TW suffix. Prices are fetched in TWD and divided by the live USD/TWD rate so every position can be viewed in either currency." },
      { label: "Amazon RSUs", detail: "Uses a 30-day trailing average price — not the live spot — anchored to the last Friday before the 15th of the prior month (OKX-style reference date)." },
    ],
  },
  {
    title: "Crypto",
    items: [
      { label: "Cost basis", detail: "Same WAVG algorithm as stocks, computed from your imported OKX spot fills. Fees are included in cost. Sell-all resets the cycle." },
      { label: "All-time P&L", detail: "OKX live balance is the authoritative quantity. P&L = (OKX balance × WAVG avgCost from fills) subtracted from OKX market value. Only coins with fill history have a non-zero gain." },
      { label: "Coins with no fills", detail: "Deposits and stablecoins (USDG, USDT…) have no fill records. They contribute 0 to the gain numerator but their current value is added to the cost denominator, so the return % correctly reflects your full capital deployed." },
      { label: "Return %", detail: "Total gain ÷ total cost, where total cost = (fills-based cost basis for traded coins) + (current market value for coins with no fills)." },
      { label: "24h Change", detail: "Sum of (balance × price change) for each coin using the 24h open price from OKX market tickers. Represents today's unrealised dollar move." },
      { label: "Data source", detail: "Live balances and prices via OKX API (us.okx.com). Historical fills paginated from fills-history (up to 3 years) and fills (last 3 months), deduplicated by tradeId." },
    ],
  },
  {
    title: "Net Worth",
    items: [
      { label: "Formula", detail: "Net Worth = Total Assets − Total Liabilities." },
      { label: "Auto-imported values", detail: "Stock portfolio market value, crypto OKX balance, and vested RSU value are read automatically from those modules — no double entry." },
      { label: "Manual entries", detail: "Bank accounts, real estate, vehicles, loans, credit cards, etc. Each entry stores the amount in USD or TWD (converted at the live rate)." },
      { label: "Trend chart", detail: "Deduplicates to one snapshot per month (the latest entry for that month) so multiple updates in the same month don't create duplicate data points." },
    ],
  },
  {
    title: "RSU",
    items: [
      { label: "Vesting schedule", detail: "Computed from grant date + each company's tranche schedule (percentage at each monthsFromGrant milestone). Built-in schedules for AMZN, GOOGL, META, NVDA, NFLX, MSFT, AAPL." },
      { label: "Valuation", detail: "Vested shares × current spot price. Unvested shares × spot price (or trailing avg for Amazon). Total RSU value flows into Net Worth automatically." },
      { label: "Amazon reference date", detail: "The last Friday that falls before the 15th of the prior calendar month. Amazon uses this date's 30-day trailing average price for RSU valuations instead of the live quote." },
      { label: "Custom companies", detail: "Add any private or public company with a custom vesting tranche schedule. Private companies use a manually entered share price." },
    ],
  },
  {
    title: "Expenses",
    items: [
      { label: "Tracking", detail: "Every expense entry has a year, month, category, and optional sub-category. The monthly chart aggregates entries by month." },
      { label: "Export report", detail: "Export any month range as Markdown (summaries, category/subcategory breakdowns, monthly trend, full ledger — ready to paste into an AI) or raw CSV. Download or copy to clipboard." },
    ],
  },
  {
    title: "Retirement Accounts",
    items: [
      { label: "Entries", detail: "Each record stores contributions, employer match (401k only), and end-of-period balance. Entries can be monthly or annual." },
      { label: "Contribution limit", detail: "2025 limits displayed as reference: 401(k) $23,500 · HSA $4,300 · IRA $7,000. Not enforced — it's a reminder only." },
      { label: "KPIs", detail: "Current Balance = most recent entry's balance. This Year Contributions = sum of all entries for the current year. This Month = the entry matching the current month, if any." },
    ],
  },
  {
    title: "Data & Privacy",
    items: [
      { label: "Storage", detail: "All data lives in your browser's localStorage under fv_* keys. Nothing is sent to any server by default." },
      { label: "Google Drive sync", detail: "Optional. When signed in, data is backed up to a private file in your own Google Drive. Only you can access it. Sync triggers automatically on every save." },
      { label: "OKX credentials", detail: "API key, secret, and passphrase are stored in localStorage only and are intentionally excluded from the Drive backup. Use a read-only OKX API key with no trade or withdraw permissions." },
      { label: "Currency", detail: "A live USD/TWD rate is fetched from Yahoo Finance on pages that need it (portfolio, net worth). A fallback rate of 30.0 is used if the request fails." },
    ],
  },
];

function AccordionSection({ title, items }: { title: string; items: { label: string; detail: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
      >
        <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">{title}</span>
        <span className="text-zinc-400 text-xs ml-4 flex-shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex gap-3">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 w-40 flex-shrink-0 pt-0.5">{item.label}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [showDocs, setShowDocs] = useState(false);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Sign-in banner — shown only when logged out */}
      {status !== "loading" && !session && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-5 py-4">
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm">Sync your data across devices</p>
            <p className="text-blue-700 dark:text-blue-400 text-xs mt-0.5">
              Sign in with Google to back up and restore your data via Google Drive — stored privately in your own account, no one else can access it. Uses your existing Google account, no new signup needed.
            </p>
          </div>
          <button
            onClick={() => signIn("google")}
            className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      )}

      {/* Signed-in status banner */}
      {session?.user && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-3">
          {session.user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
          )}
          <div>
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">{session.user.name}</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Drive sync active — your data is backed up automatically.</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">All your financial data, stored privately in your browser.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`block bg-white dark:bg-zinc-900 border-l-4 ${s.color} rounded-xl p-5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border border-gray-200 dark:border-zinc-800`}
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <h2 className="text-zinc-900 dark:text-white font-semibold text-base mb-1">{s.title}</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>

      {/* Calculation reference */}
      <div className="mt-10">
        <button
          onClick={() => setShowDocs(!showDocs)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors mb-4"
        >
          <span className="text-base">{showDocs ? "▼" : "▶"}</span>
          How calculations work
        </button>

        {showDocs && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
              Reference guide for every formula and data source used across FinView.
            </p>
            {HOW_IT_WORKS.map((section) => (
              <AccordionSection key={section.title} title={section.title} items={section.items} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
