"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { collectAll, restoreAll, registerSync } from "@/lib/storage";

const DEBOUNCE_MS = 2000;
const PUSHED_AT_KEY = "fv_pushed_at";

export default function DriveSync() {
  const { data: session, status } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulledRef = useRef(false);

  const push = useCallback(async () => {
    if (!session?.accessToken) return;
    const pushedAt = Date.now().toString();
    const data = collectAll();
    try {
      await fetch("/api/drive/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, _pushedAt: pushedAt }),
      });
      localStorage.setItem(PUSHED_AT_KEY, pushedAt);
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
          // Skip restore if this device was the last to push this data
          const localPushedAt = localStorage.getItem(PUSHED_AT_KEY);
          if (remote._pushedAt && remote._pushedAt === localPushedAt) return;
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
