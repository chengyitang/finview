# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # ESLint (no test suite)
```

No test framework is configured.

## Stack

- **Next.js 16.2.4** — App Router, React 19, TypeScript
- **Tailwind CSS v4** (PostCSS plugin, no config file)
- **Recharts** for charts
- **React Compiler** enabled (`reactCompiler: true` in `next.config.ts`) — do not add manual `useMemo`/`useCallback`

## Architecture

All user data lives exclusively in `localStorage` — there is no database. `lib/storage.ts` provides typed load/save helpers for every domain; keys are prefixed `fv_`.

### Route structure

| Route | Purpose |
|---|---|
| `/` | Dashboard link grid |
| `/income` | Income entry tracking |
| `/tax` | Federal/state tax estimates by year |
| `/retirement/[account]` | Dynamic: `401k`, `hsa`, `ira` |
| `/investment/portfolio` | Stock portfolio with live prices |
| `/investment/rsu` | RSU vesting tracker across grants |

### API routes (server-side)

| Route | Description |
|---|---|
| `GET /api/stock?ticker=X` | Quote — Alpha Vantage if `ALPHA_VANTAGE_API_KEY` set, else Yahoo Finance |
| `GET /api/stock/history?ticker=X` | 6-month daily closes from Yahoo Finance |
| `GET /api/stock/avg?ticker=X` | 30-day trailing average price |
| `GET /api/fx` | USD/TWD rate via `USDTWD=X` on Yahoo Finance |

### Key `lib/` modules

- **`storage.ts`** — localStorage CRUD, all keys prefixed `fv_`
- **`yahooFinance.ts`** — Yahoo Finance v8 chart API; 60s `next.revalidate`; fallback FX rate of 30.0
- **`portfolio.ts`** — Aggregates transactions into `ActivePosition`/`ClosedPosition`; handles USD↔TWD conversion via `fxRate`; pure-numeric tickers automatically get `.TW` suffix (Taiwan stocks)
- **`vesting.ts`** — Computes RSU vesting events from grant date + tranche schedule; splits vested/unvested
- **`companies.ts`** — Built-in vesting schedules for AMZN, GOOGL, META, NVDA, NFLX, MSFT, AAPL; Amazon uses `priceMethod: "30day-trailing-avg"`
- **`referenceDate.ts`** — Amazon-specific reference date calculation (prior month's last Friday before the 15th)

### Type definitions

All shared types are in `types/index.ts`: `Grant`, `Company`, `VestingTranche`, `Transaction`, `ActivePosition`, `ClosedPosition`, `IncomeEntry`, `TaxEntry`, `RetirementAccount`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | Optional | US stock quotes (falls back to Yahoo if absent) |
