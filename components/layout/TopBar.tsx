"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useLayout } from "./LayoutContext";
import { useTheme } from "./ThemeContext";
import { useDriveSync } from "./DriveSync";

export default function TopBar() {
  const { toggleSidebar, hideValues, toggleHideValues } = useLayout();
  const { dark, toggle } = useTheme();
  const { data: session, status } = useSession();
  const { syncStatus, syncError, manualPush, manualPull } = useDriveSync();

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 z-10">
      {/* Left: toggle + brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-semibold text-sm text-zinc-900 dark:text-white tracking-tight">FinView</span>
      </div>

      {/* Right: drive sync + auth + theme */}
      <div className="flex items-center gap-3">
        {/* Drive sync controls */}
        {status === "authenticated" && (
          <div className="flex items-center gap-1 relative group">
            {/* Status indicator */}
            {syncStatus === "pushing" || syncStatus === "pulling" ? (
              <svg className="w-3.5 h-3.5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : syncStatus === "ok" ? (
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : syncStatus === "error" ? (
              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5" />
            )}
            {/* Push */}
            <button
              onClick={manualPush}
              disabled={syncStatus === "pushing" || syncStatus === "pulling"}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
              title="Push local data to Drive"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" />
              </svg>
            </button>
            {/* Pull */}
            <button
              onClick={manualPull}
              disabled={syncStatus === "pushing" || syncStatus === "pulling"}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
              title="Pull latest data from Drive"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8v-2a2 2 0 012-2h12a2 2 0 012 2v2M12 20V8m0 12l-4-4m4 4l4-4" />
              </svg>
            </button>
            {/* Error tooltip */}
            {syncStatus === "error" && syncError && (
              <div className="absolute top-full right-0 mt-1.5 z-50 w-64 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{syncError}</p>
              </div>
            )}
          </div>
        )}

        {/* Hide values toggle */}
        <button
          onClick={toggleHideValues}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle value visibility"
          title={hideValues ? "Show values" : "Hide values"}
        >
          {hideValues ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle theme"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Auth */}
        {status === "loading" ? (
          <div className="w-20 h-6 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
        ) : session?.user ? (
          <div className="flex items-center gap-2">
            {session.user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
            )}
            <span className="text-xs text-zinc-600 dark:text-zinc-400 hidden sm:block max-w-[140px] truncate">
              {session.user.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
            </svg>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
