import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Settings, Play, Pause, AlertTriangle, Zap, DollarSign, RefreshCw, MessageSquare } from 'lucide-react';
import { MetricCard } from './components/MetricCard';
import { StrategyVisualizer } from './components/StrategyVisualizer';
import { LogPanel } from './components/LogPanel';
import { PremiumChart } from './components/PremiumChart';
import { TopFundingTable } from './components/TopFundingTable';
import { MultiCoinPremiumTable } from './components/MultiCoinPremiumTable';
import { analyzeMarketSituation } from './services/geminiService';
import { MarketData, TradeLog, BotConfig, TradeStatus } from './types';
import { INITIAL_CAPITAL, DEFAULT_EXCHANGE_RATE, RISKS } from './constants';
import { fetchLiveMarketData } from './services/marketService';

const HISTORY_LIMIT = 120;
const POLLING_INTERVAL_MS = 3000;

const App: React.FC = () => {
  // --- State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [currentData, setCurrentData] = useState<MarketData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<number | null>(null);
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>(TradeStatus.IDLE);
  const [entryPriceDiff, setEntryPriceDiff] = useState<number>(0); // Record premium at entry

  // Bot Config
  const [config, setConfig] = useState<BotConfig>({
    entryThreshold: 3.5,
    exitThreshold: 0.8,
    leverage: 1,
    investmentKrw: INITIAL_CAPITAL
  });

  // AI State
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const pollingRef = useRef<number | null>(null);

  const appendMarketDataPoint = useCallback((newDataPoint: MarketData) => {
    setCurrentData(newDataPoint);
    setMarketData((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].timestamp === newDataPoint.timestamp) {
        return prev;
      }

      const next = [...prev, newDataPoint];
      if (next.length > HISTORY_LIMIT) next.shift();
      return next;
    });
  }, []);

  const refreshMarketData = useCallback(
    async (manualRefresh = false) => {
      if (manualRefresh) setIsRefreshing(true);

      try {
        const newDataPoint = await fetchLiveMarketData();
        appendMarketDataPoint(newDataPoint);
        setLastSuccessfulFetchAt(Date.now());
        setMarketError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '실시간 시세 조회 실패';
        console.error('Ticker fetch error:', error);
        setMarketError(message);
      } finally {
        setIsInitialLoading(false);
        if (manualRefresh) setIsRefreshing(false);
      }
    },
    [appendMarketDataPoint]
  );

  // Always keep market feed updated, independent from bot trading status.
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await refreshMarketData(false);
      if (cancelled) return;

      pollingRef.current = window.setInterval(() => {
        void refreshMarketData(false);
      }, POLLING_INTERVAL_MS);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [refreshMarketData]);

  // --- Auto-Trading Logic (The Bot) ---
  useEffect(() => {
    if (!isPlaying || !currentData) return;

    const premium = currentData.kimchiPremiumPercent;

    // ENTRY LOGIC
    if (tradeStatus === TradeStatus.IDLE) {
      if (premium >= config.entryThreshold) {
        setTradeStatus(TradeStatus.ENTERED);
        setEntryPriceDiff(premium);

        const newLog: TradeLog = {
          id: Date.now().toString(),
          timestamp: currentData.timestamp,
          type: 'ENTRY',
          premium: premium,
          krwPrice: currentData.krwPrice,
          usdPrice: currentData.usdPrice,
          description: `김프(${premium.toFixed(2)}%) > 진입가(${config.entryThreshold}%). 델타 중립 포지션 진입.`
        };
        setLogs(prev => [newLog, ...prev]);
      }
    }
    // EXIT LOGIC
    else if (tradeStatus === TradeStatus.ENTERED) {
      if (premium <= config.exitThreshold) {
        setTradeStatus(TradeStatus.EXITED);
        // Gross approximation of profit: Entry Premium - Exit Premium
        // (Ignoring fees/slippage for the visualizer simplicity)
        const estimatedProfit = entryPriceDiff - premium;

        const newLog: TradeLog = {
          id: Date.now().toString(),
          timestamp: currentData.timestamp,
          type: 'EXIT',
          premium: premium,
          krwPrice: currentData.krwPrice,
          usdPrice: currentData.usdPrice,
          profit: estimatedProfit,
          description: `김프(${premium.toFixed(2)}%) < 청산가(${config.exitThreshold}%). 포지션 종료. 확보 차익: ${estimatedProfit.toFixed(2)}%`
        };
        setLogs(prev => [newLog, ...prev]);

        // Reset to IDLE after a brief delay or immediately? Immediately for continuous loop.
        setTimeout(() => setTradeStatus(TradeStatus.IDLE), 1000);
      }
    }
  }, [currentData, isPlaying, tradeStatus, config, entryPriceDiff]);

  // --- AI Analysis Handler ---
  const handleAiAnalysis = useCallback(async () => {
    if (!currentData) return;
    setIsAiLoading(true);
    setAiAdvice(null);

    try {
      const recent = marketData.slice(-5);
      if (recent.length < 2) {
        setAiAdvice('AI 분석을 위한 데이터가 아직 충분하지 않습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      const start = recent[0].kimchiPremiumPercent;
      const end = recent[recent.length - 1].kimchiPremiumPercent;
      let trend: 'WIDENING' | 'NARROWING' | 'STABLE' = 'STABLE';
      if (end > start + 0.1) trend = 'WIDENING';
      if (end < start - 0.1) trend = 'NARROWING';

      const result = await analyzeMarketSituation(
        currentData.kimchiPremiumPercent,
        trend,
        0.01 // Mock funding rate
      );

      setAiAdvice(result);
    } catch (error) {
      console.error('AI analysis error:', error);
      setAiAdvice('AI 분석 호출 중 오류가 발생했습니다.');
    } finally {
      setIsAiLoading(false);
    }
  }, [currentData, marketData]);

  // Status map for display
  const statusMap = {
    [TradeStatus.IDLE]: '대기 중 (Idle)',
    [TradeStatus.ENTERED]: '진입 완료 (Entered)',
    [TradeStatus.EXITED]: '청산 완료 (Exited)'
  };

  const isDataFresh =
    currentData !== null &&
    Date.now() - currentData.timestamp <= POLLING_INTERVAL_MS * 2.5;

  const statusColor = marketError
    ? 'text-rose-400'
    : isDataFresh
      ? 'text-emerald-500'
      : 'text-amber-400';

  const statusText = marketError
    ? '데이터 연결 오류'
    : isDataFresh
      ? '실시간 연결됨'
      : '데이터 지연';

  const formattedLastUpdated = useMemo(
    () => (currentData ? new Date(currentData.timestamp).toLocaleTimeString('ko-KR') : '-'),
    [currentData]
  );

  const effectiveConversionRate = currentData
    ? currentData.conversionRate ?? currentData.exchangeRate ?? DEFAULT_EXCHANGE_RATE
    : DEFAULT_EXCHANGE_RATE;

  const normalizedGlobalKrwPrice = currentData
    ? currentData.normalizedGlobalKrwPrice ?? currentData.usdPrice * effectiveConversionRate
    : 0;

  const defaultFundingNotionalUsdt = useMemo(
    () => Math.max(50, Math.round(config.investmentKrw / Math.max(1, effectiveConversionRate))),
    [config.investmentKrw, effectiveConversionRate]
  );

  // --- Render Helpers ---
  if (isInitialLoading && !currentData) {
    return (
      <div className="h-screen w-full bg-slate-950 flex items-center justify-center text-slate-500">
        실시간 데이터 연결 중...
      </div>
    );
  }

  if (!currentData) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col gap-4 items-center justify-center text-slate-300 px-6 text-center">
        <p className="text-lg font-semibold">실시간 데이터 연결에 실패했습니다.</p>
        <p className="text-sm text-slate-500">{marketError ?? '백엔드 서버 상태를 확인해주세요.'}</p>
        <button
          onClick={() => void refreshMarketData(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
        >
          {isRefreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 lg:p-8 font-sans">

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
            <Activity className="text-emerald-400" />
            델타 중립 봇
          </h1>
          <p className="text-slate-500 mt-2 max-w-xl text-sm">
            국내(KRW)와 해외(USDT) 거래소 간의 가격 괴리를 이용한 델타 중립 전략 대시보드.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* API Key Check - purely visual for this demo context */}
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className="text-[10px] uppercase text-slate-500 tracking-wider font-bold">시스템 상태</span>
            <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
              <span className={`w-2 h-2 rounded-full ${marketError ? 'bg-rose-500' : isDataFresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {statusText}
            </span>
            <span className="text-[10px] text-slate-500 mt-1">최근 갱신: {formattedLastUpdated}</span>
          </div>

          <button
            onClick={() => void refreshMarketData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-3 rounded-lg font-bold transition-all shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-60"
          >
            {isRefreshing ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            새로고침
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-lg ${isPlaying
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20'
              }`}
          >
            {isPlaying ? <><Pause size={18} /> 봇 중지</> : <><Play size={18} /> 봇 시작</>}
          </button>
        </div>
      </header>

      {marketError && (
        <div className="mb-6 bg-rose-950/30 border border-rose-800/60 rounded-lg px-4 py-3 text-sm text-rose-200">
          실시간 데이터 오류: {marketError}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Col: Config & Visualizer (4 cols) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Strategy Visualizer */}
          <StrategyVisualizer />

          {/* Configuration Panel */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-400" />
              봇 파라미터 설정
            </h3>

            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>진입 임계값 (김프 &gt;)</span>
                  <span className="text-emerald-400 font-mono">{config.entryThreshold}%</span>
                </label>
                <input
                  type="range" min="1" max="10" step="0.1"
                  value={config.entryThreshold}
                  onChange={(e) => setConfig({ ...config, entryThreshold: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>청산 임계값 (김프 &lt;)</span>
                  <span className="text-indigo-400 font-mono">{config.exitThreshold}%</span>
                </label>
                <input
                  type="range" min="-1" max="5" step="0.1"
                  value={config.exitThreshold}
                  onChange={(e) => setConfig({ ...config, exitThreshold: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div>
                <label className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>시뮬레이션 자본금</span>
                  <span className="text-slate-200 font-mono">{(config.investmentKrw / 1000000).toFixed(0)}백만 KRW</span>
                </label>
                <div className="h-2 bg-slate-800 rounded-lg overflow-hidden">
                  <div className="h-full bg-slate-600 w-full"></div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">상태</span>
                <span className={`font-bold px-2 py-1 rounded text-xs ${tradeStatus === TradeStatus.ENTERED ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/30 text-slate-400'
                  }`}>
                  {statusMap[tradeStatus]}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Checklist */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              주요 리스크 요인
            </h3>
            <ul className="space-y-3">
              {RISKS.map(risk => (
                <li key={risk.id} className="flex items-start gap-3 text-sm p-2 rounded hover:bg-slate-800/50 transition-colors cursor-help group relative">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${risk.level === 'HIGH' ? 'bg-rose-500' : risk.level === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                  <div>
                    <span className="text-slate-300 block font-medium">{risk.name}</span>
                    <span className="text-slate-500 text-xs hidden group-hover:block transition-all">{risk.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Center & Right Col: Data & Charts (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Top Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <MetricCard
              title="김치 프리미엄"
              value={`${currentData.kimchiPremiumPercent.toFixed(2)}%`}
              subValue="USD/KRW 기준"
              trend={currentData.kimchiPremiumPercent > 0 ? 'up' : 'down'}
              icon={<Zap size={18} />}
              highlight={currentData.kimchiPremiumPercent > config.entryThreshold}
            />
            <MetricCard
              title="USDT 실질 김프"
              value={`${(currentData.kimchiPremiumPercentUsdt ?? currentData.kimchiPremiumPercent).toFixed(2)}%`}
              subValue={`USDT 프리미엄: ${(currentData.usdtPremiumPercent ?? 0).toFixed(2)}%`}
              trend={(currentData.kimchiPremiumPercentUsdt ?? currentData.kimchiPremiumPercent) > 0 ? 'up' : 'down'}
            />
            <MetricCard
              title="국내 시세 (KRW)"
              value={`₩${(currentData.krwPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              subValue={currentData.sources?.domestic ?? 'upbit:KRW-BTC'}
            />
            <MetricCard
              title="해외 시세 (USDT)"
              value={`$${(currentData.usdPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              subValue={currentData.sources?.global ?? 'binance:BTCUSDT'}
            />
            <MetricCard
              title="환율 (USD/KRW)"
              value={`₩${currentData.exchangeRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subValue={`USDT/KRW: ₩${currentData.usdtKrwRate?.toFixed(0) ?? '-'}`}
              icon={<DollarSign size={18} />}
            />
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 text-xs flex flex-col md:flex-row justify-between gap-2 text-slate-400">
            <span>해외 환산가 (USD 기준): ₩{normalizedGlobalKrwPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span>USDT/KRW: {currentData.usdtKrwRate?.toFixed(2) ?? '-'} · USD/KRW: {currentData.exchangeRate.toFixed(2)}</span>
            <span>마지막 성공 갱신: {lastSuccessfulFetchAt ? new Date(lastSuccessfulFetchAt).toLocaleTimeString('ko-KR') : '-'}</span>
          </div>

          <MultiCoinPremiumTable />

          <TopFundingTable defaultNotionalUsdt={defaultFundingNotionalUsdt} />

          {/* Main Chart */}
          <PremiumChart
            entryThreshold={config.entryThreshold}
            exitThreshold={config.exitThreshold}
          />

          {/* Bottom Row: AI & Logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[350px]">

            {/* AI Advisor */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-center mb-4 z-10">
                <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  AI 전략 분석가
                </h3>
                <button
                  onClick={handleAiAnalysis}
                  disabled={isAiLoading}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
                >
                  {isAiLoading ? <RefreshCw className="animate-spin w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                  분석하기
                </button>
              </div>

              <div className="flex-1 overflow-y-auto z-10 custom-scrollbar">
                {aiAdvice ? (
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-sm leading-relaxed text-slate-300">
                    {aiAdvice}
                  </div>
                ) : (
                  <div className="text-slate-600 text-sm italic flex h-full items-center justify-center text-center px-4">
                    '분석하기'를 클릭하면 Gemini AI가 델타 중립 전략을 바탕으로 현재 시장 상황을 진단합니다.
                  </div>
                )}
              </div>

              {/* Decoration */}
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl z-0 pointer-events-none"></div>
            </div>

            {/* Trade Logs */}
            <LogPanel logs={logs} />
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
