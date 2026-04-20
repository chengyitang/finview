"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeContext";

const nav = [
  { label: "Overview", href: "/", icon: "◉" },
  { label: "Income", href: "/income", icon: "💵" },
  { label: "Tax", href: "/tax", icon: "🧾" },
  {
    label: "Retirement",
    icon: "🏦",
    children: [
      { label: "401(k)", href: "/retirement/401k" },
      { label: "HSA", href: "/retirement/hsa" },
      { label: "IRA / Roth IRA", href: "/retirement/ira" },
    ],
  },
  {
    label: "Investment",
    icon: "📈",
    children: [
      { label: "Portfolio", href: "/investment/portfolio" },
      { label: "RSU", href: "/investment/rsu" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();

  return (
    <aside className="w-56 shrink-0 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-gray-200 dark:border-zinc-800">
        <span className="text-zinc-900 dark:text-white font-bold text-lg tracking-tight">FinView</span>
        <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5">Personal Finance Hub</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map((item) =>
          item.children ? (
            <div key={item.label} className="pt-3">
              <p className="px-2 mb-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                {item.icon} {item.label}
              </p>
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center px-3 py-1.5 rounded-md text-sm transition-colors ${
                    pathname === child.href
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href!}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                pathname === item.href
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          )
        )}
      </nav>
      <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Theme</span>
          <button
            onClick={toggle}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {dark ? "Light" : "Dark"}
          </button>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">Data stored in your browser only.</p>
      </div>
    </aside>
  );
}
