"use client";

import { createContext, useContext, useRef, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { collectAll, restoreAll, registerSync } from "@/lib/storage";

type SyncStatus = "idle" | "pushing" | "pulling" | "ok" | "error";

interface DriveSyncCtx {
  syncStatus: SyncStatus;
  syncError: string | null;
  manualPush: () => Promise<void>;
  manualPull: () => Promise<void>;
}

const Ctx = createContext<DriveSyncCtx>({
  syncStatus: "idle",
  syncError: null,
  manualPush: async () => {},
  manualPull: async () => {},
});

export const useDriveSync = () => useContext(Ctx);

const DEBOUNCE_MS = 2000;
const SESSION_PULLED_KEY = "fv_session_pulled";

function tokenErrorMessage(sessionError: string | undefined): string | null {
  if (sessionError === "RefreshTokenError" || sessionError === "RefreshTokenMissing") {
    return "Session expired — sign out and sign back in";
  }
  return null;
}

export default function DriveSync({ children }: { children: React.ReactNode }) {
  const { data: session, status: authStatus } = useSession();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  function setError(msg: string) {
    setSyncStatus("error");
    setSyncError(msg);
    setTimeout(() => { setSyncStatus("idle"); setSyncError(null); }, 6000);
  }

  function setOk() {
    setSyncStatus("ok");
    setSyncError(null);
    setTimeout(() => setSyncStatus("idle"), 3000);
  }

  const doPush = useCallback(async () => {
    const tokenErr = tokenErrorMessage(session?.error);
    if (tokenErr) { setError(tokenErr); return; }
    if (!session?.accessToken) return;

    setSyncStatus("pushing");
    setSyncError(null);
    const data = collectAll();
    try {
      const res = await fetch("/api/drive/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setOk();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Upload failed (${res.status}): ${body?.error ?? res.statusText}`);
      }
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : "Network error"}`);
    }
  }, [session]);

  const schedulePush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doPush, DEBOUNCE_MS);
  }, [doPush]);

  useEffect(() => {
    registerSync(schedulePush);
  }, [schedulePush]);

  const manualPull = useCallback(async () => {
    const tokenErr = tokenErrorMessage(session?.error);
    if (tokenErr) { setError(tokenErr); return; }
    if (!session?.accessToken) return;

    setSyncStatus("pulling");
    setSyncError(null);
    try {
      const res = await fetch("/api/drive/data");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Download failed (${res.status}): ${body?.error ?? res.statusText}`);
        return;
      }
      const remote = await res.json();
      if (remote && Object.keys(remote).length > 0) {
        restoreAll(remote);
        setOk();
        setTimeout(() => window.location.reload(), 400);
      } else {
        setError("Nothing found on Drive — push your data first");
      }
    } catch (err) {
      setError(`Download failed: ${err instanceof Error ? err.message : "Network error"}`);
    }
  }, [session]);

  // Auto-pull once per browser session
  useEffect(() => {
    if (authStatus !== "authenticated") return;
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
          await doPush();
        }
      } catch {
        // keep localStorage data
      }
    })();
  }, [authStatus, doPush]);

  return (
    <Ctx.Provider value={{ syncStatus, syncError, manualPush: doPush, manualPull }}>
      {children}
    </Ctx.Provider>
  );
}
