"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { collectAll, restoreAll, registerSync } from "@/lib/storage";

const DEBOUNCE_MS = 2000;

export default function DriveSync() {
  const { data: session, status } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulledRef = useRef(false);

  const push = useCallback(async () => {
    if (!session?.accessToken) return;
    const data = collectAll();
    try {
      await fetch("/api/drive/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // silent — localStorage remains source of truth
    }
  }, [session]);

  const schedulePush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(push, DEBOUNCE_MS);
  }, [push]);

  // Register the debounced push as the global sync hook
  useEffect(() => {
    registerSync(schedulePush);
  }, [schedulePush]);

  // Pull from Drive once on login
  useEffect(() => {
    if (status !== "authenticated" || pulledRef.current) return;
    pulledRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/drive/data");
        if (!res.ok) return;
        const remote = await res.json();
        if (remote && Object.keys(remote).length > 0) {
          restoreAll(remote);
          // Reload to let all pages re-read localStorage
          window.location.reload();
        }
      } catch {
        // ignore — keep localStorage data
      }
    })();
  }, [status]);

  return null;
}
