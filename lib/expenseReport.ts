import { ExpenseEntry, ExpenseCategory, IncomeEntry } from "@/types";

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface ExpenseReportInput {
  entries: ExpenseEntry[];
  income: IncomeEntry[];
  from: YearMonth;
  to: YearMonth;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ymKey = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);
export const ymLabel = (ym: YearMonth) => `${MONTHS[ym.month - 1]} ${ym.year}`;
const ymIso = (ym: YearMonth) => `${ym.year}-${String(ym.month).padStart(2, "0")}`;

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const sum = (xs: ExpenseEntry[]) => xs.reduce((s, e) => s + e.amountUSD, 0);

function table(header: string[], rows: string[][], alignRight: number[] = []): string {
  const sep = header.map((_, i) => (alignRight.includes(i) ? "---:" : "---"));
  return [header, sep, ...rows].map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n");
}

export function monthsInRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  for (let k = ymKey(from); k <= ymKey(to); k++) {
    out.push({ year: Math.floor(k / 12), month: (k % 12) + 1 });
  }
  return out;
}

export function filterByRange<T extends YearMonth>(items: T[], from: YearMonth, to: YearMonth): T[] {
  const lo = ymKey(from), hi = ymKey(to);
  return items.filter((e) => { const k = ymKey(e); return k >= lo && k <= hi; });
}

function sortChronological(entries: ExpenseEntry[]): ExpenseEntry[] {
  return [...entries].sort((a, b) =>
    ymKey(a) - ymKey(b) ||
    a.category.localeCompare(b.category) ||
    b.amountUSD - a.amountUSD
  );
}

export function buildExpenseMarkdown({ entries, income, from, to }: ExpenseReportInput): string {
  const months = monthsInRange(from, to);
  const inRange = sortChronological(filterByRange(entries, from, to));
  const total = sum(inRange);
  const monthCount = months.length;
  const lines: string[] = [];

  lines.push(`# Expense Report: ${ymLabel(from)} – ${ymLabel(to)}`);
  lines.push("");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} by FinView. All amounts in USD.`);
  lines.push("");
  lines.push("> **Notes for analysis:** Expenses are recorded at monthly granularity (no specific day). " +
    "Each entry has a category, an optional subcategory, and a free-text description. " +
    "Months with no entries may mean nothing was spent or nothing was logged.");
  lines.push("");

  if (inRange.length === 0) {
    lines.push("_No expenses recorded in this period._");
    return lines.join("\n") + "\n";
  }

  // Monthly totals
  const monthly = months.map((m) => {
    const es = inRange.filter((e) => e.year === m.year && e.month === m.month);
    return { m, total: sum(es), count: es.length };
  });
  const monthsWithData = monthly.filter((x) => x.count > 0);
  const highest = monthsWithData.reduce((a, b) => (b.total > a.total ? b : a));
  const lowest = monthsWithData.reduce((a, b) => (b.total < a.total ? b : a));

  // Income in range for savings rate
  const incomeInRange = filterByRange(income, from, to).reduce((s, e) => s + e.amountUSD, 0);

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Period:** ${ymLabel(from)} – ${ymLabel(to)} (${monthCount} month${monthCount !== 1 ? "s" : ""})`);
  lines.push(`- **Total spending:** ${money(total)} across ${inRange.length} entries`);
  lines.push(`- **Months with recorded expenses:** ${monthsWithData.length} of ${monthCount}`);
  lines.push(`- **Average per month (over months with data):** ${money(total / monthsWithData.length)}`);
  lines.push(`- **Highest month:** ${ymLabel(highest.m)} (${money(highest.total)})`);
  lines.push(`- **Lowest month (with data):** ${ymLabel(lowest.m)} (${money(lowest.total)})`);
  if (incomeInRange > 0) {
    lines.push(`- **Recorded take-home income in period:** ${money(incomeInRange)}`);
    lines.push(`- **Spending as % of income:** ${pct((total / incomeInRange) * 100)}`);
  }
  lines.push("");

  // Category breakdown
  const cats = Array.from(new Set(inRange.map((e) => e.category))) as ExpenseCategory[];
  const catRows = cats
    .map((cat) => {
      const es = inRange.filter((e) => e.category === cat);
      return { cat, total: sum(es), count: es.length };
    })
    .sort((a, b) => b.total - a.total);

  lines.push("## Spending by Category");
  lines.push("");
  lines.push(table(
    ["Category", "Total", "% of Total", "Avg / Month", "Entries"],
    catRows.map((r) => [r.cat, money(r.total), pct((r.total / total) * 100), money(r.total / monthCount), String(r.count)]),
    [1, 2, 3, 4],
  ));
  lines.push("");

  // Subcategory breakdown
  const subMap = new Map<string, { cat: ExpenseCategory; sub: string; total: number; count: number }>();
  for (const e of inRange) {
    const sub = e.subCategory ?? "Other";
    const key = `${e.category}\u0000${sub}`;
    const cur = subMap.get(key) ?? { cat: e.category, sub, total: 0, count: 0 };
    cur.total += e.amountUSD;
    cur.count += 1;
    subMap.set(key, cur);
  }
  const subRows = [...subMap.values()].sort((a, b) => b.total - a.total);

  lines.push("## Spending by Subcategory");
  lines.push("");
  lines.push(table(
    ["Category", "Subcategory", "Total", "% of Total", "Entries"],
    subRows.map((r) => [r.cat, r.sub, money(r.total), pct((r.total / total) * 100), String(r.count)]),
    [2, 3, 4],
  ));
  lines.push("");

  // Month × category matrix
  if (monthCount > 1) {
    const orderedCats = catRows.map((r) => r.cat);
    lines.push("## Monthly Trend by Category");
    lines.push("");
    lines.push(table(
      ["Month", ...orderedCats, "Total", "Δ vs Prev"],
      monthly.map((row, i) => {
        const es = inRange.filter((e) => e.year === row.m.year && e.month === row.m.month);
        const prev = i > 0 ? monthly[i - 1].total : null;
        const delta = prev === null || prev === 0
          ? "—"
          : `${row.total >= prev ? "+" : ""}${pct(((row.total - prev) / prev) * 100)}`;
        return [
          ymIso(row.m),
          ...orderedCats.map((c) => {
            const v = sum(es.filter((e) => e.category === c));
            return v > 0 ? money(v) : "—";
          }),
          money(row.total),
          delta,
        ];
      }),
      [...orderedCats.map((_, i) => i + 1), orderedCats.length + 1, orderedCats.length + 2],
    ));
    lines.push("");
  }

  // Largest individual entries
  const top = [...inRange].sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 10);
  lines.push("## Largest Individual Expenses");
  lines.push("");
  lines.push(table(
    ["Month", "Category", "Subcategory", "Description", "Amount"],
    top.map((e) => [ymIso(e), e.category, e.subCategory ?? "", e.description || "", money(e.amountUSD)]),
    [4],
  ));
  lines.push("");

  // Full ledger
  lines.push("## All Transactions");
  lines.push("");
  lines.push(table(
    ["Month", "Category", "Subcategory", "Description", "Amount"],
    inRange.map((e) => [ymIso(e), e.category, e.subCategory ?? "", e.description || "", money(e.amountUSD)]),
    [4],
  ));
  lines.push("");

  return lines.join("\n");
}

export function buildExpenseCSV({ entries, from, to }: Pick<ExpenseReportInput, "entries" | "from" | "to">): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sortChronological(filterByRange(entries, from, to)).map((e) =>
    [ymIso(e), e.category, e.subCategory ?? "", e.description, e.amountUSD.toFixed(2)].map(esc).join(",")
  );
  return ["Month,Category,Subcategory,Description,AmountUSD", ...rows].join("\n") + "\n";
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
