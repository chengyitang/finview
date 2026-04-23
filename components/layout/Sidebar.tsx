"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayout } from "./LayoutContext";

const nav = [
  { label: "Overview", href: "/", icon: "◉" },
  { label: "Income", href: "/income", icon: "💵" },
  { label: "Tax", href: "/tax", icon: "🧾" },
  {
    label: "Retirement",
    icon: "🏦",
    children: [
      { label: "401(k)", href: "/retirement/401k", icon: "📋" },
      { label: "HSA", href: "/retirement/hsa", icon: "🏥" },
      { label: "IRA / Roth IRA", href: "/retirement/ira", icon: "📑" },
    ],
  },
  {
    label: "Investment",
    icon: "📈",
    children: [
      { label: "Portfolio", href: "/investment/portfolio", icon: "📊" },
      { label: "RSU", href: "/investment/rsu", icon: "📈" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useLayout();

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={`
          fixed lg:relative top-12 lg:top-auto z-40 lg:z-auto
          h-[calc(100dvh-3rem)] lg:min-h-0
          flex flex-col shrink-0
          bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800
          transition-all duration-200
          ${sidebarOpen
            ? "translate-x-0 w-64 lg:w-56"
            : "-translate-x-full lg:translate-x-0 w-64 lg:w-14"
          }
        `}
      >
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {nav.map((item) =>
            item.children ? (
              <div key={item.label} className={sidebarOpen ? "pt-3" : "pt-2"}>
                {sidebarOpen && (
                  <p className="px-2 mb-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate">
                    {item.icon} {item.label}
                  </p>
                )}
                {!sidebarOpen && (
                  <div className="w-full h-px bg-gray-200 dark:bg-zinc-800 mb-2" />
                )}
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    title={!sidebarOpen ? child.label : undefined}
                    onClick={() => { if (window.innerWidth < 1024) toggleSidebar(); }}
                    className={`flex items-center gap-2 rounded-md text-sm transition-colors ${
                      sidebarOpen ? "px-3 py-2" : "px-0 py-2 justify-center"
                    } ${
                      isActive(child.href)
                        ? "bg-blue-600 text-white"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="text-base leading-none">{child.icon}</span>
                    {sidebarOpen && <span className="truncate">{child.label}</span>}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                title={!sidebarOpen ? item.label : undefined}
                onClick={() => { if (window.innerWidth < 1024) toggleSidebar(); }}
                className={`flex items-center gap-2 rounded-md text-sm transition-colors ${
                  sidebarOpen ? "px-3 py-2" : "px-0 py-2 justify-center"
                } ${
                  isActive(item.href!)
                    ? "bg-blue-600 text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            )
          )}
        </nav>

        {sidebarOpen && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-400 dark:text-zinc-600">Data stored in your browser only.</p>
          </div>
        )}
      </aside>
    </>
  );
}
