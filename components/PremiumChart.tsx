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
import { AlertCircle, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { CandleInterval, PremiumCandle } from '../types';
import { fetchPremiumCandles } from '../services/marketService';

type ChartTab = 'premium' | 'domestic' | 'overseas' | 'exchangeRate';

const CHART_TABS: { key: ChartTab; label: string; color: string }[] = [
  { key: 'premium', label: '프리미엄', color: '#818cf8' },
  { key: 'domestic', label: '국내 시세', color: '#f59e0b' },
  { key: 'overseas', label: '해외 시세', color: '#22d3ee' },
  { key: 'exchangeRate', label: '환산환율', color: '#a78bfa' },
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

const CandlestickLayer: React.FC<CandlestickLayerProps> = ({ candles, domain, offset }) => {
  if (!offset || candles.length === 0) return null;

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
        const wickColor = isBullish ? '#22c55e' : isFlat ? '#94a3b8' : '#ef4444';
        const bodyFill = isBullish ? '#22c55e' : isFlat ? '#64748b' : '#ef4444';

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
              rx={2}
              fill={bodyFill}
              opacity={0.85}
            />
          </g>
        );
      })}
    </g>
  );
};

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: number | string; interval: CandleInterval }> = ({
  active,
  payload,
  label,
  interval,
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
        환산율: <span className="font-mono">{candle.conversionClose.toFixed(2)} KRW/USDT</span>
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
}> = ({ data, dataKey, interval, color, unit, prefix, digits }) => {
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
  const [activeTab, setActiveTab] = useState<ChartTab>('premium');
  const [candles, setCandles] = useState<PremiumCandle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [sourceSummary, setSourceSummary] = useState<string>('');
  const requestIdRef = useRef(0);
  const latestInitialRequestIdRef = useRef<number | null>(null);
  const latestManualRequestIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const currentOption = INTERVAL_OPTION_MAP[interval];

  useEffect(() => {
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
        const response = await fetchPremiumCandles(interval, currentOption.limit);

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setCandles(response.candles);
        setLastUpdatedAt(response.generatedAt);
        setSourceSummary(
          `${response.sources.domestic} · ${response.sources.global} · ${response.sources.conversion}`
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
    [currentOption.limit, interval]
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
  }, [currentOption.refreshMs, isAutoRefresh, loadCandles]);

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
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex-1 min-h-[460px] flex flex-col">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-slate-100">프리미엄 캔들 차트</h3>
          <p className="text-xs text-slate-500 mt-1">마지막 봉: {latestTimestamp}</p>
          {sourceSummary && (
            <p className="text-[11px] text-slate-600 mt-1 truncate max-w-[680px]">{sourceSummary}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CHART_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeTab === tab.key
                  ? 'text-white border'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 hover:bg-slate-700'
                }`}
              style={activeTab === tab.key ? { backgroundColor: `${tab.color}30`, borderColor: `${tab.color}80`, color: tab.color } : undefined}
            >
              {tab.label}
            </button>
          ))}
          <span className="w-px h-5 bg-slate-700 mx-1" />
          {INTERVAL_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => setInterval(option.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${interval === option.key
                  ? 'bg-slate-700 text-slate-200 border border-slate-600'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-800 hover:text-slate-300 hover:bg-slate-700'
                }`}
            >
              {option.label}
            </button>
          ))}
          <button
            onClick={() => setIsAutoRefresh((prev) => !prev)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${isAutoRefresh
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
          >
            자동갱신 {isAutoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => void loadCandles(true, false)}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-md px-3 py-2">
          봉 데이터 경고: {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">현재 종가</div>
          <div className="font-mono text-base text-indigo-300">{stats.latest.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">직전 대비</div>
          <div className={`font-mono text-base flex items-center gap-1 ${trendColor}`}>
            <TrendIcon size={14} />
            {trendDelta >= 0 ? '+' : ''}{trendDelta.toFixed(2)}%p
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">평균 종가</div>
          <div className="font-mono text-base text-cyan-300">{stats.average.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">최소 / 최대</div>
          <div className="font-mono text-base text-slate-300">{stats.min.toFixed(2)}% / {stats.max.toFixed(2)}%</div>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${tradeSignal.className}`}>
          <div className="text-[11px] uppercase tracking-wider opacity-80">신호 상태</div>
          <div className="font-semibold text-sm mt-0.5">{tradeSignal.label}</div>
        </div>
      </div>

      <div className="flex-1 w-full">
        {activeTab === 'premium' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => formatXAxisLabel(interval, Number(value))}
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                minTickGap={24}
              />
              <YAxis
                domain={yDomain}
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${Number(value).toFixed(2)}%`}
                width={64}
              />
              <Tooltip content={<CustomTooltip interval={interval} />} />

              {entryThreshold < yDomain[1] && (
                <ReferenceArea y1={entryThreshold} y2={yDomain[1]} fill="#ef4444" fillOpacity={0.06} />
              )}
              {exitThreshold > yDomain[0] && (
                <ReferenceArea y1={yDomain[0]} y2={exitThreshold} fill="#2563eb" fillOpacity={0.05} />
              )}

              <ReferenceLine
                y={entryThreshold}
                stroke="#10b981"
                strokeDasharray="6 6"
                strokeWidth={1.2}
                label={{
                  value: `진입 ${entryThreshold.toFixed(1)}%`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
              <ReferenceLine
                y={exitThreshold}
                stroke="#6366f1"
                strokeDasharray="6 6"
                strokeWidth={1.2}
                label={{
                  value: `청산 ${exitThreshold.toFixed(1)}%`,
                  fill: '#818cf8',
                  fontSize: 10,
                  position: 'insideBottomLeft',
                }}
              />

              <Customized component={<CandlestickLayer candles={chartData} domain={yDomain} />} />

              <Line
                type="monotone"
                dataKey="movingAverage"
                name={`MA(${currentOption.maWindow})`}
                stroke="#22d3ee"
                strokeWidth={1.4}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {activeTab === 'domestic' && (
          <SubLineChart
            data={chartData}
            dataKey="domesticCloseKrw"
            interval={interval}
            color="#f59e0b"
            unit=""
            prefix="₩"
            digits={0}
          />
        )}
        {activeTab === 'overseas' && (
          <SubLineChart
            data={chartData}
            dataKey="globalCloseUsdt"
            interval={interval}
            color="#22d3ee"
            unit=""
            prefix="$"
            digits={2}
          />
        )}
        {activeTab === 'exchangeRate' && (
          <SubLineChart
            data={chartData}
            dataKey="conversionClose"
            interval={interval}
            color="#a78bfa"
            unit=""
            prefix="₩"
            digits={2}
          />
        )}
      </div>

      <div className="mt-3 text-[11px] text-slate-500 flex justify-between">
        <span>표시 봉 수: {chartData.length}개</span>
        <span>최근 갱신: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('ko-KR') : '-'}</span>
      </div>
    </div>
  );
};
