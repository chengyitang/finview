import Link from "next/link";

const features = [
  {
    title: "Stock Portfolio",
    href: "/investment/portfolio",
    desc: "Track US & Taiwan stock positions with live prices, P/L, and dividends. Enter transactions directly — no file uploads needed.",
    icon: "📊",
  },
  {
    title: "RSU",
    href: "/investment/rsu",
    desc: "Calculate vested and unvested RSU value for Amazon, Google, Meta, NVIDIA, and more. Supports custom companies and multiple grants.",
    icon: "📈",
  },
];

export default function InvestmentPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Investment</h1>
      <p className="text-zinc-400 text-sm mb-6">Sub-features within the investment section.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <Link key={f.href} href={f.href}
            className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:bg-zinc-800 transition-colors">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h2 className="text-white font-semibold text-base mb-1">{f.title}</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
