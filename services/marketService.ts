import {
    CandleInterval,
    FundingPositionSide,
    MarketData,
    PremiumCandle,
    PremiumCandleResponse,
    TopVolumeFundingResponse,
} from '../types';

const DEFAULT_API_BASE_URL = 'https://delta-neutral-bot-production.up.railway.app';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
const API_FETCH_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 12_000);

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

    return {
        interval: payload.interval as CandleInterval,
        limit: payload.limit,
        generatedAt: payload.generatedAt,
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

async function fetchApi<T>(path: string, errorPrefix: string, normalizer: (payload: any) => T): Promise<T> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

    try {
        let response: Response;
        try {
            response = await fetch(`${apiBaseUrl}${path}`, {
                cache: 'no-store',
                signal: controller.signal,
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new Error(`${errorPrefix} timeout after ${API_FETCH_TIMEOUT_MS}ms`);
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${errorPrefix} network error: ${message}`);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${errorPrefix} ${response.status}: ${errorText || 'Unknown error'}`);
        }

        const payload = await response.json();
        return normalizer(payload);
    } finally {
        clearTimeout(timeoutHandle);
    }
}

export const fetchLiveMarketData = async (): Promise<MarketData> => {
    try {
        return await fetchApi('/api/ticker', 'Ticker API', normalizeMarketPayload);
    } catch (error) {
        console.error('Error fetching live market data via proxy:', error);
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`실시간 시세 서버 연결 실패 (server.js 실행 상태 확인 필요): ${message}`);
    }
};

export const fetchPremiumCandles = async (
    interval: CandleInterval,
    limit: number
): Promise<PremiumCandleResponse> => {
    try {
        const query = `/api/premium-candles?interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(
            String(limit)
        )}`;
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

// ──────────────────── Multi-coin Premium ────────────────────

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
    count: number;
    coins: MultiPremiumCoin[];
}

export const fetchMultiPremium = async (limit = 20): Promise<MultiPremiumResponse> => {
    const url = `${apiBaseUrl}/api/multi-premium?limit=${limit}`;
    const resp = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`Multi-premium API error: ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data?.coins)) throw new Error('Invalid multi-premium response');
    return data as MultiPremiumResponse;
};
