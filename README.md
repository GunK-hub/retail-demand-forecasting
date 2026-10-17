# Retail Demand Forecasting — Integrated Dashboard

This combines the Replit React/Vite dashboard with the existing Python retail-demand forecasting project.

## What is connected

- **Overview and Data workspace:** real daily history from `data/processed/retail_demand_features.csv`.
- **Forecast:** calls the saved tuned Random Forest model through `src/forecast.py`.
- **Model evaluation:** keeps the frontend's transparent statistical baseline comparison and adds the actual saved validation and recursive-backtest CSV results from the Python project.
- **Fallback:** if the Python API is not running, the frontend can still show its original synthetic demo data.

## Requirements

- Python 3.12 recommended
- Node.js 20+ and npm
- The tuned model file is included at `models/random_forest_retail_demand_tuned.joblib`.

## Run locally (Windows / VS Code)

### Terminal 1 — Python backend

From the project root:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/api/health` or open `http://127.0.0.1:8000/docs`.

### Terminal 2 — React frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Project layout

- `frontend/` — your Replit React dashboard, with the existing design preserved
- `backend/main.py` — FastAPI endpoints used by the frontend
- `src/` — original Python data loader, model loader, and recursive forecasting code
- `data/processed/` — processed history and saved evaluation outputs
- `models/` — trained Random Forest model used for real forecasts
- `streamlit_app.py` — original Streamlit dashboard retained as a fallback

## Notes

- The integrated runtime archive omits the large raw CSVs and notebook outputs; it includes the processed feature data and model required to run the dashboard.
- Validation values are read from your saved project evaluation CSVs. The recursive forecast endpoint runs the trained model; it does not substitute the browser-side statistical baseline for that prediction.
- Forecast range bounds are illustrative planning bands, not calibrated confidence intervals.
