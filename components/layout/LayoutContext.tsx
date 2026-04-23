"use client";

import { createContext, useContext, useState, useEffect } from "react";

const LayoutContext = createContext<{
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  hideValues: boolean;
  toggleHideValues: () => void;
}>({ sidebarOpen: true, toggleSidebar: () => {}, hideValues: false, toggleHideValues: () => {} });

export const useLayout = () => useContext(LayoutContext);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hideValues, setHideValues] = useState(false);

  useEffect(() => {
    setSidebarOpen(localStorage.getItem("fv_sidebar") !== "closed");
    setHideValues(localStorage.getItem("fv_hide_values") === "1");
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("fv_sidebar", next ? "open" : "closed");
      return next;
    });
  }

  function toggleHideValues() {
    setHideValues((prev) => {
      const next = !prev;
      localStorage.setItem("fv_hide_values", next ? "1" : "0");
      return next;
    });
  }

  return (
    <LayoutContext.Provider value={{ sidebarOpen, toggleSidebar, hideValues, toggleHideValues }}>
      {children}
    </LayoutContext.Provider>
  );
}
