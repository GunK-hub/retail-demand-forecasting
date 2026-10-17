from pathlib import Path
import sys
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
sys.path.insert(0, str(SRC_DIR))

from data_loader import load_features  # noqa: E402
from forecast import generate_forecast  # noqa: E402

app = FastAPI(
    title="Retail Demand Forecasting API",
    description="API for the integrated React dashboard and trained Python forecasting pipeline.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_csv_rows(filename: str) -> list[dict[str, Any]]:
    path = PROCESSED_DIR / filename
    if not path.exists():
        return []
    frame = pd.read_csv(path)
    frame = frame.where(pd.notna(frame), None)
    return frame.to_dict(orient="records")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "python-forecasting-backend"}


@app.get("/api/history")
def history():
    try:
        frame = load_features()
        records = [
            {"date": row.date.strftime("%Y-%m-%d"), "sales": float(row.sales)}
            for row in frame[["date", "sales"]].itertuples(index=False)
        ]
        return {
            "source_name": "Retail demand dataset · Python project",
            "data_source": "processed project dataset",
            "record_count": len(records),
            "start_date": records[0]["date"] if records else None,
            "end_date": records[-1]["date"] if records else None,
            "records": records,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load project history: {exc}") from exc


@app.get("/api/forecast")
def forecast(days: int = Query(default=30, ge=1, le=90)):
    try:
        frame = generate_forecast(days=days)
        # This band is a visual planning range, not a statistical confidence interval.
        forecast_rows = []
        for row in frame.itertuples(index=False):
            prediction = max(0.0, float(row.predicted_sales))
            width = max(5.0, prediction * 0.15)
            forecast_rows.append({
                "date": row.date.strftime("%Y-%m-%d"),
                "predictedSales": round(prediction, 2),
                "lowerBound": round(max(0.0, prediction - width), 2),
                "upperBound": round(prediction + width, 2),
            })
        return {
            "model": "Trained Random Forest Regressor",
            "forecast_days": days,
            "forecast_origin": load_features()["date"].max().strftime("%Y-%m-%d"),
            "forecast": forecast_rows,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Forecast generation failed: {exc}") from exc


@app.get("/api/model-metrics")
def model_metrics():
    return {
        "validation_models": read_csv_rows("validation_model_comparison.csv"),
        "recursive_backtest": read_csv_rows("recursive_backtest_metrics.csv"),
        "final_test_evaluation": read_csv_rows("final_test_evaluation.csv"),
    }
