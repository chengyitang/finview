"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="text-xs text-zinc-400 dark:text-zinc-600 animate-pulse">Checking auth…</div>;
  }

  if (session?.user) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {session.user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />
          )}
          <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex-1">
            {session.user.email}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Drive sync on</span>
          <button
            onClick={() => signOut()}
            className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    </button>
  );
}
