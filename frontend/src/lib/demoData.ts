import type { SalesRecord } from "./types";

const DAY_FACTORS = [0.84, 0.89, 0.94, 0.98, 1.08, 1.23, 1.12];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDemoData(): SalesRecord[] {
  const end = new Date();
  const endUtc = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  const first = new Date(endUtc);
  first.setUTCDate(first.getUTCDate() - 364);

  return Array.from({ length: 365 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);

    const weekdayFactor = DAY_FACTORS[date.getUTCDay()] ?? 1;
    const annualSeasonality =
      1 + 0.09 * Math.sin((2 * Math.PI * index) / 365 - 0.7);
    const shortCycle =
      1 + 0.035 * Math.sin(index * 0.37) + 0.02 * Math.cos(index * 0.13);
    const gradualTrend = 1 + index * 0.00028;
    const campaignLift = index % 47 >= 42 ? 1.14 : 1;
    const yearEndLift = date.getUTCMonth() === 11 ? 1.13 : 1;

    return {
      date: toDateKey(date),
      sales: Math.round(
        126 *
          weekdayFactor *
          annualSeasonality *
          shortCycle *
          gradualTrend *
          campaignLift *
          yearEndLift,
      ),
    };
  });
}
