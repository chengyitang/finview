"use client";

import { useState, useCallback } from "react";

type ToastItem = { id: string; message: string };

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismiss };
}

export function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 bg-red-50 dark:bg-red-950/90 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 shadow-lg"
        >
          <svg className="shrink-0 w-4 h-4 mt-0.5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-800 dark:text-red-200 flex-1 leading-snug">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-red-400 dark:text-red-600 hover:text-red-600 dark:hover:text-red-400 text-sm leading-none mt-0.5"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
