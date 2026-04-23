import { Grant, Company, Transaction, IncomeEntry, TaxEntry, RetirementAccount } from "@/types";

// Sync hook — set by DriveSync component at runtime to avoid circular imports
let _triggerSync: (() => void) | null = null;
export function registerSync(fn: () => void) { _triggerSync = fn; }
function triggerSync() { _triggerSync?.(); }

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
export const saveGrants = (v: Grant[]): void => { save("fv_rsu_grants", v); triggerSync(); };
export const loadCustomCompanies = (): Company[] => load("fv_rsu_companies", []);
export const saveCustomCompanies = (v: Company[]): void => { save("fv_rsu_companies", v); triggerSync(); };

// Portfolio
export const loadTransactions = (): Transaction[] => load("fv_portfolio_txns", []);
export const saveTransactions = (v: Transaction[]): void => { save("fv_portfolio_txns", v); triggerSync(); };

// Income
export const loadIncome = (): IncomeEntry[] => load("fv_income", []);
export const saveIncome = (v: IncomeEntry[]): void => { save("fv_income", v); triggerSync(); };

// Tax
export const loadTax = (): TaxEntry[] => load("fv_tax", []);
export const saveTax = (v: TaxEntry[]): void => { save("fv_tax", v); triggerSync(); };

// Retirement
export const loadRetirement = (): RetirementAccount[] => load("fv_retirement", []);
export const saveRetirement = (v: RetirementAccount[]): void => { save("fv_retirement", v); triggerSync(); };

// Assets history — end-of-year snapshots in USD, keyed by market ("all"|"US"|"TW") then year
export function loadAssetsHistory(): Record<string, Record<number, number>> {
  try {
    const raw = localStorage.getItem("fv_assets_history");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Migrate old flat format { 2024: 100000 } → { all: { 2024: 100000 } }
    if (typeof Object.values(parsed)[0] === "number") return { all: parsed };
    return parsed;
  } catch { return {}; }
}
export const saveAssetsHistory = (v: Record<string, Record<number, number>>): void =>
  save("fv_assets_history", v);

// Collect / restore all keys for Drive sync
export function collectAll() {
  return {
    fv_rsu_grants: loadGrants(),
    fv_rsu_companies: loadCustomCompanies(),
    fv_portfolio_txns: loadTransactions(),
    fv_income: loadIncome(),
    fv_tax: loadTax(),
    fv_retirement: loadRetirement(),
    fv_assets_history: loadAssetsHistory(),
  };
}

export function restoreAll(data: Partial<ReturnType<typeof collectAll>>) {
  if (data.fv_rsu_grants) save("fv_rsu_grants", data.fv_rsu_grants);
  if (data.fv_rsu_companies) save("fv_rsu_companies", data.fv_rsu_companies);
  if (data.fv_portfolio_txns) save("fv_portfolio_txns", data.fv_portfolio_txns);
  if (data.fv_income) save("fv_income", data.fv_income);
  if (data.fv_tax) save("fv_tax", data.fv_tax);
  if (data.fv_retirement) save("fv_retirement", data.fv_retirement);
  if (data.fv_assets_history) save("fv_assets_history", data.fv_assets_history);
}
