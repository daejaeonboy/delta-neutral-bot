export enum TradeStatus {
  IDLE = 'IDLE',
  ENTERED = 'ENTERED',
  EXITED = 'EXITED'
}

export enum Side {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export interface MarketData {
  timestamp: number;
  krwPrice: number; // Domestic Price
  btcSource?: string;
  usdPrice: number; // International Price (BTC/USDT or BTC/USD)
  globalSource?: string;
  exchangeRate: number; // USD/KRW
  exchangeRateSource?: string;
  usdtKrwRate?: number; // KRW/USDT
  conversionRate?: number; // Conversion rate used in kimchi premium calculation
  normalizedGlobalKrwPrice?: number; // usdPrice * conversionRate
  kimchiPremiumPercent: number; // Primary: based on USD/KRW
  kimchiPremiumPercentUsdt?: number; // Effective: based on USDT/KRW
  usdtPremiumPercent?: number; // USDT premium over USD/KRW
  fxCacheAgeMs?: number | null;
  sources?: {
    domestic: string;
    global: string;
    fx: string;
    conversion: string;
  };
}

export type CandleInterval = '1m' | '10m' | '30m' | '1d';

export interface PremiumCandle {
  timestamp: number; // Bucket start timestamp (UTC ms)
  open: number;
  high: number;
  low: number;
  close: number;
  domesticCloseKrw: number;
  globalCloseUsdt: number;
  conversionClose: number; // USDT basis: KRW/USDT, USD basis: USD/KRW
}

export interface PremiumCandleResponse {
  interval: CandleInterval;
  limit: number;
  generatedAt: number;
  premiumBasis?: 'USD' | 'USDT';
  usdKrwRateApplied?: number | null;
  usdKrwRateRange?: {
    min: number;
    max: number;
  } | null;
  usdKrwHistoryCoverage?: {
    source: string;
    dayCount: number;
    carryForwardFilled: number;
    carryBackwardFilled: number;
    fallbackFilled: number;
  } | null;
  candles: PremiumCandle[];
  sources: {
    domestic: string;
    global: string;
    conversion: string;
    fxFallback: string;
  };
}

export type FundingPositionSide = 'LONG' | 'SHORT';

export interface TopVolumeFundingItem {
  rank: number;
  symbol: string;
  quoteVolume24h: number;
  lastPrice: number;
  fundingRate: number; // decimal (e.g. 0.0001 = 0.01%)
  nextFundingTime: number | null;
  estimatedFundingFeeUsdt: number | null;
  estimatedFundingFeeKrw: number | null;
}

export interface TopVolumeFundingResponse {
  generatedAt: number;
  source: string;
  limit: number;
  positionSide: FundingPositionSide;
  positionNotionalUsdt: number;
  fundingIntervalHours: number;
  usdtKrwRate: number;
  symbols: TopVolumeFundingItem[];
}

export type BacktestExitReason = 'threshold' | 'forced-close';

export interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  entryPremium: number;
  exitPremium: number;
  holdingCandles: number;
  grossReturnPct: number;
  netReturnPct: number;
  profitKrw: number;
  capitalBeforeKrw: number;
  capitalAfterKrw: number;
  exitReason: BacktestExitReason;
}

export interface BacktestPremiumPoint {
  timestamp: number;
  close: number;
}

export interface PremiumBacktestResult {
  generatedAt: number;
  interval: CandleInterval;
  limit: number;
  candleCount?: number;
  premiumBasis?: 'USD' | 'USDT';
  triggerMode?: 'touch' | 'close';
  fillAtThreshold?: boolean;
  usdKrwRateApplied?: number | null;
  usdKrwRateRange?: {
    min: number;
    max: number;
  } | null;
  usdKrwHistoryCoverage?: {
    source: string;
    dayCount: number;
    carryForwardFilled: number;
    carryBackwardFilled: number;
    fallbackFilled: number;
  } | null;
  premiumRange?: {
    minClose: number;
    maxClose: number;
  } | null;
  periodStart: number | null;
  periodEnd: number | null;
  entryThreshold: number;
  exitThreshold: number;
  leverage: number;
  feeBps: number;
  slippageBps: number;
  initialCapitalKrw: number;
  finalCapitalKrw: number;
  totalProfitKrw: number;
  totalReturnPct: number;
  tradeCount: number;
  winRate: number;
  avgTradeReturnPct: number;
  maxDrawdownPct: number;
  openPosition: null | {
    entryTimestamp: number;
    entryPremium: number;
  };
  sources: {
    domestic: string;
    global: string;
    conversion: string;
    fxFallback: string;
  };
  dataSource?: 'stored-history' | 'live-fetch';
  requestedStartTime?: number | null;
  requestedEndTime?: number | null;
  historyCoverage?: {
    interval: CandleInterval;
    storedCandles: number;
    earliestTimestamp: number | null;
    latestTimestamp: number | null;
    updatedAt: number | null;
  };
  rangeBackfill?: {
    interval: CandleInterval;
    added: number;
    updated: number;
    totalStored: number;
    fetchedCandles: number;
    source: string;
    sourceInterval: string;
    rangeStart: number;
    rangeEnd: number;
  } | null;
  chartMaxPoints?: number;
  premiumSeriesRawCount?: number;
  premiumSeriesDisplayCount?: number;
  premiumSeries?: BacktestPremiumPoint[];
  trades: BacktestTrade[];
}

export type ExecutionMarketType = 'coinm' | 'usdm';

export interface ExecutionSafetySummary {
  safeMode: boolean;
  consecutiveFailures: number;
  threshold: number;
  lastFailureAt: number | null;
  lastFailureEvent: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: number | null;
  alertWebhookConfigured: boolean;
  alertCooldownMs: number;
  alertTimeoutMs: number;
  lastAlertSentAt: number | null;
  orderExecution?: {
    allowLiveOrders: boolean;
    allowTestnetOrders: boolean;
    defaultRetryCount: number;
    defaultRetryDelayMs: number;
    idempotencyTtlMs: number;
    idempotencyMaxEntries: number;
    idempotencyEntries: number;
  };
}

export interface BinanceExecutionStatusResponse {
  timestamp: number;
  connected: boolean;
  configured: boolean;
  marketType: ExecutionMarketType;
  testnet: boolean;
  credentialSource?: 'runtime' | 'env' | 'none';
  credentialKeyHint?: string | null;
  credentialUpdatedAt?: number | null;
  credentialPersisted?: boolean;
  exchangeId?: string | null;
  serverTime?: number | null;
  balance?: {
    asset: string;
    free: number | null;
    used: number | null;
    total: number | null;
  };
  safety?: ExecutionSafetySummary;
  error?: string;
}

export interface ExecutionCredentialsStatusResponse {
  timestamp: number;
  credentials: {
    configured: boolean;
    source: 'runtime' | 'env' | 'none';
    keyHint: string | null;
    updatedAt: number | null;
    persisted: boolean;
    envConfigured: boolean;
    runtimeConfigured: boolean;
    binance?: {
      configured: boolean;
      source: 'runtime' | 'env' | 'none';
      keyHint: string | null;
      updatedAt: number | null;
      persisted: boolean;
    };
    bithumb?: {
      configured: boolean;
      source: 'runtime' | 'env' | 'none';
      keyHint: string | null;
      updatedAt: number | null;
      persisted: boolean;
    };
  };
}

export interface AuthSessionResponse {
  timestamp: number;
  auth: {
    enabled: boolean;
    tokenEnabled: boolean;
    passwordEnabled: boolean;
    authenticated: boolean;
    username: string | null;
    expiresAt: number | null;
  };
}

export interface BinanceExecutionPositionResponse {
  timestamp: number;
  marketType: ExecutionMarketType;
  symbol: string;
  testnet: boolean;
  hasPosition: boolean;
  safety?: ExecutionSafetySummary;
  position: null | {
    symbol: string;
    side: string | null;
    contracts: number | null;
    contractSize: number | null;
    notional: number | null;
    leverage: number | null;
    entryPrice: number | null;
    markPrice: number | null;
    unrealizedPnl: number | null;
    liquidationPrice: number | null;
    marginMode: string | null;
  };
  error?: string;
}

export interface BinanceExecutionPortfolioResponse {
  timestamp: number;
  connected: boolean;
  configured: boolean;
  marketType: ExecutionMarketType;
  symbol: string;
  testnet: boolean;
  balanceAsset: string;
  safety?: ExecutionSafetySummary;
  walletBalances: Array<{
    asset: string;
    free: number | null;
    used: number | null;
    total: number | null;
  }>;
  positions: Array<{
    symbol: string;
    side: string | null;
    contracts: number | null;
    contractSize: number | null;
    notional: number | null;
    leverage: number | null;
    entryPrice: number | null;
    markPrice: number | null;
    unrealizedPnl: number | null;
    liquidationPrice: number | null;
    marginMode: string | null;
  }>;
  summary: {
    walletAssetFree: number | null;
    walletAssetUsed: number | null;
    walletAssetTotal: number | null;
    walletBalanceCount: number;
    activePositionCount: number;
    totalUnrealizedPnl: number | null;
  };
  error?: string;
}

export interface BithumbExecutionPortfolioResponse {
  timestamp: number;
  connected: boolean;
  configured: boolean;
  marketType: 'spot';
  symbol: string;
  testnet: boolean;
  balanceAsset: string;
  safety?: ExecutionSafetySummary;
  walletBalances: Array<{
    asset: string;
    free: number | null;
    used: number | null;
    total: number | null;
  }>;
  positions: Array<{
    symbol: string;
    side: string | null;
    contracts: number | null;
    contractSize: number | null;
    notional: number | null;
    leverage: number | null;
    entryPrice: number | null;
    markPrice: number | null;
    unrealizedPnl: number | null;
    liquidationPrice: number | null;
    marginMode: string | null;
  }>;
  summary: {
    walletAssetFree: number | null;
    walletAssetUsed: number | null;
    walletAssetTotal: number | null;
    walletBalanceCount: number;
    activePositionCount: number;
    totalUnrealizedPnl: number | null;
  };
  error?: string;
}

export interface BinanceExecutionFill {
  id: string | null;
  orderId: string | null;
  timestamp: number | null;
  datetime: string | null;
  side: string | null;
  type: string | null;
  amount: number | null;
  price: number | null;
  cost: number | null;
  fee: null | {
    currency: string | null;
    cost: number | null;
    rate: number | null;
  };
  realizedPnl: number | null;
  maker: boolean | null;
  takerOrMaker: string | null;
  strategyContext?: {
    action: 'ENTRY_SELL' | 'EXIT_BUY' | 'ENTRY_BUY' | 'EXIT_SELL' | null;
    decisionTimestamp: number | null;
    premiumPct: number | null;
    effectivePremiumPct: number | null;
    usdtKrwRate: number | null;
    exchangeRate: number | null;
    usdPrice: number | null;
    krwPrice: number | null;
  } | null;
}

export interface BithumbExecutionFill {
  id: string | null;
  orderId: string | null;
  timestamp: number | null;
  datetime: string | null;
  side: string | null;
  type: string | null;
  amount: number | null;
  price: number | null;
  cost: number | null;
  fee: null | {
    currency: string | null;
    cost: number | null;
    rate: number | null;
  };
  realizedPnl: number | null;
  maker: boolean | null;
  takerOrMaker: string | null;
  strategyContext?: {
    action: 'ENTRY_SELL' | 'EXIT_BUY' | 'ENTRY_BUY' | 'EXIT_SELL' | null;
    decisionTimestamp: number | null;
    premiumPct: number | null;
    effectivePremiumPct: number | null;
    usdtKrwRate: number | null;
    exchangeRate: number | null;
    usdPrice: number | null;
    krwPrice: number | null;
  } | null;
}

export interface BinanceExecutionFillsResponse {
  timestamp: number;
  marketType: ExecutionMarketType;
  symbol: string;
  testnet: boolean;
  safety?: ExecutionSafetySummary;
  limit: number;
  since: number | null;
  count: number;
  fills: BinanceExecutionFill[];
  error?: string;
}

export interface BithumbExecutionFillsResponse {
  timestamp: number;
  marketType: 'spot';
  symbol: string;
  testnet: boolean;
  safety?: ExecutionSafetySummary;
  limit: number;
  since: number | null;
  count: number;
  fills: BithumbExecutionFill[];
  error?: string;
}

export interface ExecutionEventsResponse {
  timestamp: number;
  count: number;
  totalExecutionEvents: number;
  totalBuffered: number;
  filters: {
    limit: number;
    onlyFailures: boolean;
    level: string | null;
    marketType: ExecutionMarketType | null;
  };
  logFile: string;
  events: Array<{
    timestamp: number;
    isoTime: string;
    level: string;
    event: string;
    [key: string]: unknown;
  }>;
}

export interface ExecutionSafetyResponse {
  timestamp: number;
  safety: ExecutionSafetySummary;
}

export interface ExecutionEngineState {
  running: boolean;
  busy: boolean;
  marketType: ExecutionMarketType;
  symbol: string;
  orderBalancePctEntry: number;
  orderBalancePctExit: number;
  dryRun: boolean;
  premiumBasis: 'USD' | 'USDT';
  entryThreshold: number;
  exitThreshold: number;
  positionState: 'IDLE' | 'ENTERED';
  pollIntervalMs: number;
  orderCooldownMs: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastDecisionAt: number | null;
  lastOrderAt: number | null;
  lastOrderSide: 'buy' | 'sell' | null;
  lastOrderId: string | null;
  lastOrderAmount: number | null;
  lastPremium: number | null;
  lastEffectivePremium: number | null;
  lastMarketDataTimestamp: number | null;
  iterations: number;
  lastError: string | null;
  lastOrderError: string | null;
  stopReason: string | null;
  leaderReplicaId?: string | null;
  currentReplicaId?: string | null;
}

export interface ExecutionEngineStatusResponse {
  timestamp: number;
  safety?: ExecutionSafetySummary;
  engine: ExecutionEngineState;
}

export interface ExecutionEngineReadinessCheck {
  key: string;
  ok: boolean;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

export interface ExecutionEngineReadinessResponse {
  timestamp: number;
  durationMs: number;
  mode: 'live' | 'dryrun';
  marketType: ExecutionMarketType;
  symbol: string;
  testnet: boolean;
  ready: boolean;
  safety?: ExecutionSafetySummary;
  engine: ExecutionEngineState;
  checks: ExecutionEngineReadinessCheck[];
}

export interface StartExecutionEngineRequest {
  marketType: ExecutionMarketType;
  symbol?: string;
  dryRun: boolean;
  premiumBasis?: 'USD' | 'USDT';
  entryThreshold: number;
  exitThreshold: number;
  orderBalancePctEntry: number;
  orderBalancePctExit: number;
}

export interface TradeLog {
  id: string;
  timestamp: number;
  type: 'ENTRY' | 'EXIT';
  premium: number;
  krwPrice: number;
  usdPrice: number;
  profit?: number;
  description: string;
}

export interface BotConfig {
  entryThreshold: number; // Sell threshold (e.g., 2.0%)
  exitThreshold: number;  // Buy threshold (e.g., 0.0%)
  leverage: number;
  investmentKrw: number;
}

export interface StrategyRisk {
  id: string;
  name: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}
