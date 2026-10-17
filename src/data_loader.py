
from pathlib import Path
import pandas as pd


# Project root directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Processed data directory
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"


def load_features():
    """Load the engineered retail demand dataset."""
    file_path = PROCESSED_DIR / "retail_demand_features.csv"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Feature dataset not found: {file_path}"
        )

    df = pd.read_csv(file_path, parse_dates=["date"])

    if "sales" not in df.columns:
        raise ValueError("Dataset must contain a 'sales' column.")

    df = df.sort_values("date").reset_index(drop=True)

    return df


def load_forecast():
    """Load the previously generated future forecast."""
    file_path = PROCESSED_DIR / "future_demand_forecast.csv"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Forecast file not found: {file_path}"
        )

    df = pd.read_csv(file_path, parse_dates=["date"])

    return df
