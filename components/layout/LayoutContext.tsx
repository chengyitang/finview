"use client";

import { createContext, useContext, useState, useEffect } from "react";

const LayoutContext = createContext<{
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}>({ sidebarOpen: true, toggleSidebar: () => {} });

export const useLayout = () => useContext(LayoutContext);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setSidebarOpen(localStorage.getItem("fv_sidebar") !== "closed");
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("fv_sidebar", next ? "open" : "closed");
      return next;
    });
  }

  return (
    <LayoutContext.Provider value={{ sidebarOpen, toggleSidebar }}>
      {children}
    </LayoutContext.Provider>
  );
}
