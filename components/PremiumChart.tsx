import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, AlertCircle, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { CandleInterval, PremiumCandle } from '../types';
import { fetchPremiumCandles } from '../services/marketService';

type ChartTab = 'premium' | 'domestic' | 'overseas' | 'exchangeRate';
type PremiumBasis = 'USD' | 'USDT';
type ViewMode = 'line' | 'candle';

const HISTORY_LIMITS = [180, 500, 1000, 2000];

const CHART_TABS: { key: ChartTab; label: string; color: string }[] = [
  { key: 'premium', label: '프리미엄', color: '#818cf8' },
  { key: 'domestic', label: '국내 시세', color: '#f59e0b' },
  { key: 'overseas', label: '해외 시세', color: '#22d3ee' },
  { key: 'exchangeRate', label: '환산환율', color: '#a78bfa' },
];
const PREMIUM_BASIS_OPTIONS: { key: PremiumBasis; label: string }[] = [
  { key: 'USD', label: 'USD 기준' },
  { key: 'USDT', label: 'USDT 기준' },
];

interface PremiumChartProps {
  entryThreshold: number;
  exitThreshold: number;
}

interface IntervalOption {
  key: CandleInterval;
  label: string;
  limit: number;
  refreshMs: number;
  maWindow: number;
}

interface ChartCandle extends PremiumCandle {
  movingAverage: number;
  direction: 'up' | 'down' | 'flat';
}

interface ChartOffset {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CandlestickLayerProps {
  candles: ChartCandle[];
  domain: [number, number];
  viewMode: ViewMode;
  offset?: ChartOffset;
}

const INTERVAL_OPTIONS: IntervalOption[] = [
  { key: '1m', label: '1분봉', limit: 180, refreshMs: 15_000, maWindow: 20 },
  { key: '10m', label: '10분봉', limit: 200, refreshMs: 30_000, maWindow: 16 },
  { key: '30m', label: '30분봉', limit: 200, refreshMs: 60_000, maWindow: 12 },
  { key: '1d', label: '1일봉', limit: 160, refreshMs: 5 * 60_000, maWindow: 7 },
];

const INTERVAL_OPTION_MAP: Record<CandleInterval, IntervalOption> = INTERVAL_OPTIONS.reduce(
  (acc, option) => {
    acc[option.key] = option;
    return acc;
  },
  {} as Record<CandleInterval, IntervalOption>
);

function buildChartCandles(candles: PremiumCandle[], windowSize: number): ChartCandle[] {
  return candles.map((candle, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    const slice = candles.slice(startIndex, index + 1);
    const movingAverage = slice.reduce((sum, row) => sum + row.close, 0) / slice.length;
    const direction =
      candle.close > candle.open ? 'up' : candle.close < candle.open ? 'down' : 'flat';

    return {
      ...candle,
      movingAverage,
      direction,
    };
  });
}

function formatXAxisLabel(interval: CandleInterval, timestamp: number): string {
  const date = new Date(timestamp);

  if (interval === '1d') {
    return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  }

  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipTime(interval: CandleInterval, timestamp: number): string {
  const date = new Date(timestamp);

  if (interval === '1d') {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CandlestickLayer: React.FC<CandlestickLayerProps> = ({ candles, domain, viewMode, offset }) => {
  if (!offset || candles.length === 0 || viewMode !== 'candle') return null;

  const [minValue, maxValue] = domain;
  const valueSpan = Math.max(0.0001, maxValue - minValue);
  const step = offset.width / candles.length;
  const bodyWidth = Math.max(3, Math.min(14, step * 0.62));

  const toY = (value: number): number =>
    offset.top + ((maxValue - value) / valueSpan) * offset.height;

  return (
    <g>
      {candles.map((candle, index) => {
        const centerX = offset.left + step * index + step / 2;
        const openY = toY(candle.open);
        const closeY = toY(candle.close);
        const highY = toY(candle.high);
        const lowY = toY(candle.low);
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        const isBullish = candle.direction === 'up';
        const isFlat = candle.direction === 'flat';

        // TradingView colors
        const wickColor = isBullish ? '#089981' : isFlat ? '#94a3b8' : '#f23645';
        const bodyFill = isBullish ? '#089981' : isFlat ? '#64748b' : '#f23645';

        return (
          <g key={`${candle.timestamp}-${index}`}>
            <line
              x1={centerX}
              y1={highY}
              x2={centerX}
              y2={lowY}
              stroke={wickColor}
              strokeWidth={1.2}
              opacity={0.9}
            />
            <rect
              x={centerX - bodyWidth / 2}
              y={bodyY}
              width={bodyWidth}
              height={bodyHeight}
              fill={bodyFill}
              opacity={1}
            />
          </g>
        );
      })}
    </g>
  );
};

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: number | string; interval: CandleInterval; premiumBasis: PremiumBasis }> = ({
  active,
  payload,
  label,
  interval,
  premiumBasis,
}) => {
  const timestamp = typeof label === 'number' ? label : Number(label);
  if (!active || !payload?.length || !Number.isFinite(timestamp)) return null;

  const candle = payload[0].payload as ChartCandle;

  return (
    <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-2xl text-xs space-y-1.5">
      <div className="text-slate-300 font-semibold mb-1">{formatTooltipTime(interval, timestamp)}</div>
      <div className="text-slate-400">
        O/H/L/C:
        <span className="ml-1 font-mono text-slate-200">
          {candle.open.toFixed(2)} / {candle.high.toFixed(2)} / {candle.low.toFixed(2)} / {candle.close.toFixed(2)}%
        </span>
      </div>
      <div className="text-cyan-300">
        MA:
        <span className="ml-1 font-mono text-cyan-200">{candle.movingAverage.toFixed(2)}%</span>
      </div>
      <div className="text-slate-400">
        국내 종가: <span className="font-mono">₩{candle.domesticCloseKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      </div>
      <div className="text-slate-400">
        해외 종가: <span className="font-mono">${candle.globalCloseUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="text-slate-400">
        환산율: <span className="font-mono">{candle.conversionClose.toFixed(2)} {premiumBasis === 'USD' ? 'USD/KRW' : 'KRW/USDT'}</span>
      </div>
    </div>
  );
};

const LineTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: number | string;
  interval: CandleInterval;
  dataKey: string;
  unit: string;
  prefix: string;
  digits: number;
}> = ({ active, payload, label, interval, dataKey, unit, prefix, digits }) => {
  const timestamp = typeof label === 'number' ? label : Number(label);
  if (!active || !payload?.length || !Number.isFinite(timestamp)) return null;

  const candle = payload[0].payload as ChartCandle;
  const value = Number(candle[dataKey as keyof ChartCandle]);

  return (
    <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-2xl text-xs space-y-1.5">
      <div className="text-slate-300 font-semibold mb-1">{formatTooltipTime(interval, timestamp)}</div>
      <div className="text-slate-200 font-mono text-sm">
        {prefix}{Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '-'}{unit}
      </div>
      <div className="text-slate-500 text-[10px] mt-1">
        김프: {candle.close.toFixed(2)}%
      </div>
    </div>
  );
};

const SubLineChart: React.FC<{
  data: ChartCandle[];
  dataKey: string;
  interval: CandleInterval;
  color: string;
  unit: string;
  prefix: string;
  digits: number;
  hideYAxis?: boolean;
}> = ({ data, dataKey, interval, color, unit, prefix, digits, hideYAxis }) => {
  const values = data.map((d) => Number(d[dataKey as keyof ChartCandle])).filter(Number.isFinite);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 1;
  const span = Math.max(maxVal - minVal, 0.01);
  const padding = span * 0.08;
  const domain: [number, number] = [
    Number((minVal - padding).toFixed(digits)),
    Number((maxVal + padding).toFixed(digits)),
  ];

  const gradientId = `gradient-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatXAxisLabel(interval, Number(v))}
          stroke="#64748b"
          tick={{ fontSize: 10 }}
          minTickGap={24}
        />
        <YAxis
          domain={domain}
          hide={hideYAxis}
          stroke="#64748b"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${prefix}${Number(v).toLocaleString(undefined, { maximumFractionDigits: digits > 2 ? 2 : digits })}`}
          width={80}
        />
        <Tooltip content={<LineTooltip interval={interval} dataKey={dataKey} unit={unit} prefix={prefix} digits={digits} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const PremiumChart: React.FC<PremiumChartProps> = ({
  entryThreshold,
  exitThreshold,
}) => {
  const [interval, setInterval] = useState<CandleInterval>('1m');
  const [premiumBasis, setPremiumBasis] = useState<PremiumBasis>('USD');
  const [activeTab, setActiveTab] = useState<ChartTab>('premium');
  const [viewMode, setViewMode] = useState<ViewMode>('candle');
  const [historyLimit, setHistoryLimit] = useState<number>(INTERVAL_OPTION_MAP[interval].limit);
  const [candles, setCandles] = useState<PremiumCandle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [sourceSummary, setSourceSummary] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const zoomRatioRef = useRef<number>(1.0); // Anchor ratio for zooming
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const latestInitialRequestIdRef = useRef<number | null>(null);
  const latestManualRequestIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const currentOption = INTERVAL_OPTION_MAP[interval];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCandles = useCallback(
    async (manual = false, initial = false) => {
      const requestId = ++requestIdRef.current;
      if (manual) {
        latestManualRequestIdRef.current = requestId;
        setIsRefreshing(true);
      }
      if (initial) {
        latestInitialRequestIdRef.current = requestId;
        setIsLoading(true);
      }

      try {
        const response = await fetchPremiumCandles(interval, historyLimit, premiumBasis);

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setCandles(response.candles);
        setLastUpdatedAt(response.generatedAt);
        setSourceSummary(
          `${response.sources.domestic} · ${response.sources.global} · ${response.sources.conversion} · ${response.premiumBasis ?? premiumBasis} 기준`
        );
        setError(null);
      } catch (err) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : '봉 데이터 조회 실패';
        setError(message);
      } finally {
        if (!mountedRef.current) return;
        if (manual && latestManualRequestIdRef.current === requestId) {
          setIsRefreshing(false);
        }
        if (initial && latestInitialRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [historyLimit, interval, premiumBasis]
  );

  useEffect(() => {
    void loadCandles(false, true);

    if (!isAutoRefresh) return;

    const timer = window.setInterval(() => {
      void loadCandles(false, false);
    }, currentOption.refreshMs);

    return () => {
      clearInterval(timer);
    };
  }, [currentOption.refreshMs, isAutoRefresh, loadCandles, historyLimit]);

  const chartData = useMemo(
    () => buildChartCandles(candles, currentOption.maWindow),
    [candles, currentOption.maWindow]
  );

  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        latest: 0,
        previous: 0,
        min: 0,
        max: 0,
        average: 0,
      };
    }

    const closes = chartData.map((item) => item.close);
    const latest = closes[closes.length - 1];
    const previous = closes.length > 1 ? closes[closes.length - 2] : latest;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const average = closes.reduce((sum, value) => sum + value, 0) / closes.length;

    return { latest, previous, min, max, average };
  }, [chartData]);

  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [-1, 8];

    const values: number[] = [];
    for (const candle of chartData) {
      values.push(candle.low, candle.high, candle.movingAverage);
    }
    values.push(entryThreshold, exitThreshold);

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const span = Math.max(0.8, maxValue - minValue);
    const padding = Math.max(0.2, span * 0.15);

    const min = Number((minValue - padding).toFixed(2));
    const max = Number((maxValue + padding).toFixed(2));
    if (min === max) return [min - 1, max + 1];
    return [min, max];
  }, [chartData, entryThreshold, exitThreshold]);

  const subChartDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 1];
    const dataKey = activeTab === 'domestic' ? 'domesticCloseKrw' : activeTab === 'overseas' ? 'globalCloseUsdt' : activeTab === 'conversion' ? 'conversionClose' : null;
    if (!dataKey) return [0, 1];

    const values = chartData.map((d) => Number(d[dataKey as keyof ChartCandle])).filter(Number.isFinite);
    if (values.length === 0) return [0, 1];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const span = Math.max(maxVal - minVal, 0.01);
    const padding = span * 0.08;
    return [minVal - padding, maxVal + padding];
  }, [chartData, activeTab]);

  const activeDomain = activeTab === 'premium' ? yDomain : subChartDomain;
  const candleWidth = (viewMode === 'candle' ? 12 : 6) * zoomLevel;
  const calculatedWidth = Math.max(800, chartData.length * candleWidth);

  const handleWheel = (e: React.WheelEvent) => {
    // Requirements for zoom: either Ctrl/Cmd key is pressed OR the user specifically asked for "mouse scroll zoom"
    // To avoid conflicting with normal page scroll, we check for Ctrl key or just intercept if it's over the chart
    if (e.ctrlKey || e.metaKey || true) { // Supporting naked scroll as requested
      e.preventDefault();
      const zoomStep = 0.15;
      const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
      const newZoom = Math.max(0.2, Math.min(5.0, zoomLevel + delta));

      if (newZoom !== zoomLevel && chartScrollRef.current) {
        const scrollContainer = chartScrollRef.current;
        const scrollLeft = scrollContainer.scrollLeft;
        const clientWidth = scrollContainer.clientWidth;
        const contentWidth = scrollContainer.scrollWidth;

        // Use center of the viewport as anchor
        zoomRatioRef.current = (scrollLeft + clientWidth / 2) / contentWidth;
        setZoomLevel(newZoom);
      }
    }
  };

  // Anchor the zoom: Adjust scroll position when content width changes due to zoom
  useEffect(() => {
    if (chartScrollRef.current && zoomLevel !== 1.0) {
      const scrollContainer = chartScrollRef.current;
      const newContentWidth = scrollContainer.scrollWidth;
      const clientWidth = scrollContainer.clientWidth;

      const newScrollLeft = (zoomRatioRef.current * newContentWidth) - (clientWidth / 2);
      scrollContainer.scrollLeft = newScrollLeft;
    }
  }, [zoomLevel]);

  useEffect(() => {
    if (chartScrollRef.current && chartData.length > 0) {
      // Auto-scroll to end only on first load or when length increases significantly
      if (chartScrollRef.current.scrollLeft === 0 || chartData.length > 500) {
        chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
      }
    }
  }, [chartData.length]);

  const trendDelta = stats.latest - stats.previous;
  const TrendIcon = trendDelta > 0 ? TrendingUp : trendDelta < 0 ? TrendingDown : Minus;
  const trendColor =
    trendDelta > 0 ? 'text-emerald-400' : trendDelta < 0 ? 'text-rose-400' : 'text-slate-400';

  const latestTimestamp = chartData.length
    ? formatTooltipTime(interval, chartData[chartData.length - 1].timestamp)
    : '-';

  const tradeSignal = stats.latest >= entryThreshold
    ? { label: '진입 후보', className: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40' }
    : stats.latest <= exitThreshold
      ? { label: '청산 후보', className: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/40' }
      : { label: '관망 구간', className: 'text-slate-300 bg-slate-700/40 border-slate-600/60' };

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 min-h-[440px] flex items-center justify-center text-slate-500">
        봉 데이터 불러오는 중...
      </div>
    );
  }

  if (error && chartData.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 min-h-[440px] flex flex-col items-center justify-center text-center gap-3">
        <AlertCircle className="w-6 h-6 text-rose-400" />
        <p className="text-slate-200 font-semibold">봉 데이터 연결에 실패했습니다.</p>
        <p className="text-sm text-slate-500">{error}</p>
        <button
          onClick={() => void loadCandles(true, true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Streamlined Header Toolbar */}
      <div className="bg-slate-900/60 border-b border-slate-800/50 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
            {CHART_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'bg-slate-800 text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'premium' && (
            <div className="flex items-center gap-3 px-3 py-1 bg-slate-950/30 rounded-lg border border-slate-800/30">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold uppercase leading-none">Basis</span>
                <button
                  onClick={() => setPremiumBasis(premiumBasis === 'USD' ? 'USDT' : 'USD')}
                  className="text-[11px] font-mono font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  {premiumBasis}
                </button>
              </div>
              <div className="w-px h-6 bg-slate-800/50" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 font-bold uppercase leading-none">Premium</span>
                <span className="text-[12px] font-mono font-bold text-slate-100">
                  {chartData.length > 0 ? chartData[chartData.length - 1].close.toFixed(2) : '0.00'}%
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => {
              const newInterval = e.target.value as CandleInterval;
              setInterval(newInterval);
              setHistoryLimit(INTERVAL_OPTION_MAP[newInterval].limit);
            }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-300 outline-none hover:border-indigo-500/50 transition-colors"
          >
            {INTERVAL_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>

          <select
            value={historyLimit}
            onChange={(e) => setHistoryLimit(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-300 outline-none hover:border-indigo-500/50 transition-colors"
          >
            {HISTORY_LIMITS.map(limit => <option key={limit} value={limit}>{limit}개</option>)}
          </select>

          <div className="flex items-center bg-slate-950/40 p-1 rounded-lg border border-slate-800/50">
            <button
              onClick={() => setViewMode('candle')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'candle' ? 'bg-slate-800 text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
            >
              CANDLE
            </button>
            <button
              onClick={() => setViewMode('line')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'line' ? 'bg-slate-800 text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
            >
              LINE
            </button>
          </div>

          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${isAutoRefresh
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
          >
            {isAutoRefresh ? 'AUTO' : 'OFF'}
          </button>

          <button
            onClick={() => void loadCandles(true, false)}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 overflow-hidden relative bg-slate-950/20 flex flex-col">

        {/* Global Error Message */}
        {error && (
          <div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-right-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-bold rounded-lg backdrop-blur-md">
              <AlertCircle size={14} />
              {error}
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <Activity className="absolute inset-0 m-auto w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <span className="text-xs font-bold text-slate-500 tracking-widest uppercase">Loading Market Data...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
            데이터 수신 대기 중...
          </div>
        ) : (
          <div className="flex-1 relative flex overflow-hidden">
            <div
              ref={chartScrollRef}
              onWheel={handleWheel}
              className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent pr-[60px]"
            >
              <div style={{ width: calculatedWidth, height: '100%' }}>
                {activeTab === 'premium' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 20, right: 0, left: 10, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => formatXAxisLabel(interval, Number(value))}
                        stroke="#475569"
                        tick={{ fontSize: 10, fontWeight: 500 }}
                        minTickGap={40}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis domain={yDomain} hide />
                      <Tooltip
                        content={<CustomTooltip interval={interval} premiumBasis={premiumBasis} />}
                        cursor={{ stroke: '#334155', strokeWidth: 1 }}
                      />

                      {entryThreshold < yDomain[1] && (
                        // @ts-ignore
                        <ReferenceArea y1={entryThreshold} y2={yDomain[1]} fill="#10b981" fillOpacity={0.03} />
                      )}
                      {exitThreshold > yDomain[0] && (
                        // @ts-ignore
                        <ReferenceArea y1={yDomain[0]} y2={exitThreshold} fill="#6366f1" fillOpacity={0.03} />
                      )}

                      <ReferenceLine
                        y={entryThreshold}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `ENTRY ${entryThreshold.toFixed(1)}%`,
                          fill: '#10b981',
                          fontSize: 9,
                          fontWeight: 800,
                          position: 'insideTopLeft',
                          offset: 10,
                        }}
                      />
                      <ReferenceLine
                        y={exitThreshold}
                        stroke="#6366f1"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `EXIT ${exitThreshold.toFixed(1)}%`,
                          fill: '#818cf8',
                          fontSize: 9,
                          fontWeight: 800,
                          position: 'insideBottomLeft',
                          offset: 10,
                        }}
                      />

                      <Customized component={<CandlestickLayer candles={chartData} domain={yDomain} viewMode={viewMode} />} />

                      {chartData.length > 0 && (
                        <ReferenceLine
                          y={chartData[chartData.length - 1].close}
                          stroke={chartData[chartData.length - 1].direction === 'up' ? '#089981' : '#f23645'}
                          strokeDasharray="3 3"
                        />
                      )}

                      {viewMode === 'line' && (
                        <Area
                          type="monotone"
                          dataKey="close"
                          stroke="#818cf8"
                          strokeWidth={2}
                          fill="url(#areaGradient)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}

                      <Line
                        type="monotone"
                        dataKey="movingAverage"
                        name={`MA(${currentOption.maWindow})`}
                        stroke="#22d3ee"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        isAnimationActive={false}
                        opacity={0.8}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <SubLineChart
                    data={chartData}
                    dataKey={activeTab === 'domestic' ? 'domesticCloseKrw' : activeTab === 'overseas' ? 'globalCloseUsdt' : 'conversionClose'}
                    interval={interval}
                    color={CHART_TABS.find(t => t.key === activeTab)?.color || '#fff'}
                    unit={activeTab === 'overseas' ? '$' : '₩'}
                    prefix={activeTab === 'overseas' ? '$' : '₩'}
                    digits={activeTab === 'domestic' ? 0 : 2}
                    hideYAxis
                  />
                )}
              </div>
            </div>

            {/* Fixed Y-Axis on the Right */}
            <div className="absolute top-0 right-0 w-[60px] h-full bg-slate-950/80 backdrop-blur-sm pointer-events-none z-10 border-l border-slate-800/30">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 10 }}>
                  <YAxis
                    domain={activeDomain}
                    stroke="#475569"
                    tick={{ fontSize: 10, fontWeight: 500 }}
                    tickFormatter={(value) => {
                      if (activeTab === 'premium') return `${Number(value).toFixed(1)}%`;
                      const prefix = activeTab === 'overseas' ? '$' : '₩';
                      const digits = activeTab === 'domestic' ? 0 : 2;
                      return `${prefix}${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })}`;
                    }}
                    width={50}
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                  />
                  {activeTab === 'premium' && chartData.length > 0 && (
                    <ReferenceLine
                      y={chartData[chartData.length - 1].close}
                      stroke={chartData[chartData.length - 1].direction === 'up' ? '#089981' : '#f23645'}
                      strokeWidth={1}
                      label={{
                        position: 'right',
                        value: chartData[chartData.length - 1].close.toFixed(2),
                        fill: 'white',
                        fontSize: 10,
                        fontWeight: 'bold',
                        backgroundColor: chartData[chartData.length - 1].direction === 'up' ? '#089981' : '#f23645',
                        padding: { left: 4, right: 4, top: 2, bottom: 2 },
                        borderRadius: 2
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* TV Branding */}
        {chartData.length > 0 && !isLoading && (
          <div className="absolute bottom-4 left-6 pointer-events-none flex items-center gap-1.5 opacity-40">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold tracking-tighter text-slate-400 uppercase">TradingView Style Visualizer</span>
          </div>
        )}
      </div>

      {/* Minimal Footer */}
      <div className="px-4 py-2 border-t border-slate-800/30 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-widest">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800/40 rounded text-[9px] border border-slate-800/40">
            <span className="text-slate-600">SIGNAL</span>
            <span className={tradeSignal.className.split(' ')[0]}>{tradeSignal.label}</span>
          </div>
          <span className="truncate max-w-[400px] opacity-60">{sourceSummary}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('ko-KR') : '-'}</span>
          <span className="opacity-30">|</span>
          <span>{currentOption.label}</span>
        </div>
      </div>
    </div>
  );
};
