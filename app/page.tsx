"use client";

import Link from "next/link";

const sections = [
  {
    title: "Income",
    href: "/income",
    desc: "Track salary, bonuses, and other income sources.",
    icon: "💵",
    color: "border-emerald-700",
  },
  {
    title: "Tax",
    href: "/tax",
    desc: "Estimate federal and state tax liability by year.",
    icon: "🧾",
    color: "border-yellow-700",
  },
  {
    title: "401(k)",
    href: "/retirement/401k",
    desc: "Log contributions, employer match, and balance.",
    icon: "🏦",
    color: "border-blue-700",
  },
  {
    title: "HSA",
    href: "/retirement/hsa",
    desc: "Track health savings account contributions and balance.",
    icon: "🏥",
    color: "border-teal-700",
  },
  {
    title: "IRA / Roth IRA",
    href: "/retirement/ira",
    desc: "Manage IRA and Roth IRA contributions.",
    icon: "📑",
    color: "border-purple-700",
  },
  {
    title: "Stock Portfolio",
    href: "/investment/portfolio",
    desc: "Track US and Taiwan stocks with live prices. No file uploads — data saved in your browser.",
    icon: "📊",
    color: "border-indigo-700",
  },
  {
    title: "RSU",
    href: "/investment/rsu",
    desc: "Calculate vested and unvested RSU value across multiple grants and companies.",
    icon: "📈",
    color: "border-pink-700",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-400 mt-1">All your financial data, stored privately in your browser.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`block bg-zinc-900 border-l-4 ${s.color} rounded-xl p-5 hover:bg-zinc-800 transition-colors`}
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <h2 className="text-white font-semibold text-base mb-1">{s.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
