"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { collectAll, restoreAll, registerSync } from "@/lib/storage";

const DEBOUNCE_MS = 2000;
const SESSION_PULLED_KEY = "fv_session_pulled";

export default function DriveSync() {
  const { data: session, status } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    registerSync(schedulePush);
  }, [schedulePush]);

  // Pull from Drive once per browser session
  useEffect(() => {
    if (status !== "authenticated") return;
    if (sessionStorage.getItem(SESSION_PULLED_KEY)) return;
    sessionStorage.setItem(SESSION_PULLED_KEY, "1");

    (async () => {
      try {
        const res = await fetch("/api/drive/data");
        if (!res.ok) return;
        const remote = await res.json();
        if (remote && Object.keys(remote).length > 0) {
          restoreAll(remote);
          window.location.reload();
        } else {
          // Drive empty — push local data up immediately
          await push();
        }
      } catch {
        // ignore — keep localStorage data
      }
    })();
  }, [status, push]);

  return null;
}
