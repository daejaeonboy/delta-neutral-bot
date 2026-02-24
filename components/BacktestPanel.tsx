import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BacktestPremiumPoint, CandleInterval, PremiumBacktestResult } from '../types';
import { fetchPremiumBacktest } from '../services/marketService';

interface BacktestPanelProps {
  defaultEntryThreshold: number;
  defaultExitThreshold: number;
  defaultInvestmentKrw: number;
}

const INTERVAL_OPTIONS: { key: CandleInterval; label: string; maxLimit: number }[] = [
  { key: '1m', label: '1분봉', maxLimit: 200 },
  { key: '10m', label: '10분봉', maxLimit: 200 },
  { key: '30m', label: '30분봉', maxLimit: 200 },
  { key: '1d', label: '1일봉', maxLimit: 200 },
];

interface BacktestChartRow {
  timestamp: number;
  premiumClose: number;
  entryPremium: number | null;
  exitPremium: number | null;
}

const MAX_BACKTEST_CHART_POINTS = 2400;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatSignedNumber(value: number, digits = 0): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatChartTime(interval: CandleInterval, timestamp: number): string {
  const date = new Date(timestamp);
  if (interval === '1d') {
    return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
  }
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseDatetimeLocalToTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function reasonLabel(reason: string): string {
  return reason === 'forced-close' ? '종가 강제매수' : '매수 임계값 체결';
}

function downsamplePremiumSeries(
  points: BacktestPremiumPoint[],
  maxPoints: number
): BacktestPremiumPoint[] {
  if (points.length <= maxPoints) return points;

  const bucketSize = Math.max(2, Math.ceil(points.length / maxPoints));
  const sampled: BacktestPremiumPoint[] = [];

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    if (!bucket.length) continue;

    let minPoint = bucket[0];
    let maxPoint = bucket[0];
    for (const point of bucket) {
      if (point.close < minPoint.close) minPoint = point;
      if (point.close > maxPoint.close) maxPoint = point;
    }

    if (minPoint.timestamp <= maxPoint.timestamp) {
      sampled.push(minPoint);
      if (maxPoint.timestamp !== minPoint.timestamp) sampled.push(maxPoint);
    } else {
      sampled.push(maxPoint);
      if (maxPoint.timestamp !== minPoint.timestamp) sampled.push(minPoint);
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const byTimestamp = new Map<number, BacktestPremiumPoint>();
  for (const point of sampled) {
    byTimestamp.set(point.timestamp, point);
  }
  byTimestamp.set(first.timestamp, first);
  byTimestamp.set(last.timestamp, last);

  const sorted = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length <= maxPoints) return sorted;

  const stride = Math.ceil(sorted.length / maxPoints);
  return sorted.filter((_, index) => index % stride === 0 || index === sorted.length - 1);
}

const BacktestPanelComponent: React.FC<BacktestPanelProps> = ({
  defaultEntryThreshold,
  defaultExitThreshold,
  defaultInvestmentKrw,
}) => {
  const [interval, setInterval] = useState<CandleInterval>('30m');
  const [premiumBasis, setPremiumBasis] = useState<'USD' | 'USDT'>('USD');
  const [triggerMode, setTriggerMode] = useState<'touch' | 'close'>('touch');
  const [fillAtThreshold, setFillAtThreshold] = useState(true);
  const [limit, setLimit] = useState(200);
  const [entryThreshold, setEntryThreshold] = useState(defaultEntryThreshold);
  const [exitThreshold, setExitThreshold] = useState(defaultExitThreshold);
  const [leverage, setLeverage] = useState(1);
  const [feeBps, setFeeBps] = useState(6);
  const [slippageBps, setSlippageBps] = useState(2);
  const [forceCloseAtEnd, setForceCloseAtEnd] = useState(true);
  const [useStoredData, setUseStoredData] = useState(true);
  const [isDateRangeEnabled, setIsDateRangeEnabled] = useState(false);
  const [rangeStart, setRangeStart] = useState<string>(() =>
    toDatetimeLocalValue(Date.now() - 14 * 24 * 60 * 60 * 1000)
  );
  const [rangeEnd, setRangeEnd] = useState<string>(() => toDatetimeLocalValue(Date.now()));

  const [result, setResult] = useState<PremiumBacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bootstrappedRef = useRef(false);

  useEffect(() => {
    setEntryThreshold(defaultEntryThreshold);
  }, [defaultEntryThreshold]);

  useEffect(() => {
    setExitThreshold(defaultExitThreshold);
  }, [defaultExitThreshold]);

  const selectedInterval = useMemo(
    () => INTERVAL_OPTIONS.find((option) => option.key === interval) ?? INTERVAL_OPTIONS[0],
    [interval]
  );
  const startTimestamp = useMemo(() => parseDatetimeLocalToTimestamp(rangeStart), [rangeStart]);
  const endTimestamp = useMemo(() => parseDatetimeLocalToTimestamp(rangeEnd), [rangeEnd]);
  const isThresholdInvalid = entryThreshold <= exitThreshold;
  const isDateRangeInvalid =
    isDateRangeEnabled &&
    (startTimestamp === null || endTimestamp === null || startTimestamp > endTimestamp);

  const setRangeDays = useCallback((days: number) => {
    const end = Date.now();
    const start = end - days * 24 * 60 * 60 * 1000;
    setRangeStart(toDatetimeLocalValue(start));
    setRangeEnd(toDatetimeLocalValue(end));
    setIsDateRangeEnabled(true);
  }, []);

  const applyExplorationPreset = useCallback(() => {
    setInterval('30m');
    setPremiumBasis('USD');
    setTriggerMode('touch');
    setFillAtThreshold(true);
    setLimit(200);
    setEntryThreshold(2.0);
    setExitThreshold(0.0);
    setLeverage(1);
    setFeeBps(6);
    setSlippageBps(2);
    setForceCloseAtEnd(true);
    setUseStoredData(true);
    setRangeDays(30);
    setError(null);
  }, [setRangeDays]);

  const runBacktest = useCallback(
    async (manual = false) => {
      if (isThresholdInvalid) {
        setError('판매(%)는 매수(%)보다 커야 합니다. 예: 판매 2.0 / 매수 0.0');
        return;
      }
      if (isDateRangeInvalid) {
        setError('기간 설정이 올바르지 않습니다. 시작/종료 시간을 확인하세요.');
        return;
      }

      const resolvedStartTime = isDateRangeEnabled ? startTimestamp : null;
      const resolvedEndTime = isDateRangeEnabled ? endTimestamp : null;

      if (manual) {
        setIsRunning(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await fetchPremiumBacktest({
          interval,
          limit: clamp(limit, 30, selectedInterval.maxLimit),
          chartMaxPoints: MAX_BACKTEST_CHART_POINTS,
          premiumBasis,
          triggerMode,
          fillAtThreshold,
          entryThreshold,
          exitThreshold,
          leverage: clamp(leverage, 0.1, 10),
          initialCapitalKrw: clamp(defaultInvestmentKrw, 100_000, 100_000_000_000),
          feeBps: clamp(feeBps, 0, 200),
          slippageBps: clamp(slippageBps, 0, 200),
          forceCloseAtEnd,
          startTime: resolvedStartTime,
          endTime: resolvedEndTime,
          useStoredData,
        });

        setResult(response);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : '백테스트 실행 실패';
        setError(message);
      } finally {
        setIsLoading(false);
        if (manual) {
          setIsRunning(false);
        }
      }
    },
    [
      defaultInvestmentKrw,
      entryThreshold,
      exitThreshold,
      feeBps,
      forceCloseAtEnd,
      isDateRangeEnabled,
      isDateRangeInvalid,
      isThresholdInvalid,
      interval,
      leverage,
      limit,
      premiumBasis,
      triggerMode,
      fillAtThreshold,
      endTimestamp,
      selectedInterval.maxLimit,
      slippageBps,
      startTimestamp,
      useStoredData,
    ]
  );

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void runBacktest(false);
  }, [runBacktest]);

  const recentTrades = useMemo(() => {
    if (!result) return [];
    return [...result.trades].slice(-12).reverse();
  }, [result]);

  const displayPremiumSeries = useMemo<BacktestPremiumPoint[]>(() => {
    if (!result?.premiumSeries?.length) return [];

    const downsampled = downsamplePremiumSeries(result.premiumSeries, MAX_BACKTEST_CHART_POINTS);
    const byTimestamp = new Map<number, BacktestPremiumPoint>();
    for (const point of downsampled) {
      byTimestamp.set(point.timestamp, point);
    }

    if (result.trades.length > 0) {
      const originalByTimestamp = new Map<number, BacktestPremiumPoint>();
      for (const point of result.premiumSeries) {
        originalByTimestamp.set(point.timestamp, point);
      }
      for (const trade of result.trades) {
        const entryPoint =
          originalByTimestamp.get(trade.entryTimestamp) ?? {
            timestamp: trade.entryTimestamp,
            close: trade.entryPremium,
          };
        byTimestamp.set(entryPoint.timestamp, entryPoint);

        const exitPoint =
          originalByTimestamp.get(trade.exitTimestamp) ?? {
            timestamp: trade.exitTimestamp,
            close: trade.exitPremium,
          };
        byTimestamp.set(exitPoint.timestamp, exitPoint);
      }
    }

    return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [result]);

  const backtestChartRows = useMemo<BacktestChartRow[]>(() => {
    if (!displayPremiumSeries.length || !result) return [];

    const entryByTimestamp = new Map<number, number>();
    const exitByTimestamp = new Map<number, number>();
    for (const trade of result.trades) {
      if (!entryByTimestamp.has(trade.entryTimestamp)) {
        entryByTimestamp.set(trade.entryTimestamp, trade.entryPremium);
      }
      if (!exitByTimestamp.has(trade.exitTimestamp)) {
        exitByTimestamp.set(trade.exitTimestamp, trade.exitPremium);
      }
    }

    return displayPremiumSeries.map((point) => ({
      timestamp: point.timestamp,
      premiumClose: point.close,
      entryPremium: entryByTimestamp.get(point.timestamp) ?? null,
      exitPremium: exitByTimestamp.get(point.timestamp) ?? null,
    }));
  }, [displayPremiumSeries, result]);

  const backtestChartDomain = useMemo<[number, number]>(() => {
    if (!backtestChartRows.length) return [-1, 1];

    const values: number[] = [entryThreshold, exitThreshold];
    for (const row of backtestChartRows) {
      values.push(row.premiumClose);
      if (Number.isFinite(row.entryPremium ?? NaN)) values.push(row.entryPremium as number);
      if (Number.isFinite(row.exitPremium ?? NaN)) values.push(row.exitPremium as number);
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const span = Math.max(0.3, maxValue - minValue);
    const padding = Math.max(0.08, span * 0.2);
    return [Number((minValue - padding).toFixed(4)), Number((maxValue + padding).toFixed(4))];
  }, [backtestChartRows, entryThreshold, exitThreshold]);

  if (isLoading && !result) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 min-h-[360px] flex items-center justify-center text-slate-500">
        백테스트 데이터 불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <div className="w-1.5 h-5 bg-emerald-500 rounded-full"></div>
            전략 백테스트
          </h3>
          <div className="h-4 w-px bg-slate-800 mx-1"></div>
          {result && (
            <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
              <span>{result.periodStart ? formatDateTime(result.periodStart) : '-'} ~ {result.periodEnd ? formatDateTime(result.periodEnd) : '-'}</span>
              <span className="opacity-50">·</span>
              <span>봉 수: {result.candleCount ?? result.limit}개</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={applyExplorationPreset}
            className="px-2 py-1.5 rounded text-xs font-semibold text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            기본값 복원
          </button>
          <button
            onClick={() => void runBacktest(true)}
            disabled={isRunning || isThresholdInvalid || isDateRangeInvalid}
            className={`flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm ${isRunning
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:scale-95'
              }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? '실행 중' : '백테스트 실행'}
          </button>
        </div>
      </div>

      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-5">
          {/* Main Inputs Group */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">봉</span>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as CandleInterval)}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500/50 outline-none w-[85px]"
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">수</span>
              <input
                type="number"
                min={30}
                max={selectedInterval.maxLimit}
                step={10}
                value={limit}
                onChange={(e) => setLimit(clamp(Number(e.target.value), 30, selectedInterval.maxLimit))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-100 font-mono outline-none w-16 focus:border-cyan-500/50"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">기준</span>
              <select
                value={premiumBasis}
                onChange={(e) => setPremiumBasis(e.target.value === 'USD' ? 'USD' : 'USDT')}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-200 outline-none w-[115px] focus:border-cyan-500/50"
              >
                <option value="USDT">USDT환산</option>
                <option value="USD">USD환율</option>
              </select>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800/60 hidden lg:block"></div>

          {/* Strategy Group */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">판매%</span>
              <input
                type="number"
                step={0.1}
                value={entryThreshold}
                onChange={(e) => setEntryThreshold(clamp(Number(e.target.value), -10, 30))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-emerald-400 font-mono font-black outline-none w-16 focus:border-emerald-500/50"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">매수%</span>
              <input
                type="number"
                step={0.1}
                value={exitThreshold}
                onChange={(e) => setExitThreshold(clamp(Number(e.target.value), -15, 30))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-indigo-400 font-mono font-black outline-none w-16 focus:border-indigo-500/50"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">신호</span>
              <select
                value={triggerMode}
                onChange={(e) => setTriggerMode(e.target.value === 'close' ? 'close' : 'touch')}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-200 outline-none w-[90px] focus:border-emerald-500/50"
              >
                <option value="touch">터치</option>
                <option value="close">종가</option>
              </select>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800/60 hidden lg:block"></div>

          {/* Settings Group */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">배율</span>
              <input
                type="number"
                step={0.1}
                value={leverage}
                onChange={(e) => setLeverage(clamp(Number(e.target.value), 0.1, 10))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-100 font-mono outline-none w-14 focus:border-amber-500/50"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">수수료</span>
              <input
                type="number"
                value={feeBps}
                onChange={(e) => setFeeBps(clamp(Number(e.target.value), 0, 200))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-100 font-mono outline-none w-14 focus:border-amber-500/50"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">슬립</span>
              <input
                type="number"
                value={slippageBps}
                onChange={(e) => setSlippageBps(clamp(Number(e.target.value), 0, 200))}
                className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-slate-100 font-mono outline-none w-14 focus:border-amber-500/50"
              />
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800/60 hidden lg:block"></div>

          {/* Multi-Options */}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-400 uppercase hover:text-cyan-400 transition-all">
              <input
                type="checkbox"
                checked={useStoredData}
                onChange={(e) => setUseStoredData(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              저장DB
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-400 uppercase hover:text-emerald-400 transition-all">
              <input
                type="checkbox"
                checked={fillAtThreshold}
                onChange={(e) => setFillAtThreshold(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
              />
              임계체결
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-400 uppercase hover:text-indigo-400 transition-all">
              <input
                type="checkbox"
                checked={isDateRangeEnabled}
                onChange={(e) => setIsDateRangeEnabled(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
              />
              기간지정
            </label>
          </div>

          {isDateRangeEnabled && (
            <div className="flex items-center gap-4 pl-4 border-l border-slate-800 animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none"
                />
                <span className="text-slate-600 font-bold">~</span>
                <input
                  type="datetime-local"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 font-mono outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setRangeDays(7)} className="px-2 py-1 rounded bg-slate-800 text-[11px] font-bold text-slate-400 hover:text-slate-100 transition-colors">7D</button>
                <button onClick={() => setRangeDays(30)} className="px-2 py-1 rounded bg-slate-800 text-[11px] font-bold text-slate-400 hover:text-slate-100 transition-colors">30D</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-md px-3 py-2">
          백테스트 오류: {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
            <Metric title="총 수익률" value={formatSignedPercent(result.totalReturnPct)} highlight={result.totalReturnPct >= 0} />
            <Metric title="총 손익" value={`${formatSignedNumber(result.totalProfitKrw, 0)} KRW`} highlight={result.totalProfitKrw >= 0} />
            <Metric title="최종 자본" value={`₩${result.finalCapitalKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            <Metric title="거래 수" value={`${result.tradeCount}회`} />
            <Metric title="승률" value={`${result.winRate.toFixed(1)}%`} />
            <Metric title="평균 수익률" value={formatSignedPercent(result.avgTradeReturnPct)} highlight={result.avgTradeReturnPct >= 0} />
            <Metric title="최대 낙폭" value={`${result.maxDrawdownPct.toFixed(2)}%`} highlight={false} />
            <Metric title="파라미터" value={`S:${result.entryThreshold.toFixed(1)} / B:${result.exitThreshold.toFixed(1)}`} />
          </div>

          <div className={`mb-3 text-xs rounded-md px-3 py-2 border ${result.totalProfitKrw >= 0 ? 'text-emerald-300 bg-emerald-950/20 border-emerald-800/50' : 'text-rose-300 bg-rose-950/20 border-rose-800/50'}`}>
            백테스트 판정: {result.totalProfitKrw >= 0 ? '현재 설정에서는 이익 구간입니다.' : '현재 설정에서는 손실 구간입니다.'}
            {result.openPosition && (
              <span className="text-slate-400 ml-2">
                (미체결 매수 대기 판매: {formatDateTime(result.openPosition.entryTimestamp)} / {result.openPosition.entryPremium.toFixed(2)}%)
              </span>
            )}
          </div>

          <div className="mb-3 text-xs text-slate-300 bg-slate-900/40 border border-slate-800 rounded-md px-3 py-2">
            실행 데이터: {result.dataSource === 'stored-history' ? '저장 히스토리' : '실시간 조회'} · 기준 {result.premiumBasis ?? premiumBasis} · 사용 봉 {result.candleCount ?? result.limit}개
            <span className="text-slate-500 ml-2">
              (신호: {result.triggerMode === 'close' ? '종가' : '고/저가 터치'} · 체결: {result.fillAtThreshold === false ? '신호봉 종가' : '임계값'})
            </span>
            {result.premiumSeries && result.premiumSeries.length > 0 && (
              <span className="text-slate-500 ml-2">
                (차트 렌더링: {backtestChartRows.length.toLocaleString()} / 원본 {(result.premiumSeriesRawCount ?? result.premiumSeries.length).toLocaleString()}봉)
              </span>
            )}
            {result.premiumBasis === 'USD' && result.usdKrwRateApplied != null && (
              <span className="text-slate-500 ml-2">(적용 USD/KRW: {result.usdKrwRateApplied.toFixed(4)})</span>
            )}
            {result.premiumBasis === 'USD' && result.usdKrwRateRange && (
              <span className="text-slate-500 ml-2">
                (USD/KRW 범위: {result.usdKrwRateRange.min.toFixed(4)} ~ {result.usdKrwRateRange.max.toFixed(4)})
              </span>
            )}
            {result.premiumBasis === 'USD' && result.usdKrwHistoryCoverage && (
              <span className="text-slate-500 ml-2">
                (환율 히스토리: {result.usdKrwHistoryCoverage.dayCount}일, 보간 F/B {result.usdKrwHistoryCoverage.carryForwardFilled}/{result.usdKrwHistoryCoverage.carryBackwardFilled}, fallback {result.usdKrwHistoryCoverage.fallbackFilled})
              </span>
            )}
            {result.premiumRange && (
              <span className="text-slate-500 ml-2">
                (백테스트 구간 김프 범위: {result.premiumRange.minClose.toFixed(4)}% ~ {result.premiumRange.maxClose.toFixed(4)}%)
              </span>
            )}
            {result.historyCoverage && (
              <span className="text-slate-500 ml-2">
                (저장 범위: {result.historyCoverage.earliestTimestamp ? formatDateTime(result.historyCoverage.earliestTimestamp) : '-'} ~ {result.historyCoverage.latestTimestamp ? formatDateTime(result.historyCoverage.latestTimestamp) : '-'} / {result.historyCoverage.storedCandles}개)
              </span>
            )}
            {result.rangeBackfill && (
              <span className="text-slate-500 ml-2">
                (요청 구간 백필: +{result.rangeBackfill.added} / 갱신 {result.rangeBackfill.updated}, 소스 {result.rangeBackfill.source})
              </span>
            )}
          </div>

          <div className="mb-4 h-[260px] rounded-lg border border-slate-800 bg-slate-950/40 p-2">
            {backtestChartRows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                백테스트 김프 차트 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={backtestChartRows} margin={{ top: 8, right: 12, left: 6, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => formatChartTime(interval, Number(value))}
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={backtestChartDomain}
                    tickFormatter={(value) => `${Number(value).toFixed(2)}%`}
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    width={70}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateTime(Number(value))}
                    formatter={(value: number, name: string) => {
                      const label =
                        name === 'premiumClose'
                          ? '김프 종가'
                          : name === 'entryPremium'
                            ? '판매 체결'
                            : name === 'exitPremium'
                              ? '매수 체결'
                              : name;
                      return [`${Number(value).toFixed(4)}%`, label];
                    }}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <ReferenceLine y={entryThreshold} stroke="#10b981" strokeDasharray="5 5" />
                  <ReferenceLine y={exitThreshold} stroke="#818cf8" strokeDasharray="5 5" />
                  <Line
                    type="monotone"
                    dataKey="premiumClose"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="entryPremium"
                    stroke="#10b981"
                    strokeWidth={1}
                    dot={{ r: 3, fill: '#10b981' }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="exitPremium"
                    stroke="#f43f5e"
                    strokeWidth={1}
                    dot={{ r: 3, fill: '#f43f5e' }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {result.tradeCount === 0 && (
            <div className="mb-3 text-xs text-amber-200 bg-amber-950/20 border border-amber-800/50 rounded-md px-3 py-2">
              거래가 0건입니다. 판매값을 낮추거나(예: 3.5→2.0), 봉 간격을 더 짧게(30m→10m/1m) 바꿔 다시 실행해보세요.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-2 text-left">판매</th>
                  <th className="py-2 pr-2 text-left">매수</th>
                  <th className="py-2 pr-2 text-right">보유봉</th>
                  <th className="py-2 pr-2 text-right">판매/매수 김프</th>
                  <th className="py-2 pr-2 text-right">순수익률</th>
                  <th className="py-2 pr-2 text-right">손익(KRW)</th>
                  <th className="py-2 pr-2 text-right">매수 후 자본</th>
                  <th className="py-2 text-right">매수 사유</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      체결된 백테스트 거래가 없습니다.
                    </td>
                  </tr>
                ) : (
                  recentTrades.map((trade) => {
                    const profitable = trade.profitKrw >= 0;
                    return (
                      <tr key={`${trade.entryTimestamp}-${trade.exitTimestamp}`} className="border-b border-slate-900/80 hover:bg-slate-900/30">
                        <td className="py-2 pr-2 text-slate-300">{formatDateTime(trade.entryTimestamp)}</td>
                        <td className="py-2 pr-2 text-slate-300">{formatDateTime(trade.exitTimestamp)}</td>
                        <td className="py-2 pr-2 text-right font-mono text-slate-400">{trade.holdingCandles}</td>
                        <td className="py-2 pr-2 text-right font-mono text-slate-300">
                          {trade.entryPremium.toFixed(2)}% / {trade.exitPremium.toFixed(2)}%
                        </td>
                        <td className={`py-2 pr-2 text-right font-mono ${profitable ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {formatSignedPercent(trade.netReturnPct)}
                        </td>
                        <td className={`py-2 pr-2 text-right font-mono ${profitable ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {formatSignedNumber(trade.profitKrw, 0)}
                        </td>
                        <td className="py-2 pr-2 text-right font-mono text-slate-300">
                          {trade.capitalAfterKrw.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 text-right text-slate-500">{reasonLabel(trade.exitReason)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            데이터 소스: {result.sources.domestic} · {result.sources.global} · {result.sources.conversion}
          </div>
        </>
      )}
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; highlight?: boolean }> = ({
  title,
  value,
  highlight,
}) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wider text-slate-500">{title}</div>
    <div className={`font-mono text-sm mt-1 ${highlight === undefined ? 'text-slate-200' : highlight ? 'text-emerald-300' : 'text-rose-300'}`}>
      {value}
    </div>
  </div>
);

export const BacktestPanel = React.memo(BacktestPanelComponent);
BacktestPanel.displayName = 'BacktestPanel';
