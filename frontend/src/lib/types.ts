export type SalesRecord = {
  date: string;
  sales: number;
  store?: string;
  product?: string;
  category?: string;
};

export type DailySales = {
  date: string;
  sales: number;
};

export type ForecastPoint = {
  date: string;
  predictedSales: number;
  lowerBound: number;
  upperBound: number;
};

export type ModelScore = {
  model: string;
  mae: number;
  rmse: number;
  wape: number | null;
  holdoutDays: number;
  isRecommended: boolean;
};

export type EvaluationResult = {
  scores: ModelScore[];
  holdoutStart: string;
  holdoutEnd: string;
  holdoutDays: number;
  trainingDays: number;
} | null;

export type CsvImportResult = {
  records: SalesRecord[];
  sourceName: string;
  skippedRows: number;
};
