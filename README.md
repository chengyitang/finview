# FinView

A personal finance hub that runs entirely in your browser — no accounts, no cloud sync, no data leaves your device.

**Live demo**: https://finview-zeta.vercel.app

## Features

- **Income** — track salary, bonuses, and other income by month
- **Tax** — estimate federal and state tax liability by year
- **Retirement** — log 401(k), HSA, and IRA/Roth IRA contributions and balances
- **Stock Portfolio** — track US and Taiwan stocks with live prices; pure-numeric tickers (e.g. `2330`) are auto-detected as Taiwan stocks (`.TW`)
- **RSU** — calculate vested/unvested value across multiple grants; built-in vesting schedules for Amazon, Google, Meta, NVIDIA, Netflix, Microsoft, and Apple

All data is saved in `localStorage`. Nothing is sent to any server.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Stock price lookups work out of the box via Yahoo Finance (no key needed). Optionally set an Alpha Vantage key for higher-quality US equity quotes:

```bash
# .env.local
ALPHA_VANTAGE_API_KEY=your_key_here
```

Get a free key at [alphavantage.co](https://www.alphavantage.co/support/#api-key). When the key is absent the app falls back to Yahoo Finance automatically.

If deploying to Vercel, add the variable via the dashboard (**Project → Settings → Environment Variables**) or CLI:

```bash
vercel env add ALPHA_VANTAGE_API_KEY
```

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 · Recharts
