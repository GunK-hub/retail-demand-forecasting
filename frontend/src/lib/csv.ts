import Papa from "papaparse";
import type { CsvImportResult, SalesRecord } from "./types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100_000;

const DATE_HEADERS = new Set([
  "date",
  "day",
  "ds",
  "timestamp",
  "transactiondate",
  "orderdate",
]);
const SALES_HEADERS = new Set([
  "sales",
  "units",
  "unitssold",
  "demand",
  "quantity",
  "qty",
  "actual",
  "y",
]);

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeader(
  fields: string[],
  candidates: Set<string>,
): string | undefined {
  return fields.find((field) => candidates.has(normalizeHeader(field)));
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      return null;
    }
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function optionalText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function optionalHeader(fields: string[], aliases: string[]): string | undefined {
  const normalized = new Set(aliases);
  return findHeader(fields, normalized);
}

export async function parseSalesCsv(file: File): Promise<CsvImportResult> {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Choose a CSV file to import.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("The file is larger than 10 MB. Try a smaller CSV.");
  }
  if (file.size === 0) {
    throw new Error("This CSV file is empty.");
  }

  const result = await new Promise<Papa.ParseResult<Record<string, unknown>>>(
    (resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: "greedy",
        complete: resolve,
        error: (error) => reject(new Error(error.message)),
      });
    },
  );

  const fields = result.meta.fields ?? [];
  const dateHeader = findHeader(fields, DATE_HEADERS);
  const salesHeader = findHeader(fields, SALES_HEADERS);
  if (!dateHeader || !salesHeader) {
    throw new Error(
      "CSV needs a date column and a sales column. Accepted examples: date, sales or ds, units_sold.",
    );
  }
  if (result.data.length > MAX_ROWS) {
    throw new Error("The CSV has more than 100,000 rows. Reduce it and try again.");
  }
  if (result.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${result.errors[0]?.message ?? "invalid file"}`);
  }

  const storeHeader = optionalHeader(fields, [
    "store",
    "storeid",
    "storenumber",
    "storenbr",
  ]);
  const productHeader = optionalHeader(fields, [
    "product",
    "productid",
    "sku",
    "item",
  ]);
  const categoryHeader = optionalHeader(fields, [
    "category",
    "productcategory",
    "department",
  ]);

  let skippedRows = 0;
  const records: SalesRecord[] = [];
  for (const row of result.data) {
    const date = parseDate(row[dateHeader]);
    const salesText = String(row[salesHeader] ?? "").trim().replace(/,/g, "");
    const sales = Number(salesText);
    if (!date || !Number.isFinite(sales) || sales < 0) {
      skippedRows += 1;
      continue;
    }
    records.push({
      date,
      sales,
      ...(storeHeader ? { store: optionalText(row[storeHeader]) } : {}),
      ...(productHeader ? { product: optionalText(row[productHeader]) } : {}),
      ...(categoryHeader ? { category: optionalText(row[categoryHeader]) } : {}),
    });
  }

  if (records.length === 0) {
    throw new Error("No valid sales rows were found. Check date and sales values.");
  }
  return { records, sourceName: file.name, skippedRows };
}
