interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}

export default function KPICard({ label, value, sub, positive, negative }: Props) {
  const valueColor = positive
    ? "text-emerald-400"
    : negative
    ? "text-red-400"
    : "text-white";

  return (
    <div className="bg-zinc-800 rounded-xl px-5 py-4 border border-zinc-700">
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}
