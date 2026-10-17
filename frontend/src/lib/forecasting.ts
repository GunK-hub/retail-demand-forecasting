import type {
  DailySales,
  EvaluationResult,
  ForecastPoint,
  ModelScore,
  SalesRecord,
} from "./types";

export const MIN_DAYS_FOR_EVALUATION = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateToUtcDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatDateKey(dateToUtcDay(date) + days * DAY_MS);
}

export function weekdayForDate(date: string): number {
  return new Date(dateToUtcDay(date)).getUTCDay();
}

export function aggregateDaily(records: SalesRecord[]): DailySales[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    totals.set(record.date, (totals.get(record.date) ?? 0) + record.sales);
  }
  return [...totals.entries()]
    .map(([date, sales]) => ({ date, sales }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

function weekdayBaseline(training: DailySales[], weekday: number): number {
  const recent = training.slice(-84);
  const sameWeekday = recent
    .filter((point) => weekdayForDate(point.date) === weekday)
    .slice(-8)
    .map((point) => point.sales);
  return sameWeekday.length > 0
    ? median(sameWeekday)
    : median(recent.map((point) => point.sales));
}

function linearTrend(training: DailySales[]): { slope: number; origin: number } {
  const recent = training.slice(-56);
  if (recent.length < 2) {
    return { slope: 0, origin: recent.at(-1)?.sales ?? 0 };
  }

  const originTimestamp = dateToUtcDay(recent[0]?.date ?? training[0]?.date ?? "");
  const xs = recent.map(
    (point) => (dateToUtcDay(point.date) - originTimestamp) / DAY_MS,
  );
  const ys = recent.map((point) => point.sales);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce(
    (sum, value) => sum + (value - meanX) ** 2,
    0,
  );
  const slope =
    denominator === 0
      ? 0
      : xs.reduce(
          (sum, value, index) =>
            sum + (value - meanX) * ((ys[index] ?? 0) - meanY),
          0,
        ) / denominator;
  return { slope, origin: meanY - slope * meanX };
}

type ForecastModel = "seasonal-trend" | "weekday-median" | "moving-average" | "linear-trend";

function predictValue(
  training: DailySales[],
  targetDate: string,
  model: ForecastModel,
): number {
  const lastDate = training.at(-1)?.date;
  if (!lastDate || training.length === 0) return 0;
  const step = Math.max(
    1,
    Math.round((dateToUtcDay(targetDate) - dateToUtcDay(lastDate)) / DAY_MS),
  );
  const recent = training.slice(-28);

  if (model === "moving-average") {
    return recent.slice(-7).reduce((sum, point) => sum + point.sales, 0) /
      Math.max(1, Math.min(7, recent.length));
  }

  const trend = linearTrend(training);
  const targetX =
    (dateToUtcDay(targetDate) -
      dateToUtcDay(training[0]?.date ?? targetDate)) /
    DAY_MS;

  if (model === "linear-trend") {
    return Math.max(0, trend.origin + trend.slope * targetX);
  }

  const seasonal = weekdayBaseline(training, weekdayForDate(targetDate));
  if (model === "weekday-median") return seasonal;

  const lastObserved = training.at(-1)?.sales ?? seasonal;
  const trendAdjustment = trend.slope * step * 0.35;
  const boundedAdjustment = Math.max(
    -Math.max(1, lastObserved * 0.2),
    Math.min(Math.max(1, lastObserved * 0.2), trendAdjustment),
  );
  return Math.max(0, seasonal + boundedAdjustment);
}

function estimateErrorScale(training: DailySales[]): number {
  const recent = training.slice(-84);
  const residuals = recent.flatMap((point, index) => {
    const priorSameWeekday = recent
      .slice(0, index)
      .filter(
        (candidate) =>
          weekdayForDate(candidate.date) === weekdayForDate(point.date),
      )
      .slice(-8)
      .map((candidate) => candidate.sales);
    if (priorSameWeekday.length < 2) return [];
    return [Math.abs(point.sales - median(priorSameWeekday))];
  });
  const fallback = median(recent.map((point) => point.sales)) * 0.08;
  return Math.max(median(residuals) * 1.55, fallback, 1);
}

export function generateForecast(
  records: SalesRecord[],
  horizon: number,
): ForecastPoint[] {
  const daily = aggregateDaily(records);
  const lastDate = daily.at(-1)?.date;
  if (!lastDate) return [];
  const errorScale = estimateErrorScale(daily);

  return Array.from({ length: horizon }, (_, index) => {
    const step = index + 1;
    const date = addDays(lastDate, step);
    const predictedSales = predictValue(daily, date, "seasonal-trend");
    const range = errorScale * Math.sqrt(1 + step / 7);
    return {
      date,
      predictedSales: Math.round(predictedSales * 100) / 100,
      lowerBound: Math.round(Math.max(0, predictedSales - range) * 100) / 100,
      upperBound: Math.round((predictedSales + range) * 100) / 100,
    };
  });
}

function calculateMetrics(
  actual: number[],
  predicted: number[],
): Pick<ModelScore, "mae" | "rmse" | "wape"> {
  const errors = actual.map((value, index) => value - (predicted[index] ?? 0));
  const mae =
    errors.reduce((sum, error) => sum + Math.abs(error), 0) /
    Math.max(1, errors.length);
  const rmse = Math.sqrt(
    errors.reduce((sum, error) => sum + error * error, 0) /
      Math.max(1, errors.length),
  );
  const denominator = actual.reduce((sum, value) => sum + Math.abs(value), 0);
  const wape =
    denominator === 0
      ? null
      : (errors.reduce((sum, error) => sum + Math.abs(error), 0) /
          denominator) *
        100;
  return { mae, rmse, wape };
}

export function evaluateModels(records: SalesRecord[]): EvaluationResult {
  const daily = aggregateDaily(records);
  if (daily.length < MIN_DAYS_FOR_EVALUATION) return null;

  const holdoutDays = Math.min(28, Math.max(7, Math.floor(daily.length * 0.2)));
  const training = daily.slice(0, -holdoutDays);
  const holdout = daily.slice(-holdoutDays);
  if (training.length < 14 || holdout.length === 0) return null;

  const modelNames: Array<{ key: ForecastModel; label: string }> = [
    { key: "seasonal-trend", label: "Seasonal trend" },
    { key: "weekday-median", label: "Weekday median" },
    { key: "moving-average", label: "7-day moving average" },
    { key: "linear-trend", label: "Linear trend" },
  ];
  const actual = holdout.map((point) => point.sales);
  const candidates = modelNames.map(({ key, label }) => {
    const predicted = holdout.map((point) =>
      predictValue(training, point.date, key),
    );
    return {
      key,
      ...calculateMetrics(actual, predicted),
    };
  });
  const bestWape = candidates.reduce<number>(
    (best, candidate) =>
      candidate.wape !== null && candidate.wape < best
        ? candidate.wape
        : best,
    Number.POSITIVE_INFINITY,
  );
  const scores = candidates.map((candidate, index) => {
    const model = modelNames[index]?.label ?? candidate.key;
    return {
      model,
      mae: Math.round(candidate.mae * 100) / 100,
      rmse: Math.round(candidate.rmse * 100) / 100,
      wape:
        candidate.wape === null
          ? null
          : Math.round(candidate.wape * 100) / 100,
      holdoutDays,
      isRecommended:
        candidate.wape !== null && candidate.wape === bestWape,
    };
  });

  return {
    scores: [...scores].sort(
      (a, b) => (a.wape ?? Number.POSITIVE_INFINITY) - (b.wape ?? Number.POSITIVE_INFINITY),
    ),
    holdoutStart: holdout[0]?.date ?? "",
    holdoutEnd: holdout.at(-1)?.date ?? "",
    holdoutDays,
    trainingDays: training.length,
  };
}

export function movingAverage(
  series: DailySales[],
  windowSize = 7,
): Array<number | null> {
  return series.map((_, index) => {
    if (index + 1 < windowSize) return null;
    const slice = series.slice(index - windowSize + 1, index + 1);
    return (
      slice.reduce((sum, point) => sum + point.sales, 0) / windowSize
    );
  });
}

export function getWeekdayAverages(
  records: SalesRecord[],
): Array<{ weekday: string; averageSales: number }> {
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const groups = Array.from({ length: 7 }, () => [] as number[]);
  for (const point of aggregateDaily(records)) {
    groups[weekdayForDate(point.date)]?.push(point.sales);
  }
  return groups.map((values, index) => ({
    weekday: weekdayNames[index] ?? "",
    averageSales:
      values.length === 0
        ? 0
        : values.reduce((sum, value) => sum + value, 0) / values.length,
  }));
}
