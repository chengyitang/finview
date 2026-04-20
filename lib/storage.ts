import { Grant, Company, Transaction, IncomeEntry, TaxEntry, RetirementAccount } from "@/types";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// RSU
export const loadGrants = (): Grant[] => load("fv_rsu_grants", []);
export const saveGrants = (v: Grant[]): void => save("fv_rsu_grants", v);
export const loadCustomCompanies = (): Company[] => load("fv_rsu_companies", []);
export const saveCustomCompanies = (v: Company[]): void => save("fv_rsu_companies", v);

// Portfolio
export const loadTransactions = (): Transaction[] => load("fv_portfolio_txns", []);
export const saveTransactions = (v: Transaction[]): void => save("fv_portfolio_txns", v);

// Income
export const loadIncome = (): IncomeEntry[] => load("fv_income", []);
export const saveIncome = (v: IncomeEntry[]): void => save("fv_income", v);

// Tax
export const loadTax = (): TaxEntry[] => load("fv_tax", []);
export const saveTax = (v: TaxEntry[]): void => save("fv_tax", v);

// Retirement
export const loadRetirement = (): RetirementAccount[] => load("fv_retirement", []);
export const saveRetirement = (v: RetirementAccount[]): void => save("fv_retirement", v);
