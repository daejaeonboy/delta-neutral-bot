import {
    AuthSessionResponse,
    BinanceExecutionFillsResponse,
    BinanceExecutionPortfolioResponse,
    BinanceExecutionPositionResponse,
    BinanceExecutionStatusResponse,
    CandleInterval,
    ExecutionCredentialsStatusResponse,
    ExecutionEngineReadinessResponse,
    ExecutionEngineStatusResponse,
    ExecutionEventsResponse,
    ExecutionMarketType,
    ExecutionSafetyResponse,
    FundingPositionSide,
    MarketData,
    PremiumBacktestResult,
    PremiumCandle,
    PremiumCandleResponse,
    StartExecutionEngineRequest,
    TopVolumeFundingResponse,
} from '../types';

const DEFAULT_API_FETCH_TIMEOUT_MS = 12_000;
const parsedApiFetchTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const API_FETCH_TIMEOUT_MS =
    Number.isFinite(parsedApiFetchTimeoutMs) && parsedApiFetchTimeoutMs > 0
        ? parsedApiFetchTimeoutMs
        : DEFAULT_API_FETCH_TIMEOUT_MS;
const DEFAULT_BACKTEST_FETCH_TIMEOUT_MS = 120_000;
const parsedBacktestFetchTimeoutMs = Number(import.meta.env.VITE_BACKTEST_API_TIMEOUT_MS);
const BACKTEST_FETCH_TIMEOUT_MS =
    Number.isFinite(parsedBacktestFetchTimeoutMs) && parsedBacktestFetchTimeoutMs > 0
        ? parsedBacktestFetchTimeoutMs
        : DEFAULT_BACKTEST_FETCH_TIMEOUT_MS;

function normalizeBaseUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/$/, '');
}

function isLocalHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function buildApiBaseCandidates(): string[] {
    const candidates: string[] = [];

    const envBase = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
    if (envBase) {
        candidates.push(envBase);
    }

    if (typeof window !== 'undefined') {
        const isLocal = isLocalHostname(window.location.hostname);

        if (isLocal) {
            const localWithCurrentHost = normalizeBaseUrl(
                `${window.location.protocol}//${window.location.hostname}:4000`
            );
            if (localWithCurrentHost) {
                candidates.push(localWithCurrentHost);
            }

            const localhost = normalizeBaseUrl('http://localhost:4000');
            if (localhost) {
                candidates.push(localhost);
            }
        }

        const sameOrigin = normalizeBaseUrl(window.location.origin);
        const isSameOriginBackend = window.location.port === '4000';
        if (sameOrigin && (!isLocal || isSameOriginBackend)) {
            candidates.push(sameOrigin);
        }
    }

    const unique: string[] = [];
    for (const candidate of candidates) {
        if (!unique.includes(candidate)) {
            unique.push(candidate);
        }
    }

    return unique;
}

const apiBaseCandidates = buildApiBaseCandidates();
const EXECUTION_ADMIN_TOKEN_STORAGE_KEY = 'execution_admin_token';

function getExecutionAdminTokenFromStorage(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const token = window.localStorage.getItem(EXECUTION_ADMIN_TOKEN_STORAGE_KEY);
        if (!token) return null;
        const trimmed = token.trim();
        return trimmed.length > 0 ? trimmed : null;
    } catch {
        return null;
    }
}

export function getExecutionAdminToken(): string | null {
    return getExecutionAdminTokenFromStorage();
}

export function setExecutionAdminToken(token: string): void {
    if (typeof window === 'undefined') return;
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!normalized) return;
    window.localStorage.setItem(EXECUTION_ADMIN_TOKEN_STORAGE_KEY, normalized);
}

export function clearExecutionAdminToken(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(EXECUTION_ADMIN_TOKEN_STORAGE_KEY);
}

function toFiniteNumber(value: unknown): number | null {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeMarketPayload(payload: any): MarketData {
    const timestamp = toFiniteNumber(payload?.timestamp);
    const krwPrice = toFiniteNumber(payload?.krwPrice);
    const usdPrice = toFiniteNumber(payload?.usdPrice);
    const exchangeRate = toFiniteNumber(payload?.exchangeRate);
    const kimchiPremiumPercent = toFiniteNumber(payload?.kimchiPremiumPercent);

    if (
        timestamp === null ||
        krwPrice === null ||
        usdPrice === null ||
        exchangeRate === null ||
        kimchiPremiumPercent === null
    ) {
        throw new Error('Invalid market payload from backend');
    }

    const usdtKrwRate = toFiniteNumber(payload?.usdtKrwRate) ?? undefined;
    const conversionRate = toFiniteNumber(payload?.conversionRate) ?? undefined;
    const normalizedGlobalKrwPrice = toFiniteNumber(payload?.normalizedGlobalKrwPrice) ?? undefined;
    const kimchiPremiumPercentUsdt = toFiniteNumber(payload?.kimchiPremiumPercentUsdt) ?? undefined;
    const usdtPremiumPercent = toFiniteNumber(payload?.usdtPremiumPercent) ?? undefined;
    const fxCacheAgeMs = toFiniteNumber(payload?.fxCacheAgeMs);
    const sources =
        payload?.sources &&
            typeof payload.sources.domestic === 'string' &&
            typeof payload.sources.global === 'string' &&
            typeof payload.sources.fx === 'string' &&
            typeof payload.sources.conversion === 'string'
            ? payload.sources
            : undefined;

    return {
        timestamp,
        krwPrice,
        usdPrice,
        exchangeRate,
        usdtKrwRate,
        conversionRate,
        normalizedGlobalKrwPrice,
        kimchiPremiumPercent,
        kimchiPremiumPercentUsdt,
        usdtPremiumPercent,
        fxCacheAgeMs: fxCacheAgeMs === null ? undefined : fxCacheAgeMs,
        sources,
    };
}

function normalizePremiumCandleResponse(payload: any): PremiumCandleResponse {
    if (
        !payload ||
        typeof payload.interval !== 'string' ||
        !Array.isArray(payload.candles) ||
        typeof payload.limit !== 'number' ||
        typeof payload.generatedAt !== 'number'
    ) {
        throw new Error('Invalid premium candle payload from backend');
    }

    const candles: PremiumCandle[] = payload.candles
        .map((candle: any) => {
            const timestamp = toFiniteNumber(candle?.timestamp);
            const open = toFiniteNumber(candle?.open);
            const high = toFiniteNumber(candle?.high);
            const low = toFiniteNumber(candle?.low);
            const close = toFiniteNumber(candle?.close);
            const domesticCloseKrw = toFiniteNumber(candle?.domesticCloseKrw);
            const globalCloseUsdt = toFiniteNumber(candle?.globalCloseUsdt);
            const conversionClose = toFiniteNumber(candle?.conversionClose);

            if (
                timestamp === null ||
                open === null ||
                high === null ||
                low === null ||
                close === null ||
                domesticCloseKrw === null ||
                globalCloseUsdt === null ||
                conversionClose === null
            ) {
                return null;
            }

            return {
                timestamp,
                open,
                high,
                low,
                close,
                domesticCloseKrw,
                globalCloseUsdt,
                conversionClose,
            };
        })
        .filter((candle: PremiumCandle | null): candle is PremiumCandle => candle !== null);

    if (candles.length === 0) {
        throw new Error('Premium candle payload is empty');
    }

    const usdKrwRateApplied =
        payload?.usdKrwRateApplied == null ? null : toFiniteNumber(payload.usdKrwRateApplied);
    const usdKrwRateRangePayload = payload?.usdKrwRateRange;
    const usdKrwRateRange =
        usdKrwRateRangePayload &&
            toFiniteNumber(usdKrwRateRangePayload?.min) !== null &&
            toFiniteNumber(usdKrwRateRangePayload?.max) !== null
            ? {
                min: Number(usdKrwRateRangePayload.min),
                max: Number(usdKrwRateRangePayload.max),
            }
            : null;
    const usdKrwHistoryCoveragePayload = payload?.usdKrwHistoryCoverage;
    const usdKrwHistoryCoverage =
        usdKrwHistoryCoveragePayload &&
            typeof usdKrwHistoryCoveragePayload.source === 'string' &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.dayCount) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.carryForwardFilled) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.carryBackwardFilled) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.fallbackFilled) !== null
            ? {
                source: usdKrwHistoryCoveragePayload.source,
                dayCount: Number(usdKrwHistoryCoveragePayload.dayCount),
                carryForwardFilled: Number(usdKrwHistoryCoveragePayload.carryForwardFilled),
                carryBackwardFilled: Number(usdKrwHistoryCoveragePayload.carryBackwardFilled),
                fallbackFilled: Number(usdKrwHistoryCoveragePayload.fallbackFilled),
            }
            : null;

    return {
        interval: payload.interval as CandleInterval,
        limit: payload.limit,
        generatedAt: payload.generatedAt,
        premiumBasis:
            payload?.premiumBasis === 'USD'
                ? 'USD'
                : payload?.premiumBasis === 'USDT'
                    ? 'USDT'
                    : undefined,
        usdKrwRateApplied,
        usdKrwRateRange,
        usdKrwHistoryCoverage,
        candles,
        sources:
            payload?.sources &&
                typeof payload.sources.domestic === 'string' &&
                typeof payload.sources.global === 'string' &&
                typeof payload.sources.conversion === 'string' &&
                typeof payload.sources.fxFallback === 'string'
                ? payload.sources
                : {
                    domestic: 'upbit:KRW-BTC',
                    global: 'binance:BTCUSDT',
                    conversion: 'upbit:KRW-USDT',
                    fxFallback: 'open.er-api:USD/KRW',
                },
    };
}

function normalizeTopVolumeFundingResponse(payload: any): TopVolumeFundingResponse {
    if (
        !payload ||
        typeof payload.generatedAt !== 'number' ||
        typeof payload.source !== 'string' ||
        typeof payload.limit !== 'number' ||
        typeof payload.positionSide !== 'string' ||
        typeof payload.positionNotionalUsdt !== 'number' ||
        typeof payload.fundingIntervalHours !== 'number' ||
        typeof payload.usdtKrwRate !== 'number' ||
        !Array.isArray(payload.symbols)
    ) {
        throw new Error('Invalid top volume funding payload from backend');
    }

    const symbols = payload.symbols
        .map((item: any) => {
            const rank = toFiniteNumber(item?.rank);
            const symbol = typeof item?.symbol === 'string' ? item.symbol : null;
            const quoteVolume24h = toFiniteNumber(item?.quoteVolume24h);
            const lastPrice = toFiniteNumber(item?.lastPrice);
            const fundingRate = toFiniteNumber(item?.fundingRate);
            const nextFundingTime = item?.nextFundingTime == null ? null : toFiniteNumber(item.nextFundingTime);
            const estimatedFundingFeeUsdt =
                item?.estimatedFundingFeeUsdt == null ? null : toFiniteNumber(item.estimatedFundingFeeUsdt);
            const estimatedFundingFeeKrw =
                item?.estimatedFundingFeeKrw == null ? null : toFiniteNumber(item.estimatedFundingFeeKrw);

            if (
                rank === null ||
                symbol === null ||
                quoteVolume24h === null ||
                lastPrice === null ||
                fundingRate === null
            ) {
                return null;
            }

            return {
                rank,
                symbol,
                quoteVolume24h,
                lastPrice,
                fundingRate,
                nextFundingTime,
                estimatedFundingFeeUsdt,
                estimatedFundingFeeKrw,
            };
        })
        .filter((item) => item !== null);

    if (symbols.length === 0) {
        throw new Error('Top volume funding payload is empty');
    }

    const positionSide = payload.positionSide.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';

    return {
        generatedAt: payload.generatedAt,
        source: payload.source,
        limit: payload.limit,
        positionSide,
        positionNotionalUsdt: payload.positionNotionalUsdt,
        fundingIntervalHours: payload.fundingIntervalHours,
        usdtKrwRate: payload.usdtKrwRate,
        symbols,
    };
}

export interface MultiPremiumCoin {
    symbol: string;
    krwPrice: number;
    usdtPrice: number;
    volume24hKrw: number;
    premiumUsd: number;
    premiumUsdt: number;
}

export interface MultiPremiumResponse {
    timestamp: number;
    usdKrw: number;
    usdtKrw: number;
    usdtPremiumPercent: number;
    fxSource: string;
    globalSource?: string;
    count: number;
    coins: MultiPremiumCoin[];
}

function normalizeMultiPremiumResponse(payload: any): MultiPremiumResponse {
    const timestamp = toFiniteNumber(payload?.timestamp);
    const usdKrw = toFiniteNumber(payload?.usdKrw);
    const usdtKrw = toFiniteNumber(payload?.usdtKrw);
    const usdtPremiumPercent = toFiniteNumber(payload?.usdtPremiumPercent);
    const count = toFiniteNumber(payload?.count);

    if (
        timestamp === null ||
        usdKrw === null ||
        usdtKrw === null ||
        usdtPremiumPercent === null ||
        count === null ||
        !Array.isArray(payload?.coins)
    ) {
        throw new Error('Invalid multi-premium response');
    }

    const coins = payload.coins
        .map((coin: any): MultiPremiumCoin | null => {
            const symbol = typeof coin?.symbol === 'string' ? coin.symbol : null;
            const krwPrice = toFiniteNumber(coin?.krwPrice);
            const usdtPrice = toFiniteNumber(coin?.usdtPrice);
            const volume24hKrw = toFiniteNumber(coin?.volume24hKrw);
            const premiumUsd = toFiniteNumber(coin?.premiumUsd);
            const premiumUsdt = toFiniteNumber(coin?.premiumUsdt);

            if (
                symbol === null ||
                krwPrice === null ||
                usdtPrice === null ||
                volume24hKrw === null ||
                premiumUsd === null ||
                premiumUsdt === null
            ) {
                return null;
            }

            return {
                symbol,
                krwPrice,
                usdtPrice,
                volume24hKrw,
                premiumUsd,
                premiumUsdt,
            };
        })
        .filter((coin: MultiPremiumCoin | null): coin is MultiPremiumCoin => coin !== null);

    if (coins.length === 0) {
        throw new Error('Multi-premium payload is empty');
    }

    return {
        timestamp,
        usdKrw,
        usdtKrw,
        usdtPremiumPercent,
        fxSource: typeof payload?.fxSource === 'string' ? payload.fxSource : 'unknown',
        globalSource: typeof payload?.globalSource === 'string' ? payload.globalSource : undefined,
        count,
        coins,
    };
}

interface BacktestTradePayload {
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
    exitReason: 'threshold' | 'forced-close';
}

function normalizeBacktestTrade(payload: any): BacktestTradePayload | null {
    const entryTimestamp = toFiniteNumber(payload?.entryTimestamp);
    const exitTimestamp = toFiniteNumber(payload?.exitTimestamp);
    const entryPremium = toFiniteNumber(payload?.entryPremium);
    const exitPremium = toFiniteNumber(payload?.exitPremium);
    const holdingCandles = toFiniteNumber(payload?.holdingCandles);
    const grossReturnPct = toFiniteNumber(payload?.grossReturnPct);
    const netReturnPct = toFiniteNumber(payload?.netReturnPct);
    const profitKrw = toFiniteNumber(payload?.profitKrw);
    const capitalBeforeKrw = toFiniteNumber(payload?.capitalBeforeKrw);
    const capitalAfterKrw = toFiniteNumber(payload?.capitalAfterKrw);
    const exitReason = payload?.exitReason === 'forced-close' ? 'forced-close' : payload?.exitReason === 'threshold' ? 'threshold' : null;

    if (
        entryTimestamp === null ||
        exitTimestamp === null ||
        entryPremium === null ||
        exitPremium === null ||
        holdingCandles === null ||
        grossReturnPct === null ||
        netReturnPct === null ||
        profitKrw === null ||
        capitalBeforeKrw === null ||
        capitalAfterKrw === null ||
        exitReason === null
    ) {
        return null;
    }

    return {
        entryTimestamp,
        exitTimestamp,
        entryPremium,
        exitPremium,
        holdingCandles,
        grossReturnPct,
        netReturnPct,
        profitKrw,
        capitalBeforeKrw,
        capitalAfterKrw,
        exitReason,
    };
}

function normalizePremiumBacktestResponse(payload: any): PremiumBacktestResult {
    const generatedAt = toFiniteNumber(payload?.generatedAt);
    const limit = toFiniteNumber(payload?.limit);
    const candleCount = toFiniteNumber(payload?.candleCount);
    const chartMaxPoints = toFiniteNumber(payload?.chartMaxPoints);
    const premiumSeriesRawCount = toFiniteNumber(payload?.premiumSeriesRawCount);
    const premiumSeriesDisplayCount = toFiniteNumber(payload?.premiumSeriesDisplayCount);
    const usdKrwRateApplied =
        payload?.usdKrwRateApplied == null ? null : toFiniteNumber(payload.usdKrwRateApplied);
    const usdKrwRateRangePayload = payload?.usdKrwRateRange;
    const usdKrwRateRange =
        usdKrwRateRangePayload &&
            toFiniteNumber(usdKrwRateRangePayload?.min) !== null &&
            toFiniteNumber(usdKrwRateRangePayload?.max) !== null
            ? {
                min: Number(usdKrwRateRangePayload.min),
                max: Number(usdKrwRateRangePayload.max),
            }
            : null;
    const usdKrwHistoryCoveragePayload = payload?.usdKrwHistoryCoverage;
    const usdKrwHistoryCoverage =
        usdKrwHistoryCoveragePayload &&
            typeof usdKrwHistoryCoveragePayload.source === 'string' &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.dayCount) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.carryForwardFilled) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.carryBackwardFilled) !== null &&
            toFiniteNumber(usdKrwHistoryCoveragePayload?.fallbackFilled) !== null
            ? {
                source: usdKrwHistoryCoveragePayload.source,
                dayCount: Number(usdKrwHistoryCoveragePayload.dayCount),
                carryForwardFilled: Number(usdKrwHistoryCoveragePayload.carryForwardFilled),
                carryBackwardFilled: Number(usdKrwHistoryCoveragePayload.carryBackwardFilled),
                fallbackFilled: Number(usdKrwHistoryCoveragePayload.fallbackFilled),
            }
            : null;
    const premiumRangePayload = payload?.premiumRange;
    const premiumRange =
        premiumRangePayload &&
            toFiniteNumber(premiumRangePayload?.minClose) !== null &&
            toFiniteNumber(premiumRangePayload?.maxClose) !== null
            ? {
                minClose: Number(premiumRangePayload.minClose),
                maxClose: Number(premiumRangePayload.maxClose),
            }
            : null;
    const periodStart = payload?.periodStart == null ? null : toFiniteNumber(payload.periodStart);
    const periodEnd = payload?.periodEnd == null ? null : toFiniteNumber(payload.periodEnd);
    const entryThreshold = toFiniteNumber(payload?.entryThreshold);
    const exitThreshold = toFiniteNumber(payload?.exitThreshold);
    const leverage = toFiniteNumber(payload?.leverage);
    const feeBps = toFiniteNumber(payload?.feeBps);
    const slippageBps = toFiniteNumber(payload?.slippageBps);
    const initialCapitalKrw = toFiniteNumber(payload?.initialCapitalKrw);
    const finalCapitalKrw = toFiniteNumber(payload?.finalCapitalKrw);
    const totalProfitKrw = toFiniteNumber(payload?.totalProfitKrw);
    const totalReturnPct = toFiniteNumber(payload?.totalReturnPct);
    const tradeCount = toFiniteNumber(payload?.tradeCount);
    const winRate = toFiniteNumber(payload?.winRate);
    const avgTradeReturnPct = toFiniteNumber(payload?.avgTradeReturnPct);
    const maxDrawdownPct = toFiniteNumber(payload?.maxDrawdownPct);

    if (
        generatedAt === null ||
        typeof payload?.interval !== 'string' ||
        limit === null ||
        entryThreshold === null ||
        exitThreshold === null ||
        leverage === null ||
        feeBps === null ||
        slippageBps === null ||
        initialCapitalKrw === null ||
        finalCapitalKrw === null ||
        totalProfitKrw === null ||
        totalReturnPct === null ||
        tradeCount === null ||
        winRate === null ||
        avgTradeReturnPct === null ||
        maxDrawdownPct === null ||
        !Array.isArray(payload?.trades)
    ) {
        throw new Error('Invalid premium backtest payload');
    }

    const trades = payload.trades
        .map((item: any) => normalizeBacktestTrade(item))
        .filter((item: BacktestTradePayload | null): item is BacktestTradePayload => item !== null);
    const premiumSeries = Array.isArray(payload?.premiumSeries)
        ? payload.premiumSeries
            .map((item: any) => {
                const timestamp = toFiniteNumber(item?.timestamp);
                const close = toFiniteNumber(item?.close);
                if (timestamp === null || close === null) return null;
                return { timestamp, close };
            })
            .filter((item): item is { timestamp: number; close: number } => item !== null)
        : [];

    const openPositionPayload = payload?.openPosition;
    const openPosition =
        openPositionPayload &&
            toFiniteNumber(openPositionPayload?.entryTimestamp) !== null &&
            toFiniteNumber(openPositionPayload?.entryPremium) !== null
            ? {
                entryTimestamp: Number(openPositionPayload.entryTimestamp),
                entryPremium: Number(openPositionPayload.entryPremium),
            }
            : null;

    const requestedStartTime =
        payload?.requestedStartTime == null ? null : toFiniteNumber(payload.requestedStartTime);
    const requestedEndTime =
        payload?.requestedEndTime == null ? null : toFiniteNumber(payload.requestedEndTime);
    const historyCoveragePayload = payload?.historyCoverage;
    const historyCoverage =
        historyCoveragePayload &&
            typeof historyCoveragePayload.interval === 'string' &&
            toFiniteNumber(historyCoveragePayload?.storedCandles) !== null
            ? {
                interval: historyCoveragePayload.interval as CandleInterval,
                storedCandles: Number(historyCoveragePayload.storedCandles),
                earliestTimestamp:
                    historyCoveragePayload.earliestTimestamp == null
                        ? null
                        : toFiniteNumber(historyCoveragePayload.earliestTimestamp),
                latestTimestamp:
                    historyCoveragePayload.latestTimestamp == null
                        ? null
                        : toFiniteNumber(historyCoveragePayload.latestTimestamp),
                updatedAt:
                    historyCoveragePayload.updatedAt == null
                        ? null
                        : toFiniteNumber(historyCoveragePayload.updatedAt),
            }
            : undefined;
    const rangeBackfillPayload = payload?.rangeBackfill;
    const rangeBackfill =
        rangeBackfillPayload &&
            typeof rangeBackfillPayload.interval === 'string' &&
            toFiniteNumber(rangeBackfillPayload?.added) !== null &&
            toFiniteNumber(rangeBackfillPayload?.updated) !== null &&
            toFiniteNumber(rangeBackfillPayload?.totalStored) !== null &&
            toFiniteNumber(rangeBackfillPayload?.fetchedCandles) !== null &&
            typeof rangeBackfillPayload.source === 'string' &&
            typeof rangeBackfillPayload.sourceInterval === 'string' &&
            toFiniteNumber(rangeBackfillPayload?.rangeStart) !== null &&
            toFiniteNumber(rangeBackfillPayload?.rangeEnd) !== null
            ? {
                interval: rangeBackfillPayload.interval as CandleInterval,
                added: Number(rangeBackfillPayload.added),
                updated: Number(rangeBackfillPayload.updated),
                totalStored: Number(rangeBackfillPayload.totalStored),
                fetchedCandles: Number(rangeBackfillPayload.fetchedCandles),
                source: rangeBackfillPayload.source,
                sourceInterval: rangeBackfillPayload.sourceInterval,
                rangeStart: Number(rangeBackfillPayload.rangeStart),
                rangeEnd: Number(rangeBackfillPayload.rangeEnd),
            }
            : null;

    return {
        generatedAt,
        interval: payload.interval as CandleInterval,
        limit,
        candleCount: candleCount === null ? undefined : candleCount,
        triggerMode:
            payload?.triggerMode === 'close'
                ? 'close'
                : payload?.triggerMode === 'touch'
                    ? 'touch'
                    : undefined,
        fillAtThreshold:
            typeof payload?.fillAtThreshold === 'boolean'
                ? payload.fillAtThreshold
                : undefined,
        chartMaxPoints: chartMaxPoints === null ? undefined : chartMaxPoints,
        premiumSeriesRawCount:
            premiumSeriesRawCount === null ? undefined : premiumSeriesRawCount,
        premiumSeriesDisplayCount:
            premiumSeriesDisplayCount === null ? undefined : premiumSeriesDisplayCount,
        premiumBasis:
            payload?.premiumBasis === 'USD'
                ? 'USD'
                : payload?.premiumBasis === 'USDT'
                    ? 'USDT'
                    : undefined,
        usdKrwRateApplied,
        usdKrwRateRange,
        usdKrwHistoryCoverage,
        premiumRange,
        periodStart: periodStart === null ? null : periodStart,
        periodEnd: periodEnd === null ? null : periodEnd,
        entryThreshold,
        exitThreshold,
        leverage,
        feeBps,
        slippageBps,
        initialCapitalKrw,
        finalCapitalKrw,
        totalProfitKrw,
        totalReturnPct,
        tradeCount,
        winRate,
        avgTradeReturnPct,
        maxDrawdownPct,
        openPosition,
        dataSource:
            payload?.dataSource === 'live-fetch'
                ? 'live-fetch'
                : payload?.dataSource === 'stored-history'
                    ? 'stored-history'
                    : undefined,
        requestedStartTime,
        requestedEndTime,
        historyCoverage,
        rangeBackfill,
        premiumSeries,
        sources:
            payload?.sources &&
                typeof payload.sources.domestic === 'string' &&
                typeof payload.sources.global === 'string' &&
                typeof payload.sources.conversion === 'string' &&
                typeof payload.sources.fxFallback === 'string'
                ? payload.sources
                : {
                    domestic: 'upbit:KRW-BTC',
                    global: 'binance:BTCUSDT',
                    conversion: 'upbit:KRW-USDT',
                    fxFallback: 'open.er-api:USD/KRW',
                },
        trades,
    };
}

function shouldTryNextBase(status: number, baseIndex: number): boolean {
    if (baseIndex >= apiBaseCandidates.length - 1) return false;
    return status >= 500 || status === 404 || status === 429;
}

async function readResponseText(response: Response): Promise<string> {
    try {
        return (await response.text()).trim();
    } catch {
        return '';
    }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutError = new DOMException(`timeout after ${timeoutMs}ms`, 'AbortError');
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const requestInit: RequestInit = {
        ...init,
        signal: controller.signal,
    };

    const fetchPromise = fetch(url, requestInit);
    const timeoutPromise = new Promise<Response>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
        }, timeoutMs);
    });

    try {
        return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
    }
}

function normalizeApiErrorText(errorText: string): string {
    const trimmed = typeof errorText === 'string' ? errorText.trim() : '';
    if (!trimmed) return '';

    try {
        const payload = JSON.parse(trimmed);
        const errorMessage =
            payload && typeof payload === 'object' && typeof payload.error === 'string'
                ? payload.error.trim()
                : '';
        const fallbackMessage =
            payload && typeof payload === 'object' && typeof payload.message === 'string'
                ? payload.message.trim()
                : '';
        const candidate = errorMessage || fallbackMessage;
        if (candidate) {
            if (candidate.includes('"code":-2008') || candidate.includes('code":-2008')) {
                return 'Binance API 키 ID 오류(-2008): 키 값이 잘못되었거나 삭제된 키입니다. API 키를 다시 입력하세요.';
            }
            if (candidate.includes('"code":-2015') || candidate.includes('code":-2015')) {
                return 'Binance API 인증 실패(-2015): API 키/시크릿, IP 화이트리스트, 권한을 확인하세요.';
            }
            return candidate;
        }
    } catch {
        // Keep raw text when response is not JSON.
    }

    return trimmed.length > 260 ? `${trimmed.slice(0, 260)}...` : trimmed;
}

async function fetchApi<T>(
    path: string,
    errorPrefix: string,
    normalizer: (payload: any) => T,
    options: {
        timeoutMs?: number;
        method?: 'GET' | 'POST';
        body?: unknown;
        headers?: Record<string, string>;
        allowFallback?: boolean;
        credentials?: RequestCredentials;
    } = {}
): Promise<T> {
    if (apiBaseCandidates.length === 0) {
        throw new Error(`${errorPrefix} API base URL not configured`);
    }

    const attemptErrors: string[] = [];

    const timeoutMs =
        Number.isFinite(options.timeoutMs ?? NaN) && (options.timeoutMs ?? 0) > 0
            ? Number(options.timeoutMs)
            : API_FETCH_TIMEOUT_MS;
    const method = options.method ?? 'GET';
    const allowFallback = options.allowFallback !== false;
    const credentialsMode = options.credentials ?? 'include';
    const maxBaseIndex = allowFallback ? apiBaseCandidates.length - 1 : 0;
    const requestHeaders: Record<string, string> = {
        Accept: 'application/json',
        ...(options.headers ?? {}),
    };
    const executionAdminToken = getExecutionAdminTokenFromStorage();
    if (executionAdminToken && !requestHeaders['x-admin-token']) {
        requestHeaders['x-admin-token'] = executionAdminToken;
    }
    const hasBody = options.body !== undefined;
    if (hasBody && !requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
    }

    for (let index = 0; index <= maxBaseIndex; index += 1) {
        const baseUrl = apiBaseCandidates[index];
        let response: Response;
        try {
            response = await fetchWithTimeout(
                `${baseUrl}${path}`,
                {
                    method,
                    cache: 'no-store',
                    credentials: credentialsMode,
                    headers: requestHeaders,
                    body: hasBody ? JSON.stringify(options.body) : undefined,
                },
                timeoutMs
            );
        } catch (error) {
            const message =
                error instanceof DOMException && error.name === 'AbortError'
                    ? `${errorPrefix} timeout after ${timeoutMs}ms`
                    : `${errorPrefix} network error: ${error instanceof Error ? error.message : String(error)}`;

            attemptErrors.push(`${baseUrl} -> ${message}`);
            continue;
        }

        if (!response.ok) {
            const errorText = await readResponseText(response);
            const normalizedError = normalizeApiErrorText(errorText);
            const statusMessage = `${response.status}${normalizedError ? ` ${normalizedError}` : ''}`;
            attemptErrors.push(`${baseUrl} -> ${statusMessage}`);

            if (shouldTryNextBase(response.status, index)) {
                continue;
            }

            throw new Error(`${errorPrefix} ${statusMessage}`);
        }

        try {
            const payload = await response.json();
            return normalizer(payload);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            attemptErrors.push(`${baseUrl} -> invalid payload (${message})`);
            if (index < apiBaseCandidates.length - 1) {
                continue;
            }
            throw new Error(`${errorPrefix} invalid payload from ${baseUrl}: ${message}`);
        }
    }

    const joinedErrors = attemptErrors.length ? ` (${attemptErrors.join(' | ')})` : '';
    throw new Error(`${errorPrefix} failed on all API targets${joinedErrors}`);
}

export const fetchLiveMarketData = async (): Promise<MarketData> => {
    try {
        return await fetchApi('/api/ticker', 'Ticker API', normalizeMarketPayload);
    } catch (error) {
        console.error('Error fetching live market data via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`실시간 시세 서버 연결 실패: ${message}`);
    }
};

export const fetchPremiumCandles = async (
    interval: CandleInterval,
    limit: number,
    premiumBasis: 'USD' | 'USDT' = 'USDT'
): Promise<PremiumCandleResponse> => {
    try {
        const query = `/api/premium-candles?interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(
            String(limit)
        )}&premiumBasis=${encodeURIComponent(premiumBasis)}`;
        return await fetchApi(query, 'Premium candle API', normalizePremiumCandleResponse);
    } catch (error) {
        console.error('Error fetching premium candle data via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`봉 데이터 조회 실패: ${message}`);
    }
};

export const fetchTopVolumeFunding = async (
    options: {
        limit?: number;
        side?: FundingPositionSide;
        notionalUsdt?: number;
        fundingIntervalHours?: number;
    } = {}
): Promise<TopVolumeFundingResponse> => {
    try {
        const params = new URLSearchParams();
        params.set('limit', String(options.limit ?? 10));
        params.set('side', options.side ?? 'SHORT');
        params.set('notionalUsdt', String(options.notionalUsdt ?? 1000));
        params.set('fundingIntervalHours', String(options.fundingIntervalHours ?? 8));
        return await fetchApi(
            `/api/top-volume-funding?${params.toString()}`,
            'Top funding API',
            normalizeTopVolumeFundingResponse
        );
    } catch (error) {
        console.error('Error fetching top volume funding data via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`상위 거래량/펀딩 데이터 조회 실패: ${message}`);
    }
};

export const fetchMultiPremium = async (limit = 20): Promise<MultiPremiumResponse> => {
    try {
        return await fetchApi(
            `/api/multi-premium?limit=${encodeURIComponent(String(limit))}`,
            'Multi-premium API',
            normalizeMultiPremiumResponse
        );
    } catch (error) {
        console.error('Error fetching multi-premium data via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`멀티코인 김프 조회 실패: ${message}`);
    }
};

export interface PremiumBacktestOptions {
    interval: CandleInterval;
    limit: number;
    chartMaxPoints?: number;
    premiumBasis?: 'USD' | 'USDT';
    triggerMode?: 'touch' | 'close';
    fillAtThreshold?: boolean;
    entryThreshold: number;
    exitThreshold: number;
    leverage: number;
    initialCapitalKrw: number;
    feeBps: number;
    slippageBps: number;
    forceCloseAtEnd: boolean;
    startTime?: number | null;
    endTime?: number | null;
    useStoredData?: boolean;
}

export const fetchPremiumBacktest = async (
    options: PremiumBacktestOptions
): Promise<PremiumBacktestResult> => {
    try {
        const params = new URLSearchParams();
        params.set('interval', options.interval);
        params.set('limit', String(options.limit));
        params.set('chartMaxPoints', String(options.chartMaxPoints ?? 2400));
        params.set('premiumBasis', options.premiumBasis ?? 'USDT');
        params.set('triggerMode', options.triggerMode ?? 'touch');
        params.set('fillAtThreshold', String(options.fillAtThreshold ?? true));
        params.set('entryThreshold', String(options.entryThreshold));
        params.set('exitThreshold', String(options.exitThreshold));
        params.set('leverage', String(options.leverage));
        params.set('initialCapitalKrw', String(options.initialCapitalKrw));
        params.set('feeBps', String(options.feeBps));
        params.set('slippageBps', String(options.slippageBps));
        params.set('forceCloseAtEnd', String(options.forceCloseAtEnd));
        if (Number.isFinite(options.startTime ?? NaN)) {
            params.set('startTime', String(options.startTime));
        }
        if (Number.isFinite(options.endTime ?? NaN)) {
            params.set('endTime', String(options.endTime));
        }
        params.set('useStoredData', String(options.useStoredData ?? true));

        return await fetchApi(
            `/api/backtest/premium?${params.toString()}`,
            'Premium backtest API',
            normalizePremiumBacktestResponse,
            { timeoutMs: BACKTEST_FETCH_TIMEOUT_MS }
        );
    } catch (error) {
        console.error('Error fetching premium backtest via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`백테스트 실행 실패: ${message}`);
    }
};

function normalizeExecutionMarketType(value: unknown): ExecutionMarketType {
    return value === 'usdm' ? 'usdm' : 'coinm';
}

function normalizeExecutionSafetySummary(payload: any) {
    if (!payload || typeof payload !== 'object') return undefined;

    return {
        safeMode: Boolean(payload.safeMode),
        consecutiveFailures: Number(payload.consecutiveFailures ?? 0),
        threshold: Number(payload.threshold ?? 0),
        lastFailureAt: payload.lastFailureAt == null ? null : Number(payload.lastFailureAt),
        lastFailureEvent:
            typeof payload.lastFailureEvent === 'string' ? payload.lastFailureEvent : null,
        lastFailureMessage:
            typeof payload.lastFailureMessage === 'string' ? payload.lastFailureMessage : null,
        lastSuccessAt: payload.lastSuccessAt == null ? null : Number(payload.lastSuccessAt),
        alertWebhookConfigured: Boolean(payload.alertWebhookConfigured),
        alertCooldownMs: Number(payload.alertCooldownMs ?? 0),
        alertTimeoutMs: Number(payload.alertTimeoutMs ?? 0),
        lastAlertSentAt: payload.lastAlertSentAt == null ? null : Number(payload.lastAlertSentAt),
        orderExecution:
            payload.orderExecution && typeof payload.orderExecution === 'object'
                ? {
                    allowLiveOrders: Boolean(payload.orderExecution.allowLiveOrders),
                    allowTestnetOrders: Boolean(payload.orderExecution.allowTestnetOrders),
                    defaultRetryCount: Number(payload.orderExecution.defaultRetryCount ?? 0),
                    defaultRetryDelayMs: Number(payload.orderExecution.defaultRetryDelayMs ?? 0),
                    idempotencyTtlMs: Number(payload.orderExecution.idempotencyTtlMs ?? 0),
                    idempotencyMaxEntries: Number(payload.orderExecution.idempotencyMaxEntries ?? 0),
                    idempotencyEntries: Number(payload.orderExecution.idempotencyEntries ?? 0),
                }
                : undefined,
    };
}

function normalizeExecutionStrategyContext(payload: any) {
    if (!payload || typeof payload !== 'object') return null;
    const action =
        payload?.action === 'ENTRY_SELL'
            ? 'ENTRY_SELL'
            : payload?.action === 'EXIT_BUY'
                ? 'EXIT_BUY'
                : null;
    return {
        action,
        decisionTimestamp:
            payload?.decisionTimestamp == null ? null : Number(payload.decisionTimestamp),
        premiumPct: payload?.premiumPct == null ? null : Number(payload.premiumPct),
        effectivePremiumPct:
            payload?.effectivePremiumPct == null
                ? null
                : Number(payload.effectivePremiumPct),
        usdtKrwRate: payload?.usdtKrwRate == null ? null : Number(payload.usdtKrwRate),
        exchangeRate: payload?.exchangeRate == null ? null : Number(payload.exchangeRate),
        usdPrice: payload?.usdPrice == null ? null : Number(payload.usdPrice),
        krwPrice: payload?.krwPrice == null ? null : Number(payload.krwPrice),
    };
}

function normalizeExecutionStatusResponse(payload: any): BinanceExecutionStatusResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        typeof payload?.connected !== 'boolean' ||
        typeof payload?.configured !== 'boolean'
    ) {
        throw new Error('Invalid execution status payload');
    }

    return {
        timestamp: Number(payload.timestamp),
        connected: payload.connected,
        configured: payload.configured,
        marketType: normalizeExecutionMarketType(payload.marketType),
        testnet: Boolean(payload.testnet),
        credentialSource:
            payload?.credentialSource === 'runtime'
                ? 'runtime'
                : payload?.credentialSource === 'env'
                    ? 'env'
                    : 'none',
        credentialKeyHint:
            typeof payload?.credentialKeyHint === 'string' ? payload.credentialKeyHint : null,
        credentialUpdatedAt:
            payload?.credentialUpdatedAt == null ? null : Number(payload.credentialUpdatedAt),
        credentialPersisted: Boolean(payload?.credentialPersisted),
        exchangeId: typeof payload?.exchangeId === 'string' ? payload.exchangeId : null,
        serverTime: payload?.serverTime == null ? null : Number(payload.serverTime),
        balance:
            payload?.balance && typeof payload.balance.asset === 'string'
                ? {
                    asset: payload.balance.asset,
                    free: payload.balance.free == null ? null : Number(payload.balance.free),
                    used: payload.balance.used == null ? null : Number(payload.balance.used),
                    total: payload.balance.total == null ? null : Number(payload.balance.total),
                }
                : undefined,
        safety: normalizeExecutionSafetySummary(payload?.safety),
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

function normalizeExecutionPositionResponse(payload: any): BinanceExecutionPositionResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        typeof payload?.symbol !== 'string' ||
        typeof payload?.hasPosition !== 'boolean'
    ) {
        throw new Error('Invalid execution position payload');
    }

    const positionPayload = payload?.position;

    return {
        timestamp: Number(payload.timestamp),
        marketType: normalizeExecutionMarketType(payload.marketType),
        symbol: payload.symbol,
        testnet: Boolean(payload.testnet),
        hasPosition: payload.hasPosition,
        safety: normalizeExecutionSafetySummary(payload?.safety),
        position:
            positionPayload && typeof positionPayload === 'object'
                ? {
                    symbol:
                        typeof positionPayload?.symbol === 'string'
                            ? positionPayload.symbol
                            : payload.symbol,
                    side: typeof positionPayload?.side === 'string' ? positionPayload.side : null,
                    contracts:
                        positionPayload?.contracts == null ? null : Number(positionPayload.contracts),
                    contractSize:
                        positionPayload?.contractSize == null ? null : Number(positionPayload.contractSize),
                    notional: positionPayload?.notional == null ? null : Number(positionPayload.notional),
                    leverage: positionPayload?.leverage == null ? null : Number(positionPayload.leverage),
                    entryPrice:
                        positionPayload?.entryPrice == null ? null : Number(positionPayload.entryPrice),
                    markPrice:
                        positionPayload?.markPrice == null ? null : Number(positionPayload.markPrice),
                    unrealizedPnl:
                        positionPayload?.unrealizedPnl == null
                            ? null
                            : Number(positionPayload.unrealizedPnl),
                    liquidationPrice:
                        positionPayload?.liquidationPrice == null
                            ? null
                            : Number(positionPayload.liquidationPrice),
                    marginMode:
                        typeof positionPayload?.marginMode === 'string'
                            ? positionPayload.marginMode
                            : null,
                }
                : null,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

function normalizeExecutionPortfolioResponse(payload: any): BinanceExecutionPortfolioResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        typeof payload?.connected !== 'boolean' ||
        typeof payload?.configured !== 'boolean' ||
        typeof payload?.symbol !== 'string'
    ) {
        throw new Error('Invalid execution portfolio payload');
    }

    const walletBalances = Array.isArray(payload?.walletBalances)
        ? payload.walletBalances
            .map((item: any) => {
                if (!item || typeof item.asset !== 'string') return null;
                return {
                    asset: item.asset,
                    free: item?.free == null ? null : Number(item.free),
                    used: item?.used == null ? null : Number(item.used),
                    total: item?.total == null ? null : Number(item.total),
                };
            })
            .filter(
                (
                    item
                ): item is {
                    asset: string;
                    free: number | null;
                    used: number | null;
                    total: number | null;
                } => item !== null
            )
        : [];

    const positions = Array.isArray(payload?.positions)
        ? payload.positions
            .map((position: any) => {
                if (!position || typeof position.symbol !== 'string') return null;
                return {
                    symbol: position.symbol,
                    side: typeof position?.side === 'string' ? position.side : null,
                    contracts: position?.contracts == null ? null : Number(position.contracts),
                    contractSize: position?.contractSize == null ? null : Number(position.contractSize),
                    notional: position?.notional == null ? null : Number(position.notional),
                    leverage: position?.leverage == null ? null : Number(position.leverage),
                    entryPrice: position?.entryPrice == null ? null : Number(position.entryPrice),
                    markPrice: position?.markPrice == null ? null : Number(position.markPrice),
                    unrealizedPnl:
                        position?.unrealizedPnl == null ? null : Number(position.unrealizedPnl),
                    liquidationPrice:
                        position?.liquidationPrice == null ? null : Number(position.liquidationPrice),
                    marginMode: typeof position?.marginMode === 'string' ? position.marginMode : null,
                };
            })
            .filter(
                (
                    item
                ): item is BinanceExecutionPortfolioResponse['positions'][number] => item !== null
            )
        : [];

    const summaryPayload =
        payload?.summary && typeof payload.summary === 'object' ? payload.summary : {};

    return {
        timestamp: Number(payload.timestamp),
        connected: Boolean(payload.connected),
        configured: Boolean(payload.configured),
        marketType: normalizeExecutionMarketType(payload.marketType),
        symbol: payload.symbol,
        testnet: Boolean(payload.testnet),
        balanceAsset: typeof payload?.balanceAsset === 'string' ? payload.balanceAsset : '',
        safety: normalizeExecutionSafetySummary(payload?.safety),
        walletBalances,
        positions,
        summary: {
            walletAssetFree:
                summaryPayload?.walletAssetFree == null
                    ? null
                    : Number(summaryPayload.walletAssetFree),
            walletAssetUsed:
                summaryPayload?.walletAssetUsed == null
                    ? null
                    : Number(summaryPayload.walletAssetUsed),
            walletAssetTotal:
                summaryPayload?.walletAssetTotal == null
                    ? null
                    : Number(summaryPayload.walletAssetTotal),
            walletBalanceCount: Number(summaryPayload?.walletBalanceCount ?? walletBalances.length),
            activePositionCount: Number(summaryPayload?.activePositionCount ?? positions.length),
            totalUnrealizedPnl:
                summaryPayload?.totalUnrealizedPnl == null
                    ? null
                    : Number(summaryPayload.totalUnrealizedPnl),
        },
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

function normalizeExecutionFillsResponse(payload: any): BinanceExecutionFillsResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        typeof payload?.symbol !== 'string' ||
        !Array.isArray(payload?.fills)
    ) {
        throw new Error('Invalid execution fills payload');
    }

    const fills = payload.fills.map((fill: any) => ({
        id: typeof fill?.id === 'string' ? fill.id : fill?.id == null ? null : String(fill.id),
        orderId:
            typeof fill?.orderId === 'string'
                ? fill.orderId
                : fill?.orderId == null
                    ? null
                    : String(fill.orderId),
        timestamp: fill?.timestamp == null ? null : Number(fill.timestamp),
        datetime: typeof fill?.datetime === 'string' ? fill.datetime : null,
        side: typeof fill?.side === 'string' ? fill.side : null,
        type: typeof fill?.type === 'string' ? fill.type : null,
        amount: fill?.amount == null ? null : Number(fill.amount),
        price: fill?.price == null ? null : Number(fill.price),
        cost: fill?.cost == null ? null : Number(fill.cost),
        fee:
            fill?.fee && typeof fill.fee === 'object'
                ? {
                    currency: typeof fill.fee?.currency === 'string' ? fill.fee.currency : null,
                    cost: fill.fee?.cost == null ? null : Number(fill.fee.cost),
                    rate: fill.fee?.rate == null ? null : Number(fill.fee.rate),
                }
                : null,
        realizedPnl: fill?.realizedPnl == null ? null : Number(fill.realizedPnl),
        maker: typeof fill?.maker === 'boolean' ? fill.maker : null,
        takerOrMaker:
            typeof fill?.takerOrMaker === 'string' ? fill.takerOrMaker : null,
        strategyContext: normalizeExecutionStrategyContext(fill?.strategyContext),
    }));

    return {
        timestamp: Number(payload.timestamp),
        marketType: normalizeExecutionMarketType(payload.marketType),
        symbol: payload.symbol,
        testnet: Boolean(payload.testnet),
        safety: normalizeExecutionSafetySummary(payload?.safety),
        limit: Number(payload.limit ?? 0),
        since: payload?.since == null ? null : Number(payload.since),
        count: Number(payload.count ?? fills.length),
        fills,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
}

function normalizeExecutionEventsResponse(payload: any): ExecutionEventsResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        !Array.isArray(payload?.events)
    ) {
        throw new Error('Invalid execution events payload');
    }

    return {
        timestamp: Number(payload.timestamp),
        count: Number(payload.count ?? payload.events.length),
        totalExecutionEvents: Number(payload.totalExecutionEvents ?? payload.events.length),
        totalBuffered: Number(payload.totalBuffered ?? payload.events.length),
        filters: {
            limit: Number(payload?.filters?.limit ?? 0),
            onlyFailures: Boolean(payload?.filters?.onlyFailures),
            level:
                typeof payload?.filters?.level === 'string' ? payload.filters.level : null,
            marketType:
                payload?.filters?.marketType === 'usdm'
                    ? 'usdm'
                    : payload?.filters?.marketType === 'coinm'
                        ? 'coinm'
                        : null,
        },
        logFile: typeof payload?.logFile === 'string' ? payload.logFile : '',
        events: payload.events
            .map((item: any) =>
                item && typeof item === 'object'
                    ? {
                        ...item,
                        timestamp: Number(item.timestamp ?? 0),
                        isoTime: typeof item.isoTime === 'string' ? item.isoTime : '',
                        level: typeof item.level === 'string' ? item.level : 'info',
                        event: typeof item.event === 'string' ? item.event : 'unknown',
                    }
                    : null
            )
            .filter((item): item is ExecutionEventsResponse['events'][number] => item !== null),
    };
}

function normalizeExecutionSafetyResponse(payload: any): ExecutionSafetyResponse {
    if (!payload || toFiniteNumber(payload?.timestamp) === null) {
        throw new Error('Invalid execution safety payload');
    }
    return {
        timestamp: Number(payload.timestamp),
        safety: normalizeExecutionSafetySummary(payload.safety) ?? {
            safeMode: false,
            consecutiveFailures: 0,
            threshold: 0,
            lastFailureAt: null,
            lastFailureEvent: null,
            lastFailureMessage: null,
            lastSuccessAt: null,
            alertWebhookConfigured: false,
            alertCooldownMs: 0,
            alertTimeoutMs: 0,
            lastAlertSentAt: null,
        },
    };
}

function normalizeExecutionCredentialsStatusResponse(payload: any): ExecutionCredentialsStatusResponse {
    const credentials = payload?.credentials;
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        !credentials ||
        typeof credentials !== 'object'
    ) {
        throw new Error('Invalid execution credentials payload');
    }

    return {
        timestamp: Number(payload.timestamp),
        credentials: {
            configured: Boolean(credentials.configured),
            source:
                credentials?.source === 'runtime'
                    ? 'runtime'
                    : credentials?.source === 'env'
                        ? 'env'
                        : 'none',
            keyHint: typeof credentials?.keyHint === 'string' ? credentials.keyHint : null,
            updatedAt:
                credentials?.updatedAt == null ? null : Number(credentials.updatedAt),
            persisted: Boolean(credentials?.persisted),
            envConfigured: Boolean(credentials?.envConfigured),
            runtimeConfigured: Boolean(credentials?.runtimeConfigured),
        },
    };
}

function normalizeAuthSessionResponse(payload: any): AuthSessionResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        !payload?.auth ||
        typeof payload.auth !== 'object'
    ) {
        throw new Error('Invalid auth session payload');
    }

    const auth = payload.auth;
    return {
        timestamp: Number(payload.timestamp),
        auth: {
            enabled: Boolean(auth.enabled),
            tokenEnabled: Boolean(auth.tokenEnabled),
            passwordEnabled: Boolean(auth.passwordEnabled),
            authenticated: Boolean(auth.authenticated),
            username: typeof auth.username === 'string' ? auth.username : null,
            expiresAt: auth?.expiresAt == null ? null : Number(auth.expiresAt),
        },
    };
}

function normalizeExecutionEngineStatusResponse(payload: any): ExecutionEngineStatusResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        !payload?.engine ||
        typeof payload.engine !== 'object'
    ) {
        throw new Error('Invalid execution engine payload');
    }

    const enginePayload = payload.engine;
    const positionState = enginePayload?.positionState === 'ENTERED' ? 'ENTERED' : 'IDLE';
    const premiumBasis = enginePayload?.premiumBasis === 'USDT' ? 'USDT' : 'USD';
    const lastOrderSide =
        enginePayload?.lastOrderSide === 'buy'
            ? 'buy'
            : enginePayload?.lastOrderSide === 'sell'
                ? 'sell'
                : null;

    return {
        timestamp: Number(payload.timestamp),
        safety: normalizeExecutionSafetySummary(payload?.safety),
        engine: {
            running: Boolean(enginePayload.running),
            busy: Boolean(enginePayload.busy),
            marketType: normalizeExecutionMarketType(enginePayload.marketType),
            symbol: typeof enginePayload?.symbol === 'string' ? enginePayload.symbol : '',
            amount: Number(enginePayload?.amount ?? 0),
            dryRun: Boolean(enginePayload?.dryRun),
            premiumBasis,
            entryThreshold: Number(enginePayload?.entryThreshold ?? 0),
            exitThreshold: Number(enginePayload?.exitThreshold ?? 0),
            positionState,
            pollIntervalMs: Number(enginePayload?.pollIntervalMs ?? 0),
            orderCooldownMs: Number(enginePayload?.orderCooldownMs ?? 0),
            startedAt: enginePayload?.startedAt == null ? null : Number(enginePayload.startedAt),
            stoppedAt: enginePayload?.stoppedAt == null ? null : Number(enginePayload.stoppedAt),
            lastTickAt: enginePayload?.lastTickAt == null ? null : Number(enginePayload.lastTickAt),
            lastDecisionAt:
                enginePayload?.lastDecisionAt == null ? null : Number(enginePayload.lastDecisionAt),
            lastOrderAt: enginePayload?.lastOrderAt == null ? null : Number(enginePayload.lastOrderAt),
            lastOrderSide,
            lastOrderId:
                typeof enginePayload?.lastOrderId === 'string' ? enginePayload.lastOrderId : null,
            lastPremium: enginePayload?.lastPremium == null ? null : Number(enginePayload.lastPremium),
            lastEffectivePremium:
                enginePayload?.lastEffectivePremium == null
                    ? null
                    : Number(enginePayload.lastEffectivePremium),
            lastMarketDataTimestamp:
                enginePayload?.lastMarketDataTimestamp == null
                    ? null
                    : Number(enginePayload.lastMarketDataTimestamp),
            iterations: Number(enginePayload?.iterations ?? 0),
            lastError: typeof enginePayload?.lastError === 'string' ? enginePayload.lastError : null,
            lastOrderError:
                typeof enginePayload?.lastOrderError === 'string'
                    ? enginePayload.lastOrderError
                    : null,
            stopReason:
                typeof enginePayload?.stopReason === 'string' ? enginePayload.stopReason : null,
            leaderReplicaId:
                typeof enginePayload?.leaderReplicaId === 'string'
                    ? enginePayload.leaderReplicaId
                    : null,
            currentReplicaId:
                typeof enginePayload?.currentReplicaId === 'string'
                    ? enginePayload.currentReplicaId
                    : null,
        },
    };
}

function normalizeExecutionEngineReadinessResponse(payload: any): ExecutionEngineReadinessResponse {
    if (
        !payload ||
        toFiniteNumber(payload?.timestamp) === null ||
        toFiniteNumber(payload?.durationMs) === null ||
        typeof payload?.ready !== 'boolean' ||
        typeof payload?.symbol !== 'string' ||
        !Array.isArray(payload?.checks)
    ) {
        throw new Error('Invalid execution engine readiness payload');
    }

    const status = normalizeExecutionEngineStatusResponse(payload);
    const checks = payload.checks
        .map((item: any) => {
            if (!item || typeof item.key !== 'string') return null;
            const severity =
                item?.severity === 'error'
                    ? 'error'
                    : item?.severity === 'warn'
                        ? 'warn'
                        : 'info';
            return {
                key: item.key,
                ok: Boolean(item.ok),
                severity,
                message: typeof item?.message === 'string' ? item.message : '',
            };
        })
        .filter((item): item is ExecutionEngineReadinessResponse['checks'][number] => item !== null);

    return {
        timestamp: Number(payload.timestamp),
        durationMs: Number(payload.durationMs),
        mode: payload?.mode === 'dryrun' ? 'dryrun' : 'live',
        marketType: status.engine.marketType,
        symbol: payload.symbol,
        testnet: Boolean(payload.testnet),
        ready: payload.ready,
        safety: status.safety,
        engine: status.engine,
        checks,
    };
}

export const fetchExecutionStatus = async (
    marketType: ExecutionMarketType = 'coinm'
): Promise<BinanceExecutionStatusResponse> => {
    const query = `/api/execution/binance/status?marketType=${encodeURIComponent(marketType)}`;
    return await fetchApi(query, 'Execution status API', normalizeExecutionStatusResponse);
};

export const fetchAuthSession = async (): Promise<AuthSessionResponse> => {
    return await fetchApi(
        '/api/auth/session',
        'Auth session API',
        normalizeAuthSessionResponse,
        {
            allowFallback: false,
            credentials: 'include',
        }
    );
};

export const loginAuthSession = async (request: {
    username: string;
    password: string;
}): Promise<AuthSessionResponse> => {
    return await fetchApi(
        '/api/auth/login',
        'Auth login API',
        normalizeAuthSessionResponse,
        {
            method: 'POST',
            body: request,
            allowFallback: false,
            credentials: 'include',
        }
    );
};

export const logoutAuthSession = async (): Promise<AuthSessionResponse> => {
    return await fetchApi(
        '/api/auth/logout',
        'Auth logout API',
        normalizeAuthSessionResponse,
        {
            method: 'POST',
            body: {},
            allowFallback: false,
            credentials: 'include',
        }
    );
};

export const fetchExecutionPosition = async (
    marketType: ExecutionMarketType = 'coinm',
    symbol?: string
): Promise<BinanceExecutionPositionResponse> => {
    const params = new URLSearchParams();
    params.set('marketType', marketType);
    if (symbol && symbol.trim()) params.set('symbol', symbol.trim());
    return await fetchApi(
        `/api/execution/binance/position?${params.toString()}`,
        'Execution position API',
        normalizeExecutionPositionResponse
    );
};

export const fetchExecutionPortfolio = async (options: {
    marketType?: ExecutionMarketType;
    symbol?: string;
    balanceLimit?: number;
} = {}): Promise<BinanceExecutionPortfolioResponse> => {
    const params = new URLSearchParams();
    params.set('marketType', options.marketType ?? 'coinm');
    if (options.symbol && options.symbol.trim()) params.set('symbol', options.symbol.trim());
    if (Number.isFinite(options.balanceLimit ?? NaN)) {
        params.set('balanceLimit', String(options.balanceLimit));
    }

    return await fetchApi(
        `/api/execution/binance/portfolio?${params.toString()}`,
        'Execution portfolio API',
        normalizeExecutionPortfolioResponse
    );
};

export const fetchExecutionFills = async (options: {
    marketType?: ExecutionMarketType;
    symbol?: string;
    limit?: number;
    since?: number | null;
} = {}): Promise<BinanceExecutionFillsResponse> => {
    const params = new URLSearchParams();
    params.set('marketType', options.marketType ?? 'coinm');
    if (options.symbol && options.symbol.trim()) params.set('symbol', options.symbol.trim());
    params.set('limit', String(options.limit ?? 20));
    if (Number.isFinite(options.since ?? NaN)) params.set('since', String(options.since));

    return await fetchApi(
        `/api/execution/binance/fills?${params.toString()}`,
        'Execution fills API',
        normalizeExecutionFillsResponse
    );
};

export const fetchExecutionEvents = async (options: {
    limit?: number;
    onlyFailures?: boolean;
    marketType?: ExecutionMarketType;
} = {}): Promise<ExecutionEventsResponse> => {
    const params = new URLSearchParams();
    params.set('limit', String(options.limit ?? 50));
    if (options.onlyFailures) params.set('onlyFailures', 'true');
    if (options.marketType) params.set('marketType', options.marketType);
    return await fetchApi(
        `/api/execution/events?${params.toString()}`,
        'Execution events API',
        normalizeExecutionEventsResponse
    );
};

export const fetchExecutionSafety = async (): Promise<ExecutionSafetyResponse> => {
    return await fetchApi(
        '/api/execution/safety',
        'Execution safety API',
        normalizeExecutionSafetyResponse
    );
};

export const fetchExecutionCredentialsStatus = async (): Promise<ExecutionCredentialsStatusResponse> => {
    return await fetchApi(
        '/api/execution/credentials/status',
        'Execution credentials status API',
        normalizeExecutionCredentialsStatusResponse
    );
};

export const updateExecutionCredentials = async (request: {
    apiKey: string;
    apiSecret: string;
    persist?: boolean;
}): Promise<ExecutionCredentialsStatusResponse> => {
    return await fetchApi(
        '/api/execution/credentials',
        'Execution credentials update API',
        normalizeExecutionCredentialsStatusResponse,
        {
            method: 'POST',
            body: request,
            allowFallback: false,
        }
    );
};

export const clearExecutionCredentials = async (): Promise<ExecutionCredentialsStatusResponse> => {
    return await fetchApi(
        '/api/execution/credentials/clear',
        'Execution credentials clear API',
        normalizeExecutionCredentialsStatusResponse,
        {
            method: 'POST',
            body: {},
            allowFallback: false,
        }
    );
};

export const resetExecutionSafety = async (
    reason = 'ui-reset'
): Promise<ExecutionSafetyResponse> => {
    return await fetchApi(
        '/api/execution/safety/reset',
        'Execution safety reset API',
        normalizeExecutionSafetyResponse,
        {
            method: 'POST',
            body: { reason },
            allowFallback: false,
        }
    );
};

export const fetchExecutionEngineStatus = async (): Promise<ExecutionEngineStatusResponse> => {
    return await fetchApi(
        '/api/execution/engine/status',
        'Execution engine status API',
        normalizeExecutionEngineStatusResponse
    );
};

export const fetchExecutionEngineReadiness = async (options: {
    mode?: 'live' | 'dryrun';
    marketType?: ExecutionMarketType;
    symbol?: string;
} = {}): Promise<ExecutionEngineReadinessResponse> => {
    const params = new URLSearchParams();
    params.set('mode', options.mode === 'dryrun' ? 'dryrun' : 'live');
    if (options.marketType) params.set('marketType', options.marketType);
    if (options.symbol && options.symbol.trim()) params.set('symbol', options.symbol.trim());
    return await fetchApi(
        `/api/execution/engine/readiness?${params.toString()}`,
        'Execution engine readiness API',
        normalizeExecutionEngineReadinessResponse,
        {
            timeoutMs: BACKTEST_FETCH_TIMEOUT_MS,
        }
    );
};

export const startExecutionEngine = async (
    request: StartExecutionEngineRequest
): Promise<ExecutionEngineStatusResponse> => {
    return await fetchApi(
        '/api/execution/engine/start',
        'Execution engine start API',
        normalizeExecutionEngineStatusResponse,
        {
            method: 'POST',
            body: request,
            allowFallback: false,
        }
    );
};

export const stopExecutionEngine = async (
    reason = 'ui-stop'
): Promise<ExecutionEngineStatusResponse> => {
    return await fetchApi(
        '/api/execution/engine/stop',
        'Execution engine stop API',
        normalizeExecutionEngineStatusResponse,
        {
            method: 'POST',
            body: { reason },
            allowFallback: false,
        }
    );
};

// --- Discord Config API ---

export interface DiscordConfigResponse {
    configured: boolean;
    webhookUrlMasked: string;
}

export const fetchDiscordConfig = async (): Promise<DiscordConfigResponse> => {
    return await fetchApi<DiscordConfigResponse>(
        '/api/discord/config',
        'Discord config API',
        (p: any) => ({
            configured: Boolean(p?.configured),
            webhookUrlMasked: typeof p?.webhookUrlMasked === 'string' ? p.webhookUrlMasked : '',
        }),
        { allowFallback: false }
    );
};

export const updateDiscordConfig = async (webhookUrl: string): Promise<{ configured: boolean; message: string }> => {
    return await fetchApi(
        '/api/discord/config',
        'Discord config update API',
        (p: any) => ({
            configured: Boolean(p?.configured),
            message: typeof p?.message === 'string' ? p.message : '',
        }),
        {
            method: 'POST',
            body: { webhookUrl },
            allowFallback: false,
        }
    );
};

export const sendDiscordTest = async (): Promise<{ success: boolean; message: string }> => {
    return await fetchApi(
        '/api/discord/test',
        'Discord test API',
        (p: any) => ({
            success: Boolean(p?.success),
            message: typeof p?.message === 'string' ? p.message : '',
        }),
        {
            method: 'POST',
            allowFallback: false,
        }
    );
};

