
from pathlib import Path

import pandas as pd

from data_loader import load_features
from model import load_model


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"


def generate_forecast(days=30):
    """
    Generate future demand forecasts recursively.

    Each prediction is added to the sales history and is used
    to calculate lag and rolling features for the next day.
    """
    if days < 1:
        raise ValueError("Forecast days must be at least 1.")

    features = load_features().copy()
    model = load_model()

    features["date"] = pd.to_datetime(features["date"])
    features = features.sort_values("date").reset_index(drop=True)

    if features.empty:
        raise ValueError("The feature dataset is empty.")

    expected_features = list(model.feature_names_in_)

    missing = set(expected_features) - set(features.columns)
    if missing:
        raise ValueError(
            f"Missing required features: {sorted(missing)}"
        )

    # Historical sales indexed by date.
    sales_history = pd.Series(
        features["sales"].to_numpy(dtype=float),
        index=pd.DatetimeIndex(features["date"]),
        dtype=float,
    )

    last_date = sales_history.index.max()

    future_dates = pd.date_range(
        start=last_date + pd.Timedelta(days=1),
        periods=days,
        freq="D",
    )

    predictions = []

    for forecast_date in future_dates:
        # Calendar features
        row = {
            "day_of_week": forecast_date.dayofweek,
            "day_of_month": forecast_date.day,
            "month": forecast_date.month,
            "year": forecast_date.year,
            "week_of_year": int(
                forecast_date.isocalendar().week
            ),
            "is_weekend": int(forecast_date.dayofweek >= 5),
        }

        # Lag features: use the latest available sales history.
        for lag in (1, 7, 14, 28):
            if len(sales_history) < lag:
                raise ValueError(
                    f"At least {lag} historical observations "
                    "are required for forecasting."
                )

            row[f"lag_{lag}"] = float(
                sales_history.iloc[-lag]
            )

        # Rolling features: use history available before this day.
        past_sales = sales_history.loc[
            sales_history.index < forecast_date
        ]

        row["rolling_mean_7"] = float(
            past_sales.tail(7).mean()
        )
        row["rolling_mean_28"] = float(
            past_sales.tail(28).mean()
        )
        row["rolling_std_7"] = float(
            past_sales.tail(7).std()
        )

        # Match the exact feature order expected by the model.
        X_future = pd.DataFrame(
            [row],
            columns=expected_features,
        )

        prediction = max(
            0.0,
            float(model.predict(X_future)[0]),
        )

        predictions.append(prediction)

        # Add the prediction to history for the next iteration.
        sales_history.loc[forecast_date] = prediction

    forecast = pd.DataFrame({
        "date": future_dates,
        "predicted_sales": predictions,
    })

    return forecast
