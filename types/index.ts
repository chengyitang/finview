// RSU / Investment types
export interface VestingTranche {
  monthsFromGrant: number;
  percentage: number;
}

export type PriceMethod = "spot" | "30day-trailing-avg";

export interface Company {
  id: string;
  name: string;
  ticker: string;
  tranches: VestingTranche[];
  priceMethod?: PriceMethod;
  private?: boolean;
  custom?: boolean;
}

export interface Grant {
  id: string;
  companyId: string;
  grantDate: string;
  totalShares: number;
  label?: string;
  originalValueUSD?: number;
}

export interface VestingEvent {
  vestDate: string;
  shares: number;
  percentage: number;
  vested: boolean;
}

export interface StockQuote {
  price: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
}

// Portfolio / Stock tracking types
export type TransactionType = "Buy" | "Sell" | "Dividend" | "Split";

export interface Transaction {
  id: string;
  date: string;
  ticker: string;
  stockName: string;
  type: TransactionType;
  shares: number;
  price: number;
  fee: number;
  cashFlow?: number;
}

export interface ActivePosition {
  symbol: string;
  stockName: string;
  currency: "USD" | "TWD";
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  totalDividends: number;
  capitalGain: number;
  totalReturn: number;
  adjustedAvgCost: number;
  totalPct: number;
}

export interface ClosedPosition {
  symbol: string;
  stockName: string;
  currency: "USD" | "TWD";
  realizedPL: number;
  totalReturn: number;
  totalDividends: number;
  totalInvested: number;
  totalPct: number;
}

// Income types
export interface IncomeEntry {
  id: string;
  year: number;
  month: number;
  category: "Salary" | "Bonus" | "Freelance" | "Other";
  description: string;
  amountUSD: number;
}

// Expense types
export type ExpenseCategory =
  "Housing" | "Food" | "Transport" | "Healthcare" |
  "Entertainment" | "Subscriptions" | "Education" | "Shopping" | "Personal" | "Other";

export interface ExpenseEntry {
  id: string;
  year: number;
  month: number;
  category: ExpenseCategory;
  subCategory?: string;
  description: string;
  amountUSD: number;
}

// Crypto types
export type CryptoTxType = "Buy" | "Sell" | "Receive" | "Send";

export interface CryptoTransaction {
  id: string;
  date: string;
  symbol: string;
  coinName: string;
  type: CryptoTxType;
  amount: number;
  priceUSD: number;
  fee: number;
}

// Tax types
export interface TaxEntry {
  id: string;
  year: number;
  federalOwed: number;
  stateOwed: number;
  federalPaid: number;
  statePaid: number;
  notes: string;
}

// Retirement / account types
export interface RetirementAccount {
  id: string;
  type: "401k" | "HSA" | "IRA" | "Roth IRA";
  year: number;
  contributions: number;
  employerMatch?: number;
  balance: number;
  notes: string;
}

// Net Worth types
export type AssetCategory = "cash" | "real_estate" | "vehicle" | "rsu_equity" | "other_asset";
export type LiabilityCategory = "mortgage" | "student_loan" | "auto_loan" | "credit_card" | "other_liability";

export interface NetWorthItem {
  id: string;
  label: string;
  category: AssetCategory | LiabilityCategory;
  amountUSD: number;   // raw amount in `currency` (field name kept for backward compat)
  currency?: "USD" | "TWD";
  notes?: string;
  updatedAt: string;
}

export interface NetWorthSnapshot {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}
