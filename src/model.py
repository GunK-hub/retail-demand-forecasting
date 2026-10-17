
from pathlib import Path
import joblib
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = (
    PROJECT_ROOT
    / "models"
    / "random_forest_retail_demand_tuned.joblib"
)


def load_model():
    """Load the previously trained Random Forest model."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Saved model not found: {MODEL_PATH}"
        )

    return joblib.load(MODEL_PATH)


def predict_demand(model, features):
    """Generate demand predictions from feature columns."""
    expected_features = list(model.feature_names_in_)

    missing = set(expected_features) - set(features.columns)
    if missing:
        raise ValueError(
            f"Missing required model features: {sorted(missing)}"
        )

    X = features[expected_features]
    predictions = model.predict(X)

    return pd.Series(
        predictions,
        index=features.index,
        name="predicted_sales"
    )
