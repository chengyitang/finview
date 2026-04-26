"use client";

import { useLayout } from "@/components/layout/LayoutContext";

interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}

export default function KPICard({ label, value, sub, positive, negative }: Props) {
  const { hideValues } = useLayout();
  const displayValue = hideValues ? "••••" : value;
  const valueColor = positive
    ? "text-emerald-500 dark:text-emerald-400"
    : negative
    ? "text-red-500 dark:text-red-400"
    : "text-zinc-900 dark:text-white";
  const textSize =
    displayValue.length > 11 ? "text-base" :
    displayValue.length > 7  ? "text-lg"   :
    "text-2xl";

  return (
    <div className="bg-gray-100 dark:bg-zinc-800 rounded-xl px-5 py-4 border border-gray-200 dark:border-zinc-700">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`${textSize} font-semibold tabular-nums leading-tight ${hideValues ? "text-zinc-300 dark:text-zinc-600" : valueColor}`}>
        {displayValue}
      </p>
      {sub && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
          {hideValues ? "——" : sub}
        </p>
      )}
    </div>
  );
}
