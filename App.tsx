import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Play, Pause, Zap, DollarSign, RefreshCw, TrendingUp, Plus, X, Save } from 'lucide-react';
import { MetricCard } from './components/MetricCard';
import {
  BithumbExecutionPortfolioResponse,
  BithumbExecutionFill,
  ExecutionCredentialsStatusResponse,
  ExecutionEngineReadinessResponse,
  BinanceExecutionFill,
  ExecutionEngineStatusResponse,
  ExecutionOrderResponse,
  BinanceExecutionPortfolioResponse,
  BinanceSpotExecutionPortfolioResponse,
  BinanceExecutionPositionResponse,
  BinanceExecutionStatusResponse,
  BotConfig,
  ExecutionEventsResponse,
  ExecutionMarketType,
  ExecutionSafetyResponse,
  MarketData,
} from './types';
import { INITIAL_CAPITAL, DEFAULT_EXCHANGE_RATE } from './constants';
import {
  clearExecutionCredentials,
  fetchExecutionCredentialsStatus,
  fetchExecutionEvents,
  fetchExecutionEngineStatus,
  fetchExecutionEngineReadiness,
  fetchExecutionFills,
  fetchBithumbExecutionFills,
  fetchExecutionPortfolio,
  fetchBinanceSpotExecutionPortfolio,
  fetchBithumbExecutionPortfolio,
  fetchExecutionPosition,
  fetchExecutionSafety,
  fetchExecutionStatus,
  fetchLiveMarketData,
  placeBinanceExecutionOrder,
  placeBithumbExecutionOrder,
  resetExecutionSafety,
  startExecutionEngine,
  stopExecutionEngine,
  updateExecutionCredentials,
  updateExecutionOrderPolicy,
  fetchDiscordConfig,
  updateDiscordConfig,
  sendDiscordTest,
  DiscordConfigResponse,
  DiscordNotificationSettings,
  PremiumAlertThreshold,
  getApiBaseCandidates,
  getExecutionAdminToken,
} from './services/marketService';

const POLLING_INTERVAL_MS = 1000;
const EXECUTION_REFRESH_INTERVAL_MS = 30000;

type SidebarSection = 'automation' | 'portfolio' | 'settings';
type ExecutionRuntimeEvent = ExecutionEventsResponse['events'][number];

const EXECUTION_EVENT_LABELS: Record<string, string> = {
  api_execution_binance_status_success: '바이낸스 상태 조회 성공',
  api_execution_binance_status_failure: '바이낸스 상태 조회 실패',
  api_execution_binance_status_not_configured: '바이낸스 상태 조회 스킵(미설정)',
  api_execution_binance_position_success: '바이낸스 포지션 조회 성공',
  api_execution_binance_position_failure: '바이낸스 포지션 조회 실패',
  api_execution_binance_portfolio_success: '바이낸스 선물 포트폴리오 조회 성공',
  api_execution_binance_portfolio_failure: '바이낸스 선물 포트폴리오 조회 실패',
  api_execution_binance_portfolio_not_configured: '바이낸스 선물 포트폴리오 조회 스킵(미설정)',
  api_execution_binance_spot_portfolio_success: '바이낸스 현물 포트폴리오 조회 성공',
  api_execution_binance_spot_portfolio_failure: '바이낸스 현물 포트폴리오 조회 실패',
  api_execution_binance_spot_portfolio_not_configured: '바이낸스 현물 포트폴리오 조회 스킵(미설정)',
  api_execution_binance_fills_success: '바이낸스 체결 조회 성공',
  api_execution_binance_fills_failure: '바이낸스 체결 조회 실패',
  api_execution_binance_fills_validation_failed: '바이낸스 체결 조회 검증 실패',
  api_execution_bithumb_portfolio_success: '빗썸 잔고 조회 성공',
  api_execution_bithumb_portfolio_failure: '빗썸 잔고 조회 실패',
  api_execution_bithumb_portfolio_not_configured: '빗썸 잔고 조회 스킵(미설정)',
  api_execution_bithumb_fills_success: '빗썸 체결 조회 성공',
  api_execution_bithumb_fills_failure: '빗썸 체결 조회 실패',
  api_execution_bithumb_fills_validation_failed: '빗썸 체결 조회 검증 실패',
  api_execution_binance_order_success: '바이낸스 주문 성공',
  api_execution_binance_order_failure: '바이낸스 주문 실패',
  api_execution_binance_order_dry_run: '바이낸스 드라이런 주문',
  api_execution_binance_order_attempt_failed: '바이낸스 주문 시도 실패',
  api_execution_binance_order_validation_failed: '바이낸스 주문 검증 실패',
  api_execution_binance_order_idempotency_conflict: '바이낸스 주문 중복키 충돌',
  api_execution_binance_order_blocked_safe_mode: '바이낸스 주문 차단(안전모드)',
  api_execution_binance_order_blocked_live_disabled: '바이낸스 주문 차단(실주문 OFF)',
  api_execution_binance_order_blocked_testnet_disabled: '바이낸스 주문 차단(테스트넷 비허용)',
  api_execution_bithumb_order_success: '빗썸 주문 성공',
  api_execution_bithumb_order_failure: '빗썸 주문 실패',
  api_execution_bithumb_order_dry_run: '빗썸 드라이런 주문',
  api_execution_bithumb_order_attempt_failed: '빗썸 주문 시도 실패',
  api_execution_bithumb_order_idempotent_hit: '빗썸 주문 중복키 재사용',
  api_execution_safety_reset: '실행 안전모드 초기화',
  execution_engine_started: '자동매매 엔진 시작',
  execution_engine_stopped: '자동매매 엔진 정지',
  execution_engine_start_failure: '자동매매 엔진 시작 실패',
  execution_engine_tick_failure: '자동매매 엔진 틱 실패',
  execution_engine_threshold_triggered: '자동매매 임계값 트리거',
};

const EXECUTION_EVENT_TOKEN_LABELS: Record<string, string> = {
  api: 'API',
  execution: '실행',
  binance: '바이낸스',
  bithumb: '빗썸',
  status: '상태',
  position: '포지션',
  portfolio: '포트폴리오',
  spot: '현물',
  fills: '체결조회',
  order: '주문',
  safety: '안전모드',
  reset: '초기화',
  engine: '엔진',
  credentials: '인증정보',
  updated: '업데이트',
  cleared: '삭제',
  state: '상태',
  restore: '복구',
  restored: '복구완료',
  start: '시작',
  started: '시작',
  stop: '정지',
  stopped: '정지',
  failure: '실패',
  failed: '실패',
  success: '성공',
  warn: '경고',
  blocked: '차단',
  live: '실주문',
  testnet: '테스트넷',
  disabled: '비활성',
  dry: '드라이',
  run: '런',
  validation: '검증',
  not: '미',
  configured: '설정',
  attempt: '시도',
  idempotency: '중복방지',
  idempotent: '중복방지',
  conflict: '충돌',
};

function translateExecutionEventName(eventName: string): string {
  const direct = EXECUTION_EVENT_LABELS[eventName];
  if (direct) return direct;

  const tokens = String(eventName)
    .split('_')
    .map((token) => EXECUTION_EVENT_TOKEN_LABELS[token] ?? token.toUpperCase());

  return tokens
    .join(' ')
    .replaceAll('미 설정', '미설정')
    .replaceAll('드라이 런', '드라이런')
    .replaceAll('체결조회', '체결 조회')
    .trim();
}

function translateEventLevel(level: string | null | undefined): string {
  const normalized = String(level ?? '').toLowerCase();
  if (normalized === 'error') return '오류';
  if (normalized === 'warn' || normalized === 'warning') return '경고';
  return '정보';
}

const App: React.FC = () => {
  // --- State ---
  const [currentData, setCurrentData] = useState<MarketData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<number | null>(null);

  // Bot Config
  const [config, setConfig] = useState<BotConfig>({
    entryThreshold: 0.0,
    exitThreshold: 2.0,
    leverage: 1,
    investmentKrw: INITIAL_CAPITAL
  });

  // Execution State
  const [executionMarketType, setExecutionMarketType] = useState<ExecutionMarketType>('usdm');
  const [executionSymbol, setExecutionSymbol] = useState<string>(defaultSymbolByMarketType('usdm'));
  const [executionBinanceEntrySide, setExecutionBinanceEntrySide] = useState<'short' | 'long'>('short');
  const [executionBinanceLeverageInput, setExecutionBinanceLeverageInput] = useState<string>('4');
  const [executionBinanceMarginMode, setExecutionBinanceMarginMode] = useState<'isolated' | 'cross'>('isolated');
  const [executionDryRun, setExecutionDryRun] = useState<boolean>(true);
  const [executionOrderBalancePctEntry, setExecutionOrderBalancePctEntry] = useState<number>(100);
  const [executionStatus, setExecutionStatus] = useState<BinanceExecutionStatusResponse | null>(null);
  const [executionSafety, setExecutionSafety] = useState<ExecutionSafetyResponse | null>(null);
  const [executionPosition, setExecutionPosition] = useState<BinanceExecutionPositionResponse | null>(null);
  const [executionPortfolio, setExecutionPortfolio] = useState<BinanceExecutionPortfolioResponse | null>(null);
  const [executionPortfolioCoinm, setExecutionPortfolioCoinm] = useState<BinanceExecutionPortfolioResponse | null>(null);
  const [executionPortfolioUsdm, setExecutionPortfolioUsdm] = useState<BinanceExecutionPortfolioResponse | null>(null);
  const [executionPortfolioSpot, setExecutionPortfolioSpot] = useState<BinanceSpotExecutionPortfolioResponse | null>(null);
  const [executionPortfolioCoinmError, setExecutionPortfolioCoinmError] = useState<string | null>(null);
  const [executionPortfolioUsdmError, setExecutionPortfolioUsdmError] = useState<string | null>(null);
  const [executionPortfolioSpotError, setExecutionPortfolioSpotError] = useState<string | null>(null);
  const [bithumbPortfolio, setBithumbPortfolio] = useState<BithumbExecutionPortfolioResponse | null>(null);
  const [executionFills, setExecutionFills] = useState<BinanceExecutionFill[]>([]);
  const [bithumbExecutionFills, setBithumbExecutionFills] = useState<BithumbExecutionFill[]>([]);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEventsResponse['events']>([]);
  const [executionEventsAll, setExecutionEventsAll] = useState<ExecutionEventsResponse['events']>([]);
  const [executionEngineStatus, setExecutionEngineStatus] = useState<ExecutionEngineStatusResponse | null>(null);
  const [executionReadiness, setExecutionReadiness] = useState<ExecutionEngineReadinessResponse | null>(null);
  const [executionCredentialsStatus, setExecutionCredentialsStatus] = useState<ExecutionCredentialsStatusResponse | null>(null);
  const [executionApiKeyInput, setExecutionApiKeyInput] = useState<string>('');
  const [executionApiSecretInput, setExecutionApiSecretInput] = useState<string>('');
  const [bithumbApiKeyInput, setBithumbApiKeyInput] = useState<string>('');
  const [bithumbApiSecretInput, setBithumbApiSecretInput] = useState<string>('');
  const [executionCredentialPersist, setExecutionCredentialPersist] = useState<boolean>(true);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [bithumbExecutionError, setBithumbExecutionError] = useState<string | null>(null);
  const [isExecutionRefreshing, setIsExecutionRefreshing] = useState<boolean>(false);
  const [isEngineSubmitting, setIsEngineSubmitting] = useState<boolean>(false);
  const [isCredentialSubmitting, setIsCredentialSubmitting] = useState<boolean>(false);
  const [isOrderPolicySubmitting, setIsOrderPolicySubmitting] = useState<boolean>(false);
  const [isReadinessChecking, setIsReadinessChecking] = useState<boolean>(false);
  const [binanceManualMarketType, setBinanceManualMarketType] = useState<ExecutionMarketType>('usdm');
  const [binanceManualSymbol, setBinanceManualSymbol] = useState<string>(defaultSymbolByMarketType('usdm'));
  const [binanceManualDirection, setBinanceManualDirection] = useState<'long' | 'short'>('short');
  const [binanceManualLeverageInput, setBinanceManualLeverageInput] = useState<string>('4');
  const [binanceManualMarginMode, setBinanceManualMarginMode] = useState<'isolated' | 'cross'>('isolated');
  const [binanceManualOrderType, setBinanceManualOrderType] = useState<'market' | 'limit'>('market');
  const [binanceManualAmountInput, setBinanceManualAmountInput] = useState<string>('');
  const [binanceManualBalancePctInput, setBinanceManualBalancePctInput] = useState<string>('100');
  const [binanceManualPriceInput, setBinanceManualPriceInput] = useState<string>('');
  const [binanceManualDryRun, setBinanceManualDryRun] = useState<boolean>(true);
  const [binanceManualAllowInSafeMode, setBinanceManualAllowInSafeMode] = useState<boolean>(false);
  const [binanceManualSubmitting, setBinanceManualSubmitting] = useState<boolean>(false);
  const [binanceManualError, setBinanceManualError] = useState<string | null>(null);
  const [binanceManualResult, setBinanceManualResult] = useState<ExecutionOrderResponse | null>(null);
  const [bithumbManualOrderType, setBithumbManualOrderType] = useState<'market' | 'limit'>('market');
  const [bithumbManualSymbol, setBithumbManualSymbol] = useState<string>('BTC/KRW');
  const [bithumbManualAmountInput, setBithumbManualAmountInput] = useState<string>('');
  const [bithumbManualBalancePctInput, setBithumbManualBalancePctInput] = useState<string>('100');
  const [bithumbManualPriceInput, setBithumbManualPriceInput] = useState<string>('');
  const [bithumbManualDryRun, setBithumbManualDryRun] = useState<boolean>(true);
  const [bithumbManualAllowInSafeMode, setBithumbManualAllowInSafeMode] = useState<boolean>(false);
  const [bithumbManualSubmitting, setBithumbManualSubmitting] = useState<boolean>(false);
  const [bithumbManualError, setBithumbManualError] = useState<string | null>(null);
  const [bithumbManualResult, setBithumbManualResult] = useState<ExecutionOrderResponse | null>(null);
  const [activeSection, setActiveSection] = useState<SidebarSection>('automation');
  // Discord state
  const [discordConfig, setDiscordConfig] = useState<DiscordConfigResponse | null>(null);
  const [discordWebhookInput, setDiscordWebhookInput] = useState<string>('');
  const [isDiscordSubmitting, setIsDiscordSubmitting] = useState<boolean>(false);
  const [discordMessage, setDiscordMessage] = useState<string | null>(null);
  // Discord notification settings state
  const [premiumAlertEnabled, setPremiumAlertEnabled] = useState<boolean>(false);
  const [premiumAlertThresholds, setPremiumAlertThresholds] = useState<PremiumAlertThreshold[]>([
    { id: 'default-high', value: 3.0 },
    { id: 'default-low', value: -1.0 },
  ]);
  const [periodicReportEnabled, setPeriodicReportEnabled] = useState<boolean>(true);
  const [reportIntervalMinutes, setReportIntervalMinutes] = useState<number>(60);

  const pollingRef = useRef<number | null>(null);
  const executionPollingRef = useRef<number | null>(null);
  const hasLoadedEngineSettingsRef = useRef<boolean>(false);
  const lastExecutionPushRefreshAtRef = useRef<number>(0);

  function defaultSymbolByMarketType(marketType: ExecutionMarketType): string {
    return marketType === 'usdm' ? 'BTC/USDT:USDT' : 'BTC/USD:BTC';
  }

  function formatNullableNumber(value: number | null | undefined, maximumFractionDigits = 8): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return value.toLocaleString(undefined, { maximumFractionDigits });
  }

  function formatSignedNumber(value: number | null | undefined, maximumFractionDigits = 8): string {
    if (value == null || !Number.isFinite(value)) return '-';
    const absValue = Math.abs(value);
    const body = absValue.toLocaleString(undefined, { maximumFractionDigits });
    if (value > 0) return `+${body}`;
    if (value < 0) return `-${body}`;
    return body;
  }

  function resolvePositionSide(
    sideRaw: string | null | undefined,
    contractsRaw: number | null | undefined
  ): { label: string; className: string } {
    const side = String(sideRaw ?? '').toLowerCase();
    const contracts = Number(contractsRaw ?? NaN);
    const isShort =
      side.includes('short') ||
      side.includes('sell') ||
      (Number.isFinite(contracts) && contracts < 0);
    const isLong =
      side.includes('long') ||
      side.includes('buy') ||
      (Number.isFinite(contracts) && contracts > 0);
    if (isShort) return { label: 'SHORT', className: 'text-emerald-300' };
    if (isLong) return { label: 'LONG', className: 'text-indigo-300' };
    return { label: '-', className: 'text-slate-400' };
  }

  function translateExecutionError(message: string | null | undefined): string | null {
    if (!message) return null;
    const text = String(message);
    const lower = text.toLowerCase();

    if (lower.includes('access ip')) {
      return `접근 IP가 허용되지 않았습니다. 거래소 API 설정에서 현재 공인 IP를 허용 목록에 추가하세요.\n원문: ${text}`;
    }
    if (
      lower.includes('invalid api-key') ||
      lower.includes('invalid api key') ||
      lower.includes('permissions for action') ||
      lower.includes('code\":-2015')
    ) {
      return `API 키/권한/IP 문제가 있습니다. 키 상태, 선물 권한, 허용 IP를 확인하세요.\n원문: ${text}`;
    }
    if (lower.includes('fetchmytrades') && lower.includes('not supported')) {
      return `빗썸 체결 조회는 현재 지원되지 않습니다.\n원문: ${text}`;
    }
    if (lower.includes('failed to fetch') || lower.includes('network')) {
      return `백엔드 연결 실패입니다. 서버 실행 여부와 프록시 주소를 확인하세요.\n원문: ${text}`;
    }
    if (lower.includes('execution safe mode')) {
      return `안전모드가 활성화되어 주문이 차단된 상태입니다.\n원문: ${text}`;
    }
    if (lower.includes('cannot get') || lower.includes('not found')) {
      return `요청한 API 경로가 없습니다. 프론트/백엔드 버전이 맞는지 확인하세요.\n원문: ${text}`;
    }

    return text;
  }

  function buildManualIdempotencyKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const applyReverseHedgePreset = useCallback(() => {
    const usdmSymbol = defaultSymbolByMarketType('usdm');
    setExecutionMarketType('usdm');
    setExecutionSymbol(usdmSymbol);
    setExecutionBinanceEntrySide('short');
    setExecutionBinanceLeverageInput('4');
    setExecutionBinanceMarginMode('isolated');
    setExecutionOrderBalancePctEntry(100);
    setConfig((prev) => ({
      ...prev,
      entryThreshold: 0,
      exitThreshold: 2,
    }));

    setBinanceManualMarketType('usdm');
    setBinanceManualSymbol(usdmSymbol);
    setBinanceManualDirection('short');
    setBinanceManualLeverageInput('4');
    setBinanceManualMarginMode('isolated');
    setBinanceManualBalancePctInput('100');
    setBithumbManualBalancePctInput('100');
  }, []);

  const appendMarketDataPoint = useCallback((newDataPoint: MarketData) => {
    setCurrentData(newDataPoint);
  }, []);

  useEffect(() => {
    setExecutionSymbol(defaultSymbolByMarketType(executionMarketType));
  }, [executionMarketType]);

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

  const refreshExecutionData = useCallback(
    async (manualRefresh = false) => {
      if (manualRefresh) setIsExecutionRefreshing(true);

      const settled = await Promise.allSettled([
        fetchExecutionStatus(executionMarketType),
        fetchExecutionCredentialsStatus(),
        fetchExecutionSafety(),
        fetchExecutionPosition(executionMarketType, executionSymbol.trim()),
        fetchExecutionPortfolio({
          marketType: executionMarketType,
          symbol: executionSymbol.trim(),
          balanceLimit: 8,
        }),
        fetchExecutionPortfolio({
          marketType: 'coinm',
          symbol: defaultSymbolByMarketType('coinm'),
          balanceLimit: 8,
        }),
        fetchExecutionPortfolio({
          marketType: 'usdm',
          symbol: defaultSymbolByMarketType('usdm'),
          balanceLimit: 8,
        }),
        fetchBinanceSpotExecutionPortfolio({
          symbol: 'BTC/USDT',
          balanceLimit: 8,
        }),
        fetchBithumbExecutionPortfolio({
          symbol: 'BTC/KRW',
          balanceLimit: 8,
        }),
        fetchExecutionFills({
          marketType: executionMarketType,
          symbol: executionSymbol.trim(),
          limit: 20,
        }),
        fetchBithumbExecutionFills({
          symbol: 'BTC/KRW',
          limit: 20,
        }),
        fetchExecutionEvents({
          limit: 30,
          marketType: executionMarketType,
        }),
        fetchExecutionEvents({
          limit: 120,
        }),
        fetchExecutionEngineStatus(),
      ]);

      const errors: string[] = [];

      const executionStatusResult = settled[0];
      if (executionStatusResult.status === 'fulfilled') {
        setExecutionStatus(executionStatusResult.value);
      } else {
        errors.push(executionStatusResult.reason instanceof Error ? executionStatusResult.reason.message : String(executionStatusResult.reason));
      }

      const credentialsResult = settled[1];
      if (credentialsResult.status === 'fulfilled') {
        setExecutionCredentialsStatus(credentialsResult.value);
      } else {
        errors.push(credentialsResult.reason instanceof Error ? credentialsResult.reason.message : String(credentialsResult.reason));
      }

      const safetyResult = settled[2];
      if (safetyResult.status === 'fulfilled') {
        setExecutionSafety(safetyResult.value);
      } else {
        errors.push(safetyResult.reason instanceof Error ? safetyResult.reason.message : String(safetyResult.reason));
      }

      const positionResult = settled[3];
      if (positionResult.status === 'fulfilled') {
        setExecutionPosition(positionResult.value);
      } else {
        errors.push(positionResult.reason instanceof Error ? positionResult.reason.message : String(positionResult.reason));
      }

      const portfolioResult = settled[4];
      if (portfolioResult.status === 'fulfilled') {
        setExecutionPortfolio(portfolioResult.value);
      } else {
        errors.push(
          portfolioResult.reason instanceof Error
            ? portfolioResult.reason.message
            : String(portfolioResult.reason)
        );
      }

      const coinmPortfolioResult = settled[5];
      if (coinmPortfolioResult.status === 'fulfilled') {
        setExecutionPortfolioCoinm(coinmPortfolioResult.value);
        setExecutionPortfolioCoinmError(coinmPortfolioResult.value.error ?? null);
      } else {
        const message =
          coinmPortfolioResult.reason instanceof Error
            ? coinmPortfolioResult.reason.message
            : String(coinmPortfolioResult.reason);
        setExecutionPortfolioCoinm(null);
        setExecutionPortfolioCoinmError(message);
      }

      const usdmPortfolioResult = settled[6];
      if (usdmPortfolioResult.status === 'fulfilled') {
        setExecutionPortfolioUsdm(usdmPortfolioResult.value);
        setExecutionPortfolioUsdmError(usdmPortfolioResult.value.error ?? null);
      } else {
        const message =
          usdmPortfolioResult.reason instanceof Error
            ? usdmPortfolioResult.reason.message
            : String(usdmPortfolioResult.reason);
        setExecutionPortfolioUsdm(null);
        setExecutionPortfolioUsdmError(message);
      }

      const spotPortfolioResult = settled[7];
      if (spotPortfolioResult.status === 'fulfilled') {
        setExecutionPortfolioSpot(spotPortfolioResult.value);
        setExecutionPortfolioSpotError(spotPortfolioResult.value.error ?? null);
      } else {
        const message =
          spotPortfolioResult.reason instanceof Error
            ? spotPortfolioResult.reason.message
            : String(spotPortfolioResult.reason);
        setExecutionPortfolioSpot(null);
        setExecutionPortfolioSpotError(message);
      }

      const bithumbPortfolioResult = settled[8];
      if (bithumbPortfolioResult.status === 'fulfilled') {
        setBithumbPortfolio(bithumbPortfolioResult.value);
        setBithumbExecutionError(bithumbPortfolioResult.value.error ?? null);
      } else {
        const message =
          bithumbPortfolioResult.reason instanceof Error
            ? bithumbPortfolioResult.reason.message
            : String(bithumbPortfolioResult.reason);
        setBithumbExecutionError(message);
      }

      const fillsResult = settled[9];
      if (fillsResult.status === 'fulfilled') {
        setExecutionFills(fillsResult.value.fills);
      } else {
        errors.push(fillsResult.reason instanceof Error ? fillsResult.reason.message : String(fillsResult.reason));
      }

      const bithumbFillsResult = settled[10];
      if (bithumbFillsResult.status === 'fulfilled') {
        setBithumbExecutionFills(bithumbFillsResult.value.fills);
      } else {
        errors.push(
          bithumbFillsResult.reason instanceof Error
            ? bithumbFillsResult.reason.message
            : String(bithumbFillsResult.reason)
        );
      }

      const eventsResult = settled[11];
      if (eventsResult.status === 'fulfilled') {
        setExecutionEvents(eventsResult.value.events);
      } else {
        errors.push(eventsResult.reason instanceof Error ? eventsResult.reason.message : String(eventsResult.reason));
      }

      const eventsAllResult = settled[12];
      if (eventsAllResult.status === 'fulfilled') {
        setExecutionEventsAll(eventsAllResult.value.events);
      } else {
        if (eventsResult.status === 'fulfilled') {
          setExecutionEventsAll(eventsResult.value.events);
        }
        errors.push(eventsAllResult.reason instanceof Error ? eventsAllResult.reason.message : String(eventsAllResult.reason));
      }

      const engineResult = settled[13];
      if (engineResult.status === 'fulfilled') {
        const engineStatus = engineResult.value;
        setExecutionEngineStatus(engineStatus);

        if (!hasLoadedEngineSettingsRef.current) {
          setExecutionBinanceEntrySide(engineStatus.engine.binanceEntrySide === 'long' ? 'long' : 'short');
          setExecutionBinanceMarginMode(engineStatus.engine.binanceMarginMode === 'cross' ? 'cross' : 'isolated');
          setExecutionBinanceLeverageInput(String(Math.max(1, Math.floor(engineStatus.engine.binanceLeverage || 4))));

          const loadedEntryThreshold = engineStatus.engine.entryThreshold;
          const loadedExitThreshold = engineStatus.engine.exitThreshold;
          if (Number.isFinite(loadedEntryThreshold) && Number.isFinite(loadedExitThreshold)) {
            setConfig((prev) => ({
              ...prev,
              entryThreshold: loadedEntryThreshold,
              exitThreshold: loadedExitThreshold,
            }));
          }

          const loadedEntryPct = engineStatus.engine.orderBalancePctEntry;
          if (Number.isFinite(loadedEntryPct) && loadedEntryPct > 0) {
            setExecutionOrderBalancePctEntry(loadedEntryPct);
          }

          hasLoadedEngineSettingsRef.current = true;
        }
      } else {
        errors.push(engineResult.reason instanceof Error ? engineResult.reason.message : String(engineResult.reason));
      }

      if (errors.length > 0) {
        setExecutionError(errors[0]);
      } else {
        setExecutionError(null);
      }

      if (manualRefresh) setIsExecutionRefreshing(false);
    },
    [executionMarketType, executionSymbol]
  );

  // Polling: market data
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

  // Polling: execution data
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      await refreshExecutionData(false);
      if (cancelled) return;

      executionPollingRef.current = window.setInterval(() => {
        void refreshExecutionData(false);
      }, EXECUTION_REFRESH_INTERVAL_MS);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (executionPollingRef.current) {
        clearInterval(executionPollingRef.current);
        executionPollingRef.current = null;
      }
    };
  }, [refreshExecutionData]);

  // Push updates: execution events stream (SSE)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof EventSource === 'undefined') return;

    const streamBase = getApiBaseCandidates()[0] ?? window.location.origin ?? '';
    if (!streamBase) return;

    const params = new URLSearchParams();
    params.set('limit', '10');
    const adminToken = getExecutionAdminToken();
    if (adminToken) {
      params.set('adminToken', adminToken);
    }
    const streamUrl = `${streamBase}/api/execution/events/stream?${params.toString()}`;
    const stream = new EventSource(streamUrl, { withCredentials: true });

    const appendEvent = (
      prev: ExecutionEventsResponse['events'],
      nextEvent: ExecutionRuntimeEvent,
      maxLength: number
    ): ExecutionEventsResponse['events'] => {
      const deduped = prev.filter(
        (item) =>
          !(
            item.timestamp === nextEvent.timestamp &&
            item.event === nextEvent.event &&
            item.level === nextEvent.level
          )
      );
      return [nextEvent, ...deduped].slice(0, maxLength);
    };

    stream.onmessage = (message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }

      if (!parsed || typeof parsed !== 'object') return;
      const parsedRecord = parsed as Record<string, unknown>;
      const timestamp =
        typeof parsedRecord.timestamp === 'number' && Number.isFinite(parsedRecord.timestamp)
          ? parsedRecord.timestamp
          : Date.now();
      const normalizedEvent: ExecutionRuntimeEvent = {
        ...parsedRecord,
        timestamp,
        isoTime:
          typeof parsedRecord.isoTime === 'string'
            ? parsedRecord.isoTime
            : new Date(timestamp).toISOString(),
        level: typeof parsedRecord.level === 'string' ? parsedRecord.level : 'info',
        event:
          typeof parsedRecord.event === 'string' && parsedRecord.event.trim().length > 0
            ? parsedRecord.event
            : 'execution_event_unknown',
      };

      setExecutionEvents((prev) => appendEvent(prev, normalizedEvent, 120));
      setExecutionEventsAll((prev) => appendEvent(prev, normalizedEvent, 240));

      const shouldRefreshImmediately =
        normalizedEvent.event === 'api_execution_binance_order_success' ||
        normalizedEvent.event === 'api_execution_bithumb_order_success' ||
        normalizedEvent.event === 'api_execution_binance_order_dry_run' ||
        normalizedEvent.event === 'api_execution_bithumb_order_dry_run';

      if (shouldRefreshImmediately) {
        const now = Date.now();
        if (now - lastExecutionPushRefreshAtRef.current >= 1500) {
          lastExecutionPushRefreshAtRef.current = now;
          void refreshExecutionData(false);
        }
      }
    };

    stream.onerror = () => {
      // Keep polling as fallback. EventSource retries automatically.
    };

    return () => {
      stream.close();
    };
  }, [refreshExecutionData]);

  const syncDiscordLocalState = useCallback((cfg: DiscordConfigResponse) => {
    setDiscordConfig(cfg);
    if (cfg.notifications) {
      setPremiumAlertEnabled(cfg.notifications.premiumAlertEnabled);
      // Always reflect server-loaded values as-is so saved settings are shown after reload.
      setPremiumAlertThresholds(
        Array.isArray(cfg.notifications.premiumAlertThresholds)
          ? cfg.notifications.premiumAlertThresholds
          : []
      );
      setPeriodicReportEnabled(cfg.notifications.periodicReportEnabled);
      setReportIntervalMinutes(cfg.notifications.reportIntervalMinutes);
    }
  }, []);

  // Fetch discord config on mount
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await fetchDiscordConfig();
        syncDiscordLocalState(cfg);
      } catch (error) {
        const message = error instanceof Error ? error.message : '디스코드 설정 로드 실패';
        setDiscordMessage(`설정 불러오기 실패: ${message}`);
      }
    })();
  }, [syncDiscordLocalState]);

  const handleExecutionEngineToggle = useCallback(async () => {
    if (isEngineSubmitting) return;

    const isEngineRunning = executionEngineStatus?.engine.running ?? false;
    setIsEngineSubmitting(true);

    try {
      if (isEngineRunning) {
        const response = await stopExecutionEngine('ui-stop');
        setExecutionEngineStatus(response);
        setExecutionError(null);
      } else {
        const engineLeverage = Number(executionBinanceLeverageInput);

        if (!executionDryRun && !executionStatus?.connected) {
          setExecutionError('실주문 모드에서는 먼저 바이낸스 연결 상태가 connected=true 여야 합니다.');
          return;
        }

        if (!Number.isFinite(engineLeverage) || engineLeverage < 1 || engineLeverage > 125) {
          setExecutionError('자동매매 바이낸스 배율은 1~125 사이로 입력하세요.');
          return;
        }

        if (!Number.isFinite(executionOrderBalancePctEntry) || executionOrderBalancePctEntry <= 0 || executionOrderBalancePctEntry > 100) {
          setExecutionError('진입 주문 비율(%)을 0~100 사이로 입력하세요.');
          return;
        }

        if (!Number.isFinite(config.entryThreshold) || !Number.isFinite(config.exitThreshold)) {
          setExecutionError('진입/청산 김프율(%)을 숫자로 입력하세요.');
          return;
        }

        if (config.entryThreshold >= config.exitThreshold) {
          setExecutionError('진입 기준은 청산 기준보다 낮아야 합니다. (저김프 진입 / 고김프 청산)');
          return;
        }

        const readiness = await fetchExecutionEngineReadiness({
          mode: executionDryRun ? 'dryrun' : 'live',
          marketType: executionMarketType,
          symbol: executionSymbol.trim() || defaultSymbolByMarketType(executionMarketType),
        });
        setExecutionReadiness(readiness);
        const blocking = readiness.checks.find((check) => !check.ok && check.severity === 'error');
        if (blocking) {
          setExecutionError(`실행 준비도 실패: ${blocking.message}`);
          return;
        }

        const response = await startExecutionEngine({
          marketType: executionMarketType,
          symbol: executionSymbol.trim() || defaultSymbolByMarketType(executionMarketType),
          binanceEntrySide: executionBinanceEntrySide,
          binanceLeverage: Math.floor(engineLeverage),
          binanceMarginMode: executionBinanceMarginMode,
          dryRun: executionDryRun,
          premiumBasis: 'USD',
          entryThreshold: config.entryThreshold,
          exitThreshold: config.exitThreshold,
          orderBalancePctEntry: executionOrderBalancePctEntry,
          orderBalancePctExit: 100,
        });
        setExecutionEngineStatus(response);
        setExecutionError(null);
      }

      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
      await refreshExecutionData(false);
    } finally {
      setIsEngineSubmitting(false);
    }
  }, [
    config.entryThreshold,
    config.exitThreshold,
    executionBinanceEntrySide,
    executionBinanceLeverageInput,
    executionBinanceMarginMode,
    executionDryRun,
    executionEngineStatus?.engine.running,
    executionMarketType,
    executionOrderBalancePctEntry,
    executionStatus?.connected,
    executionSymbol,
    isEngineSubmitting,
    refreshExecutionData,
  ]);


  const handleSaveBinanceCredentials = useCallback(async () => {
    if (isCredentialSubmitting) return;
    if (!executionApiKeyInput.trim() || !executionApiSecretInput.trim()) {
      setExecutionError('바이낸스 API 키와 시크릿을 입력하세요.');
      return;
    }

    setIsCredentialSubmitting(true);
    try {
      const response = await updateExecutionCredentials({
        apiKey: executionApiKeyInput.trim(),
        apiSecret: executionApiSecretInput.trim(),
        persist: executionCredentialPersist,
      });
      setExecutionCredentialsStatus(response);
      setExecutionApiKeyInput('');
      setExecutionApiSecretInput('');
      setExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
    } finally {
      setIsCredentialSubmitting(false);
    }
  }, [
    executionApiKeyInput,
    executionApiSecretInput,
    executionCredentialPersist,
    isCredentialSubmitting,
    refreshExecutionData,
  ]);

  const handleSaveBithumbCredentials = useCallback(async () => {
    if (isCredentialSubmitting) return;
    if (!bithumbApiKeyInput.trim() || !bithumbApiSecretInput.trim()) {
      setBithumbExecutionError('빗썸 API 키와 시크릿을 입력하세요.');
      return;
    }

    setIsCredentialSubmitting(true);
    try {
      const response = await updateExecutionCredentials({
        bithumbApiKey: bithumbApiKeyInput.trim(),
        bithumbApiSecret: bithumbApiSecretInput.trim(),
        persist: executionCredentialPersist,
      });
      setExecutionCredentialsStatus(response);
      setBithumbApiKeyInput('');
      setBithumbApiSecretInput('');
      setBithumbExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBithumbExecutionError(message);
    } finally {
      setIsCredentialSubmitting(false);
    }
  }, [
    bithumbApiKeyInput,
    bithumbApiSecretInput,
    executionCredentialPersist,
    isCredentialSubmitting,
    refreshExecutionData,
  ]);

  const handleClearBinanceCredentials = useCallback(async () => {
    if (isCredentialSubmitting) return;
    if (!window.confirm('바이낸스 런타임 API 키를 삭제할까요? (환경변수 키는 삭제되지 않습니다)')) return;

    setIsCredentialSubmitting(true);
    try {
      const response = await clearExecutionCredentials('binance');
      setExecutionCredentialsStatus(response);
      setExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
    } finally {
      setIsCredentialSubmitting(false);
    }
  }, [isCredentialSubmitting, refreshExecutionData]);

  const handleClearBithumbCredentials = useCallback(async () => {
    if (isCredentialSubmitting) return;
    if (!window.confirm('빗썸 런타임 API 키를 삭제할까요? (환경변수 키는 삭제되지 않습니다)')) return;

    setIsCredentialSubmitting(true);
    try {
      const response = await clearExecutionCredentials('bithumb');
      setExecutionCredentialsStatus(response);
      setBithumbExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBithumbExecutionError(message);
    } finally {
      setIsCredentialSubmitting(false);
    }
  }, [isCredentialSubmitting, refreshExecutionData]);

  const handleResetExecutionSafety = useCallback(async () => {
    try {
      const response = await resetExecutionSafety('ui-manual-reset');
      setExecutionSafety(response);
      setExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
    }
  }, [refreshExecutionData]);

  const handleToggleLiveOrders = useCallback(async (nextValue: boolean) => {
    if (isOrderPolicySubmitting) return;
    if (nextValue) {
      if (!window.confirm('실주문을 허용할까요? 드라이런 해제 시 실제 주문이 나갑니다.')) {
        return;
      }
    }

    setIsOrderPolicySubmitting(true);
    try {
      const response = await updateExecutionOrderPolicy({ allowLiveOrders: nextValue });
      setExecutionSafety(response);
      setExecutionError(null);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
    } finally {
      setIsOrderPolicySubmitting(false);
    }
  }, [isOrderPolicySubmitting, refreshExecutionData]);

  const handleCheckExecutionReadiness = useCallback(async () => {
    if (isReadinessChecking) return;
    setIsReadinessChecking(true);
    try {
      const response = await fetchExecutionEngineReadiness({
        mode: executionDryRun ? 'dryrun' : 'live',
        marketType: executionMarketType,
        symbol: executionSymbol.trim() || defaultSymbolByMarketType(executionMarketType),
      });
      setExecutionReadiness(response);
      setExecutionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecutionError(message);
    } finally {
      setIsReadinessChecking(false);
    }
  }, [executionDryRun, executionMarketType, executionSymbol, isReadinessChecking]);

  const handleBinanceManualBuy = useCallback(async () => {
    if (binanceManualSubmitting) return;

    const symbol = binanceManualSymbol.trim() || defaultSymbolByMarketType(binanceManualMarketType);
    const side = binanceManualDirection === 'long' ? 'buy' : 'sell';
    const amount = Number(binanceManualAmountInput);
    const balancePct = Number(binanceManualBalancePctInput);
    const leverage = Number(binanceManualLeverageInput);
    const liveAllowed = executionSafety?.safety?.orderExecution?.allowLiveOrders ?? false;
    const isLimitOrder = binanceManualOrderType === 'limit';
    const limitPrice = Number(binanceManualPriceInput);

    if (isLimitOrder && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
      setBinanceManualError('지정가 주문은 가격을 0보다 크게 입력하세요.');
      return;
    }

    if (!Number.isFinite(leverage) || leverage < 1 || leverage > 125) {
      setBinanceManualError('배율은 1~125 사이 숫자로 입력하세요. (기본 4)');
      return;
    }

    if (!binanceManualDryRun && !liveAllowed) {
      setBinanceManualError('실주문 허용이 꺼져 있습니다. 자동매매 실행 설정에서 실주문 허용을 켜거나 드라이런을 사용하세요.');
      return;
    }

    const useExplicitAmount = Number.isFinite(amount) && amount > 0;
    const useBalancePct = Number.isFinite(balancePct) && balancePct > 0 && balancePct <= 100;
    if (!useExplicitAmount && !useBalancePct) {
      setBinanceManualError('수량(0초과) 또는 잔고 비율(0~100%) 중 하나를 입력하세요.');
      return;
    }

    setBinanceManualSubmitting(true);
    setBinanceManualError(null);

    try {
      const response = await placeBinanceExecutionOrder({
        marketType: binanceManualMarketType,
        symbol,
        side,
        type: binanceManualOrderType,
        amount: useExplicitAmount ? amount : undefined,
        balancePct: useExplicitAmount ? undefined : balancePct,
        price: isLimitOrder ? limitPrice : undefined,
        leverage: Math.floor(leverage),
        marginMode: binanceManualMarginMode,
        dryRun: binanceManualDryRun,
        allowInSafeMode: binanceManualAllowInSafeMode,
        idempotencyKey: binanceManualDryRun ? undefined : buildManualIdempotencyKey('ui-binance-buy'),
      });
      setBinanceManualResult(response);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBinanceManualError(message);
    } finally {
      setBinanceManualSubmitting(false);
    }
  }, [
    binanceManualAllowInSafeMode,
    binanceManualAmountInput,
    binanceManualBalancePctInput,
    binanceManualDirection,
    binanceManualDryRun,
    binanceManualLeverageInput,
    binanceManualMarginMode,
    binanceManualMarketType,
    binanceManualOrderType,
    binanceManualPriceInput,
    binanceManualSubmitting,
    binanceManualSymbol,
    executionSafety?.safety?.orderExecution?.allowLiveOrders,
    refreshExecutionData,
  ]);

  const handleBinanceManualClosePosition = useCallback(async () => {
    if (binanceManualSubmitting) return;

    const symbol = binanceManualSymbol.trim() || defaultSymbolByMarketType(binanceManualMarketType);
    const liveAllowed = executionSafety?.safety?.orderExecution?.allowLiveOrders ?? false;

    if (!binanceManualDryRun && !liveAllowed) {
      setBinanceManualError('실주문 허용이 꺼져 있습니다. 자동매매 실행 설정에서 실주문 허용을 켜거나 드라이런을 사용하세요.');
      return;
    }

    setBinanceManualSubmitting(true);
    setBinanceManualError(null);

    try {
      const positionResponse = await fetchExecutionPosition(binanceManualMarketType, symbol);
      if (!positionResponse.hasPosition || !positionResponse.position) {
        setBinanceManualError('현재 정리할 포지션이 없습니다.');
        return;
      }

      const positionContracts = Number(positionResponse.position.contracts ?? NaN);
      if (!Number.isFinite(positionContracts) || positionContracts <= 0) {
        setBinanceManualError('포지션 수량을 확인할 수 없어 정리를 진행할 수 없습니다.');
        return;
      }

      const rawSide = String(positionResponse.position.side ?? '').toLowerCase();
      const closeSide: 'buy' | 'sell' =
        rawSide.includes('short') || rawSide.includes('sell') ? 'buy' : 'sell';

      const response = await placeBinanceExecutionOrder({
        marketType: binanceManualMarketType,
        symbol,
        side: closeSide,
        type: 'market',
        amount: positionContracts,
        dryRun: binanceManualDryRun,
        allowInSafeMode: binanceManualAllowInSafeMode,
        reduceOnly: true,
        idempotencyKey: binanceManualDryRun ? undefined : buildManualIdempotencyKey('ui-binance-close'),
      });
      setBinanceManualResult(response);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBinanceManualError(message);
    } finally {
      setBinanceManualSubmitting(false);
    }
  }, [
    binanceManualAllowInSafeMode,
    binanceManualDryRun,
    binanceManualMarketType,
    binanceManualSubmitting,
    binanceManualSymbol,
    executionSafety?.safety?.orderExecution?.allowLiveOrders,
    refreshExecutionData,
  ]);

  const handleBithumbManualBuy = useCallback(async () => {
    if (bithumbManualSubmitting) return;

    const symbol = bithumbManualSymbol.trim() || 'BTC/KRW';
    const amount = Number(bithumbManualAmountInput);
    const balancePct = Number(bithumbManualBalancePctInput);
    const liveAllowed = executionSafety?.safety?.orderExecution?.allowLiveOrders ?? false;
    const isLimitOrder = bithumbManualOrderType === 'limit';
    const limitPrice = Number(bithumbManualPriceInput);

    const useExplicitAmount = Number.isFinite(amount) && amount > 0;
    const useBalancePct = Number.isFinite(balancePct) && balancePct > 0 && balancePct <= 100;
    if (!useExplicitAmount && !useBalancePct) {
      setBithumbManualError('수량(0초과) 또는 잔고 비율(0~100%) 중 하나를 입력하세요.');
      return;
    }

    if (isLimitOrder && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
      setBithumbManualError('지정가 주문은 가격을 0보다 크게 입력하세요.');
      return;
    }

    if (!bithumbManualDryRun && !liveAllowed) {
      setBithumbManualError('실주문 허용이 꺼져 있습니다. 자동매매 실행 설정에서 실주문 허용을 켜거나 드라이런을 사용하세요.');
      return;
    }

    setBithumbManualSubmitting(true);
    setBithumbManualError(null);

    try {
      const response = await placeBithumbExecutionOrder({
        symbol,
        side: 'buy',
        type: bithumbManualOrderType,
        amount: useExplicitAmount ? amount : undefined,
        balancePct: useExplicitAmount ? undefined : balancePct,
        price: isLimitOrder ? limitPrice : undefined,
        dryRun: bithumbManualDryRun,
        allowInSafeMode: bithumbManualAllowInSafeMode,
        idempotencyKey: bithumbManualDryRun ? undefined : buildManualIdempotencyKey('ui-bithumb-buy'),
      });
      setBithumbManualResult(response);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBithumbManualError(message);
    } finally {
      setBithumbManualSubmitting(false);
    }
  }, [
    bithumbManualAllowInSafeMode,
    bithumbManualAmountInput,
    bithumbManualBalancePctInput,
    bithumbManualDryRun,
    bithumbManualOrderType,
    bithumbManualPriceInput,
    bithumbManualSubmitting,
    bithumbManualSymbol,
    executionSafety?.safety?.orderExecution?.allowLiveOrders,
    refreshExecutionData,
  ]);

  const handleBithumbManualClosePosition = useCallback(async () => {
    if (bithumbManualSubmitting) return;

    const symbol = bithumbManualSymbol.trim() || 'BTC/KRW';
    const liveAllowed = executionSafety?.safety?.orderExecution?.allowLiveOrders ?? false;

    if (!bithumbManualDryRun && !liveAllowed) {
      setBithumbManualError('실주문 허용이 꺼져 있습니다. 자동매매 실행 설정에서 실주문 허용을 켜거나 드라이런을 사용하세요.');
      return;
    }

    const btcWalletRow = (bithumbPortfolio?.walletBalances ?? []).find(
      (row) => String(row.asset ?? '').toUpperCase() === 'BTC'
    );
    const freeBtc = Number(btcWalletRow?.free);
    if (!bithumbManualDryRun && Number.isFinite(freeBtc) && freeBtc <= 0) {
      setBithumbManualError('현재 정리할 빗썸 BTC 현물 잔고가 없습니다.');
      return;
    }

    setBithumbManualSubmitting(true);
    setBithumbManualError(null);

    try {
      const response = await placeBithumbExecutionOrder({
        symbol,
        side: 'sell',
        type: 'market',
        balancePct: 100,
        dryRun: bithumbManualDryRun,
        allowInSafeMode: bithumbManualAllowInSafeMode,
        idempotencyKey: bithumbManualDryRun ? undefined : buildManualIdempotencyKey('ui-bithumb-close'),
      });
      setBithumbManualResult(response);
      await refreshExecutionData(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBithumbManualError(message);
    } finally {
      setBithumbManualSubmitting(false);
    }
  }, [
    bithumbManualAllowInSafeMode,
    bithumbManualDryRun,
    bithumbManualSubmitting,
    bithumbManualSymbol,
    bithumbPortfolio?.walletBalances,
    executionSafety?.safety?.orderExecution?.allowLiveOrders,
    refreshExecutionData,
  ]);

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

  const apiBaseCandidates = useMemo(() => getApiBaseCandidates(), []);
  const primaryApiBase = apiBaseCandidates[0] ?? '';
  const apiBaseLabel = primaryApiBase || '미설정';
  const apiBaseIsLocal =
    primaryApiBase.includes('localhost') ||
    primaryApiBase.includes('127.0.0.1') ||
    primaryApiBase.includes('::1');

  const effectiveConversionRate = currentData
    ? currentData.conversionRate ?? currentData.exchangeRate ?? DEFAULT_EXCHANGE_RATE
    : DEFAULT_EXCHANGE_RATE;

  const normalizedGlobalKrwPrice = currentData
    ? currentData.normalizedGlobalKrwPrice ?? currentData.usdPrice * effectiveConversionRate
    : 0;

  const executionConnected = executionStatus?.connected ?? false;

  const executionConfigured = executionStatus?.configured ?? false;
  const executionCredentialSource =
    executionCredentialsStatus?.credentials.source ??
    executionStatus?.credentialSource ??
    'none';
  const executionCredentialHint =
    executionCredentialsStatus?.credentials.keyHint ??
    executionStatus?.credentialKeyHint ??
    null;
  const executionCredentialUpdatedAt =
    executionCredentialsStatus?.credentials.updatedAt ??
    executionStatus?.credentialUpdatedAt ??
    null;
  const executionCredentialPersisted =
    executionCredentialsStatus?.credentials.persisted ??
    executionStatus?.credentialPersisted ??
    false;

  const bithumbConfigured = executionCredentialsStatus?.credentials.bithumb?.configured ?? false;
  const bithumbCredentialSource = executionCredentialsStatus?.credentials.bithumb?.source ?? 'none';
  const bithumbCredentialHint = executionCredentialsStatus?.credentials.bithumb?.keyHint;
  const bithumbCredentialUpdatedAt = executionCredentialsStatus?.credentials.bithumb?.updatedAt;
  const bithumbCredentialPersisted = executionCredentialsStatus?.credentials.bithumb?.persisted ?? false;

  const executionSafeMode = executionSafety?.safety?.safeMode ?? false;
  const executionLiveOrdersAllowed = executionSafety?.safety?.orderExecution?.allowLiveOrders ?? false;
  const isPlaying = executionEngineStatus?.engine.running ?? false;
  const enginePositionState = executionEngineStatus?.engine.positionState ?? 'IDLE';
  const engineLastPremium = executionEngineStatus?.engine.lastPremium ?? null;
  const executionPortfolioSummary = executionPortfolio?.summary;
  const bithumbPortfolioSummary = bithumbPortfolio?.summary;
  const bithumbPortfolioConnected = bithumbPortfolio?.connected ?? false;
  const bithumbPortfolioConfigured = bithumbPortfolio?.configured ?? false;
  const bithumbPortfolioError = bithumbPortfolio?.error ?? null;
  const executionPortfolioBalanceAsset =
    executionPortfolio?.balanceAsset ??
    executionStatus?.balance?.asset ??
    (executionMarketType === 'usdm' ? 'USDT' : 'BTC');
  const executionWalletFree =
    executionPortfolioSummary?.walletAssetFree ??
    executionStatus?.balance?.free ??
    null;
  const executionBalanceText =
    `${executionPortfolioBalanceAsset} ${formatNullableNumber(executionWalletFree, 8)}`;
  const binancePortfolioCoinm =
    executionPortfolioCoinm ??
    (executionPortfolio?.marketType === 'coinm' ? executionPortfolio : null);
  const binancePortfolioUsdm =
    executionPortfolioUsdm ??
    (executionPortfolio?.marketType === 'usdm' ? executionPortfolio : null);
  const binancePortfolioSpot = executionPortfolioSpot;
  const binanceCoinmSummary = binancePortfolioCoinm?.summary;
  const binanceUsdmSummary = binancePortfolioUsdm?.summary;
  const binanceSpotSummary = binancePortfolioSpot?.summary;
  const binanceCoinmConnected = binancePortfolioCoinm?.connected ?? false;
  const binanceCoinmConfigured = binancePortfolioCoinm?.configured ?? false;
  const binanceUsdmConnected = binancePortfolioUsdm?.connected ?? false;
  const binanceUsdmConfigured = binancePortfolioUsdm?.configured ?? false;
  const binanceSpotConnected = binancePortfolioSpot?.connected ?? false;
  const binanceSpotConfigured = binancePortfolioSpot?.configured ?? false;
  const binanceCoinmError =
    executionPortfolioCoinmError ?? binancePortfolioCoinm?.error ?? null;
  const binanceUsdmError =
    executionPortfolioUsdmError ?? binancePortfolioUsdm?.error ?? null;
  const binanceSpotError =
    executionPortfolioSpotError ?? binancePortfolioSpot?.error ?? null;
  const binanceCoinmTotal = binanceCoinmSummary?.walletAssetTotal ?? null;
  const binanceCoinmFree = binanceCoinmSummary?.walletAssetFree ?? null;
  const binanceCoinmPositions = binanceCoinmSummary?.activePositionCount ?? 0;
  const binanceUsdmTotal = binanceUsdmSummary?.walletAssetTotal ?? null;
  const binanceUsdmFree = binanceUsdmSummary?.walletAssetFree ?? null;
  const binanceUsdmPositions = binanceUsdmSummary?.activePositionCount ?? 0;
  const binanceSpotPositions = binanceSpotSummary?.activePositionCount ?? 0;
  const binanceSpotBalances = binancePortfolioSpot?.walletBalances ?? [];
  const usdtKrwForPortfolio = currentData?.usdtKrwRate ?? currentData?.exchangeRate ?? null;
  const binanceSpotUsdtTotal =
    binanceSpotBalances.find((row) => row.asset.toUpperCase() === 'USDT')?.total ?? null;
  const binanceSpotBtcTotal =
    binanceSpotBalances.find((row) => row.asset.toUpperCase() === 'BTC')?.total ?? null;
  const binanceSpotKrwTotal =
    binanceSpotBalances.find((row) => row.asset.toUpperCase() === 'KRW')?.total ?? null;
  const binanceSpotUsdtKrw =
    binanceSpotUsdtTotal != null && Number.isFinite(usdtKrwForPortfolio ?? NaN)
      ? binanceSpotUsdtTotal * (usdtKrwForPortfolio ?? 0)
      : null;
  const binanceSpotBtcKrw =
    binanceSpotBtcTotal != null && Number.isFinite(currentData?.krwPrice ?? NaN)
      ? binanceSpotBtcTotal * (currentData?.krwPrice ?? 0)
      : null;
  const binanceSpotKrwValue =
    binanceSpotKrwTotal != null && Number.isFinite(binanceSpotKrwTotal)
      ? binanceSpotKrwTotal
      : null;
  const binanceCoinmKrw =
    binanceCoinmTotal != null && Number.isFinite(currentData?.krwPrice ?? NaN)
      ? binanceCoinmTotal * (currentData?.krwPrice ?? 0)
      : null;
  const binanceUsdmKrw =
    binanceUsdmTotal != null && Number.isFinite(usdtKrwForPortfolio ?? NaN)
      ? binanceUsdmTotal * (usdtKrwForPortfolio ?? 0)
      : null;
  const hasBinanceSpotUsdtKrw = Number.isFinite(binanceSpotUsdtKrw ?? NaN);
  const hasBinanceSpotBtcKrw = Number.isFinite(binanceSpotBtcKrw ?? NaN);
  const hasBinanceSpotKrwValue = Number.isFinite(binanceSpotKrwValue ?? NaN);
  const binanceSpotCombinedKrw =
    hasBinanceSpotUsdtKrw || hasBinanceSpotBtcKrw || hasBinanceSpotKrwValue
      ? (hasBinanceSpotUsdtKrw ? Number(binanceSpotUsdtKrw) : 0) +
      (hasBinanceSpotBtcKrw ? Number(binanceSpotBtcKrw) : 0) +
      (hasBinanceSpotKrwValue ? Number(binanceSpotKrwValue) : 0)
      : null;
  const hasBinanceCoinmKrw = Number.isFinite(binanceCoinmKrw ?? NaN);
  const hasBinanceUsdmKrw = Number.isFinite(binanceUsdmKrw ?? NaN);
  const binanceFuturesCombinedKrw =
    hasBinanceCoinmKrw || hasBinanceUsdmKrw
      ? (hasBinanceCoinmKrw ? Number(binanceCoinmKrw) : 0) +
      (hasBinanceUsdmKrw ? Number(binanceUsdmKrw) : 0)
      : null;
  const hasBinanceFuturesCombinedKrw = Number.isFinite(binanceFuturesCombinedKrw ?? NaN);
  const hasBinanceSpotCombinedKrw = Number.isFinite(binanceSpotCombinedKrw ?? NaN);
  const binanceCombinedKrw =
    hasBinanceFuturesCombinedKrw || hasBinanceSpotCombinedKrw
      ? (hasBinanceFuturesCombinedKrw ? Number(binanceFuturesCombinedKrw) : 0) +
      (hasBinanceSpotCombinedKrw ? Number(binanceSpotCombinedKrw) : 0)
      : null;
  const bithumbBalances = bithumbPortfolio?.walletBalances ?? [];
  const bithumbKrwAssetTotal =
    bithumbBalances.find((row) => row.asset.toUpperCase() === 'KRW')?.total ?? null;
  const bithumbBtcTotal =
    bithumbBalances.find((row) => row.asset.toUpperCase() === 'BTC')?.total ?? null;
  const bithumbBtcFree =
    bithumbBalances.find((row) => row.asset.toUpperCase() === 'BTC')?.free ?? null;
  const bithumbUsdtTotal =
    bithumbBalances.find((row) => row.asset.toUpperCase() === 'USDT')?.total ?? null;
  const bithumbKrwTotal =
    bithumbPortfolioSummary?.walletAssetTotal ??
    bithumbKrwAssetTotal ??
    null;
  const bithumbKrwFree =
    bithumbPortfolioSummary?.walletAssetFree ??
    (bithumbBalances.find((row) => row.asset.toUpperCase() === 'KRW')?.free ?? null);
  const bithumbBtcKrw =
    bithumbBtcTotal != null && Number.isFinite(currentData?.krwPrice ?? NaN)
      ? bithumbBtcTotal * (currentData?.krwPrice ?? 0)
      : null;
  const bithumbUsdtKrw =
    bithumbUsdtTotal != null && Number.isFinite(usdtKrwForPortfolio ?? NaN)
      ? bithumbUsdtTotal * (usdtKrwForPortfolio ?? 0)
      : null;
  const hasBithumbKrwCash = Number.isFinite(bithumbKrwTotal ?? NaN);
  const hasBithumbBtcKrw = Number.isFinite(bithumbBtcKrw ?? NaN);
  const hasBithumbUsdtKrw = Number.isFinite(bithumbUsdtKrw ?? NaN);
  const bithumbCombinedKrw =
    hasBithumbKrwCash || hasBithumbBtcKrw || hasBithumbUsdtKrw
      ? (hasBithumbKrwCash ? Number(bithumbKrwTotal) : 0) +
      (hasBithumbBtcKrw ? Number(bithumbBtcKrw) : 0) +
      (hasBithumbUsdtKrw ? Number(bithumbUsdtKrw) : 0)
      : null;
  const hasBinanceCombinedKrw = Number.isFinite(binanceCombinedKrw ?? NaN);
  const hasBithumbCombinedKrw = Number.isFinite(bithumbCombinedKrw ?? NaN);
  const totalPortfolioKrw =
    hasBinanceCombinedKrw || hasBithumbCombinedKrw
      ? (hasBinanceCombinedKrw ? Number(binanceCombinedKrw) : 0) +
      (hasBithumbCombinedKrw ? Number(bithumbCombinedKrw) : 0)
      : null;
  const executionEntryPctClamped =
    Number.isFinite(executionOrderBalancePctEntry) && executionOrderBalancePctEntry > 0
      ? Math.min(100, Number(executionOrderBalancePctEntry))
      : null;
  const executionEntryPctFactor =
    Number.isFinite(executionEntryPctClamped ?? NaN) && Number(executionEntryPctClamped) > 0
      ? Number(executionEntryPctClamped) / 100
      : null;
  const executionLeverageNumber = Number(executionBinanceLeverageInput);
  const hasExecutionLeverage =
    Number.isFinite(executionLeverageNumber) && executionLeverageNumber > 0;
  const engineUsdPrice =
    Number.isFinite(currentData?.usdPrice ?? NaN) && Number(currentData?.usdPrice) > 0
      ? Number(currentData?.usdPrice)
      : null;
  const engineKrwPrice =
    Number.isFinite(currentData?.krwPrice ?? NaN) && Number(currentData?.krwPrice) > 0
      ? Number(currentData?.krwPrice)
      : null;
  const estimatedBinanceSpotBtcAt100 =
    executionMarketType === 'usdm'
      ? Number.isFinite(binanceUsdmFree ?? NaN) && hasExecutionLeverage && Number.isFinite(engineUsdPrice ?? NaN)
        ? (Number(binanceUsdmFree) * executionLeverageNumber) / Number(engineUsdPrice)
        : null
      : Number.isFinite(binanceCoinmFree ?? NaN) && hasExecutionLeverage
        ? Number(binanceCoinmFree) * executionLeverageNumber
        : null;
  const estimatedBinanceSpotBtcForEntryPct =
    Number.isFinite(estimatedBinanceSpotBtcAt100 ?? NaN) && Number.isFinite(executionEntryPctFactor ?? NaN)
      ? Number(estimatedBinanceSpotBtcAt100) * Number(executionEntryPctFactor)
      : null;
  const estimatedBinanceNotionalUsdAt100 =
    Number.isFinite(estimatedBinanceSpotBtcAt100 ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(estimatedBinanceSpotBtcAt100) * Number(engineUsdPrice)
      : null;
  const estimatedBinanceNotionalUsdForEntryPct =
    Number.isFinite(estimatedBinanceSpotBtcForEntryPct ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(estimatedBinanceSpotBtcForEntryPct) * Number(engineUsdPrice)
      : null;
  const bithumbEntrySideForAuto = executionBinanceEntrySide === 'short' ? 'buy' : 'sell';
  const estimatedBithumbSpotCapacityBtc =
    bithumbEntrySideForAuto === 'buy'
      ? Number.isFinite(bithumbKrwFree ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
        ? Number(bithumbKrwFree) / Number(engineKrwPrice)
        : null
      : Number.isFinite(bithumbBtcFree ?? NaN)
        ? Number(bithumbBtcFree)
        : null;
  const estimatedHedgeBtcAt100 =
    Number.isFinite(estimatedBinanceSpotBtcAt100 ?? NaN) && Number.isFinite(estimatedBithumbSpotCapacityBtc ?? NaN)
      ? Math.min(Number(estimatedBinanceSpotBtcAt100), Number(estimatedBithumbSpotCapacityBtc))
      : null;
  const estimatedHedgeBtcForEntryPct =
    Number.isFinite(estimatedHedgeBtcAt100 ?? NaN) && Number.isFinite(executionEntryPctFactor ?? NaN)
      ? Number(estimatedHedgeBtcAt100) * Number(executionEntryPctFactor)
      : null;
  const estimatedHedgeNotionalUsdAt100 =
    Number.isFinite(estimatedHedgeBtcAt100 ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(estimatedHedgeBtcAt100) * Number(engineUsdPrice)
      : null;
  const estimatedHedgeNotionalUsdForEntryPct =
    Number.isFinite(estimatedHedgeBtcForEntryPct ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(estimatedHedgeBtcForEntryPct) * Number(engineUsdPrice)
      : null;
  const estimatedHedgeKrwAt100 =
    Number.isFinite(estimatedHedgeBtcAt100 ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(estimatedHedgeBtcAt100) * Number(engineKrwPrice)
      : null;
  const estimatedHedgeKrwForEntryPct =
    Number.isFinite(estimatedHedgeBtcForEntryPct ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(estimatedHedgeBtcForEntryPct) * Number(engineKrwPrice)
      : null;
  const estimatedHedgeClampRatio =
    Number.isFinite(estimatedBinanceSpotBtcAt100 ?? NaN) &&
      Number(estimatedBinanceSpotBtcAt100) > 0 &&
      Number.isFinite(estimatedHedgeBtcAt100 ?? NaN)
      ? Number(estimatedHedgeBtcAt100) / Number(estimatedBinanceSpotBtcAt100)
      : null;
  const estimatedHedgeLimitSource =
    Number.isFinite(estimatedHedgeClampRatio ?? NaN) && Number(estimatedHedgeClampRatio) < 0.999
      ? '빗썸 잔고 제한'
      : '바이낸스 설정 비율 기준';
  const estimatedEffectiveBinanceMarginUsedForEntryPct =
    executionMarketType === 'usdm'
      ? Number.isFinite(estimatedHedgeNotionalUsdForEntryPct ?? NaN) && hasExecutionLeverage
        ? Number(estimatedHedgeNotionalUsdForEntryPct) / executionLeverageNumber
        : null
      : Number.isFinite(estimatedHedgeBtcForEntryPct ?? NaN) && hasExecutionLeverage
        ? Number(estimatedHedgeBtcForEntryPct) / executionLeverageNumber
        : null;
  const estimatedBinanceMarginAt100 =
    executionMarketType === 'usdm'
      ? Number.isFinite(binanceUsdmFree ?? NaN)
        ? Number(binanceUsdmFree)
        : null
      : Number.isFinite(binanceCoinmFree ?? NaN)
        ? Number(binanceCoinmFree)
        : null;
  const estimatedEffectiveEntryPctOnBinance =
    Number.isFinite(estimatedEffectiveBinanceMarginUsedForEntryPct ?? NaN) &&
      Number.isFinite(estimatedBinanceMarginAt100 ?? NaN) &&
      Number(estimatedBinanceMarginAt100) > 0
      ? (Number(estimatedEffectiveBinanceMarginUsedForEntryPct) / Number(estimatedBinanceMarginAt100)) * 100
      : null;
  const hasEstimatedHedgePreview =
    Number.isFinite(estimatedHedgeBtcForEntryPct ?? NaN) &&
    Number.isFinite(estimatedHedgeNotionalUsdForEntryPct ?? NaN) &&
    Number.isFinite(estimatedHedgeKrwForEntryPct ?? NaN);
  const autoBinanceAvailableAsset = executionMarketType === 'usdm' ? 'USDT' : 'BTC';
  const autoBinanceAvailableValue =
    executionMarketType === 'usdm'
      ? Number.isFinite(binanceUsdmFree ?? NaN)
        ? Number(binanceUsdmFree)
        : null
      : Number.isFinite(binanceCoinmFree ?? NaN)
        ? Number(binanceCoinmFree)
        : null;
  const autoBinanceAvailableKrw =
    executionMarketType === 'usdm'
      ? Number.isFinite(autoBinanceAvailableValue ?? NaN) && Number.isFinite(usdtKrwForPortfolio ?? NaN)
        ? Number(autoBinanceAvailableValue) * Number(usdtKrwForPortfolio)
        : null
      : Number.isFinite(autoBinanceAvailableValue ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
        ? Number(autoBinanceAvailableValue) * Number(engineKrwPrice)
        : null;
  const autoBithumbAvailableEntryAsset = bithumbEntrySideForAuto === 'buy' ? 'KRW' : 'BTC';
  const autoBithumbAvailableEntryValue =
    autoBithumbAvailableEntryAsset === 'KRW'
      ? Number.isFinite(bithumbKrwFree ?? NaN)
        ? Number(bithumbKrwFree)
        : null
      : Number.isFinite(bithumbBtcFree ?? NaN)
        ? Number(bithumbBtcFree)
        : null;
  const autoBithumbAvailableEntryKrw =
    autoBithumbAvailableEntryAsset === 'KRW'
      ? autoBithumbAvailableEntryValue
      : Number.isFinite(autoBithumbAvailableEntryValue ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
        ? Number(autoBithumbAvailableEntryValue) * Number(engineKrwPrice)
        : null;
  const binanceManualLeverageValue = Number(binanceManualLeverageInput);
  const binanceManualHasLeverage =
    Number.isFinite(binanceManualLeverageValue) && binanceManualLeverageValue > 0;
  const binanceManualBalancePctValue = Number(binanceManualBalancePctInput);
  const binanceManualBalancePctClamped =
    Number.isFinite(binanceManualBalancePctValue) && binanceManualBalancePctValue > 0
      ? Math.min(100, binanceManualBalancePctValue)
      : null;
  const binanceManualBalancePctFactor =
    Number.isFinite(binanceManualBalancePctClamped ?? NaN) && Number(binanceManualBalancePctClamped) > 0
      ? Number(binanceManualBalancePctClamped) / 100
      : null;
  const binanceManualAvailableAsset = binanceManualMarketType === 'usdm' ? 'USDT' : 'BTC';
  const binanceManualAvailableMargin =
    binanceManualMarketType === 'usdm'
      ? Number.isFinite(binanceUsdmFree ?? NaN)
        ? Number(binanceUsdmFree)
        : null
      : Number.isFinite(binanceCoinmFree ?? NaN)
        ? Number(binanceCoinmFree)
        : null;
  const binanceManualAvailableMarginKrw =
    binanceManualMarketType === 'usdm'
      ? Number.isFinite(binanceManualAvailableMargin ?? NaN) && Number.isFinite(usdtKrwForPortfolio ?? NaN)
        ? Number(binanceManualAvailableMargin) * Number(usdtKrwForPortfolio)
        : null
      : Number.isFinite(binanceManualAvailableMargin ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
        ? Number(binanceManualAvailableMargin) * Number(engineKrwPrice)
        : null;
  const binanceManualBtcAt100 =
    binanceManualMarketType === 'usdm'
      ? Number.isFinite(binanceManualAvailableMargin ?? NaN) &&
        binanceManualHasLeverage &&
        Number.isFinite(engineUsdPrice ?? NaN)
        ? (Number(binanceManualAvailableMargin) * binanceManualLeverageValue) / Number(engineUsdPrice)
        : null
      : Number.isFinite(binanceManualAvailableMargin ?? NaN) && binanceManualHasLeverage
        ? Number(binanceManualAvailableMargin) * binanceManualLeverageValue
        : null;
  const binanceManualBtcForPct =
    Number.isFinite(binanceManualBtcAt100 ?? NaN) && Number.isFinite(binanceManualBalancePctFactor ?? NaN)
      ? Number(binanceManualBtcAt100) * Number(binanceManualBalancePctFactor)
      : null;
  const binanceManualNotionalUsdAt100 =
    Number.isFinite(binanceManualBtcAt100 ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(binanceManualBtcAt100) * Number(engineUsdPrice)
      : null;
  const binanceManualNotionalUsdForPct =
    Number.isFinite(binanceManualBtcForPct ?? NaN) && Number.isFinite(engineUsdPrice ?? NaN)
      ? Number(binanceManualBtcForPct) * Number(engineUsdPrice)
      : null;
  const binanceManualNotionalKrwForPct =
    Number.isFinite(binanceManualBtcForPct ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(binanceManualBtcForPct) * Number(engineKrwPrice)
      : null;
  const bithumbManualBalancePctValue = Number(bithumbManualBalancePctInput);
  const bithumbManualBalancePctClamped =
    Number.isFinite(bithumbManualBalancePctValue) && bithumbManualBalancePctValue > 0
      ? Math.min(100, bithumbManualBalancePctValue)
      : null;
  const bithumbManualBalancePctFactor =
    Number.isFinite(bithumbManualBalancePctClamped ?? NaN) && Number(bithumbManualBalancePctClamped) > 0
      ? Number(bithumbManualBalancePctClamped) / 100
      : null;
  const bithumbManualBuyKrwAt100 =
    Number.isFinite(bithumbKrwFree ?? NaN) ? Number(bithumbKrwFree) : null;
  const bithumbManualBuyKrwForPct =
    Number.isFinite(bithumbManualBuyKrwAt100 ?? NaN) && Number.isFinite(bithumbManualBalancePctFactor ?? NaN)
      ? Number(bithumbManualBuyKrwAt100) * Number(bithumbManualBalancePctFactor)
      : null;
  const bithumbManualBuyBtcAt100 =
    Number.isFinite(bithumbManualBuyKrwAt100 ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(bithumbManualBuyKrwAt100) / Number(engineKrwPrice)
      : null;
  const bithumbManualBuyBtcForPct =
    Number.isFinite(bithumbManualBuyKrwForPct ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(bithumbManualBuyKrwForPct) / Number(engineKrwPrice)
      : null;
  const bithumbManualCloseBtcAt100 =
    Number.isFinite(bithumbBtcFree ?? NaN) ? Number(bithumbBtcFree) : null;
  const bithumbManualCloseKrwAt100 =
    Number.isFinite(bithumbManualCloseBtcAt100 ?? NaN) && Number.isFinite(engineKrwPrice ?? NaN)
      ? Number(bithumbManualCloseBtcAt100) * Number(engineKrwPrice)
      : null;
  const binanceCurrentPositions = useMemo(
    () => {
      const pickActive = (
        positions: BinanceExecutionPortfolioResponse['positions'] | undefined,
        marketLabel: 'COIN-M' | 'USDT-M'
      ) =>
        (positions ?? [])
          .filter((position) => {
            const contracts = Number(position.contracts ?? NaN);
            return Number.isFinite(contracts) && Math.abs(contracts) > 0;
          })
          .map((position) => ({
            marketLabel,
            symbol: position.symbol,
            side: position.side,
            contracts: position.contracts,
            entryPrice: position.entryPrice,
            markPrice: position.markPrice,
            unrealizedPnl: position.unrealizedPnl,
          }));

      return [
        ...pickActive(binancePortfolioCoinm?.positions, 'COIN-M'),
        ...pickActive(binancePortfolioUsdm?.positions, 'USDT-M'),
      ];
    },
    [binancePortfolioCoinm?.positions, binancePortfolioUsdm?.positions]
  );
  const bithumbCurrentPositions = useMemo(
    () => {
      const fromApi = (bithumbPortfolio?.positions ?? [])
        .filter((position) => {
          const contracts = Number(position.contracts ?? NaN);
          return Number.isFinite(contracts) && Math.abs(contracts) > 0;
        })
        .map((position) => ({
          marketLabel: 'SPOT',
          symbol: position.symbol,
          side: position.side,
          contracts: position.contracts,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          unrealizedPnl: position.unrealizedPnl,
        }));
      if (fromApi.length > 0) return fromApi;

      const btcHolding = Number(bithumbBtcTotal ?? NaN);
      if (Number.isFinite(btcHolding) && btcHolding > 0) {
        return [
          {
            marketLabel: 'SPOT',
            symbol: 'BTC/KRW',
            side: 'long',
            contracts: btcHolding,
            entryPrice: null,
            markPrice: engineKrwPrice,
            unrealizedPnl: null,
          },
        ];
      }

      return [];
    },
    [bithumbPortfolio?.positions, bithumbBtcTotal, engineKrwPrice]
  );
  const combinedExecutionFills = useMemo(
    () =>
      [
        ...executionFills.map((fill) => ({ ...fill, exchange: 'binance' as const })),
        ...bithumbExecutionFills.map((fill) => ({ ...fill, exchange: 'bithumb' as const })),
      ]
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [executionFills, bithumbExecutionFills]
  );
  const dryRunExecutionLogs = useMemo(
    () =>
      executionEventsAll
        .filter(
          (event) =>
            event.event === 'api_execution_binance_order_dry_run' ||
            event.event === 'api_execution_bithumb_order_dry_run'
        )
        .map((event) => {
          const strategyContext =
            event.strategyContext && typeof event.strategyContext === 'object'
              ? (event.strategyContext as Record<string, unknown>)
              : null;
          const actionRaw = typeof strategyContext?.action === 'string' ? strategyContext.action : null;
          const actionLabel =
            actionRaw === 'ENTRY_SELL' || actionRaw === 'ENTRY_BUY'
              ? '진입'
              : actionRaw === 'EXIT_BUY' || actionRaw === 'EXIT_SELL'
                ? '청산'
                : '주문';
          const premiumValueRaw =
            typeof strategyContext?.effectivePremiumPct === 'number'
              ? strategyContext.effectivePremiumPct
              : typeof strategyContext?.premiumPct === 'number'
                ? strategyContext.premiumPct
                : null;

          return {
            timestamp: typeof event.timestamp === 'number' ? event.timestamp : null,
            exchange:
              event.event === 'api_execution_binance_order_dry_run'
                ? '바이낸스'
                : event.event === 'api_execution_bithumb_order_dry_run'
                  ? '빗썸'
                  : '-',
            actionLabel,
            symbol: typeof event.symbol === 'string' ? event.symbol : '-',
            side: typeof event.side === 'string' ? event.side.toUpperCase() : '-',
            amount: typeof event.amount === 'number' ? event.amount : null,
            premium:
              typeof premiumValueRaw === 'number' && Number.isFinite(premiumValueRaw)
                ? premiumValueRaw
                : null,
          };
        })
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [executionEventsAll]
  );
  const sidebarSections: Array<{ key: SidebarSection; label: string; description: string }> = [
    { key: 'automation', label: '자동매매', description: '실행 설정/리스크' },
    { key: 'portfolio', label: '포트폴리오', description: '잔고/체결/이벤트' },
    { key: 'settings', label: '설정', description: 'API/디스코드 설정' },
  ];
  const isAutomationTab = activeSection === 'automation';
  const isPortfolioTab = activeSection === 'portfolio';
  const isSettingsTab = activeSection === 'settings';

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
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
            <Activity className="text-emerald-400 w-6 h-6" />
            델타 중립 봇
          </h1>
          <p className="text-slate-500 text-xs mt-1">Delta Neutral Strategy</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {sidebarSections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${activeSection === section.key
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
            >
              <div className={`w-1 h-8 rounded-full ${activeSection === section.key ? 'bg-emerald-500' : 'bg-transparent'}`}></div>
              <div>
                <div className="font-medium text-sm">{section.label}</div>
                <div className="text-[10px] opacity-70">{section.description}</div>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {/* API Key Check - simplified for sidebar */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">SYSTEM STATUS</span>
              <span className={`w-2 h-2 rounded-full ${marketError ? 'bg-rose-500' : isDataFresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
            </div>
            <div className={`text-xs ${statusColor} truncate`}>{statusText}</div>
            <div className="text-[10px] text-slate-600 truncate">{formattedLastUpdated}</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar for Mobile/Tablet or Global Actions */}
        <header className="h-16 bg-slate-950/80 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100">
            {sidebarSections.find(s => s.key === activeSection)?.label}
          </h2>

          <div className="flex items-center gap-4">
            {marketError && (
              <span className="text-xs text-rose-400 font-medium px-3 py-1 bg-rose-950/30 border border-rose-900/50 rounded-full animate-pulse">
                Connection Error
              </span>
            )}
            <button
              onClick={() => void refreshMarketData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isRefreshing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {marketError && (
              <div className="bg-rose-950/30 border border-rose-800/60 rounded-lg px-4 py-3 text-sm text-rose-200">
                실시간 데이터 오류: {marketError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Col: Data & Charts (Now on the left/center) */}
              {!isPortfolioTab && (
                <div className="lg:col-span-12 flex flex-col gap-6">

                {/* Top Metrics Row */}
                {isAutomationTab && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <MetricCard
                      title="P값 (합성환율)"
                      value={`₩${(currentData.krwPrice / currentData.usdPrice).toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                      subValue={`리얼환율 대비: ${(currentData.kimchiPremiumPercent > 0 ? '+' : '')}${currentData.kimchiPremiumPercent.toFixed(2)}%`}
                      trend={currentData.kimchiPremiumPercent > 0 ? 'up' : 'down'}
                      icon={<Zap size={16} strokeWidth={2.5} />}
                      highlight={currentData.kimchiPremiumPercent > (config.entryThreshold || 3)}
                    />
                    <MetricCard
                      title="김치 프리미엄 (USD)"
                      value={`${currentData.kimchiPremiumPercent.toFixed(2)}%`}
                      subValue={`진입 기준: ${config.entryThreshold}%`}
                      trend={currentData.kimchiPremiumPercent > 0 ? 'up' : 'down'}
                      icon={<Activity size={16} />}
                    />
                    <MetricCard
                      title="국내 비트코인 (KRW)"
                      value={`₩${currentData.krwPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      subValue={`${currentData.btcSource ?? 'Bithumb'}`}
                      icon={<TrendingUp size={16} />}
                    />
                    <MetricCard
                      title="해외 비트코인 (KRW 환산)"
                      value={`₩${normalizedGlobalKrwPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      subValue={`$${(currentData.usdPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${currentData.globalSource ?? 'Binance USDT-M'}`}
                      icon={<Activity size={16} />}
                    />
                    <MetricCard
                      title="리얼 환율 (USD/KRW)"
                      value={`₩${currentData.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                      subValue={`소스: ${currentData.sources?.fx ?? 'USD/KRW'}`}
                      icon={<DollarSign size={16} />}
                    />
                    <MetricCard
                      title="빗썸 환율 (USDT/KRW)"
                      value={`₩${currentData.usdtKrwRate?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '-'}`}
                      subValue={`USDT-P: ${(currentData.usdtPremiumPercent ?? 0).toFixed(2)}%`}
                      icon={<DollarSign size={16} />}
                    />
                  </div>
                )}

                {isAutomationTab && (
                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 text-xs flex flex-col md:flex-row justify-between gap-2 text-slate-400">
                    <span>해외 환산가: ₩{normalizedGlobalKrwPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span className="text-emerald-400/80 font-medium">USD/KRW 환율: {currentData.exchangeRate.toFixed(2)} · USDT/KRW (테더): {currentData.usdtKrwRate?.toFixed(2) ?? '-'}</span>
                    <span>갱신: {lastSuccessfulFetchAt ? new Date(lastSuccessfulFetchAt).toLocaleTimeString('ko-KR') : '-'}</span>
                  </div>
                )}

                {isSettingsTab && (
                  <div id="settings-section" className="space-y-6">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">운영 연결 정보</h3>
                      <div className="text-xs text-slate-400">
                        API Base: <span className="font-mono text-slate-200">{apiBaseLabel}</span>
                      </div>
                      {apiBaseCandidates.length > 1 && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          후보: {apiBaseCandidates.slice(1).join(' · ')}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-600 mt-2">
                        VITE_API_BASE_URL을 설정하면 브라우저 위치와 무관하게 해당 주소로 고정됩니다.
                      </div>
                      {apiBaseIsLocal && (
                        <div className="text-[10px] text-amber-400/80 mt-1">
                          현재 로컬 API를 사용 중입니다. 운영 서버 사용 시 VITE_API_BASE_URL을 AWS 주소로 지정하세요.
                        </div>
                      )}
                    </div>
                    {/* Binance API Key Management */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">바이난스 API 키 관리</h3>
                      <div className="space-y-3">
                        <div className="text-[11px] text-slate-500 space-y-1">
                          <div className="flex items-center gap-2">
                            <span>현재 키 설정: {executionConfigured ? '✅ 설정됨' : '❌ 미설정'}</span>
                            <span className="opacity-40">|</span>
                            <span>바이낸스 연결: {executionConnected ? '🟢 정상' : executionConfigured ? '🔴 오류 (키 확인 필요)' : '⚪ 미설정'}</span>
                          </div>
                          {executionConnected && executionStatus?.balance && (
                            <div className="text-emerald-400 font-mono">
                              잔고: {executionStatus.balance.free} {executionStatus.balance.asset} (사용가능)
                            </div>
                          )}
                          <div className="pt-1 opacity-70">
                            source: {executionCredentialSource}
                            {executionCredentialHint ? ` · ${executionCredentialHint}` : ''}
                            {executionCredentialUpdatedAt ? ` · ${new Date(executionCredentialUpdatedAt).toLocaleTimeString('ko-KR')}` : ''}
                            {executionCredentialPersisted ? ' · persisted' : ''}
                          </div>
                          <div className="text-[10px] text-slate-600">
                            런타임 키(source=runtime)는 .env 키보다 우선 적용됩니다.
                            {' '}현재 선택 시장({executionMarketType.toUpperCase()}) 권한이 바이낸스 API에 있어야 합니다.
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            type="password"
                            autoComplete="off"
                            value={executionApiKeyInput}
                            onChange={(e) => setExecutionApiKeyInput(e.target.value)}
                            placeholder="BINANCE_API_KEY"
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                          />
                          <input
                            type="password"
                            autoComplete="off"
                            value={executionApiSecretInput}
                            onChange={(e) => setExecutionApiSecretInput(e.target.value)}
                            placeholder="BINANCE_API_SECRET"
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                          />
                        </div>
                        <label className="text-[11px] text-slate-400 inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={executionCredentialPersist}
                            onChange={(e) => setExecutionCredentialPersist(e.target.checked)}
                            className="accent-cyan-500 w-3.5 h-3.5 rounded border-slate-700 bg-slate-800"
                          />
                          서버 재시작 후에도 키 유지(.runtime 저장)
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleSaveBinanceCredentials()}
                            disabled={isCredentialSubmitting}
                            className="px-3 py-1.5 rounded bg-cyan-900/30 border border-cyan-800/50 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-60 transition-colors"
                          >
                            {isCredentialSubmitting ? '저장 중...' : '키 저장/적용'}
                          </button>
                          <button
                            onClick={() => void refreshExecutionData(true)}
                            disabled={isExecutionRefreshing}
                            className="px-3 py-1.5 rounded bg-emerald-900/30 border border-emerald-800/50 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-60 transition-colors"
                          >
                            {isExecutionRefreshing ? '확인 중...' : '연결 테스트'}
                          </button>
                          <button
                            onClick={() => void handleClearBinanceCredentials()}
                            disabled={isCredentialSubmitting}
                            className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-60 transition-colors"
                          >
                            런타임 키 삭제
                          </button>
                        </div>
                        {translateExecutionError(executionError) && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 mt-2">
                            {translateExecutionError(executionError)}
                          </div>
                        )}
                        {translateExecutionError(executionStatus?.error) && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 mt-2">
                            바이낸스 오류: {translateExecutionError(executionStatus?.error)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bithumb API Key Management */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">빗썸 API 키 관리</h3>
                      <div className="space-y-3">
                        <div className="text-[11px] text-slate-500 space-y-1">
                          <div className="flex items-center gap-2">
                            <span>현재 키 설정: {bithumbConfigured ? '✅ 설정됨' : '❌ 미설정'}</span>
                            <span className="opacity-40">|</span>
                            {/* TODO: Add Bithumb connection state later when we add Bithumb trading API */}
                            <span>빗썸 연결: {bithumbConfigured ? '⚪ 테스트 대기중' : '⚪ 미설정'}</span>
                          </div>
                          <div className="pt-1 opacity-70">
                            source: {bithumbCredentialSource}
                            {bithumbCredentialHint ? ` · ${bithumbCredentialHint}` : ''}
                            {bithumbCredentialUpdatedAt ? ` · ${new Date(bithumbCredentialUpdatedAt).toLocaleTimeString('ko-KR')}` : ''}
                            {bithumbCredentialPersisted ? ' · persisted' : ''}
                          </div>
                          <div className="text-[10px] text-slate-600">
                            런타임 키(source=runtime)는 .env 키보다 우선 적용됩니다.
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            type="password"
                            autoComplete="off"
                            value={bithumbApiKeyInput}
                            onChange={(e) => setBithumbApiKeyInput(e.target.value)}
                            placeholder="BITHUMB_API_KEY (Connect Key)"
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                          />
                          <input
                            type="password"
                            autoComplete="off"
                            value={bithumbApiSecretInput}
                            onChange={(e) => setBithumbApiSecretInput(e.target.value)}
                            placeholder="BITHUMB_API_SECRET (Secret Key)"
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                          />
                        </div>
                        <label className="text-[11px] text-slate-400 inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={executionCredentialPersist}
                            onChange={(e) => setExecutionCredentialPersist(e.target.checked)}
                            className="accent-cyan-500 w-3.5 h-3.5 rounded border-slate-700 bg-slate-800"
                          />
                          서버 재시작 후에도 키 유지(.runtime 저장)
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleSaveBithumbCredentials()}
                            disabled={isCredentialSubmitting}
                            className="px-3 py-1.5 rounded bg-cyan-900/30 border border-cyan-800/50 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-60 transition-colors"
                          >
                            {isCredentialSubmitting ? '저장 중...' : '키 저장/적용'}
                          </button>
                          <button
                            onClick={() => void handleClearBithumbCredentials()}
                            disabled={isCredentialSubmitting}
                            className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-60 transition-colors"
                          >
                            런타임 키 삭제
                          </button>
                        </div>
                        {translateExecutionError(bithumbExecutionError) && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 mt-2">
                            빗썸 오류: {translateExecutionError(bithumbExecutionError)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Discord Webhook Config */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">디스코드 웹훅 설정</h3>
                      <div className="space-y-3">
                        <div className="text-[11px] text-slate-500">
                          상태: {discordConfig?.configured ? '✅ 연결됨' : '❌ 미설정'}
                          {discordConfig?.webhookUrlMasked ? ` · ${discordConfig.webhookUrlMasked}` : ''}
                        </div>
                        <input
                          type="text"
                          autoComplete="off"
                          value={discordWebhookInput}
                          onChange={(e) => setDiscordWebhookInput(e.target.value)}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setIsDiscordSubmitting(true);
                              setDiscordMessage(null);
                              try {
                                const result = await updateDiscordConfig(discordWebhookInput.trim());
                                setDiscordMessage(result.message);
                                setDiscordWebhookInput('');
                                const fresh = await fetchDiscordConfig();
                                syncDiscordLocalState(fresh);
                              } catch (e) {
                                setDiscordMessage(e instanceof Error ? e.message : '오류 발생');
                              } finally {
                                setIsDiscordSubmitting(false);
                              }
                            }}
                            disabled={isDiscordSubmitting}
                            className="px-3 py-1.5 rounded bg-indigo-900/30 border border-indigo-800/50 text-xs font-semibold text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-60 transition-colors"
                          >
                            {isDiscordSubmitting ? '저장 중...' : '웹훅 저장'}
                          </button>
                          <button
                            onClick={async () => {
                              setIsDiscordSubmitting(true);
                              setDiscordMessage(null);
                              try {
                                const result = await sendDiscordTest();
                                setDiscordMessage(result.message);
                              } catch (e) {
                                setDiscordMessage(e instanceof Error ? e.message : '테스트 실패');
                              } finally {
                                setIsDiscordSubmitting(false);
                              }
                            }}
                            disabled={isDiscordSubmitting || !discordConfig?.configured}
                            className="px-3 py-1.5 rounded bg-emerald-900/30 border border-emerald-800/50 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-60 transition-colors"
                          >
                            테스트 알림 보내기
                          </button>
                          {discordConfig?.configured && (
                            <button
                              onClick={async () => {
                                setIsDiscordSubmitting(true);
                                setDiscordMessage(null);
                                try {
                                  const result = await updateDiscordConfig('', {
                                    premiumAlertEnabled,
                                    premiumAlertThresholds,
                                    periodicReportEnabled,
                                    reportIntervalMinutes,
                                  });
                                  setDiscordMessage('웹훅 URL 삭제됨');
                                  const fresh = await fetchDiscordConfig();
                                  syncDiscordLocalState(fresh);
                                } catch (e) {
                                  setDiscordMessage(e instanceof Error ? e.message : '오류');
                                } finally {
                                  setIsDiscordSubmitting(false);
                                }
                              }}
                              disabled={isDiscordSubmitting}
                              className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-60 transition-colors"
                            >
                              웹훅 삭제
                            </button>
                          )}
                        </div>
                        {discordMessage && (
                          <div className="text-xs text-indigo-300 bg-indigo-950/30 border border-indigo-800/50 rounded px-3 py-2">
                            {discordMessage}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-600 space-y-1">
                          <p>🔴 판매 체결 / 🟢 매수 체결 알림</p>
                          <p>▶️ 엔진 시작 / ⏹️ 엔진 정지 알림</p>
                        </div>
                      </div>
                    </div>

                    {/* Discord Notification Settings */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">디스코드 알림 설정</h3>
                      <div className="space-y-4">

                        {/* 김프 임계값 알림 */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={premiumAlertEnabled}
                              onChange={(e) => setPremiumAlertEnabled(e.target.checked)}
                              className="accent-indigo-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                            />
                            🔔 김프 임계값 알림
                          </label>
                          {premiumAlertEnabled && (
                            <div className="ml-6 space-y-2">
                              {premiumAlertThresholds.map((threshold, index) => (
                                <div key={threshold.id} className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step={0.1}
                                    value={threshold.value}
                                    onChange={(e) => {
                                      const updated = [...premiumAlertThresholds];
                                      updated[index] = { ...updated[index], value: Number(e.target.value) };
                                      setPremiumAlertThresholds(updated);
                                    }}
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                                  <span className="text-xs text-slate-500">%</span>
                                  <button
                                    onClick={() => setPremiumAlertThresholds(premiumAlertThresholds.filter((_, i) => i !== index))}
                                    className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-800 transition-colors shrink-0"
                                    title="삭제"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              {premiumAlertThresholds.length < 10 && (
                                <button
                                  onClick={() => {
                                    setPremiumAlertThresholds([
                                      ...premiumAlertThresholds,
                                      {
                                        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                        value: 0,
                                      },
                                    ]);
                                  }}
                                  className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 transition-colors px-2 py-1.5 rounded bg-indigo-950/30 border border-indigo-800/40 hover:bg-indigo-950/50"
                                >
                                  <Plus size={14} />
                                  임계값 추가
                                </button>
                              )}
                              <p className="text-[10px] text-slate-600">
                                김프가 설정한 값을 넘거나 내려가면 디스코드로 알림을 보냅니다. (쿨다운: 10분)
                              </p>
                            </div>
                          )}
                        </div>

                        {/* 정기 보고 설정 */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={periodicReportEnabled}
                              onChange={(e) => setPeriodicReportEnabled(e.target.checked)}
                              className="accent-indigo-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                            />
                            📊 김프 정기 보고
                          </label>
                          {periodicReportEnabled && (
                            <div className="ml-6">
                              <label className="text-slate-400 flex flex-col gap-1 text-xs">
                                보고 간격
                                <select
                                  value={reportIntervalMinutes}
                                  onChange={(e) => setReportIntervalMinutes(Number(e.target.value))}
                                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none"
                                >
                                  <option value={30}>30분</option>
                                  <option value={60}>1시간</option>
                                  <option value={120}>2시간</option>
                                  <option value={240}>4시간</option>
                                  <option value={480}>8시간</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </div>

                        {/* 알림 설정 저장 버튼 */}
                        <button
                          onClick={async () => {
                            setIsDiscordSubmitting(true);
                            setDiscordMessage(null);
                            try {
                              const webhookUrl = discordWebhookInput.trim() || (discordConfig?.configured ? '__KEEP__' : '');
                              const result = await updateDiscordConfig(
                                webhookUrl,
                                {
                                  premiumAlertEnabled,
                                  premiumAlertThresholds,
                                  periodicReportEnabled,
                                  reportIntervalMinutes,
                                }
                              );
                              setDiscordWebhookInput('');
                              const fresh = await fetchDiscordConfig();
                              syncDiscordLocalState(fresh);
                              setDiscordMessage('알림 설정이 저장되었습니다.');
                            } catch (e) {
                              setDiscordMessage(e instanceof Error ? e.message : '설정 저장 실패');
                            } finally {
                              setIsDiscordSubmitting(false);
                            }
                          }}
                          disabled={isDiscordSubmitting || (!discordConfig?.configured && discordWebhookInput.trim().length === 0)}
                          className="w-full px-3 py-2 rounded bg-indigo-900/30 border border-indigo-800/50 text-sm font-semibold text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-60 transition-colors"
                        >
                          {isDiscordSubmitting ? '저장 중...' : '📥 알림 설정 저장'}
                        </button>

                        {!discordConfig?.configured && discordWebhookInput.trim().length === 0 && (
                          <p className="text-[10px] text-amber-400/70">
                            ⚠️ 웹훅 URL을 먼저 설정해야 알림 기능을 사용할 수 있습니다.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                </div>
              )}

              {/* Right Col: Settings & Controls (Now on the right) */}
              {(isAutomationTab || isPortfolioTab) && (
                <div className="lg:col-span-12 space-y-6">

                  {isAutomationTab && (
                    <div id="automation-section" className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-200 mb-1">자동매매 설정</h3>
                        <p className="text-[11px] text-slate-500">
                          자동엔진/바이낸스 수동/빗썸 수동을 하나의 섹션에서 3열로 관리합니다.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 h-full">
                      <h4 className="text-base font-semibold text-slate-200 mb-1">1) 자동매매 실행 설정</h4>
                      <p className="text-[11px] text-slate-500 mb-4">
                        김프 기반 자동 엔진 제어용 설정입니다. 아래 `바이낸스/빗썸 실행 설정`은 수동 주문 전용입니다.
                      </p>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="text-[11px] text-slate-500">
                          전략: 김프 역타이밍 헷지 (저점 진입 / 고점 청산)
                        </div>
                        <button
                          type="button"
                          onClick={applyReverseHedgePreset}
                          className="px-3 py-1.5 rounded bg-emerald-900/30 border border-emerald-800/50 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/40 transition-colors"
                        >
                          전략 프리셋 적용
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500 mb-3">
                        빗썸은 바이낸스 방향의 반대 방향으로 자동 헤지됩니다. (바이낸스 SHORT 진입 시 빗썸 BUY, 바이낸스 LONG 진입 시 빗썸 SELL)
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            시장
                            <select
                              value={executionMarketType}
                              onChange={(e) => setExecutionMarketType(e.target.value === 'usdm' ? 'usdm' : 'coinm')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                            >
                              <option value="coinm">COIN-M</option>
                              <option value="usdm">USDT-M</option>
                            </select>
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            심볼
                            <input
                              type="text"
                              value={executionSymbol}
                              onChange={(e) => setExecutionSymbol(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            바이낸스 진입 방향
                            <select
                              value={executionBinanceEntrySide}
                              onChange={(e) => setExecutionBinanceEntrySide(e.target.value === 'long' ? 'long' : 'short')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                            >
                              <option value="short">SHORT 진입</option>
                              <option value="long">LONG 진입</option>
                            </select>
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            바이낸스 마진 모드
                            <select
                              value={executionBinanceMarginMode}
                              onChange={(e) => setExecutionBinanceMarginMode(e.target.value === 'cross' ? 'cross' : 'isolated')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                            >
                              <option value="isolated">Isolated (기본)</option>
                              <option value="cross">Cross</option>
                            </select>
                          </label>
                        </div>

                        <label className="text-slate-400 flex flex-col gap-1">
                          바이낸스 배율 (기본 4x)
                          <input
                            type="number"
                            min={1}
                            max={125}
                            step={1}
                            value={executionBinanceLeverageInput}
                            onChange={(e) => setExecutionBinanceLeverageInput(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                            placeholder="4"
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            진입 김프율 (%)
                            <input
                              type="number"
                              min={-20}
                              max={40}
                              step={0.1}
                              value={Number.isFinite(config.entryThreshold) ? config.entryThreshold : 0}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  entryThreshold: Number(e.target.value),
                                }))
                              }
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                              placeholder="예: 0.0"
                            />
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            청산 김프율 (%)
                            <input
                              type="number"
                              min={-20}
                              max={40}
                              step={0.1}
                              value={Number.isFinite(config.exitThreshold) ? config.exitThreshold : 0}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  exitThreshold: Number(e.target.value),
                                }))
                              }
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                              placeholder="예: 2.0"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            진입 주문 비율 (%)
                            <input
                              type="number"
                              min={0.1}
                              max={100}
                              step={0.1}
                              value={Number.isFinite(executionOrderBalancePctEntry) ? executionOrderBalancePctEntry : 0}
                              onChange={(e) => setExecutionOrderBalancePctEntry(Number(e.target.value))}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                              placeholder="예: 10"
                            />
                          </label>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          청산 주문 비율은 100% 고정입니다. (UI 입력 제거)
                        </div>
                        <div className="rounded border border-cyan-800/40 bg-cyan-950/10 px-3 py-2 space-y-2">
                          <div className="text-xs font-semibold text-cyan-300">가용 잔고 (자동매매 기준)</div>
                          <div className="grid grid-cols-1 gap-2 text-[11px]">
                            <div className="rounded border border-slate-800 bg-slate-950/40 px-2.5 py-2">
                              <div className="text-slate-400">바이낸스 가용 ({executionMarketType.toUpperCase()})</div>
                              <div className="text-slate-200 font-mono mt-1">
                                {formatNullableNumber(autoBinanceAvailableValue, 8)} {autoBinanceAvailableAsset}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                KRW 환산 약 ₩{formatNullableNumber(autoBinanceAvailableKrw, 0)} · 배율 {formatNullableNumber(executionLeverageNumber, 0)}x
                              </div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-950/40 px-2.5 py-2">
                              <div className="text-slate-400">빗썸 가용 (진입 방향 기준)</div>
                              <div className="text-slate-200 font-mono mt-1">
                                {autoBithumbAvailableEntryAsset === 'KRW'
                                  ? `₩${formatNullableNumber(autoBithumbAvailableEntryValue, 0)} KRW`
                                  : `${formatNullableNumber(autoBithumbAvailableEntryValue, 8)} BTC`}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                방향 {bithumbEntrySideForAuto.toUpperCase()} · KRW 환산 약 ₩{formatNullableNumber(autoBithumbAvailableEntryKrw, 0)}
                              </div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-950/40 px-2.5 py-2">
                              <div className="text-slate-400">100% 기준 헷지 가능 규모</div>
                              <div className="text-emerald-200 font-mono mt-1">
                                {formatNullableNumber(estimatedHedgeBtcAt100, 8)} BTC
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                바이낸스 명목 ${formatNullableNumber(estimatedHedgeNotionalUsdAt100, 2)} · 빗썸 약 ₩{formatNullableNumber(estimatedHedgeKrwAt100, 0)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded border border-emerald-800/40 bg-emerald-950/10 px-3 py-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-emerald-300">진입 예상 규모 (1:1 헷지)</div>
                            <div className="text-[10px] text-emerald-300/80">
                              방향: 바이낸스 {executionBinanceEntrySide.toUpperCase()} / 빗썸 {bithumbEntrySideForAuto.toUpperCase()}
                            </div>
                          </div>
                          {hasEstimatedHedgePreview ? (
                            <div className="space-y-1 text-[11px] text-slate-300">
                              <div>
                                현재 {formatNullableNumber(executionEntryPctClamped, 2)}% 기준:
                                {' '}<span className="font-mono text-emerald-200">{formatNullableNumber(estimatedHedgeBtcForEntryPct, 8)} BTC</span>
                                {' '}· 바이낸스 명목 ${formatNullableNumber(estimatedHedgeNotionalUsdForEntryPct, 2)}
                                {' '}· 빗썸 약 ₩{formatNullableNumber(estimatedHedgeKrwForEntryPct, 0)}
                              </div>
                              <div>
                                100% 기준 최대:
                                {' '}<span className="font-mono">{formatNullableNumber(estimatedHedgeBtcAt100, 8)} BTC</span>
                                {' '}· 바이낸스 명목 ${formatNullableNumber(estimatedHedgeNotionalUsdAt100, 2)}
                                {' '}· 빗썸 약 ₩{formatNullableNumber(estimatedHedgeKrwAt100, 0)}
                              </div>
                              <div>
                                잔고:
                                {' '}바이낸스 가용 {executionMarketType === 'usdm' ? `${formatNullableNumber(binanceUsdmFree, 8)} USDT` : `${formatNullableNumber(binanceCoinmFree, 8)} BTC`}
                                {' '}· 빗썸 가용 {bithumbEntrySideForAuto === 'buy' ? `₩${formatNullableNumber(bithumbKrwFree, 0)} KRW` : `${formatNullableNumber(bithumbBtcFree, 8)} BTC`}
                              </div>
                              <div>
                                실적용 진입비율(클램프 반영):
                                {' '}<span className="font-mono text-slate-200">{formatNullableNumber(estimatedEffectiveEntryPctOnBinance, 2)}%</span>
                                {' '}· 제한 요인: {estimatedHedgeLimitSource}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">
                              바이낸스/빗썸 잔고와 현재 BTC 가격을 불러오면, 100% 기준 및 현재 비율 기준 진입 예상 금액/수량을 보여줍니다.
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            추정치입니다. 실제 체결은 슬리피지/최소주문수량/수수료에 따라 달라질 수 있습니다.
                          </div>
                        </div>

                        <label className="text-slate-400 flex items-center gap-2 p-1">
                          <input
                            type="checkbox"
                            checked={executionDryRun}
                            onChange={(e) => setExecutionDryRun(e.target.checked)}
                            className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          드라이런 모드(실주문 없음)
                        </label>

                        <label className="text-slate-400 flex items-center gap-2 p-1">
                          <input
                            type="checkbox"
                            checked={executionLiveOrdersAllowed}
                            onChange={(e) => void handleToggleLiveOrders(e.target.checked)}
                            disabled={isOrderPolicySubmitting}
                            className="accent-rose-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          실주문 허용
                        </label>

                        <button
                          onClick={() => void handleExecutionEngineToggle()}
                          disabled={isEngineSubmitting}
                          className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-lg mt-2 ${isPlaying
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/20'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20'
                            } disabled:opacity-60`}
                        >
                          {isPlaying ? <><Pause size={18} /> 자동매매 정지</> : <><Play size={18} /> 자동매매 시작</>}
                        </button>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            연결: <span className={executionConnected ? 'text-emerald-400' : 'text-rose-400'}>{executionConnected ? '정상' : '실패'}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            설정: <span className={executionConfigured ? 'text-emerald-400' : 'text-amber-400'}>{executionConfigured ? '완료' : '미설정'}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            엔진: <span className={isPlaying ? 'text-emerald-400' : 'text-slate-400'}>{isPlaying ? '실행중' : '중지'}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            Safe Mode: <span className={executionSafeMode ? 'text-rose-400' : 'text-emerald-400'}>{executionSafeMode ? 'ON' : 'OFF'}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            포지션: <span className={enginePositionState === 'ENTERED' ? 'text-amber-400' : 'text-slate-300'}>{enginePositionState}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            잔고: <span className="text-slate-300 font-mono">{executionBalanceText}</span>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/40 px-2 py-2">
                            엔진 김프: <span className="text-slate-300 font-mono">{engineLastPremium == null ? '-' : `${engineLastPremium.toFixed(2)}%`}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            onClick={() => void refreshExecutionData(true)}
                            disabled={isExecutionRefreshing}
                            className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60 transition-colors"
                          >
                            {isExecutionRefreshing ? '갱신 중...' : '실행상태 새로고침'}
                          </button>
                          <button
                            onClick={() => void handleResetExecutionSafety()}
                            className="px-3 py-1.5 rounded bg-amber-900/20 border border-amber-800/50 text-xs font-semibold text-amber-500 hover:bg-amber-900/30 transition-colors"
                          >
                            Safe Mode 리셋
                          </button>
                          <button
                            onClick={() => void handleCheckExecutionReadiness()}
                            disabled={isReadinessChecking}
                            className="px-3 py-1.5 rounded bg-indigo-900/20 border border-indigo-800/50 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/30 disabled:opacity-60 transition-colors"
                          >
                            {isReadinessChecking ? '준비도 점검 중...' : '실행 준비도 점검'}
                          </button>
                        </div>

                        {executionReadiness && (
                          <div className={`text-xs rounded px-3 py-2 mt-2 border ${executionReadiness.ready
                            ? 'text-emerald-200 bg-emerald-950/30 border-emerald-800/40'
                            : 'text-amber-200 bg-amber-950/30 border-amber-800/40'
                            }`}>
                            준비도: {executionReadiness.ready ? 'READY' : 'NOT READY'} · 모드: {executionReadiness.mode.toUpperCase()}
                            {' '}· 점검시간: {new Date(executionReadiness.timestamp).toLocaleTimeString('ko-KR')}
                          </div>
                        )}

                        {executionReadiness && executionReadiness.checks.some((check) => !check.ok) && (
                          <div className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800 rounded px-3 py-2 space-y-1">
                            {executionReadiness.checks
                              .filter((check) => !check.ok)
                              .slice(0, 4)
                              .map((check) => (
                                <div key={check.key}>
                                  [{check.severity.toUpperCase()}] {check.message}
                                </div>
                              ))}
                          </div>
                        )}

                        {executionError && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 mt-2">
                            실행 오류: {executionError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 h-full">
                      <h4 className="text-base font-semibold text-slate-200 mb-1">2) 바이낸스 실행 설정 (수동 주문)</h4>
                      <p className="text-[11px] text-slate-500 mb-4">
                        자동 엔진과 분리된 수동 주문 파트입니다. 기본값은 `Isolated`, `4x`입니다.
                      </p>
                      <div className="space-y-3 text-sm">
                        <div className="text-[11px] text-slate-500">
                          연결: {executionConnected ? '🟢 정상' : executionConfigured ? '🔴 실패' : '⚪ 미설정'} · 실주문 허용: {executionLiveOrdersAllowed ? 'ON' : 'OFF'}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            시장
                            <select
                              value={binanceManualMarketType}
                              onChange={(e) => {
                                const nextMarketType = e.target.value === 'usdm' ? 'usdm' : 'coinm';
                                setBinanceManualMarketType(nextMarketType);
                                setBinanceManualSymbol(defaultSymbolByMarketType(nextMarketType));
                              }}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-cyan-500 outline-none"
                            >
                              <option value="coinm">COIN-M</option>
                              <option value="usdm">USDT-M</option>
                            </select>
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            심볼
                            <input
                              type="text"
                              value={binanceManualSymbol}
                              onChange={(e) => setBinanceManualSymbol(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="BTC/USDT:USDT"
                            />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            포지션 방향
                            <select
                              value={binanceManualDirection}
                              onChange={(e) => setBinanceManualDirection(e.target.value === 'short' ? 'short' : 'long')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-cyan-500 outline-none"
                            >
                              <option value="long">LONG (매수)</option>
                              <option value="short">SHORT (매도)</option>
                            </select>
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            주문 유형
                            <select
                              value={binanceManualOrderType}
                              onChange={(e) => setBinanceManualOrderType(e.target.value === 'limit' ? 'limit' : 'market')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-cyan-500 outline-none"
                            >
                              <option value="market">시장가</option>
                              <option value="limit">지정가</option>
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            배율 (기본 4x)
                            <input
                              type="number"
                              min={1}
                              max={125}
                              step={1}
                              value={binanceManualLeverageInput}
                              onChange={(e) => setBinanceManualLeverageInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="4"
                            />
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            마진 모드
                            <select
                              value={binanceManualMarginMode}
                              onChange={(e) => setBinanceManualMarginMode(e.target.value === 'cross' ? 'cross' : 'isolated')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-cyan-500 outline-none"
                            >
                              <option value="isolated">Isolated (기본)</option>
                              <option value="cross">Cross</option>
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            수량 (amount, 선택)
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={binanceManualAmountInput}
                              onChange={(e) => setBinanceManualAmountInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="예: 0.001"
                            />
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            잔고 진입 비율 (%)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={binanceManualBalancePctInput}
                              onChange={(e) => setBinanceManualBalancePctInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="100"
                            />
                          </label>
                        </div>
                        <div className="rounded border border-cyan-800/40 bg-cyan-950/10 px-3 py-2 space-y-1.5">
                          <div className="text-xs font-semibold text-cyan-300">가용 잔고 (바이낸스 수동)</div>
                          <div className="text-[11px] text-slate-300">
                            가용 증거금: <span className="font-mono text-slate-200">{formatNullableNumber(binanceManualAvailableMargin, 8)} {binanceManualAvailableAsset}</span>
                            {' '}· KRW 환산 약 ₩{formatNullableNumber(binanceManualAvailableMarginKrw, 0)}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            100% 기준: <span className="font-mono text-emerald-200">{formatNullableNumber(binanceManualBtcAt100, 8)} BTC</span>
                            {' '}· 명목 ${formatNullableNumber(binanceManualNotionalUsdAt100, 2)}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            현재 {formatNullableNumber(binanceManualBalancePctClamped, 2)}% 기준:
                            {' '}<span className="font-mono text-emerald-200">{formatNullableNumber(binanceManualBtcForPct, 8)} BTC</span>
                            {' '}· 명목 ${formatNullableNumber(binanceManualNotionalUsdForPct, 2)}
                            {' '}· 약 ₩{formatNullableNumber(binanceManualNotionalKrwForPct, 0)}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          수량을 입력하면 수량 우선으로 주문하고, 수량을 비우면 잔고 비율(기본 100%)로 진입합니다.
                        </div>
                        {binanceManualOrderType === 'limit' && (
                          <label className="text-slate-400 flex flex-col gap-1">
                            지정가
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={binanceManualPriceInput}
                              onChange={(e) => setBinanceManualPriceInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="예: 90000"
                            />
                          </label>
                        )}
                        <label className="text-slate-400 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={binanceManualDryRun}
                            onChange={(e) => setBinanceManualDryRun(e.target.checked)}
                            className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          드라이런 (체결 시뮬레이션)
                        </label>
                        <label className="text-slate-400 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={binanceManualAllowInSafeMode}
                            onChange={(e) => setBinanceManualAllowInSafeMode(e.target.checked)}
                            className="accent-amber-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          Safe Mode에서도 주문 허용
                        </label>
                        <button
                          onClick={() => void handleBinanceManualBuy()}
                          disabled={binanceManualSubmitting}
                          className="w-full px-3 py-2 rounded bg-cyan-900/30 border border-cyan-800/50 text-sm font-semibold text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-60 transition-colors"
                        >
                          {binanceManualSubmitting
                            ? '바이낸스 주문 요청 중...'
                            : `바이낸스 ${binanceManualDirection === 'long' ? 'LONG' : 'SHORT'} 수동 주문 실행`}
                        </button>
                        <button
                          onClick={() => void handleBinanceManualClosePosition()}
                          disabled={binanceManualSubmitting}
                          className="w-full px-3 py-2 rounded bg-amber-900/20 border border-amber-800/50 text-sm font-semibold text-amber-300 hover:bg-amber-900/30 disabled:opacity-60 transition-colors"
                        >
                          {binanceManualSubmitting ? '포지션 정리 요청 중...' : '바이낸스 포지션 정리 (시장가)'}
                        </button>
                        {translateExecutionError(binanceManualError) && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2">
                            바이낸스 수동 주문 오류: {translateExecutionError(binanceManualError)}
                          </div>
                        )}
                        {binanceManualResult?.order && (
                          <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded px-3 py-2 space-y-1">
                            <div>
                              최근 주문 상태: <span className="font-mono text-slate-100">{binanceManualResult.order.status ?? '-'}</span>
                              {' '}· 모드: <span className={binanceManualResult.dryRun ? 'text-amber-300' : 'text-emerald-300'}>{binanceManualResult.dryRun ? 'DRY-RUN' : 'LIVE'}</span>
                            </div>
                            <div>
                              주문ID: <span className="font-mono">{binanceManualResult.order.id ?? '-'}</span>
                              {' '}· 심볼: <span className="font-mono">{binanceManualResult.order.symbol}</span>
                            </div>
                            <div>
                              방향 {binanceManualResult.request?.side === 'sell' ? 'SHORT' : 'LONG'}
                              {' '}· 배율 {formatNullableNumber(binanceManualResult.request?.leverage, 0)}x
                              {' '}· 마진 {binanceManualResult.request?.marginMode?.toUpperCase() ?? '-'}
                            </div>
                            <div>
                              수량 {formatNullableNumber(binanceManualResult.order.amount, 8)}
                              {' '}· 체결가 {formatNullableNumber(binanceManualResult.order.average ?? binanceManualResult.order.price, 8)}
                              {binanceManualResult.request?.balancePct != null
                                ? ` · 잔고비율 ${formatNullableNumber(binanceManualResult.request.balancePct, 4)}%`
                                : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 h-full">
                      <h4 className="text-base font-semibold text-slate-200 mb-1">3) 빗썸 실행 설정 (수동 주문)</h4>
                      <p className="text-[11px] text-slate-500 mb-4">
                        빗썸 현물 수동 주문 파트입니다. 매수/정리 버튼을 각각 제공합니다.
                      </p>
                      <div className="space-y-3 text-sm">
                        <div className="text-[11px] text-slate-500">
                          연결: {bithumbPortfolioConnected ? '🟢 정상' : bithumbConfigured ? '🔴 실패' : '⚪ 미설정'} · 실주문 허용: {executionLiveOrdersAllowed ? 'ON' : 'OFF'}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            심볼
                            <input
                              type="text"
                              value={bithumbManualSymbol}
                              onChange={(e) => setBithumbManualSymbol(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="BTC/KRW"
                            />
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            주문 유형
                            <select
                              value={bithumbManualOrderType}
                              onChange={(e) => setBithumbManualOrderType(e.target.value === 'limit' ? 'limit' : 'market')}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 focus:ring-1 focus:ring-cyan-500 outline-none"
                            >
                              <option value="market">시장가</option>
                              <option value="limit">지정가</option>
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-slate-400 flex flex-col gap-1">
                            수량 (amount, 선택)
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={bithumbManualAmountInput}
                              onChange={(e) => setBithumbManualAmountInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="예: 0.001"
                            />
                          </label>
                          <label className="text-slate-400 flex flex-col gap-1">
                            잔고 진입 비율 (%)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={bithumbManualBalancePctInput}
                              onChange={(e) => setBithumbManualBalancePctInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="100"
                            />
                          </label>
                        </div>
                        <div className="rounded border border-cyan-800/40 bg-cyan-950/10 px-3 py-2 space-y-1.5">
                          <div className="text-xs font-semibold text-cyan-300">가용 잔고 (빗썸 수동)</div>
                          <div className="text-[11px] text-slate-300">
                            매수 가용: <span className="font-mono text-slate-200">₩{formatNullableNumber(bithumbManualBuyKrwAt100, 0)} KRW</span>
                            {' '}· 100% 기준 약 {formatNullableNumber(bithumbManualBuyBtcAt100, 8)} BTC
                          </div>
                          <div className="text-[11px] text-slate-300">
                            현재 {formatNullableNumber(bithumbManualBalancePctClamped, 2)}% 기준:
                            {' '}₩{formatNullableNumber(bithumbManualBuyKrwForPct, 0)}
                            {' '}· 약 {formatNullableNumber(bithumbManualBuyBtcForPct, 8)} BTC
                          </div>
                          <div className="text-[11px] text-slate-300">
                            정리 가용: <span className="font-mono text-amber-200">{formatNullableNumber(bithumbManualCloseBtcAt100, 8)} BTC</span>
                            {' '}· 약 ₩{formatNullableNumber(bithumbManualCloseKrwAt100, 0)}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          수량을 입력하면 수량 우선으로 주문하고, 수량을 비우면 잔고 비율(기본 100%)로 진입합니다.
                        </div>
                        {bithumbManualOrderType === 'limit' && (
                          <label className="text-slate-400 flex flex-col gap-1">
                            지정가 (KRW)
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={bithumbManualPriceInput}
                              onChange={(e) => setBithumbManualPriceInput(e.target.value)}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-cyan-500 outline-none"
                              placeholder="예: 150000000"
                            />
                          </label>
                        )}
                        <label className="text-slate-400 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={bithumbManualDryRun}
                            onChange={(e) => setBithumbManualDryRun(e.target.checked)}
                            className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          드라이런 (체결 시뮬레이션)
                        </label>
                        <label className="text-slate-400 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={bithumbManualAllowInSafeMode}
                            onChange={(e) => setBithumbManualAllowInSafeMode(e.target.checked)}
                            className="accent-amber-500 w-4 h-4 rounded border-slate-700 bg-slate-800"
                          />
                          Safe Mode에서도 주문 허용
                        </label>
                        <button
                          onClick={() => void handleBithumbManualBuy()}
                          disabled={bithumbManualSubmitting}
                          className="w-full px-3 py-2 rounded bg-cyan-900/30 border border-cyan-800/50 text-sm font-semibold text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-60 transition-colors"
                        >
                          {bithumbManualSubmitting ? '빗썸 매수 요청 중...' : '빗썸 수동 매수 실행'}
                        </button>
                        <button
                          onClick={() => void handleBithumbManualClosePosition()}
                          disabled={bithumbManualSubmitting}
                          className="w-full px-3 py-2 rounded bg-amber-900/20 border border-amber-800/50 text-sm font-semibold text-amber-300 hover:bg-amber-900/30 disabled:opacity-60 transition-colors"
                        >
                          {bithumbManualSubmitting ? '빗썸 정리 요청 중...' : '빗썸 포지션 정리 (시장가 100%)'}
                        </button>
                        {translateExecutionError(bithumbManualError) && (
                          <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2">
                            빗썸 수동 주문 오류: {translateExecutionError(bithumbManualError)}
                          </div>
                        )}
                        {bithumbManualResult?.order && (
                          <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded px-3 py-2 space-y-1">
                            <div>
                              최근 주문 상태: <span className="font-mono text-slate-100">{bithumbManualResult.order.status ?? '-'}</span>
                              {' '}· 모드: <span className={bithumbManualResult.dryRun ? 'text-amber-300' : 'text-emerald-300'}>{bithumbManualResult.dryRun ? 'DRY-RUN' : 'LIVE'}</span>
                            </div>
                            <div>
                              주문ID: <span className="font-mono">{bithumbManualResult.order.id ?? '-'}</span>
                              {' '}· 심볼: <span className="font-mono">{bithumbManualResult.order.symbol}</span>
                            </div>
                            <div>
                              수량 {formatNullableNumber(bithumbManualResult.order.amount, 8)}
                              {' '}· 체결가 {formatNullableNumber(bithumbManualResult.order.average ?? bithumbManualResult.order.price, 8)}
                              {bithumbManualResult.request?.balancePct != null
                                ? ` · 잔고비율 ${formatNullableNumber(bithumbManualResult.request.balancePct, 4)}%`
                                : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  )}

                  {isPortfolioTab && (
                    <div id="portfolio-section" className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-200">보유자산 포트폴리오</h3>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800 px-2 py-1 rounded">
                          {executionPortfolio?.testnet ? 'Testnet' : 'Live'} · {executionMarketType.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-3 text-xs">
                        <div className="rounded border border-emerald-800/40 bg-emerald-950/20 px-4 py-3">
                          <div className="text-emerald-300 text-[11px]">총 보유 자산 (바이낸스 + 빗썸)</div>
                          <div className="text-emerald-200 font-mono text-2xl mt-1">
                            ₩{formatNullableNumber(totalPortfolioKrw, 0)}
                          </div>
                          <div className="text-emerald-300/80 text-[11px] mt-1">
                            바이낸스: ₩{formatNullableNumber(binanceCombinedKrw, 0)} · 빗썸: ₩{formatNullableNumber(bithumbCombinedKrw, 0)}
                          </div>
                        </div>

                        <div className="rounded border border-slate-800 bg-slate-950/40 px-4 py-3 space-y-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-300 text-sm font-semibold">바이낸스 보유 자금</span>
                            <span className={`text-[10px] ${binanceCoinmConnected || binanceUsdmConnected || binanceSpotConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {binanceCoinmConnected || binanceUsdmConnected || binanceSpotConnected ? '연결됨' : (binanceCoinmConfigured || binanceUsdmConfigured || binanceSpotConfigured) ? '연결 실패' : '미설정'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">합계 (KRW 환산)</div>
                              <div className="text-slate-200 font-mono text-base mt-1">₩{formatNullableNumber(binanceCombinedKrw, 0)}</div>
                              <div className="text-slate-500 mt-1">선물 ₩{formatNullableNumber(binanceFuturesCombinedKrw, 0)} · Spot ₩{formatNullableNumber(binanceSpotCombinedKrw, 0)}</div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">Spot</div>
                              <div className="text-slate-200 font-mono mt-1">₩{formatNullableNumber(binanceSpotCombinedKrw, 0)}</div>
                              <div className="text-slate-500 mt-1">USDT {formatNullableNumber(binanceSpotUsdtTotal, 8)} · BTC {formatNullableNumber(binanceSpotBtcTotal, 8)}</div>
                              <div className="text-slate-500">포지션 {binanceSpotPositions}</div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">COIN-M</div>
                              <div className="text-slate-200 font-mono mt-1">{formatNullableNumber(binanceCoinmTotal, 8)} BTC</div>
                              <div className="text-slate-500 mt-1">가용 {formatNullableNumber(binanceCoinmFree, 8)} · 포지션 {binanceCoinmPositions}</div>
                              <div className="text-slate-500">₩{formatNullableNumber(binanceCoinmKrw, 0)}</div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">USDT-M</div>
                              <div className="text-slate-200 font-mono mt-1">{formatNullableNumber(binanceUsdmTotal, 8)} USDT</div>
                              <div className="text-slate-500 mt-1">가용 {formatNullableNumber(binanceUsdmFree, 8)} · 포지션 {binanceUsdmPositions}</div>
                              <div className="text-slate-500">₩{formatNullableNumber(binanceUsdmKrw, 0)}</div>
                            </div>
                          </div>

                          <div className="border border-slate-800 rounded-lg overflow-hidden mt-3">
                            <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                              <span>바이낸스 Spot 현물 잔고</span>
                              <span className={`text-[10px] ${binanceSpotConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {binanceSpotConnected ? '연결됨' : binanceSpotConfigured ? '연결 실패' : '미설정'}
                              </span>
                            </div>
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                                  <div className="text-slate-500">Spot 합산(KRW 환산)</div>
                                  <div className="text-slate-200 font-mono">₩{formatNullableNumber(binanceSpotCombinedKrw, 0)}</div>
                                </div>
                                <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                                  <div className="text-slate-500">USDT 총 보유</div>
                                  <div className="text-slate-200 font-mono">{formatNullableNumber(binanceSpotUsdtTotal, 8)} USDT</div>
                                </div>
                              </div>
                              {translateExecutionError(binanceSpotError) && (
                                <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 break-all">
                                  바이낸스 Spot 잔고 조회 오류: {translateExecutionError(binanceSpotError)}
                                </div>
                              )}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="py-2 px-3 text-left">자산</th>
                                      <th className="py-2 px-3 text-right">총</th>
                                      <th className="py-2 px-3 text-right">가용</th>
                                      <th className="py-2 px-3 text-right">사용</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(binancePortfolioSpot?.walletBalances ?? []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="py-4 text-center text-slate-500">
                                          표시할 Binance Spot 잔고가 없습니다.
                                        </td>
                                      </tr>
                                    ) : (
                                      (binancePortfolioSpot?.walletBalances ?? []).map((item) => (
                                        <tr key={`binance-spot-${item.asset}`} className="border-b border-slate-900/70">
                                          <td className="py-2 px-3 text-slate-300 font-medium">{item.asset}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.total, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.free, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.used, 8)}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                            <div className="border border-slate-800 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                                바이낸스 COIN-M 자산별 잔고
                              </div>
                              {translateExecutionError(binanceCoinmError) && (
                                <div className="text-[11px] text-rose-300 bg-rose-950/30 border-b border-rose-800/50 px-3 py-2 break-all">
                                  COIN-M 조회 오류: {translateExecutionError(binanceCoinmError)}
                                </div>
                              )}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="py-2 px-3 text-left">자산</th>
                                      <th className="py-2 px-3 text-right">총</th>
                                      <th className="py-2 px-3 text-right">가용</th>
                                      <th className="py-2 px-3 text-right">사용</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(binancePortfolioCoinm?.walletBalances ?? []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="py-4 text-center text-slate-500">
                                          표시할 COIN-M 잔고가 없습니다.
                                        </td>
                                      </tr>
                                    ) : (
                                      (binancePortfolioCoinm?.walletBalances ?? []).map((item) => (
                                        <tr key={`coinm-${item.asset}`} className="border-b border-slate-900/70">
                                          <td className="py-2 px-3 text-slate-300 font-medium">{item.asset}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.total, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.free, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.used, 8)}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="border border-slate-800 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                                바이낸스 USDT-M 자산별 잔고
                              </div>
                              <div className="px-3 py-1.5 text-[10px] text-slate-500 bg-slate-950/40 border-b border-slate-800">
                                선물 지갑 기준 잔고입니다.
                              </div>
                              {translateExecutionError(binanceUsdmError) && (
                                <div className="text-[11px] text-rose-300 bg-rose-950/30 border-b border-rose-800/50 px-3 py-2 break-all">
                                  USDT-M 조회 오류: {translateExecutionError(binanceUsdmError)}
                                </div>
                              )}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="py-2 px-3 text-left">자산</th>
                                      <th className="py-2 px-3 text-right">총</th>
                                      <th className="py-2 px-3 text-right">가용</th>
                                      <th className="py-2 px-3 text-right">사용</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(binancePortfolioUsdm?.walletBalances ?? []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="py-4 text-center text-slate-500">
                                          표시할 USDT-M 잔고가 없습니다.
                                        </td>
                                      </tr>
                                    ) : (
                                      (binancePortfolioUsdm?.walletBalances ?? []).map((item) => (
                                        <tr key={`usdm-${item.asset}`} className="border-b border-slate-900/70">
                                          <td className="py-2 px-3 text-slate-300 font-medium">{item.asset}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.total, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.free, 8)}</td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.used, 8)}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="border border-slate-800 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                                바이낸스 COIN-M 활성 포지션
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="py-2 px-3 text-left">심볼</th>
                                      <th className="py-2 px-3 text-left">방향</th>
                                      <th className="py-2 px-3 text-right">수량</th>
                                      <th className="py-2 px-3 text-right">미실현손익</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(binancePortfolioCoinm?.positions ?? []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="py-4 text-center text-slate-500">
                                          열린 COIN-M 포지션이 없습니다.
                                        </td>
                                      </tr>
                                    ) : (
                                      (binancePortfolioCoinm?.positions ?? []).map((position, index) => (
                                        <tr key={`coinm-pos-${position.symbol}-${position.side ?? 'none'}-${index}`} className="border-b border-slate-900/70">
                                          <td className="py-2 px-3 text-slate-300 font-mono">{position.symbol}</td>
                                          <td className={`py-2 px-3 ${(position.side ?? '').toLowerCase() === 'short' ? 'text-emerald-300' : 'text-indigo-300'}`}>
                                            {position.side ? position.side.toUpperCase() : '-'}
                                          </td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.contracts, 8)}</td>
                                          <td
                                            className={`py-2 px-3 text-right font-mono ${position.unrealizedPnl != null && position.unrealizedPnl < 0 ? 'text-rose-300' : 'text-emerald-300'
                                              }`}
                                          >
                                            {formatSignedNumber(position.unrealizedPnl, 8)}
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="border border-slate-800 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                                바이낸스 USDT-M 활성 포지션
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800">
                                      <th className="py-2 px-3 text-left">심볼</th>
                                      <th className="py-2 px-3 text-left">방향</th>
                                      <th className="py-2 px-3 text-right">수량</th>
                                      <th className="py-2 px-3 text-right">미실현손익</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(binancePortfolioUsdm?.positions ?? []).length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="py-4 text-center text-slate-500">
                                          열린 USDT-M 포지션이 없습니다.
                                        </td>
                                      </tr>
                                    ) : (
                                      (binancePortfolioUsdm?.positions ?? []).map((position, index) => (
                                        <tr key={`usdm-pos-${position.symbol}-${position.side ?? 'none'}-${index}`} className="border-b border-slate-900/70">
                                          <td className="py-2 px-3 text-slate-300 font-mono">{position.symbol}</td>
                                          <td className={`py-2 px-3 ${(position.side ?? '').toLowerCase() === 'short' ? 'text-emerald-300' : 'text-indigo-300'}`}>
                                            {position.side ? position.side.toUpperCase() : '-'}
                                          </td>
                                          <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.contracts, 8)}</td>
                                          <td
                                            className={`py-2 px-3 text-right font-mono ${position.unrealizedPnl != null && position.unrealizedPnl < 0 ? 'text-rose-300' : 'text-emerald-300'
                                              }`}
                                          >
                                            {formatSignedNumber(position.unrealizedPnl, 8)}
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded border border-slate-800 bg-slate-950/40 px-4 py-3 space-y-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-slate-300 text-sm font-semibold">빗썸 보유 자금</span>
                            <span className={`text-[10px] ${bithumbPortfolioConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {bithumbPortfolioConnected ? '연결됨' : bithumbPortfolioConfigured ? '연결 실패' : '미설정'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">총 보유 (KRW 환산)</div>
                              <div className="text-slate-200 font-mono text-base mt-1">₩{formatNullableNumber(bithumbCombinedKrw, 0)}</div>
                              <div className="text-slate-500 mt-1">
                                KRW ₩{formatNullableNumber(bithumbKrwTotal, 0)} · BTC ₩{formatNullableNumber(bithumbBtcKrw, 0)} · USDT ₩{formatNullableNumber(bithumbUsdtKrw, 0)}
                              </div>
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                              <div className="text-slate-500 text-[10px]">KRW 가용 현금</div>
                              <div className="text-slate-200 font-mono text-base mt-1">₩{formatNullableNumber(bithumbKrwFree, 0)}</div>
                            </div>
                          </div>
                          {translateExecutionError(bithumbPortfolioError) && (
                            <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2 break-all">
                              빗썸 잔고 조회 오류: {translateExecutionError(bithumbPortfolioError)}
                            </div>
                          )}
                          <div className="border border-slate-800 rounded-lg overflow-hidden">
                            <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                              빗썸 현물 잔고
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="text-slate-500 border-b border-slate-800">
                                    <th className="py-2 px-3 text-left">자산</th>
                                    <th className="py-2 px-3 text-right">총</th>
                                    <th className="py-2 px-3 text-right">가용</th>
                                    <th className="py-2 px-3 text-right">사용</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(bithumbPortfolio?.walletBalances ?? []).length === 0 ? (
                                    <tr>
                                      <td colSpan={4} className="py-4 text-center text-slate-500">
                                        표시할 빗썸 잔고가 없습니다.
                                      </td>
                                    </tr>
                                  ) : (
                                    (bithumbPortfolio?.walletBalances ?? []).map((item) => (
                                      <tr key={`b-${item.asset}`} className="border-b border-slate-900/70">
                                        <td className="py-2 px-3 text-slate-300 font-medium">{item.asset}</td>
                                        <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.total, 8)}</td>
                                        <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.free, 8)}</td>
                                        <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(item.used, 8)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}



              {(isPortfolioTab || isAutomationTab) && (
                <div className="lg:col-span-12 grid grid-cols-1 gap-6">
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-200">현재 포지션 (거래소별)</h3>
                      <button
                        onClick={() => void refreshExecutionData(true)}
                        className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        갱신
                      </button>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                          <span>바이낸스 현재 포지션</span>
                          <span>{binanceCurrentPositions.length}건</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                <th className="py-2 px-3 text-left">마켓</th>
                                <th className="py-2 px-3 text-left">심볼</th>
                                <th className="py-2 px-3 text-left">방향</th>
                                <th className="py-2 px-3 text-right">수량</th>
                                <th className="py-2 px-3 text-right">진입가</th>
                                <th className="py-2 px-3 text-right">현재가</th>
                                <th className="py-2 px-3 text-right">미실현손익</th>
                              </tr>
                            </thead>
                            <tbody>
                              {binanceCurrentPositions.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-4 text-center text-slate-500">
                                    현재 열린 바이낸스 포지션이 없습니다.
                                  </td>
                                </tr>
                              ) : (
                                binanceCurrentPositions.map((position, index) => {
                                  const sideMeta = resolvePositionSide(position.side, position.contracts);
                                  return (
                                    <tr key={`live-binance-pos-${position.marketLabel}-${position.symbol}-${index}`} className="border-b border-slate-900/70">
                                      <td className="py-2 px-3 text-slate-300 font-mono">{position.marketLabel}</td>
                                      <td className="py-2 px-3 text-slate-300 font-mono">{position.symbol}</td>
                                      <td className={`py-2 px-3 ${sideMeta.className}`}>{sideMeta.label}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.contracts, 8)}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.entryPrice, 2)}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.markPrice, 2)}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${position.unrealizedPnl != null && position.unrealizedPnl < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                        {formatSignedNumber(position.unrealizedPnl, 8)}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                          <span>빗썸 현재 포지션</span>
                          <span>{bithumbCurrentPositions.length}건</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-800">
                                <th className="py-2 px-3 text-left">마켓</th>
                                <th className="py-2 px-3 text-left">심볼</th>
                                <th className="py-2 px-3 text-left">방향</th>
                                <th className="py-2 px-3 text-right">수량</th>
                                <th className="py-2 px-3 text-right">진입가</th>
                                <th className="py-2 px-3 text-right">현재가</th>
                                <th className="py-2 px-3 text-right">미실현손익</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bithumbCurrentPositions.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-4 text-center text-slate-500">
                                    현재 보유 중인 빗썸 포지션이 없습니다.
                                  </td>
                                </tr>
                              ) : (
                                bithumbCurrentPositions.map((position, index) => {
                                  const sideMeta = resolvePositionSide(position.side, position.contracts);
                                  return (
                                    <tr key={`live-bithumb-pos-${position.symbol}-${index}`} className="border-b border-slate-900/70">
                                      <td className="py-2 px-3 text-slate-300 font-mono">{position.marketLabel}</td>
                                      <td className="py-2 px-3 text-slate-300 font-mono">{position.symbol}</td>
                                      <td className={`py-2 px-3 ${sideMeta.className}`}>{sideMeta.label}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.contracts, 8)}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.entryPrice, 0)}</td>
                                      <td className="py-2 px-3 text-right text-slate-300 font-mono">{formatNullableNumber(position.markPrice, 0)}</td>
                                      <td className={`py-2 px-3 text-right font-mono ${position.unrealizedPnl != null && position.unrealizedPnl < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                        {formatSignedNumber(position.unrealizedPnl, 8)}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-200">실제 체결 내역 (최근)</h3>
                      <button
                        onClick={() => void refreshExecutionData(true)}
                        className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        갱신
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-800">
                            <th className="py-2 pr-2 text-left">시간</th>
                            <th className="py-2 pr-2 text-left">거래소</th>
                            <th className="py-2 pr-2 text-left">체결</th>
                            <th className="py-2 pr-2 text-right">합성환율(P)</th>
                            <th className="py-2 pr-2 text-right">김치프리미엄%</th>
                            <th className="py-2 pr-2 text-right">국내 BTC</th>
                            <th className="py-2 pr-2 text-right">해외 BTC</th>
                            <th className="py-2 pr-2 text-right">USD/KRW</th>
                            <th className="py-2 pr-2 text-right">USDT/KRW</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedExecutionFills.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-4 text-center text-slate-500">
                                체결 내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            combinedExecutionFills.slice(0, 12).map((fill, index) => {
                              const ctx = fill.strategyContext ?? null;
                              const fillAction = ctx?.action ?? null;
                              const fillType =
                                fillAction === 'ENTRY_SELL' || fillAction === 'ENTRY_BUY'
                                  ? 'ENTRY'
                                  : fillAction === 'EXIT_BUY' || fillAction === 'EXIT_SELL'
                                    ? 'EXIT'
                                    : null;
                              const syntheticRate =
                                ctx?.krwPrice != null && ctx?.usdPrice != null && ctx.usdPrice > 0
                                  ? ctx.krwPrice / ctx.usdPrice
                                  : null;
                              const premium =
                                ctx?.effectivePremiumPct != null
                                  ? ctx.effectivePremiumPct
                                  : ctx?.premiumPct != null
                                    ? ctx.premiumPct
                                    : null;

                              return (
                                <tr key={`${fill.exchange}-${fill.id ?? 'fill'}-${index}`} className="border-b border-slate-900/70">
                                  <td className="py-2 pr-2 text-slate-300">
                                    {fill.timestamp ? new Date(fill.timestamp).toLocaleString('ko-KR') : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-slate-300">
                                    {fill.exchange === 'binance' ? '바이낸스' : '빗썸'}
                                  </td>
                                  <td
                                    className={`py-2 pr-2 font-medium ${fillType === 'ENTRY'
                                      ? 'text-rose-300'
                                      : fillType === 'EXIT'
                                        ? 'text-emerald-300'
                                        : 'text-slate-300'
                                      }`}
                                  >
                                    {fillType === 'ENTRY' ? '진입' : fillType === 'EXIT' ? '청산' : '체결'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {syntheticRate != null ? syntheticRate.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {premium != null ? `${premium.toFixed(2)}%` : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {ctx?.krwPrice != null ? `₩${Math.round(ctx.krwPrice).toLocaleString()}` : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {ctx?.usdPrice != null ? `$${ctx.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {ctx?.exchangeRate != null ? ctx.exchangeRate.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                                    {ctx?.usdtKrwRate != null ? ctx.usdtKrwRate.toFixed(2) : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-cyan-200">드라이런 체결내역 (시뮬레이션)</h3>
                      <button
                        onClick={() => void refreshExecutionData(true)}
                        className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        갱신
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-800">
                            <th className="py-2 pr-2 text-left">시간</th>
                            <th className="py-2 pr-2 text-left">거래소</th>
                            <th className="py-2 pr-2 text-left">구분</th>
                            <th className="py-2 pr-2 text-left">심볼</th>
                            <th className="py-2 pr-2 text-left">방향</th>
                            <th className="py-2 pr-2 text-right">수량</th>
                            <th className="py-2 pr-2 text-right">김프%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dryRunExecutionLogs.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-4 text-center text-slate-500">
                                드라이런 체결내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            dryRunExecutionLogs.slice(0, 20).map((item, index) => (
                              <tr key={`dryrun-${item.exchange}-${item.timestamp ?? 0}-${index}`} className="border-b border-slate-900/70">
                                <td className="py-2 pr-2 text-slate-300">
                                  {item.timestamp ? new Date(item.timestamp).toLocaleString('ko-KR') : '-'}
                                </td>
                                <td className="py-2 pr-2 text-slate-300">{item.exchange}</td>
                                <td className={`py-2 pr-2 font-medium ${item.actionLabel === '진입' ? 'text-rose-300' : item.actionLabel === '청산' ? 'text-emerald-300' : 'text-slate-300'}`}>
                                  {item.actionLabel}
                                </td>
                                <td className="py-2 pr-2 text-slate-300 font-mono">{item.symbol}</td>
                                <td className="py-2 pr-2 text-slate-300">{item.side}</td>
                                <td className="py-2 pr-2 text-right text-slate-300 font-mono">
                                  {item.amount != null ? formatNullableNumber(item.amount, 8) : '-'}
                                </td>
                                <td className="py-2 pr-2 text-right text-slate-300 font-mono">
                                  {item.premium != null ? `${item.premium.toFixed(2)}%` : '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-200">실행 이벤트 로그</h3>
                      <button
                        onClick={() => void refreshExecutionData(true)}
                        className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        갱신
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {executionEvents.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">이벤트가 없습니다.</div>
                      ) : (
                        executionEvents.slice(0, 20).map((event, index) => (
                          <div key={`${event.event}-${event.timestamp}-${index}`} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`text-[11px] font-semibold truncate ${event.level === 'error' ? 'text-rose-300' : event.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}>
                                  {translateExecutionEventName(event.event)}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                                  {event.event}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-500">
                                {translateEventLevel(event.level)} · {event.timestamp ? new Date(event.timestamp).toLocaleString('ko-KR') : '-'}
                              </span>
                            </div>
                            {typeof event.error === 'string' && (
                              <div className="text-[11px] text-rose-200 mt-1 break-all">{event.error}</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
