import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent } from 'react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Bar, BarChart,
} from 'recharts';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, CalendarDays, Check,
  CircleHelp, Database, FileSpreadsheet, Moon, Printer, Search,
  Sun, Upload, WandSparkles, X,
} from 'lucide-react';
import { createDemoData } from '@/lib/demoData';
import { parseSalesCsv } from '@/lib/csv';
import { addDays, aggregateDaily, evaluateModels, generateForecast, getWeekdayAverages, movingAverage } from '@/lib/forecasting';
import type { DailySales, ForecastPoint, SalesRecord } from '@/lib/types';


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type SourceKind = 'synthetic' | 'imported' | 'project';
type Workspace = {
  records: SalesRecord[];
  sourceKind: SourceKind;
  sourceName: string;
  skippedRows: number;
  startDate: string;
  endDate: string;
  horizon: number;
  setRange: (start: string, end: string) => void;
  setHorizon: (horizon: number) => void;
  importData: (records: SalesRecord[], name: string, skipped: number) => void;
  resetDemo: () => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace context is unavailable');
  return value;
};

const fmtNum = (n: number, digits = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', options);
};
const safeKey = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

function saveCsv(name: string, rows: Array<Record<string, string | number | boolean | null>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] ?? {});
  const quote = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers.map(quote).join(','), ...rows.map(row => headers.map(key => quote(row[key])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('retail-forecast-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('retail-forecast-theme', dark ? 'dark' : 'light'); } catch { /* storage is optional */ }
  }, [dark]);
  return <>{children}</>;
}

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<SalesRecord[]>(() => createDemoData());
  const [sourceKind, setSourceKind] = useState<SourceKind>('synthetic');
  const [sourceName, setSourceName] = useState('Synthetic retail series');
  const [skippedRows, setSkippedRows] = useState(0);

  const ordered = useMemo(() => aggregateDaily(records), [records]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [horizon, setHorizon] = useState(14);
  // Prefer the real processed dataset served by the Python forecasting backend.
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/history`)
      .then(response => {
        if (!response.ok) throw new Error('Python API is unavailable');
        return response.json();
      })
      .then(payload => {
        if (!active || !Array.isArray(payload.records) || payload.records.length === 0) return;
        const projectRecords: SalesRecord[] = payload.records.map((row: { date: string; sales: number }) => ({
          date: row.date,
          sales: Number(row.sales),
        }));
        setRecords(projectRecords);
        setSourceKind('project');
        setSourceName(payload.source_name || 'Python project dataset');
        setSkippedRows(0);
        setStartDate(payload.start_date || projectRecords[0]?.date || '');
        setEndDate(payload.end_date || projectRecords.at(-1)?.date || '');
      })
      .catch(() => {
        // Keep the existing demo available if the backend has not been started.
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ordered.length) return;
    setStartDate(current => current || ordered[0]!.date);
    setEndDate(current => current || ordered.at(-1)!.date);
  }, [ordered]);
  useEffect(() => {
    try {
      localStorage.setItem('retail-forecast-records', JSON.stringify(records));
      localStorage.setItem('retail-forecast-source', sourceKind);
      localStorage.setItem('retail-forecast-name', sourceName);
    } catch { /* keep the current session usable if storage is full */ }
  }, [records, sourceKind, sourceName]);
  const importData = (next: SalesRecord[], name: string, skipped: number) => {
    const daily = aggregateDaily(next);
    setRecords(next);
    setSourceKind('imported');
    setSourceName(name);
    setSkippedRows(skipped);
    setStartDate(daily[0]?.date ?? '');
    setEndDate(daily.at(-1)?.date ?? '');
  };
  const resetDemo = () => {
    const demo = createDemoData();
    const daily = aggregateDaily(demo);
    setRecords(demo);
    setSourceKind('synthetic');
    setSourceName('Synthetic retail series');
    setSkippedRows(0);
    setStartDate(daily[0]?.date ?? '');
    setEndDate(daily.at(-1)?.date ?? '');
  };
  const setRange = (start: string, end: string) => {
    if (start && end && start > end) return;
    setStartDate(start);
    setEndDate(end);
  };
  return <WorkspaceContext.Provider value={{ records, sourceKind, sourceName, skippedRows, startDate, endDate, horizon, setRange, setHorizon, importData, resetDemo }}>{children}</WorkspaceContext.Provider>;
}

const navItems = [
  { href: '/', label: 'Overview', icon: Activity, key: 'overview' },
  { href: '/forecast', label: 'Forecast', icon: WandSparkles, key: 'forecast' },
  { href: '/data', label: 'Data workspace', icon: Database, key: 'data' },
  { href: '/models', label: 'Model evaluation', icon: CircleHelp, key: 'models' },
];

function AppShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const [path] = useLocation();
  const { sourceKind, sourceName } = useWorkspace();
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('retail-forecast-theme') === 'dark'; } catch { return false; }
  });
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('retail-forecast-theme', next ? 'dark' : 'light'); } catch { /* optional */ }
  };
  return <div className="app-shell flex bg-background text-foreground">
    <aside className="sidebar print-hidden fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col px-4 py-5 lg:static lg:min-h-dvh lg:shrink-0">
      <Link href="/" className="mb-10 flex items-center gap-3 px-2" data-testid="link-brand-home">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#a5d3bd] text-[#153d32]"><Activity size={21} strokeWidth={2.4} /></span>
        <span><span className="block font-[Manrope] text-[15px] font-extrabold tracking-tight">Northline</span><span className="mt-0.5 block text-[10px] tracking-[.16em] text-white/50 uppercase">Demand workspace</span></span>
      </Link>
      <div className="eyebrow mb-3 px-3 text-white/40">Workspace</div>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon, key }) => {
          const active = path === href;
          return <Link key={key} href={href} data-testid={`nav-${key}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition-colors ${active ? 'bg-white/10 text-[#b8e0ce]' : 'text-white/65 hover:bg-white/[.06] hover:text-white'}`}>
            <Icon size={17} strokeWidth={1.8} /><span className="flex-1">{label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[#8dc5a8]" />}
          </Link>;
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.045] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="eyebrow text-white/45">Data source</span><span className={`h-2 w-2 rounded-full ${sourceKind === 'synthetic' ? 'bg-[#e5ad5c]' : 'bg-[#83c69e]'}`} /></div>
        <div className="truncate text-[13px] font-semibold text-white/90" title={sourceName} data-testid="text-source-name">{sourceName}</div>
        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${sourceKind === 'synthetic' ? 'bg-[#735b39]/40 text-[#f0c785]' : 'bg-[#315a46] text-[#b5e1c6]'}`} data-testid="badge-data-source">
          <span className="h-1 w-1 rounded-full bg-current" />{sourceKind === 'synthetic' ? 'Synthetic demo data' : sourceKind === 'project' ? 'Connected Python backend' : 'User-imported CSV'}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">All data and calculations stay in this browser.</p>
      </div>
      <div className="mt-4 flex items-center justify-between px-2 text-[10px] text-white/35"><span>PLANNING SUITE</span><span className="mono">v1.0</span></div>
    </aside>
    <main className="main-content ml-0 min-w-0 flex-1 px-5 pb-12 pt-6 lg:px-10 lg:pt-8">
      <div className="mx-auto max-w-[1360px]">
        <nav className="mobile-nav print-hidden mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 lg:hidden">
          {navItems.map(({ href, label, icon: Icon, key }) => <Link key={key} href={href} data-testid={`mobile-nav-${key}`} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-[11px] ${path === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Icon size={14} />{label}</Link>)}
        </nav>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="eyebrow mb-2 text-primary">Retail intelligence / {navItems.find(item => item.href === path)?.label ?? 'Workspace'}</div>
            <h1 className="font-[Manrope] text-[29px] font-extrabold leading-tight tracking-[-.045em] sm:text-[36px]" data-testid="text-page-title">{title}</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          <div className="print-hidden flex items-center gap-2">
            <button type="button" onClick={() => window.print()} className="tool-button" aria-label="Print or save as PDF" data-testid="button-print"><Printer size={16} /><span className="hidden sm:inline">Print / PDF</span></button>
            <button type="button" onClick={toggleTheme} className="tool-icon" aria-label="Toggle color theme" data-testid="button-theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </header>
        {children}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-5 text-[11px] text-muted-foreground">
          <span>Planning signals, not promises. Review forecasts against current trading context.</span>
          <span className="mono">LOCAL ANALYSIS · NO SERVER UPLOAD</span>
        </footer>
      </div>
    </main>
  </div>;
}

function SourceNotice() {
  const { sourceKind, sourceName } = useWorkspace();
  return <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${sourceKind === 'synthetic' ? 'border-[#e6d2ad] bg-[#f8f0df] text-[#694b20] dark:border-[#665334] dark:bg-[#322a1e] dark:text-[#e9c78d]' : 'border-[#bfdbca] bg-[#eaf3ec] text-[#315843] dark:border-[#42624e] dark:bg-[#1d3025] dark:text-[#b6d9c0]'}`} data-testid="notice-source">
    <div className="flex items-center gap-2.5"><span className="eyebrow">{sourceKind === 'synthetic' ? 'Synthetic series' : sourceKind === 'project' ? 'Python project data' : 'Imported locally'}</span><span className="h-1 w-1 rounded-full bg-current opacity-50" /><span className="text-[12px]">{sourceKind === 'synthetic' ? 'Illustrative demo data; not live store performance.' : sourceKind === 'project' ? `${sourceName} · actual processed project history.` : `${sourceName} is held in this browser only.`}</span></div>
    <span className="text-[11px] opacity-70">{sourceKind === 'project' ? 'Connected to local Python API' : 'Imported data stays in this browser'}</span>
  </div>;
}

function RangeControls() {
  const { records, startDate, endDate, setRange } = useWorkspace();
  const daily = useMemo(() => aggregateDaily(records), [records]);
  if (!daily.length) return null;
  return <section className="panel mb-5 flex flex-wrap items-end gap-3 p-4 sm:p-5" aria-label="Date range filters">
    <div className="mr-auto min-w-[150px]"><div className="eyebrow text-muted-foreground">Explore a period</div><p className="mt-1 text-[12px] text-muted-foreground">Applied across all views</p></div>
    <label className="filter-field"><span>From</span><input type="date" value={startDate} min={daily[0]?.date} max={endDate || daily.at(-1)?.date} onChange={e => setRange(e.target.value, endDate)} data-testid="input-date-start" /></label>
    <label className="filter-field"><span>Through</span><input type="date" value={endDate} min={startDate || daily[0]?.date} max={daily.at(-1)?.date} onChange={e => setRange(startDate, e.target.value)} data-testid="input-date-end" /></label>
    <div className="flex gap-1.5 pb-[1px]">
      {[30, 90].map(days => <button key={days} type="button" onClick={() => { const end = daily.at(-1)!.date; const start = addDays(end, -(days - 1)); setRange(start < daily[0]!.date ? daily[0]!.date : start, end); }} className="preset-button" data-testid={`button-range-${days}`}>{days}d</button>)}
      <button type="button" onClick={() => setRange(daily[0]!.date, daily.at(-1)!.date)} className="preset-button" data-testid="button-range-all">All time</button>
    </div>
  </section>;
}

function Metric({ label, value, detail, accent = false, testId }: { label: string; value: string; detail: string; accent?: boolean; testId: string }) {
  return <div className="panel relative min-h-[132px] overflow-hidden p-5">
    <div className="eyebrow text-muted-foreground">{label}</div>
    <div className={`mt-3 font-[Manrope] text-[27px] font-bold tracking-[-.04em] ${accent ? 'text-primary' : ''}`} data-testid={testId}>{value}</div>
    <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    {accent && <span className="absolute -bottom-5 -right-4 h-20 w-20 rounded-full border-[10px] border-primary/10" />}
  </div>;
}

function ExportButton({ filename, rows, label = 'Export chart data' }: { filename: string; rows: Array<Record<string, string | number | boolean | null>>; label?: string }) {
  return <button type="button" onClick={() => saveCsv(filename, rows)} disabled={!rows.length} className="tool-icon text-muted-foreground" aria-label={label} title={label} data-testid={`export-${safeKey(filename)}`}><ArrowDownToLine size={16} /></button>;
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string; payload?: { lowerBound?: number; upperBound?: number; actual?: number | null; predicted?: number | null } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (point && point.lowerBound != null && point.upperBound != null) {
    return <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-lg">
      <div className="mb-2 text-[11px] text-muted-foreground">{label ? dateLabel(String(label), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
      {point.actual != null && <div className="flex items-center gap-2 py-0.5 text-[12px]"><span className="h-2 w-2 rounded-full bg-[#456d87]" /><span className="text-muted-foreground">Observed sales</span><strong className="ml-3 tabular-nums">{fmtNum(point.actual, 1)}</strong></div>}
      <div className="flex items-center gap-2 py-0.5 text-[12px]"><span className="h-2 w-2 rounded-full bg-[#39896d]" /><span className="text-muted-foreground">Baseline forecast</span><strong className="ml-3 tabular-nums">{fmtNum(point.predicted ?? 0, 1)}</strong></div>
      <div className="mt-1 border-t border-border pt-1 text-[11px] text-muted-foreground">Indicative range <strong className="ml-1 text-foreground">{fmtNum(point.lowerBound, 1)} – {fmtNum(point.upperBound, 1)}</strong></div>
    </div>;
  }
  return <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-lg">
    <div className="mb-2 text-[11px] text-muted-foreground">{label ? (/^\d{4}-\d{2}-\d{2}$/.test(String(label)) ? dateLabel(String(label), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : String(label)) : ''}</div>
    {payload.filter(item => item.value != null).map((item, index) => <div key={`${item.dataKey}-${index}`} className="flex items-center gap-2 py-0.5 text-[12px]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-muted-foreground">{item.name}</span><strong className="ml-3 tabular-nums">{fmtNum(item.value!, 1)}</strong>
    </div>)}
  </div>;
}

function ChartFrame({ title, annotation, filename, rows, children, testId }: { title: string; annotation: string; filename: string; rows: Array<Record<string, string | number | boolean | null>>; children: ReactNode; testId: string }) {
  return <section className="panel min-w-0 p-5 sm:p-6" data-testid={testId}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="font-[Manrope] text-[15px] font-bold tracking-[-.02em]">{title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{annotation}</p></div>
      <ExportButton filename={filename} rows={rows} />
    </div>
    {children}
  </section>;
}

function ChartEmpty({ text = 'No observations in this period.' }: { text?: string }) {
  return <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center"><div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Activity size={18} /></div><p className="text-[13px] font-medium">{text}</p><p className="mt-1 text-[11px] text-muted-foreground">Adjust the date range or load a dataset to continue.</p></div>;
}

function OverviewPage() {
  const { records, startDate, endDate, sourceKind } = useWorkspace();
  const daily = useMemo(() => aggregateDaily(records).filter(row => row.date >= startDate && row.date <= endDate), [records, startDate, endDate]);
  const prior = useMemo(() => {
    const full = aggregateDaily(records);
    const count = daily.length;
    const firstIndex = full.findIndex(row => row.date === startDate);
    return full.slice(Math.max(0, firstIndex - count), Math.max(0, firstIndex));
  }, [records, daily.length, startDate]);
  const salesTotal = daily.reduce((sum, row) => sum + row.sales, 0);
  const avg = daily.length ? salesTotal / daily.length : 0;
  const previousAvg = prior.length ? prior.reduce((sum, row) => sum + row.sales, 0) / prior.length : null;
  const delta = previousAvg && avg ? ((avg - previousAvg) / previousAvg) * 100 : null;
  const topDay = daily.reduce<DailySales | null>((best, row) => !best || row.sales > best.sales ? row : best, null);
  const recent = daily.slice(-12).reverse();
  const weekday = useMemo(() => getWeekdayAverages(records.filter(row => row.date >= startDate && row.date <= endDate)).map(row => ({ ...row, averageSales: Math.round(row.averageSales * 10) / 10 })), [records, startDate, endDate]);
  const trendData = daily.map(row => ({ ...row, movingAverage: null as number | null }));
  const ma = movingAverage(daily, Math.min(7, Math.max(1, daily.length)));
  trendData.forEach((row, index) => { row.movingAverage = ma[index] == null ? null : Math.round(ma[index]! * 10) / 10; });
  return <AppShell title="Sales, in context." subtitle="A grounded view of recent demand, with the signal separated from the noise.">
    <SourceNotice />
    <RangeControls />
    {!records.length ? <EmptyWorkspace /> : <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Sales in selected period" value={fmtNum(salesTotal)} detail={`${fmtNum(daily.length)} observed days · ${sourceKind === 'synthetic' ? 'illustrative units' : 'uploaded sales values'}`} accent testId="value-total-sales" />
        <Metric label="Average daily sales" value={fmtNum(avg, 1)} detail="Aggregated across calendar days" testId="value-daily-average" />
        <Metric label="Change vs prior period" value={delta == null ? '—' : `${delta >= 0 ? '+' : ''}${fmtNum(delta, 1)}%`} detail={prior.length ? `${prior.length} preceding observed days` : 'No comparable prior period'} testId="value-period-change" />
        <Metric label="Highest sales day" value={topDay ? fmtNum(topDay.sales) : '—'} detail={topDay ? dateLabel(topDay.date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No observations'} testId="value-peak-sales" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]">
        <ChartFrame title="Daily demand" annotation="Daily totals with a seven-day moving average" filename="daily-demand.csv" rows={trendData.map(row => ({ date: row.date, sales: row.sales, movingAverage7d: row.movingAverage }))} testId="chart-daily-demand">
          {daily.length ? <ResponsiveContainer width="100%" height={294}><AreaChart data={trendData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
            <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#39896d" stopOpacity={.22} /><stop offset="100%" stopColor="#39896d" stopOpacity={.015} /></linearGradient></defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="date" tickFormatter={d => dateLabel(d)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={35} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="sales" name="Daily sales" stroke="#39896d" strokeWidth={2} fill="url(#salesFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="movingAverage" name="7-day average" stroke="#d68d3f" strokeWidth={1.7} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </AreaChart></ResponsiveContainer> : <ChartEmpty />}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><i className="h-[2px] w-4 bg-[#39896d]" />Daily sales</span><span className="flex items-center gap-2"><i className="h-[2px] w-4 border-t border-dashed border-[#d68d3f]" />7-day average</span><span className="ml-auto">Values are aggregated by date</span></div>
        </ChartFrame>
        <ChartFrame title="Weekday rhythm" annotation="Average daily sales by day of week" filename="weekday-pattern.csv" rows={weekday.map(row => ({ weekday: row.weekday, averageSales: row.averageSales }))} testId="chart-weekday-rhythm">
          {weekday.some(row => row.averageSales > 0) ? <ResponsiveContainer width="100%" height={294}><BarChart data={weekday} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="weekday" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={45} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="averageSales" name="Average sales" fill="#456d87" radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={false} />
          </BarChart></ResponsiveContainer> : <ChartEmpty />}
        </ChartFrame>
      </div>
      <section className="panel mt-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-[Manrope] text-[15px] font-bold">Latest observations</h2><p className="mt-1 text-[11px] text-muted-foreground">Most recent days within the selected period</p></div><Link href="/data" className="inline-flex items-center gap-2 text-[12px] font-semibold text-primary hover:underline" data-testid="link-view-data">View data <ArrowRight size={14} /></Link></div>
        <div className="divide-y divide-border">{recent.length ? recent.slice(0, 6).map(row => <div key={row.date} className="flex items-center justify-between py-3 text-[13px]" data-testid={`row-recent-${row.date}`}><span className="text-muted-foreground">{dateLabel(row.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="mono font-medium">{fmtNum(row.sales)}</span></div>) : <div className="py-8 text-center text-[13px] text-muted-foreground">No observations fall within this date range.</div>}</div>
      </section>
    </>}
  </AppShell>;
}

function ForecastPage() {
  const { records, startDate, endDate, horizon, setHorizon, sourceKind } = useWorkspace();
  const filtered = useMemo(() => records.filter(row => row.date >= startDate && row.date <= endDate), [records, startDate, endDate]);
  const history = useMemo(() => aggregateDaily(filtered), [filtered]);
  const [backendForecast, setBackendForecast] = useState<ForecastPoint[]>([]);
  useEffect(() => {
    if (sourceKind !== 'project') {
      setBackendForecast([]);
      return;
    }
    let active = true;
    setBackendForecast([]);
    fetch(`${API_BASE_URL}/api/forecast?days=${horizon}`)
      .then(response => {
        if (!response.ok) throw new Error('Forecast API request failed');
        return response.json();
      })
      .then(payload => {
        if (!active || !Array.isArray(payload.forecast)) return;
        setBackendForecast(payload.forecast.map((point: ForecastPoint) => ({
          date: point.date,
          predictedSales: Number(point.predictedSales),
          lowerBound: Number(point.lowerBound),
          upperBound: Number(point.upperBound),
        })));
      })
      .catch(() => { if (active) setBackendForecast([]); });
    return () => { active = false; };
  }, [horizon, sourceKind]);
  const localForecast = useMemo(() => generateForecast(filtered, horizon), [filtered, horizon]);
  const forecast = sourceKind === 'project' ? backendForecast : localForecast;
  const actualSlice = history.slice(-Math.min(35, history.length));
  const chartData = [
    ...actualSlice.map(row => ({ date: row.date, actual: row.sales, predicted: null as number | null, lowerBase: null as number | null, band: null as number | null, lowerBound: null as number | null, upperBound: null as number | null })),
    ...forecast.map(point => ({ date: point.date, actual: null as number | null, predicted: point.predictedSales, lowerBase: point.lowerBound, band: point.upperBound - point.lowerBound, lowerBound: point.lowerBound, upperBound: point.upperBound })),
  ];
  const total = forecast.reduce((sum, point) => sum + point.predictedSales, 0);
  const average = forecast.length ? total / forecast.length : 0;
  const rangeRows = forecast.map(point => ({ date: point.date, predictedSales: point.predictedSales, lowerBound: point.lowerBound, upperBound: point.upperBound }));
  return <AppShell title="Plan for what’s next." subtitle="Short-range demand predictions generated by the trained Python Random Forest model when the backend is connected.">
    <SourceNotice /><RangeControls />
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-[#203f39] p-5 text-[#f4f0e7] sm:p-6">
      <div><div className="eyebrow text-[#a9cbbb]">Forecast horizon</div><div className="mt-2 flex flex-wrap gap-2">
        {[7, 14, 30].map(days => <button key={days} type="button" onClick={() => setHorizon(days)} className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${horizon === days ? 'border-[#b8ddc8] bg-[#b8ddc8] text-[#1a3d34]' : 'border-white/20 text-white/75 hover:bg-white/10'}`} aria-pressed={horizon === days} data-testid={`button-horizon-${days}`}>{days} days</button>)}
      </div><p className="mt-2 text-[11px] text-white/55">For project data, forecasts begin after the latest date in the processed dataset.</p></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1"><div className="eyebrow text-white/50">Projected total</div><div className="eyebrow text-white/50">Daily average</div><strong className="font-[Manrope] text-[23px] tracking-tight" data-testid="value-forecast-total">{fmtNum(total)}</strong><strong className="font-[Manrope] text-[23px] tracking-tight" data-testid="value-forecast-average">{fmtNum(average, 1)}</strong></div>
    </div>
    {!history.length ? <EmptyWorkspace /> : <div className="space-y-5">
      <ChartFrame title="Demand outlook" annotation={`Recent actuals and a ${horizon}-day statistical baseline with an indicative range`} filename="demand-forecast.csv" rows={rangeRows} testId="chart-demand-forecast">
        {forecast.length ? <ResponsiveContainer width="100%" height={340}><ComposedChart data={chartData} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={d => dateLabel(d)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={35} />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="lowerBase" name="Range baseline" stackId="range" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area type="monotone" dataKey="band" name="Indicative range" stackId="range" stroke="none" fill="#dfb36e" fillOpacity={.24} isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" name="Observed sales" stroke="#456d87" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="predicted" name="Baseline forecast" stroke="#39896d" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 2, fill: '#39896d', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart></ResponsiveContainer> : <ChartEmpty text="Forecast needs at least one observed day." />}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><i className="h-[2px] w-4 bg-[#456d87]" />Observed sales</span><span className="flex items-center gap-2"><i className="h-[2px] w-4 border-t-2 border-dashed border-[#39896d]" />Baseline forecast</span><span className="flex items-center gap-2"><i className="h-3 w-4 rounded-sm bg-[#dfb36e]/35" />Indicative range</span></div>
      </ChartFrame>
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6"><div><h2 className="font-[Manrope] text-[15px] font-bold">Daily forecast details</h2><p className="mt-1 text-[11px] text-muted-foreground">The range is a heuristic uncertainty estimate, not a confidence guarantee.</p></div><div className="print-hidden"><ExportButton filename="daily-forecast-details.csv" rows={rangeRows} label="Export daily forecast details" /></div></div>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Date</th><th>Weekday</th><th>Expected sales</th><th>Lower estimate</th><th>Upper estimate</th></tr></thead><tbody>{forecast.map(point => <tr key={point.date} data-testid={`row-forecast-${point.date}`}><td>{dateLabel(point.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{dateLabel(point.date, { weekday: 'long' })}</td><td className="mono font-semibold">{fmtNum(point.predictedSales, 1)}</td><td className="mono text-muted-foreground">{fmtNum(point.lowerBound, 1)}</td><td className="mono text-muted-foreground">{fmtNum(point.upperBound, 1)}</td></tr>)}</tbody></table></div>
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <section className="panel p-5 sm:p-6"><div className="eyebrow text-primary">Method in brief</div><h3 className="mt-2 font-[Manrope] text-[17px] font-bold">Seasonality first, trend second.</h3><p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">The baseline uses recent median sales for the same weekday, then applies a deliberately bounded trend adjustment from recent history. The range widens modestly with forecast distance using recent historical error.</p><Link href="/models" className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-primary hover:underline" data-testid="link-forecast-method">See the evaluation and limitations <ArrowRight size={14} /></Link></section>
        <section className="rounded-2xl border border-[#e3d1b2] bg-[#f8f0df] p-5 text-[#62491f] dark:border-[#665334] dark:bg-[#322a1e] dark:text-[#e9c78d] sm:p-6"><div className="eyebrow">Use with judgment</div><p className="mt-2 text-[13px] leading-6">This browser-side baseline does not know about promotions, stockouts, price changes, weather, or assortment shifts. Treat it as a planning reference, not a committed target.</p></section>
      </div>
    </div>}
  </AppShell>;
}

function DataPage() {
  const { records, sourceKind, sourceName, skippedRows, importData, resetDemo, startDate, endDate } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const stores = useMemo(() => [...new Set(records.map(row => row.store).filter((value): value is string => Boolean(value)))].sort(), [records]);
  const filtered = useMemo(() => records.filter(row => (!startDate || row.date >= startDate) && (!endDate || row.date <= endDate) && (!storeFilter || row.store === storeFilter) && (!query || [row.date, row.sales, row.store, row.product, row.category].some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())))).sort((a, b) => b.date.localeCompare(a.date)), [records, storeFilter, query, startDate, endDate]);
  useEffect(() => setPage(0), [startDate, endDate]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const total = records.reduce((sum, row) => sum + row.sales, 0);
  const distinctDays = new Set(records.map(row => row.date)).size;
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await parseSalesCsv(file);
      importData(result.records, result.sourceName, result.skippedRows);
      setPage(0); setStoreFilter(''); setQuery('');
      setNotice(`Imported ${fmtNum(result.records.length)} valid rows${result.skippedRows ? `; skipped ${fmtNum(result.skippedRows)} invalid rows` : ''}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The CSV could not be read. Check the file and try again.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };
  const exportRows = records.map(row => ({ date: row.date, sales: row.sales, store: row.store ?? '', product: row.product ?? '', category: row.category ?? '' }));
  return <AppShell title="Your data, close at hand." subtitle="Inspect the rows behind every signal. Import a CSV locally or return to the illustrative sample.">
    <SourceNotice /><RangeControls />
    <section className="panel mb-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><FileSpreadsheet size={20} /></div><div><div className="eyebrow text-muted-foreground">Dataset source</div><h2 className="mt-1 font-[Manrope] text-[16px] font-bold" data-testid="text-current-dataset">{sourceName}</h2><p className="mt-1 max-w-xl text-[12px] leading-5 text-muted-foreground">CSV files are parsed in your browser and are never uploaded. Required columns: date and sales. Store, product, and category are optional.</p></div></div>
        <div className="flex flex-wrap gap-2 print-hidden">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" data-testid="input-csv-file" />
          <button type="button" className="button-primary" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="button-upload-csv">{busy ? <span className="loading-bars" /> : <Upload size={15} />}{busy ? 'Reading CSV…' : 'Choose CSV'}</button>
          {sourceKind === 'imported' && <button type="button" className="button-secondary" onClick={resetDemo} data-testid="button-restore-demo">Restore demo</button>}
          <button type="button" onClick={() => saveCsv('sales-records.csv', exportRows)} className="button-secondary" disabled={!records.length} data-testid="button-export-dataset"><ArrowDownToLine size={15} />Export data</button>
        </div>
      </div>
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive" role="alert" data-testid="status-import-error"><X size={15} className="mt-0.5 shrink-0" /><span><strong>Import failed.</strong> {error}</span></div>}
      {notice && <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-[12px] text-primary" role="status" data-testid="status-import-success"><Check size={15} className="mt-0.5 shrink-0" /><span>{notice}</span></div>}
      {skippedRows > 0 && sourceKind === 'imported' && <p className="mt-3 text-[11px] text-muted-foreground" data-testid="text-skipped-rows">{fmtNum(skippedRows)} rows from the imported file were skipped because date or sales values were invalid.</p>}
    </section>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Valid records" value={fmtNum(records.length)} detail="Rows accepted into this workspace" testId="value-record-count" />
      <Metric label="Observed days" value={fmtNum(distinctDays)} detail="Distinct calendar dates" accent testId="value-observed-days" />
      <Metric label="Sales total" value={fmtNum(total)} detail="Sum across all accepted records" testId="value-data-total" />
      <Metric label="Date coverage" value={records.length ? `${dateLabel(records.reduce((min, r) => r.date < min ? r.date : min, records[0]!.date))} – ${dateLabel(records.reduce((max, r) => r.date > max ? r.date : max, records[0]!.date))}` : '—'} detail="Earliest through latest record" testId="value-date-coverage" />
    </div>
    {!records.length ? <EmptyWorkspace /> : <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div><h2 className="font-[Manrope] text-[15px] font-bold">Sales records</h2><p className="mt-1 text-[11px] text-muted-foreground">Search across date, sales, store, product, and category</p></div>
        <div className="flex flex-wrap gap-2">
          <label className="search-field"><Search size={15} /><input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Find a record" aria-label="Search sales data" data-testid="input-search-data" /></label>
          {stores.length > 0 && <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(0); }} className="select-field" aria-label="Filter by store" data-testid="select-store-filter"><option value="">All stores</option>{stores.map(store => <option key={store} value={store}>{store}</option>)}</select>}
        </div>
      </div>
      <div className="overflow-x-auto">
        {pageRows.length ? <table className="data-table"><thead><tr><th>Date</th><th>Sales</th><th>Store</th><th>Product</th><th>Category</th></tr></thead><tbody>{pageRows.map((row, index) => <tr key={`${row.date}-${row.store ?? ''}-${row.product ?? ''}-${index}`} data-testid={`row-sales-${page}-${index}`}><td>{dateLabel(row.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className="mono font-semibold">{fmtNum(row.sales, 2)}</td><td>{row.store || <span className="text-muted-foreground/50">—</span>}</td><td>{row.product || <span className="text-muted-foreground/50">—</span>}</td><td>{row.category || <span className="text-muted-foreground/50">—</span>}</td></tr>)}</tbody></table> : <div className="flex min-h-48 flex-col items-center justify-center text-center"><Search size={22} className="mb-3 text-muted-foreground/50" /><p className="text-[13px] font-semibold">No matching records</p><p className="mt-1 text-[11px] text-muted-foreground">Try a different search term or store filter.</p></div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6"><span className="text-[11px] text-muted-foreground" data-testid="text-table-pagination">Showing {filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {fmtNum(filtered.length)} records</span><div className="flex gap-2"><button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="pager-button" aria-label="Previous page" data-testid="button-page-previous"><ArrowLeft size={14} />Previous</button><span className="mono px-2 py-2 text-[11px] text-muted-foreground" data-testid="text-page-number">{page + 1} / {pageCount}</span><button type="button" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="pager-button" aria-label="Next page" data-testid="button-page-next">Next<ArrowRight size={14} /></button></div></div>
    </section>}
  </AppShell>;
}

function ModelsPage() {
  const { records, startDate, endDate, sourceKind } = useWorkspace();
  const filtered = useMemo(() => records.filter(row => row.date >= startDate && row.date <= endDate), [records, startDate, endDate]);
  const evaluation = useMemo(() => evaluateModels(filtered), [filtered]);
  const [projectMetrics, setProjectMetrics] = useState<{ validation_models: Array<Record<string, string | number | null>>; recursive_backtest: Array<Record<string, string | number | null>> } | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/model-metrics`)
      .then(response => { if (!response.ok) throw new Error('Metrics API request failed'); return response.json(); })
      .then(payload => { if (active) setProjectMetrics(payload); })
      .catch(() => { if (active) setProjectMetrics(null); });
    return () => { active = false; };
  }, []);
  const scores = evaluation?.scores ?? [];
  const chartRows = scores.map(score => ({ model: score.model, MAE: score.mae, RMSE: score.rmse, WAPE: score.wape }));
  const longestDateSpan = useMemo(() => aggregateDaily(filtered), [filtered]);
  return <AppShell title="Know how the forecast holds up." subtitle="Chronological holdout testing compares simple baselines on unseen days from your selected history.">
    <SourceNotice /><RangeControls />
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(290px,.8fr)]">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow text-primary">Out-of-sample evaluation</div><h2 className="mt-2 font-[Manrope] text-[18px] font-bold">A time-ordered holdout</h2></div><div className="rounded-lg bg-muted px-3 py-2 text-[10px] text-muted-foreground">NO SHUFFLED SPLIT</div></div>
        {evaluation ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="metric-mini"><span>Training window</span><strong data-testid="value-training-days">{fmtNum(evaluation.trainingDays)} days</strong></div>
          <div className="metric-mini"><span>Holdout length</span><strong data-testid="value-holdout-days">{fmtNum(evaluation.holdoutDays)} days</strong></div>
          <div className="metric-mini col-span-2"><span>Evaluation dates</span><strong data-testid="value-holdout-period">{dateLabel(evaluation.holdoutStart, { month: 'short', day: 'numeric', year: 'numeric' })} — {dateLabel(evaluation.holdoutEnd, { month: 'short', day: 'numeric', year: 'numeric' })}</strong></div>
        </div> : <div className="mt-6 flex gap-3 rounded-xl border border-[#e3d1b2] bg-[#f8f0df] p-4 text-[#62491f] dark:border-[#665334] dark:bg-[#322a1e] dark:text-[#e9c78d]" role="status" data-testid="status-evaluation-short"><CalendarDays size={18} className="mt-0.5 shrink-0" /><div><strong className="block text-[13px]">Not enough history for a fair holdout.</strong><p className="mt-1 text-[12px] leading-5">Evaluation needs at least 28 distinct calendar days, with enough observations left for training. The current selected window has {longestDateSpan.length} days.</p></div></div>}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold">Baseline accuracy comparison</h3><p className="mt-1 text-[10px] text-muted-foreground">Lower error is better. WAPE is undefined when actual total is zero.</p></div>{scores.length > 0 && <ExportButton filename="model-evaluation.csv" rows={scores.map(score => ({ model: score.model, MAE: score.mae, RMSE: score.rmse, WAPE_percent: score.wape, holdoutDays: score.holdoutDays, recommended: score.isRecommended }))} label="Export model evaluation chart data" />}</div>
          {evaluation ? <ResponsiveContainer width="100%" height={245}><BarChart data={chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="model" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="MAE" name="MAE" fill="#456d87" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="RMSE" name="RMSE" fill="#d68d3f" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart></ResponsiveContainer> : <div className="flex h-[245px] items-center justify-center text-[12px] text-muted-foreground">A chart appears when enough history is available.</div>}
        </div>
      </section>
      <section className="rounded-2xl bg-[#203f39] p-5 text-[#f4f0e7] sm:p-6">
        <div className="eyebrow text-[#a9cbbb]">Recommended baseline</div>
        {evaluation && scores.length ? <><h2 className="mt-2 font-[Manrope] text-[22px] font-bold tracking-tight" data-testid="text-recommended-model">{scores.find(score => score.isRecommended)?.model ?? scores[0]?.model}</h2><p className="mt-3 text-[12px] leading-6 text-white/65">Selected as the lowest WAPE on the historical holdout. This selection is evidence from one retrospective split, not a guarantee of future accuracy.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[.08] p-3"><div className="eyebrow text-white/45">WAPE</div><div className="mt-1 font-[Manrope] text-[21px] font-bold" data-testid="value-best-wape">{scores.find(score => score.isRecommended)?.wape == null ? '—' : `${fmtNum(scores.find(score => score.isRecommended)!.wape!, 1)}%`}</div></div><div className="rounded-xl bg-white/[.08] p-3"><div className="eyebrow text-white/45">Holdout</div><div className="mt-1 font-[Manrope] text-[21px] font-bold">{evaluation.holdoutDays} days</div></div></div></> : <><h2 className="mt-2 font-[Manrope] text-[20px] font-bold">Awaiting sufficient history</h2><p className="mt-3 text-[12px] leading-6 text-white/65">The recommendation stays blank until the selected window can support a chronological train and holdout split.</p></>}
        <div className="mt-6 border-t border-white/15 pt-4"><div className="eyebrow text-white/45">What was not tested</div><p className="mt-2 text-[12px] leading-6 text-white/70">The trained Random Forest model is evaluated by the Python backend. Its saved validation comparison and recursive backtest are shown below.</p></div>
      </section>
    </div>
    <section className="panel mt-5 overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="font-[Manrope] text-[15px] font-bold">Model scorecard</h2><p className="mt-1 text-[11px] text-muted-foreground">All candidates share the same held-out calendar days.</p></div>
      {evaluation ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Baseline</th><th>MAE</th><th>RMSE</th><th>WAPE</th><th>Holdout</th><th>Assessment</th></tr></thead><tbody>{scores.map(score => <tr key={score.model} data-testid={`row-model-${safeKey(score.model)}`}><td className="font-semibold">{score.model}</td><td className="mono">{fmtNum(score.mae, 2)}</td><td className="mono">{fmtNum(score.rmse, 2)}</td><td className="mono">{score.wape == null ? 'Not defined' : `${fmtNum(score.wape, 2)}%`}</td><td>{score.holdoutDays} days</td><td>{score.isRecommended ? <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary"><Check size={12} />Lowest WAPE</span> : <span className="text-[11px] text-muted-foreground">Compared</span>}</td></tr>)}</tbody></table></div> : <div className="px-6 py-10 text-center text-[13px] text-muted-foreground" data-testid="empty-scorecard">No model scores for this range. Select a longer history window to evaluate.</div>}
    </section>
    {projectMetrics && <section className="panel mt-5 overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6"><div className="eyebrow text-primary">Python model results</div><h2 className="mt-2 font-[Manrope] text-[17px] font-bold">Saved validation and recursive backtest</h2><p className="mt-1 text-[11px] text-muted-foreground">Metrics below come from the existing project CSV outputs, not the browser-side baseline calculation.</p></div>
      <div className="p-5 sm:p-6">
        <h3 className="mb-3 text-[13px] font-semibold">Validation model comparison</h3>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>WAPE (%)</th><th>Pooled WAPE (%)</th></tr></thead><tbody>
          {projectMetrics.validation_models.map((row, index) => <tr key={`${String(row.Model)}-${index}`}><td className="font-semibold">{String(row.Model ?? '')}</td><td className="mono">{Number(row.MAE).toFixed(2)}</td><td className="mono">{Number(row.RMSE).toFixed(2)}</td><td className="mono">{Number(row['WAPE (%)']).toFixed(2)}</td><td className="mono">{Number(row['Pooled WAPE (%)']).toFixed(2)}</td></tr>)}
        </tbody></table></div>
        <h3 className="mb-3 mt-6 text-[13px] font-semibold">Recursive Random Forest backtest</h3>
        {projectMetrics.recursive_backtest.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Model</th><th>Days</th><th>MAE</th><th>RMSE</th><th>WAPE (%)</th></tr></thead><tbody>
          {projectMetrics.recursive_backtest.map((row, index) => <tr key={`${String(row.Model)}-${index}`}><td className="font-semibold">{String(row.Model ?? '')}</td><td className="mono">{String(row.Days ?? '')}</td><td className="mono">{Number(row.MAE).toFixed(2)}</td><td className="mono">{Number(row.RMSE).toFixed(2)}</td><td className="mono">{Number(row['WAPE (%)']).toFixed(2)}</td></tr>)}
        </tbody></table></div> : <p className="text-[12px] text-muted-foreground">No recursive backtest metrics were found.</p>}
      </div>
    </section>}
    <section className="panel mt-5 p-5 sm:p-6">
      <div className="eyebrow text-primary">How to read this</div><div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-3">
        <div><h3 className="text-[12px] font-bold">Chronological split</h3><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">The latest observed days are held out. Earlier dates train each baseline, reflecting the direction forecasts are used.</p></div>
        <div><h3 className="text-[12px] font-bold">Error measures</h3><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">MAE is average absolute error in sales units. RMSE weights larger misses more heavily. WAPE is total absolute error divided by actual total.</p></div>
        <div><h3 className="text-[12px] font-bold">Known limitations</h3><p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">No external drivers, promotion calendar, stockout correction, cross-validation, or model retraining. The sample, when selected, is synthetic.</p></div>
      </div>
    </section>
  </AppShell>;
}

function EmptyWorkspace() {
  return <div className="panel flex min-h-[300px] flex-col items-center justify-center p-8 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Database size={24} /></div><h2 className="font-[Manrope] text-[18px] font-bold">No sales data in this view</h2><p className="mt-2 max-w-sm text-[12px] leading-5 text-muted-foreground">Choose a wider date range or import a CSV with date and sales columns to start exploring demand.</p><Link href="/data" className="button-primary mt-5" data-testid="link-upload-data"><Upload size={15} />Open data workspace</Link></div>;
}

function NotFound() {
  return <AppShell title="This view is unavailable." subtitle="The requested workspace route does not exist."><section className="panel p-8 text-center"><p className="text-muted-foreground">Return to the overview to continue planning.</p><Link href="/" className="button-primary mt-4" data-testid="link-not-found-home">Go to overview</Link></section></AppShell>;
}

function RoutedApp() {
  return <Switch>
    <Route path="/" component={OverviewPage} />
    <Route path="/forecast" component={ForecastPage} />
    <Route path="/data" component={DataPage} />
    <Route path="/models" component={ModelsPage} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <ThemeProvider><WorkspaceProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedApp /></WouterRouter></WorkspaceProvider></ThemeProvider>;
}

export default App;
