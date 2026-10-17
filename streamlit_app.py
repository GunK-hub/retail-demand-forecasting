"""
Retail Demand Forecasting Dashboard
===================================

Interactive Streamlit dashboard that turns a trained Random Forest model
into a planning tool: historical analysis, demand forecast, inventory
recommendations and model accuracy reporting.

Project layout
--------------
project/
├── app.py
├── .streamlit/config.toml     (light theme, copy next to app.py)
├── src/
│   ├── data_loader.py         -> load_features()
│   └── forecast.py            -> generate_forecast(days)
├── models/
└── data/processed/
    ├── validation_model_comparison.csv
    └── recursive_backtest_metrics.csv
"""

from pathlib import Path
from statistics import NormalDist
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# ==================================================
# 1. CONFIGURATION
# ==================================================
PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

sys.path.insert(0, str(SRC_DIR))

from data_loader import load_features  # noqa: E402
from forecast import generate_forecast  # noqa: E402

st.set_page_config(
    page_title="Retail Demand Forecasting",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

C = {
    "bg": "#F3F5F9",
    "card": "#FFFFFF",
    "border": "#E3E8F0",
    "text": "#0F172A",
    "muted": "#64748B",
    "navy": "#0B1B3A",
    "primary": "#2563EB",
    "primary_light": "#BFD3FB",
    "forecast": "#F59E0B",
    "good": "#16A34A",
    "bad": "#DC2626",
    "grid": "#EEF1F6",
}

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ==================================================
# 2. STYLING
# ==================================================
st.markdown(
    f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, .stApp, [class*="css"] {{ font-family: 'Inter', 'Segoe UI', sans-serif; }}
.stApp {{ background: {C["bg"]}; color: {C["text"]}; }}

/* Hide Streamlit chrome */
#MainMenu, footer {{ visibility: hidden; }}
header[data-testid="stHeader"] {{ background: transparent; }}

.main .block-container {{ padding-top: 1.5rem; padding-bottom: 2rem; max-width: 1450px; }}

/* Sidebar */
[data-testid="stSidebar"] {{ background: {C["card"]}; border-right: 1px solid {C["border"]}; }}
.side-brand {{ font-weight: 700; font-size: 1.05rem; color: {C["navy"]}; margin-bottom: 2px; }}
.side-sub {{ color: {C["muted"]}; font-size: .8rem; margin-bottom: 1rem; }}
.side-section {{ font-size: .78rem; font-weight: 600; color: {C["muted"]}; margin: 1.1rem 0 .3rem; letter-spacing: .3px; }}

/* Hero banner */
.hero {{
    background: linear-gradient(120deg, {C["navy"]} 0%, #17366F 100%);
    border-radius: 14px; padding: 26px 32px; margin-bottom: 1.2rem; color: #fff;
}}
.hero-title {{ font-size: 1.85rem; font-weight: 700; letter-spacing: -.4px; margin: 0; }}
.hero-sub {{ color: #B9C6E4; font-size: .95rem; margin: 6px 0 16px; }}
.pill {{
    display: inline-block; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.22);
    padding: 4px 12px; border-radius: 999px; font-size: .76rem; margin-right: 8px; color: #E7EDFB;
}}

/* KPI cards */
.kpi {{
    background: {C["card"]}; border: 1px solid {C["border"]}; border-radius: 12px;
    padding: 18px 20px 16px; height: 100%; box-shadow: 0 1px 2px rgba(15,23,42,.04);
}}
.kpi-label {{ color: {C["muted"]}; font-size: .8rem; font-weight: 500; }}
.kpi-value {{ font-size: 1.8rem; font-weight: 700; color: {C["text"]}; margin: 6px 0 4px; letter-spacing: -.5px; }}
.kpi-sub {{ font-size: .78rem; color: {C["muted"]}; }}
.kpi-delta {{ font-size: .74rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin-right: 6px; }}
.up {{ background: #DCFCE7; color: {C["good"]}; }}
.down {{ background: #FEE2E2; color: {C["bad"]}; }}

/* Section cards (st.container(border=True)) */
div[data-testid="stVerticalBlockBorderWrapper"] {{
    background: {C["card"]}; border: 1px solid {C["border"]} !important;
    border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,.04);
}}
.card-title {{ font-size: 1.02rem; font-weight: 600; color: {C["text"]}; margin: 0; }}
.card-caption {{ font-size: .82rem; color: {C["muted"]}; margin: 2px 0 8px; }}

/* Tabs */
div[data-baseweb="tab-list"] {{ gap: 6px; border-bottom: 1px solid {C["border"]}; }}
button[data-baseweb="tab"] {{ font-weight: 500; color: {C["muted"]}; padding: 10px 16px; }}
button[data-baseweb="tab"][aria-selected="true"] {{ color: {C["primary"]} !important; font-weight: 600; }}
div[data-baseweb="tab-highlight"] {{ background-color: {C["primary"]} !important; }}

/* Buttons and tables */
.stButton button, .stDownloadButton button {{ border-radius: 8px; font-weight: 500; border: 1px solid {C["border"]}; }}
.stButton button:hover, .stDownloadButton button:hover {{ border-color: {C["primary"]}; color: {C["primary"]}; }}
[data-testid="stDataFrame"] {{ border: 1px solid {C["border"]}; border-radius: 10px; overflow: hidden; }}
div[data-testid="stAlert"] {{ border-radius: 10px; }}
hr {{ border-color: {C["border"]}; }}
.footer {{ text-align: center; color: {C["muted"]}; font-size: .8rem; margin-top: 1.5rem; }}
</style>
""",
    unsafe_allow_html=True,
)


# ==================================================
# 3. UI HELPERS
# ==================================================
def kpi_card(label, value, sub="", delta=None, accent=None):
    """Render a KPI card. `delta` is a signed percentage string such as '+4.2%'."""
    accent = accent or C["primary"]
    delta_html = ""
    if delta:
        cls = "down" if delta.startswith("-") else "up"
        delta_html = f'<span class="kpi-delta {cls}">{delta}</span>'
    html = (
        f'<div class="kpi" style="border-top:3px solid {accent};">'
        f'<div class="kpi-label">{label}</div>'
        f'<div class="kpi-value">{value}</div>'
        f'<div class="kpi-sub">{delta_html}{sub}</div>'
        f"</div>"
    )
    st.markdown(html, unsafe_allow_html=True)


def card_header(title, caption=""):
    html = f'<div class="card-title">{title}</div>'
    if caption:
        html += f'<div class="card-caption">{caption}</div>'
    st.markdown(html, unsafe_allow_html=True)


def pct_delta(new, base):
    if base == 0 or pd.isna(base):
        return None
    return f"{(new - base) / base * 100:+.1f}%"


def style_figure(fig, height=380, hovermode="x unified"):
    fig.update_layout(
        template="plotly_white",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, sans-serif", color=C["text"], size=12),
        height=height,
        hovermode=hovermode,
        margin=dict(l=4, r=4, t=30, b=4),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1, bgcolor="rgba(0,0,0,0)"),
    )
    fig.update_xaxes(showgrid=False, showline=True, linecolor=C["border"], tickfont=dict(color=C["muted"]))
    fig.update_yaxes(gridcolor=C["grid"], zeroline=False, tickfont=dict(color=C["muted"]))
    return fig


# ==================================================
# 4. DATA ACCESS
# ==================================================
@st.cache_data(show_spinner="Loading historical data...")
def get_historical_data():
    data = load_features()
    data["date"] = pd.to_datetime(data["date"])
    return data.sort_values("date").reset_index(drop=True)


@st.cache_data(show_spinner="Generating forecast...")
def get_forecast(days):
    result = generate_forecast(days=days)
    result["date"] = pd.to_datetime(result["date"])
    result["predicted_sales"] = result["predicted_sales"].clip(lower=0)
    return result.sort_values("date").reset_index(drop=True)


# ==================================================
# 5. SIDEBAR
# ==================================================
st.sidebar.markdown('<div class="side-brand">Demand Forecasting</div>', unsafe_allow_html=True)
st.sidebar.markdown('<div class="side-sub">Retail analytics workspace</div>', unsafe_allow_html=True)

st.sidebar.markdown('<div class="side-section">FORECAST</div>', unsafe_allow_html=True)
forecast_days = st.sidebar.selectbox(
    "Forecast horizon",
    options=[7, 14, 30],
    index=2,
    format_func=lambda x: f"{x} days",
)

if st.sidebar.button("Refresh forecast", use_container_width=True):
    st.cache_data.clear()
    st.rerun()

try:
    historical = get_historical_data()
    forecast = get_forecast(forecast_days)
except Exception as exc:
    st.error(f"Could not load the forecasting data: {exc}")
    st.info(
        "Check that a trained model exists in the models folder and that "
        "src/data_loader.py and src/forecast.py run without errors."
    )
    st.stop()

st.sidebar.markdown('<div class="side-section">HISTORICAL DATA</div>', unsafe_allow_html=True)
min_date = historical["date"].min().date()
max_date = historical["date"].max().date()

selected_dates = st.sidebar.date_input(
    "Date range",
    value=(min_date, max_date),
    min_value=min_date,
    max_value=max_date,
)

if isinstance(selected_dates, (tuple, list)) and len(selected_dates) == 2:
    start_date, end_date = selected_dates
    filtered_history = historical[
        historical["date"].between(pd.Timestamp(start_date), pd.Timestamp(end_date))
    ]
else:
    if isinstance(selected_dates, (tuple, list)):
        st.sidebar.info("Pick an end date to apply the range.")
    filtered_history = historical.copy()

if filtered_history.empty:
    st.warning("No historical sales found for this date range. Try a wider range.")
    st.stop()

# ==================================================
# 6. HERO BANNER AND KPIs
# ==================================================
st.markdown(
    f"""
<div class="hero">
  <div class="hero-title">Retail Demand Forecasting</div>
  <div class="hero-sub">Forecast daily sales, understand demand patterns and plan inventory with machine learning.</div>
  <span class="pill">Random Forest Regressor</span>
  <span class="pill">{forecast_days}-day horizon</span>
  <span class="pill">Data: {min_date:%d %b %Y} to {max_date:%d %b %Y}</span>
</div>
""",
    unsafe_allow_html=True,
)

total_sales = filtered_history["sales"].sum()
average_sales = filtered_history["sales"].mean()
peak_sales = filtered_history["sales"].max()
average_forecast = forecast["predicted_sales"].mean()
recent_window = historical.tail(forecast_days)["sales"].mean()

k1, k2, k3, k4 = st.columns(4, gap="medium")
with k1:
    kpi_card("Total historical sales", f"{total_sales:,.0f}", "selected date range")
with k2:
    kpi_card("Average daily sales", f"{average_sales:,.1f}", "selected date range")
with k3:
    kpi_card("Peak daily sales", f"{peak_sales:,.1f}", "highest single day")
with k4:
    kpi_card(
        "Forecast daily average",
        f"{average_forecast:,.1f}",
        f"vs last {forecast_days} days",
        delta=pct_delta(average_forecast, recent_window),
        accent=C["forecast"],
    )

st.write("")

# ==================================================
# 7. TABS
# ==================================================
overview_tab, forecast_tab, inventory_tab, data_tab, model_tab = st.tabs(
    ["Overview", "Demand forecast", "Inventory planning", "Data explorer", "Model performance"]
)

# --------------------------------------------------
# 7.1 OVERVIEW
# --------------------------------------------------
with overview_tab:
    st.write("")
    with st.container(border=True):
        card_header(
            "Historical sales trend",
            "Daily sales with a 7-day moving average to show the underlying trend.",
        )
        hist = filtered_history[["date", "sales"]].sort_values("date").copy()
        hist["ma7"] = hist["sales"].rolling(7, min_periods=7).mean()

        fig = go.Figure()
        fig.add_trace(
            go.Scatter(
                x=hist["date"], y=hist["sales"], mode="lines", name="Daily sales",
                line=dict(color=C["primary_light"], width=1.2),
                hovertemplate="Daily sales: %{y:,.2f}<extra></extra>",
            )
        )
        fig.add_trace(
            go.Scatter(
                x=hist["date"], y=hist["ma7"], mode="lines", name="7-day moving average",
                line=dict(color=C["primary"], width=2.8),
                hovertemplate="7-day average: %{y:,.2f}<extra></extra>",
            )
        )
        style_figure(fig, height=380)
        fig.update_yaxes(title="Sales")
        st.plotly_chart(fig, use_container_width=True)

    left, right = st.columns(2, gap="medium")

    with left:
        with st.container(border=True):
            card_header("Weekly pattern", "Average sales by day of the week.")
            if "day_of_week" in filtered_history.columns:
                wk = (
                    filtered_history.groupby("day_of_week")["sales"]
                    .mean().reindex(range(7)).reset_index()
                )
                wk["day"] = wk["day_of_week"].map(dict(enumerate(WEEKDAYS)))
                best_idx = wk["sales"].idxmax()
                colors = [C["primary"] if i == best_idx else C["primary_light"] for i in wk.index]

                fig_wk = go.Figure(
                    go.Bar(
                        x=wk["day"], y=wk["sales"], marker_color=colors,
                        hovertemplate="%{x}<br>Average: %{y:,.2f}<extra></extra>",
                    )
                )
                fig_wk.add_hline(
                    y=filtered_history["sales"].mean(), line_dash="dash", line_color=C["muted"],
                    annotation_text="Overall average", annotation_font_color=C["muted"],
                )
                style_figure(fig_wk, height=340, hovermode="closest")
                fig_wk.update_layout(showlegend=False)
                st.plotly_chart(fig_wk, use_container_width=True)
                st.caption(
                    f"{wk.loc[best_idx, 'day']} is the strongest day: "
                    f"{pct_delta(wk.loc[best_idx, 'sales'], filtered_history['sales'].mean())} "
                    "versus the overall average."
                )
            else:
                st.info("The day_of_week column is not available in this dataset.")

    with right:
        with st.container(border=True):
            card_header("Monthly pattern", "Average daily sales by calendar month.")
            monthly = (
                filtered_history.assign(month=filtered_history["date"].dt.month)
                .groupby("month")["sales"].mean().reset_index()
            )
            if len(monthly) >= 2:
                monthly["label"] = monthly["month"].map(
                    lambda m: pd.Timestamp(2000, int(m), 1).strftime("%b")
                )
                fig_m = go.Figure(
                    go.Bar(
                        x=monthly["label"], y=monthly["sales"], marker_color=C["primary"],
                        hovertemplate="%{x}<br>Average: %{y:,.2f}<extra></extra>",
                    )
                )
                style_figure(fig_m, height=340, hovermode="closest")
                fig_m.update_layout(showlegend=False)
                st.plotly_chart(fig_m, use_container_width=True)
            else:
                st.info("Select a range covering at least two months to see monthly patterns.")

    with st.container(border=True):
        card_header("Recent sales", "Latest 15 records in the selected date range.")
        recent = (
            filtered_history[["date", "sales"]]
            .sort_values("date", ascending=False).head(15).copy()
        )
        recent["date"] = recent["date"].dt.strftime("%d %b %Y")
        recent["sales"] = recent["sales"].round(2)
        st.dataframe(
            recent, use_container_width=True, hide_index=True,
            column_config={
                "date": st.column_config.TextColumn("Date"),
                "sales": st.column_config.NumberColumn("Sales", format="%.2f"),
            },
        )

# --------------------------------------------------
# 7.2 DEMAND FORECAST
# --------------------------------------------------
with forecast_tab:
    st.write("")
    with st.container(border=True):
        card_header(
            f"{forecast_days}-day sales forecast",
            "The last 60 days of actual sales are shown for context.",
        )
        context = historical.tail(60)[["date", "sales"]]
        forecast_start = forecast["date"].min()

        fig_f = go.Figure()
        fig_f.add_trace(
            go.Scatter(
                x=context["date"], y=context["sales"], mode="lines", name="Actual",
                line=dict(color=C["primary"], width=2.2),
                hovertemplate="Actual: %{y:,.2f}<extra></extra>",
            )
        )
        bridge = pd.concat(
            [
                context.tail(1).rename(columns={"sales": "value"}),
                forecast[["date", "predicted_sales"]].rename(columns={"predicted_sales": "value"}),
            ]
        )
        fig_f.add_trace(
            go.Scatter(
                x=bridge["date"], y=bridge["value"], mode="lines+markers", name="Forecast",
                line=dict(color=C["forecast"], width=2.8, dash="dot"),
                marker=dict(size=6, color=C["forecast"], line=dict(color="#fff", width=1)),
                hovertemplate="Forecast: %{y:,.2f}<extra></extra>",
            )
        )
        fig_f.add_shape(
            type="line", xref="x", yref="paper", x0=forecast_start, x1=forecast_start, y0=0, y1=1,
            line=dict(color=C["muted"], width=1, dash="dash"),
        )
        fig_f.add_annotation(
            x=forecast_start, yref="paper", y=1, text="Forecast starts", showarrow=False,
            xanchor="left", yanchor="bottom", font=dict(color=C["muted"], size=11),
        )
        style_figure(fig_f, height=420)
        fig_f.update_yaxes(title="Daily sales")
        st.plotly_chart(fig_f, use_container_width=True)

    best_day = forecast.loc[forecast["predicted_sales"].idxmax()]
    low_day = forecast.loc[forecast["predicted_sales"].idxmin()]

    s1, s2, s3 = st.columns(3, gap="medium")
    with s1:
        kpi_card("Total forecast demand", f"{forecast['predicted_sales'].sum():,.0f}",
                 f"next {forecast_days} days", accent=C["forecast"])
    with s2:
        kpi_card("Highest predicted demand", f"{best_day['predicted_sales']:,.1f}",
                 f"{best_day['date']:%a, %d %b %Y}", accent=C["forecast"])
    with s3:
        kpi_card("Lowest predicted demand", f"{low_day['predicted_sales']:,.1f}",
                 f"{low_day['date']:%a, %d %b %Y}", accent=C["forecast"])

    st.write("")
    with st.container(border=True):
        card_header("Daily forecast details", "Predicted sales for each day in the horizon.")
        table = forecast.copy()
        table.insert(1, "weekday", table["date"].dt.day_name())
        table["date"] = table["date"].dt.strftime("%d %b %Y")
        st.dataframe(
            table.round(2), use_container_width=True, hide_index=True,
            column_config={
                "date": st.column_config.TextColumn("Date"),
                "weekday": st.column_config.TextColumn("Weekday"),
                "predicted_sales": st.column_config.NumberColumn("Predicted sales", format="%.2f"),
            },
        )
        st.download_button(
            "Download forecast (CSV)",
            data=forecast.to_csv(index=False).encode("utf-8"),
            file_name=f"demand_forecast_{forecast_days}_days.csv",
            mime="text/csv",
        )

# --------------------------------------------------
# 7.3 INVENTORY PLANNING
# --------------------------------------------------
with inventory_tab:
    st.write("")
    with st.container(border=True):
        card_header(
            "Reorder calculator",
            "Convert the forecast into a reorder decision using a standard safety-stock formula.",
        )
        p1, p2, p3 = st.columns(3, gap="medium")
        with p1:
            lead_time = st.slider(
                "Supplier lead time (days)", 1, min(14, forecast_days), min(7, forecast_days),
                help="Days between placing an order and receiving stock.",
            )
        with p2:
            service_level = st.slider(
                "Target service level (%)", 85.0, 99.5, 95.0, 0.5,
                help="Probability of not running out of stock during the lead time.",
            )
        with p3:
            current_stock = st.number_input(
                "Current stock on hand (units)", min_value=0.0,
                value=float(round(average_forecast * lead_time)), step=10.0,
            )

    daily_std = historical.tail(90)["sales"].std()
    daily_std = 0.0 if pd.isna(daily_std) else daily_std
    z_score = NormalDist().inv_cdf(service_level / 100)
    lead_time_demand = forecast["predicted_sales"].head(lead_time).sum()
    safety_stock = z_score * daily_std * (lead_time ** 0.5)
    reorder_point = lead_time_demand + safety_stock
    order_qty = max(reorder_point - current_stock, 0)
    cover = current_stock / average_forecast if average_forecast > 0 else float("nan")

    st.write("")
    i1, i2, i3, i4 = st.columns(4, gap="medium")
    with i1:
        kpi_card("Lead-time demand", f"{lead_time_demand:,.0f}", f"next {lead_time} days")
    with i2:
        kpi_card("Safety stock", f"{safety_stock:,.0f}", f"{service_level:.1f}% service level")
    with i3:
        kpi_card("Reorder point", f"{reorder_point:,.0f}", "demand + safety stock", accent=C["forecast"])
    with i4:
        kpi_card("Days of cover", f"{cover:,.1f}", "at forecast demand")

    st.write("")
    if order_qty > 0:
        st.warning(
            f"Stock is below the reorder point. Order at least **{order_qty:,.0f} units** "
            f"to reach a {service_level:.1f}% service level."
        )
    else:
        st.success(f"Current stock covers the reorder point for a {service_level:.1f}% service level.")

    with st.container(border=True):
        card_header("Cumulative demand vs. current stock", "Where the forecast demand overtakes your stock.")
        cum = forecast[["date", "predicted_sales"]].copy()
        cum["cumulative"] = cum["predicted_sales"].cumsum()
        fig_s = go.Figure()
        fig_s.add_trace(
            go.Scatter(
                x=cum["date"], y=cum["cumulative"], mode="lines", name="Cumulative forecast demand",
                line=dict(color=C["forecast"], width=3), fill="tozeroy",
                fillcolor="rgba(245,158,11,.10)",
                hovertemplate="Cumulative demand: %{y:,.0f}<extra></extra>",
            )
        )
        fig_s.add_hline(
            y=current_stock, line_dash="dash", line_color=C["primary"],
            annotation_text="Current stock", annotation_font_color=C["primary"],
        )
        style_figure(fig_s, height=340)
        fig_s.update_yaxes(title="Units")
        st.plotly_chart(fig_s, use_container_width=True)
        st.caption(
            "Safety stock = z x daily demand std. dev. x sqrt(lead time), using the last 90 days "
            "of actual sales. A simplified planning heuristic that assumes independent daily "
            "demand and a constant lead time."
        )

# --------------------------------------------------
# 7.4 DATA EXPLORER
# --------------------------------------------------
with data_tab:
    st.write("")
    d1, d2, d3 = st.columns(3, gap="medium")
    span = (filtered_history["date"].max() - filtered_history["date"].min()).days + 1
    with d1:
        kpi_card("Rows", f"{len(filtered_history):,}", "in selected range")
    with d2:
        kpi_card("Columns", f"{len(filtered_history.columns)}", "engineered features")
    with d3:
        kpi_card("Date span", f"{span:,} days", "selected range")

    st.write("")
    with st.container(border=True):
        card_header("Historical dataset", "Engineered features for the selected date range.")
        st.dataframe(filtered_history, use_container_width=True, hide_index=True)
        with st.expander("Summary statistics"):
            st.dataframe(filtered_history.describe().round(2), use_container_width=True)
        st.download_button(
            "Download historical data (CSV)",
            data=filtered_history.to_csv(index=False).encode("utf-8"),
            file_name="historical_sales.csv",
            mime="text/csv",
        )

# --------------------------------------------------
# 7.5 MODEL PERFORMANCE
# --------------------------------------------------
with model_tab:
    st.write("")
    metrics_path = PROCESSED_DIR / "validation_model_comparison.csv"
    backtest_path = PROCESSED_DIR / "recursive_backtest_metrics.csv"

    with st.container(border=True):
        card_header("Forecasting model", "How predictions are produced.")
        st.markdown(
            "- **Algorithm:** Random Forest Regressor\n"
            "- **Inputs:** calendar features, lagged sales values and rolling statistics\n"
            "- **Method:** recursive forecasting, where each predicted day feeds the next"
        )

    st.write("")
    with st.container(border=True):
        card_header("Validation accuracy", "Models compared on the validation set. Lower error is better.")

        if metrics_path.exists():
            metrics_df = pd.read_csv(metrics_path)
            ranking_metric = (
                "Pooled WAPE (%)" if "Pooled WAPE (%)" in metrics_df.columns else "WAPE (%)"
            )

            if ranking_metric in metrics_df.columns:
                valid = metrics_df.dropna(subset=[ranking_metric])
                if not valid.empty:
                    best = valid.loc[valid[ranking_metric].idxmin()]

                    m1, m2, m3 = st.columns(3, gap="medium")
                    with m1:
                        kpi_card("Best validation model", str(best["Model"]), "lowest error")
                    with m2:
                        kpi_card(ranking_metric, f"{best[ranking_metric]:.2f}%", "best model",
                                 accent=C["forecast"])
                    with m3:
                        if "MAE" in metrics_df.columns:
                            kpi_card("Validation MAE", f"{best['MAE']:.2f}", "best model")

                    ranked = valid.sort_values(ranking_metric)
                    fig_models = go.Figure(
                        go.Bar(
                            x=ranked[ranking_metric], y=ranked["Model"], orientation="h",
                            marker_color=[
                                C["forecast"] if m == best["Model"] else C["primary_light"]
                                for m in ranked["Model"]
                            ],
                            hovertemplate="%{y}: %{x:.2f}%<extra></extra>",
                        )
                    )
                    style_figure(fig_models, height=max(240, 60 * len(ranked)), hovermode="closest")
                    fig_models.update_layout(showlegend=False)
                    fig_models.update_yaxes(autorange="reversed")
                    fig_models.update_xaxes(title=ranking_metric)
                    st.write("")
                    st.plotly_chart(fig_models, use_container_width=True)

            st.dataframe(
                metrics_df.sort_values(ranking_metric)
                if ranking_metric in metrics_df.columns else metrics_df,
                use_container_width=True, hide_index=True,
            )
        else:
            st.warning("Validation results not found. Expected data/processed/validation_model_comparison.csv.")

    st.write("")
    with st.container(border=True):
        card_header(
            "Recursive backtesting",
            "Performance when the model predicts several days ahead using its own earlier predictions.",
        )
        if backtest_path.exists():
            bt = pd.read_csv(backtest_path)
            if not bt.empty:
                st.dataframe(
                    bt.sort_values("WAPE (%)") if "WAPE (%)" in bt.columns else bt,
                    use_container_width=True, hide_index=True,
                )
                if "WAPE (%)" in bt.columns:
                    valid_bt = bt.dropna(subset=["WAPE (%)"])
                    if not valid_bt.empty:
                        best_bt = valid_bt.loc[valid_bt["WAPE (%)"].idxmin()]
                        st.info(
                            f"Best recursive backtest model: **{best_bt['Model']}** "
                            f"with a WAPE of {best_bt['WAPE (%)']:.2f}%."
                        )
        else:
            st.warning("Recursive backtest results not found. Expected data/processed/recursive_backtest_metrics.csv.")

    st.write("")
    with st.container(border=True):
        card_header("How to read the metrics", "Short definitions of each error measure.")
        st.markdown(
            """
- **MAE (Mean Absolute Error):** average gap between actual and predicted sales, in sales units. Lower is better.
- **RMSE (Root Mean Squared Error):** like MAE but penalises large misses more heavily. Lower is better.
- **WAPE (Weighted Absolute Percentage Error):** total absolute error divided by total actual demand, as a percentage. Lower is better.
- **Pooled WAPE:** WAPE calculated on errors and demand pooled across all validation folds, so higher-demand folds carry proportionally more weight.
            """
        )
        st.caption(
            "Validation and recursive backtesting use different evaluation procedures, "
            "so compare models only within the same procedure."
        )

# ==================================================
# 8. FOOTER
# ==================================================
st.markdown(
    '<div class="footer">Retail Demand Forecasting &middot; Python, scikit-learn, Streamlit, Plotly</div>',
    unsafe_allow_html=True,
)