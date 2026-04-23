"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

const sections = [
  { title: "Income", href: "/income", desc: "Track salary, bonuses, and other income sources.", icon: "💵", color: "border-emerald-600 dark:border-emerald-700" },
  { title: "Tax", href: "/tax", desc: "Estimate federal and state tax liability by year.", icon: "🧾", color: "border-yellow-600 dark:border-yellow-700" },
  { title: "401(k)", href: "/retirement/401k", desc: "Log contributions, employer match, and balance.", icon: "🏦", color: "border-blue-600 dark:border-blue-700" },
  { title: "HSA", href: "/retirement/hsa", desc: "Track health savings account contributions and balance.", icon: "🏥", color: "border-teal-600 dark:border-teal-700" },
  { title: "IRA / Roth IRA", href: "/retirement/ira", desc: "Manage IRA and Roth IRA contributions.", icon: "📑", color: "border-purple-600 dark:border-purple-700" },
  { title: "Stock Portfolio", href: "/investment/portfolio", desc: "Track US and Taiwan stocks with live prices. No file uploads — data saved in your browser.", icon: "📊", color: "border-blue-600 dark:border-blue-700" },
  { title: "RSU", href: "/investment/rsu", desc: "Calculate vested and unvested RSU value across multiple grants and companies.", icon: "📈", color: "border-pink-600 dark:border-pink-700" },
];

export default function DashboardPage() {
  const { data: session, status } = useSession();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Sign-in banner — shown only when logged out */}
      {status !== "loading" && !session && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-5 py-4">
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm">Sync your data across devices</p>
            <p className="text-blue-700 dark:text-blue-400 text-xs mt-0.5">
              Sign in with Google to back up and restore your data via Google Drive. Stored privately in your own Google Drive — no one else can access it. No account setup required.
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
    </div>
  );
}
