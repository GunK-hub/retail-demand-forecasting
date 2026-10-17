# Retail Demand Forecast Dashboard

An interactive dashboard for analyzing daily retail sales, generating short-range demand forecasts, and evaluating forecasting baselines with a chronological holdout.

## Why this project

Retail teams need more than a prediction line: they need to see the history behind a forecast, compare reasonable baselines, and understand how accuracy was measured. This app makes those steps visible and keeps data handling local to the browser.

## Features

- Historical sales trend, rolling average, day-of-week profile, and date filters
- 7-, 14-, and 30-day demand forecasts with an estimated uncertainty range
- Client-side CSV import, validation, dataset search, and export
- Chronological holdout comparison of seasonal-trend, weekday-median, moving-average, and linear-trend baselines
- MAE, RMSE, and WAPE metrics with the evaluated date window shown
- Chart CSV exports, print-to-PDF, and a persistent light/dark theme
- Synthetic demo series so the project is useful before a real dataset is available

## Data and privacy

The built-in dataset is synthetic and generated deterministically. It is intended to demonstrate the analysis workflow, not to represent real stores or measured business performance.

CSV files are parsed in the browser and are not sent to a server. Imported data is saved in this browser's local storage and remains after reloads until it is replaced or browser storage is cleared. The app does not sync uploaded data between devices.

Required CSV columns:

| Column | Accepted examples |
| --- | --- |
| Date | `date`, `day`, `ds`, `timestamp`, `transaction_date`, `order_date` |
| Sales | `sales`, `units`, `units_sold`, `demand`, `quantity`, `qty`, `actual`, `y` |

Optional columns: `store` / `store_id`, `product` / `product_id` / `sku`, and `category` / `product_category` / `department`. Dates should use ISO format (`YYYY-MM-DD`). Sales values must be numeric and non-negative. Invalid rows are skipped and counted; a CSV with no valid rows is rejected.

## Forecasting method

The supplied Streamlit script referred to a Random Forest model and feature pipeline that were not included with the attachment. This implementation does **not** claim to run that unavailable model.

The forecast uses a transparent seasonal-trend baseline:

1. Aggregate rows into daily sales totals.
2. Estimate each forecast day from the median of recent observations for the same weekday.
3. Add a damped recent linear trend, bounded to avoid large unsupported adjustments.
4. Show an illustrative planning range based on recent same-weekday errors. It is not a statistically calibrated or guaranteed coverage interval.

Model comparison holds out the final portion of the chronological daily series (up to 28 days) and compares all baselines against the same holdout. No random split is used. The evaluation is a single holdout, not a repeated rolling-origin backtest. At least 28 distinct dates are required before metrics are shown.

- **MAE**: average absolute error, in the same units as sales.
- **RMSE**: square root of mean squared error; large errors have greater influence.
- **WAPE**: total absolute error divided by total actual sales, shown as a percentage.

Lower errors are better. Metrics on synthetic demo data are illustrative only and should not be used as evidence of real-world business performance.

## Run locally

From the workspace root:

```bash
pnpm --filter @workspace/retail-forecast-dashboard run dev
```

Other checks:

```bash
pnpm --filter @workspace/retail-forecast-dashboard run typecheck
pnpm --filter @workspace/retail-forecast-dashboard run build
```

## Resume-ready summary

Adapt this only after reviewing the actual implementation and using a real dataset for any performance claims:

> Built an interactive retail demand forecasting dashboard with client-side CSV ingestion, time-series exploration, seasonal-trend forecasts, and chronological holdout evaluation of MAE, RMSE, and WAPE across statistical baselines.

Do not add accuracy percentages or business impact numbers unless they are calculated from a real, documented dataset and evaluation.
