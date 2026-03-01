import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Play, Pause, Zap, DollarSign, RefreshCw, TrendingUp, Plus, X, Save } from 'lucide-react';
import { MetricCard } from './components/MetricCard';
import {
  BithumbExecutionPortfolioResponse,
  ExecutionCredentialsStatusResponse,
  ExecutionEngineReadinessResponse,
  BinanceExecutionFill,
  ExecutionEngineStatusResponse,
  BinanceExecutionPortfolioResponse,
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
  fetchExecutionPortfolio,
  fetchBithumbExecutionPortfolio,
  fetchExecutionPosition,
  fetchExecutionSafety,
  fetchExecutionStatus,
  fetchLiveMarketData,
  resetExecutionSafety,
  startExecutionEngine,
  stopExecutionEngine,
  updateExecutionCredentials,
  fetchDiscordConfig,
  updateDiscordConfig,
  sendDiscordTest,
  DiscordConfigResponse,
  DiscordNotificationSettings,
  PremiumAlertThreshold,
  getApiBaseCandidates,
} from './services/marketService';

const POLLING_INTERVAL_MS = 3000;
const EXECUTION_REFRESH_INTERVAL_MS = 15000;

type SidebarSection = 'automation' | 'portfolio' | 'settings';

const App: React.FC = () => {
  // --- State ---
  const [currentData, setCurrentData] = useState<MarketData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<number | null>(null);

  // Bot Config
  const [config, setConfig] = useState<BotConfig>({
    entryThreshold: 2.0,
    exitThreshold: 0.0,
    leverage: 1,
    investmentKrw: INITIAL_CAPITAL
  });

  // Execution State
  const [executionMarketType, setExecutionMarketType] = useState<ExecutionMarketType>('coinm');
  const [executionSymbol, setExecutionSymbol] = useState<string>(defaultSymbolByMarketType('coinm'));
  const [executionDryRun, setExecutionDryRun] = useState<boolean>(true);
  const [executionOrderBalancePctEntry, setExecutionOrderBalancePctEntry] = useState<number>(10);
  const [executionOrderBalancePctExit, setExecutionOrderBalancePctExit] = useState<number>(10);
  const [executionStatus, setExecutionStatus] = useState<BinanceExecutionStatusResponse | null>(null);
  const [executionSafety, setExecutionSafety] = useState<ExecutionSafetyResponse | null>(null);
  const [executionPosition, setExecutionPosition] = useState<BinanceExecutionPositionResponse | null>(null);
  const [executionPortfolio, setExecutionPortfolio] = useState<BinanceExecutionPortfolioResponse | null>(null);
  const [bithumbPortfolio, setBithumbPortfolio] = useState<BithumbExecutionPortfolioResponse | null>(null);
  const [executionFills, setExecutionFills] = useState<BinanceExecutionFill[]>([]);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEventsResponse['events']>([]);
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
  const [isReadinessChecking, setIsReadinessChecking] = useState<boolean>(false);
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
        fetchBithumbExecutionPortfolio({
          symbol: 'BTC/KRW',
          balanceLimit: 8,
        }),
        fetchExecutionFills({
          marketType: executionMarketType,
          symbol: executionSymbol.trim(),
          limit: 20,
        }),
        fetchExecutionEvents({
          limit: 30,
          marketType: executionMarketType,
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

      const fillsResult = settled[5];
      if (fillsResult.status === 'fulfilled') {
        setBithumbPortfolio(fillsResult.value);
        setBithumbExecutionError(fillsResult.value.error ?? null);
      } else {
        const message = fillsResult.reason instanceof Error ? fillsResult.reason.message : String(fillsResult.reason);
        setBithumbExecutionError(message);
      }

      const fillsResult2 = settled[6];
      if (fillsResult2.status === 'fulfilled') {
        setExecutionFills(fillsResult2.value.fills);
      } else {
        errors.push(fillsResult2.reason instanceof Error ? fillsResult2.reason.message : String(fillsResult2.reason));
      }

      const eventsResult = settled[7];
      if (eventsResult.status === 'fulfilled') {
        setExecutionEvents(eventsResult.value.events);
      } else {
        errors.push(eventsResult.reason instanceof Error ? eventsResult.reason.message : String(eventsResult.reason));
      }

      const engineResult = settled[8];
      if (engineResult.status === 'fulfilled') {
        const engineStatus = engineResult.value;
        setExecutionEngineStatus(engineStatus);
        const loadedEntryPct = engineStatus.engine.orderBalancePctEntry;
        if (Number.isFinite(loadedEntryPct) && loadedEntryPct > 0) {
          setExecutionOrderBalancePctEntry(loadedEntryPct);
        }
        const loadedExitPct = engineStatus.engine.orderBalancePctExit;
        if (Number.isFinite(loadedExitPct) && loadedExitPct > 0) {
          setExecutionOrderBalancePctExit(loadedExitPct);
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
        if (!executionDryRun && !executionStatus?.connected) {
          setExecutionError('실주문 모드에서는 먼저 바이낸스 연결 상태가 connected=true 여야 합니다.');
          return;
        }

        if (!Number.isFinite(executionOrderBalancePctEntry) || executionOrderBalancePctEntry <= 0 || executionOrderBalancePctEntry > 100) {
          setExecutionError('진입 주문 비율(%)을 0~100 사이로 입력하세요.');
          return;
        }

        if (!Number.isFinite(executionOrderBalancePctExit) || executionOrderBalancePctExit <= 0 || executionOrderBalancePctExit > 100) {
          setExecutionError('청산 주문 비율(%)을 0~100 사이로 입력하세요.');
          return;
        }

        if (config.entryThreshold <= config.exitThreshold) {
          setExecutionError('진입 기준은 청산 기준보다 커야 합니다.');
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
          dryRun: executionDryRun,
          premiumBasis: 'USD',
          entryThreshold: config.entryThreshold,
          exitThreshold: config.exitThreshold,
          orderBalancePctEntry: executionOrderBalancePctEntry,
          orderBalancePctExit: executionOrderBalancePctExit,
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
    executionDryRun,
    executionEngineStatus?.engine.running,
    executionMarketType,
    executionOrderBalancePctEntry,
    executionOrderBalancePctExit,
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
  const executionWalletUsed =
    executionPortfolioSummary?.walletAssetUsed ??
    executionStatus?.balance?.used ??
    null;
  const executionWalletTotal =
    executionPortfolioSummary?.walletAssetTotal ??
    executionStatus?.balance?.total ??
    null;
  const executionTotalUnrealizedPnl =
    executionPortfolioSummary?.totalUnrealizedPnl ??
    executionPosition?.position?.unrealizedPnl ??
    null;
  const executionPrimaryPositionNotional =
    executionPosition?.position?.notional ?? null;
  const balanceAssetToKrw =
    executionPortfolioBalanceAsset === 'BTC'
      ? (currentData?.krwPrice ?? null)
      : (currentData?.usdtKrwRate ?? currentData?.exchangeRate ?? null);
  const executionWalletTotalKrw =
    executionWalletTotal != null && Number.isFinite(balanceAssetToKrw ?? NaN)
      ? executionWalletTotal * balanceAssetToKrw
      : null;
  const executionBalanceText =
    `${executionPortfolioBalanceAsset} ${formatNullableNumber(executionWalletFree, 8)}`;
  const bithumbKrwTotal = bithumbPortfolioSummary?.walletAssetTotal ?? null;
  const bithumbKrwFree = bithumbPortfolioSummary?.walletAssetFree ?? null;
  const combinedExecutionFills = useMemo(
    () =>
      executionFills
        .map((fill) => ({ ...fill, exchange: 'binance' as const }))
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [executionFills]
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
              <div className={`${isAutomationTab || isPortfolioTab ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col gap-6`}>

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
                      title="김치 프리미엄 (%)"
                      value={`${currentData.kimchiPremiumPercent.toFixed(2)}%`}
                      subValue={`진입 기준: ${config.entryThreshold}%`}
                      trend={currentData.kimchiPremiumPercent > 0 ? 'up' : 'down'}
                      icon={<Activity size={16} />}
                    />
                    <MetricCard
                      title="국내 비트코인 (KRW)"
                      value={`₩${Math.round(currentData.krwPrice / 10000).toLocaleString()}만`}
                      subValue={`${currentData.btcSource ?? 'Bithumb'}`}
                      icon={<TrendingUp size={16} />}
                    />
                    <MetricCard
                      title="해외 비트코인 (USD)"
                      value={`$${(currentData.usdPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                      subValue={`${currentData.globalSource ?? 'Binance COIN-M'}`}
                      icon={<Activity size={16} />}
                    />
                    <MetricCard
                      title="리얼 환율 (USD/KRW)"
                      value={`₩${currentData.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                      subValue="은행 기준"
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

              {/* Right Col: Settings & Controls (Now on the right) */}
              {(isAutomationTab || isPortfolioTab) && (
                <div className="lg:col-span-4 space-y-6">

                  {isAutomationTab && (
                    <div id="automation-section" className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">자동매매 실행 설정</h3>
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
                          <label className="text-slate-400 flex flex-col gap-1">
                            청산 주문 비율 (%)
                            <input
                              type="number"
                              min={0.1}
                              max={100}
                              step={0.1}
                              value={Number.isFinite(executionOrderBalancePctExit) ? executionOrderBalancePctExit : 0}
                              onChange={(e) => setExecutionOrderBalancePctExit(Number(e.target.value))}
                              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                              placeholder="예: 10"
                            />
                          </label>
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
                  )}

                  {isPortfolioTab && (
                    <div id="portfolio-section" className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-200">보유자산 포트폴리오</h3>
                        <button
                          onClick={() => document.getElementById('portfolio-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                        >
                          상세 보기
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <span className="block text-slate-500 text-[10px] mb-1">총 보유</span>
                          <span className="text-slate-200 font-mono text-sm">{formatNullableNumber(executionWalletTotal, 8)} {executionPortfolioBalanceAsset}</span>
                        </div>
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <span className="block text-slate-500 text-[10px] mb-1">가용 자산</span>
                          <span className="text-slate-200 font-mono text-sm">{formatNullableNumber(executionWalletFree, 8)}</span>
                        </div>
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <span className="block text-slate-500 text-[10px] mb-1">미실현손익</span>
                          <span className={`font-mono text-sm ${executionTotalUnrealizedPnl != null && executionTotalUnrealizedPnl < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatSignedNumber(executionTotalUnrealizedPnl, 8)}</span>
                        </div>
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <span className="block text-slate-500 text-[10px] mb-1">오픈 포지션</span>
                          <span className="text-slate-200 font-mono text-sm">{executionPortfolio?.summary?.activePositionCount ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isPortfolioTab && (
                <div id="portfolio-detail" className="lg:col-span-12 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-200">상세 포트폴리오</h3>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800 px-2 py-1 rounded">
                      {executionPortfolio?.testnet ? 'Testnet' : 'Live'} · {executionMarketType.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-4">
                    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="text-slate-500">총 보유 ({executionPortfolioBalanceAsset})</div>
                      <div className="text-slate-200 font-mono">
                        {formatNullableNumber(executionWalletTotal, 8)}
                      </div>
                      <div className="text-slate-500">
                        ₩{formatNullableNumber(executionWalletTotalKrw, 0)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="text-slate-500">가용 잔고</div>
                      <div className="text-slate-200 font-mono">
                        {formatNullableNumber(executionWalletFree, 8)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="text-slate-500">사용 중 잔고</div>
                      <div className="text-slate-200 font-mono">
                        {formatNullableNumber(executionWalletUsed, 8)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="text-slate-500">미실현 손익</div>
                      <div
                        className={`font-mono ${executionTotalUnrealizedPnl != null && executionTotalUnrealizedPnl < 0 ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                      >
                        {formatSignedNumber(executionTotalUnrealizedPnl, 8)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                      <div className="text-slate-500">주문 심볼 노출액</div>
                      <div className="text-slate-200 font-mono">
                        {formatNullableNumber(executionPrimaryPositionNotional, 4)}
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-lg overflow-hidden mb-4">
                    <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
                      <span>빗썸 현물 잔고</span>
                      <span className={`text-[10px] ${bithumbPortfolioConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {bithumbPortfolioConnected ? '연결됨' : bithumbPortfolioConfigured ? '연결 실패' : '미설정'}
                      </span>
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-slate-500">KRW 총 보유</div>
                          <div className="text-slate-200 font-mono">₩{formatNullableNumber(bithumbKrwTotal, 0)}</div>
                        </div>
                        <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                          <div className="text-slate-500">KRW 가용 잔고</div>
                          <div className="text-slate-200 font-mono">₩{formatNullableNumber(bithumbKrwFree, 0)}</div>
                        </div>
                      </div>
                      {translateExecutionError(bithumbPortfolioError) && (
                        <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2">
                          빗썸 잔고 조회 오류: {translateExecutionError(bithumbPortfolioError)}
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

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="border border-slate-800 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 text-xs text-slate-400 bg-slate-950/50 border-b border-slate-800">
                        자산별 잔고
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
                            {(executionPortfolio?.walletBalances ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-slate-500">
                                  표시할 잔고가 없습니다.
                                </td>
                              </tr>
                            ) : (
                              (executionPortfolio?.walletBalances ?? []).map((item) => (
                                <tr key={item.asset} className="border-b border-slate-900/70">
                                  <td className="py-2 px-3 text-slate-300 font-medium">{item.asset}</td>
                                  <td className="py-2 px-3 text-right text-slate-300 font-mono">
                                    {formatNullableNumber(item.total, 8)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-300 font-mono">
                                    {formatNullableNumber(item.free, 8)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-300 font-mono">
                                    {formatNullableNumber(item.used, 8)}
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
                        활성 포지션
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
                            {(executionPortfolio?.positions ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-slate-500">
                                  열린 포지션이 없습니다.
                                </td>
                              </tr>
                            ) : (
                              (executionPortfolio?.positions ?? []).map((position) => (
                                <tr key={`${position.symbol}-${position.side ?? 'none'}`} className="border-b border-slate-900/70">
                                  <td className="py-2 px-3 text-slate-300 font-mono">{position.symbol}</td>
                                  <td className={`py-2 px-3 ${(position.side ?? '').toLowerCase() === 'short' ? 'text-emerald-300' : 'text-indigo-300'}`}>
                                    {position.side ? position.side.toUpperCase() : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-300 font-mono">
                                    {formatNullableNumber(position.contracts, 8)}
                                  </td>
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
              )}

              {(isPortfolioTab || isAutomationTab) && (
                <div className="lg:col-span-12 grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                                  <td className="py-2 pr-2 text-emerald-300 font-medium">성공</td>
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
                              <span className={`text-[11px] font-semibold ${event.level === 'error' ? 'text-rose-300' : event.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {event.event}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {event.timestamp ? new Date(event.timestamp).toLocaleString('ko-KR') : '-'}
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
