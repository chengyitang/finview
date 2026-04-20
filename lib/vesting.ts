import { Company, Grant, VestingEvent } from "@/types";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getVestingEvents(grant: Grant, company: Company): VestingEvent[] {
  const grantDate = new Date(grant.grantDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return company.tranches.map((tranche) => {
    const vestDate = addMonths(grantDate, tranche.monthsFromGrant);
    const shares = Math.round((tranche.percentage / 100) * grant.totalShares);
    return {
      vestDate: vestDate.toISOString().split("T")[0],
      shares,
      percentage: tranche.percentage,
      vested: vestDate <= today,
    };
  });
}

export function splitVestedUnvested(events: VestingEvent[]) {
  const vested = events.filter((e) => e.vested);
  const unvested = events.filter((e) => !e.vested);
  return { vested, unvested };
}

export function calcTotalValue(
  events: VestingEvent[],
  currentPrice: number
): {
  vestedShares: number;
  unvestedShares: number;
  vestedValue: number;
  unvestedValue: number;
  totalValue: number;
} {
  const { vested, unvested } = splitVestedUnvested(events);
  const vestedShares = vested.reduce((sum, e) => sum + e.shares, 0);
  const unvestedShares = unvested.reduce((sum, e) => sum + e.shares, 0);
  return {
    vestedShares,
    unvestedShares,
    vestedValue: vestedShares * currentPrice,
    unvestedValue: unvestedShares * currentPrice,
    totalValue: (vestedShares + unvestedShares) * currentPrice,
  };
}

export function calcGrantsSummary(grants: Grant[], company: Company, currentPrice: number) {
  const allEvents = grants.flatMap((g) => getVestingEvents(g, company));
  return calcTotalValue(allEvents, currentPrice);
}
