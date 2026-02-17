import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 7000);
const fxCacheTtlMs = Number(process.env.FX_CACHE_TTL_MS ?? 5 * 60 * 1000);
const candleCacheTtlMs = Number(process.env.CANDLE_CACHE_TTL_MS ?? 20 * 1000);

app.use(cors());

const DEFAULT_USD_KRW = 1440;
const fxCache = {
    usdKrw: DEFAULT_USD_KRW,
    source: 'fallback-default',
    fetchedAt: 0,
};

const CANDLE_INTERVAL_CONFIG = {
    '1m': {
        upbitPath: 'minutes/1',
        binanceFetchInterval: '1m',
        binanceFetchMultiplier: 1,
        intervalMs: 60 * 1000,
        defaultLimit: 180,
        maxLimit: 200,
    },
    '10m': {
        upbitPath: 'minutes/10',
        binanceFetchInterval: '5m',
        binanceFetchMultiplier: 2,
        intervalMs: 10 * 60 * 1000,
        defaultLimit: 200,
        maxLimit: 200,
    },
    '30m': {
        upbitPath: 'minutes/30',
        binanceFetchInterval: '30m',
        binanceFetchMultiplier: 1,
        intervalMs: 30 * 60 * 1000,
        defaultLimit: 200,
        maxLimit: 200,
    },
    '1d': {
        upbitPath: 'days',
        binanceFetchInterval: '1d',
        binanceFetchMultiplier: 1,
        intervalMs: 24 * 60 * 60 * 1000,
        defaultLimit: 120,
        maxLimit: 200,
    },
};

const candleCache = new Map();

function toFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : NaN;
}

function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function normalizeInterval(interval) {
    const normalized = typeof interval === 'string' ? interval : '1m';
    return CANDLE_INTERVAL_CONFIG[normalized] ? normalized : '1m';
}

function parseLimit(value, fallback, maxLimit) {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, maxLimit);
}

function parsePositiveNumber(value, fallback, minValue, maxValue) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    const minClamped = Number.isFinite(minValue) ? Math.max(minValue, parsed) : parsed;
    return Number.isFinite(maxValue) ? Math.min(minClamped, maxValue) : minClamped;
}

function normalizeFundingSide(value) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'SHORT';
    return normalized === 'LONG' ? 'LONG' : 'SHORT';
}

function parseUpbitCandle(candle) {
    const timestamp = Date.parse(`${candle?.candle_date_time_utc}Z`);
    const open = toFiniteNumber(candle?.opening_price);
    const high = toFiniteNumber(candle?.high_price);
    const low = toFiniteNumber(candle?.low_price);
    const close = toFiniteNumber(candle?.trade_price);

    if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {
        return null;
    }

    return {
        timestamp,
        open,
        high,
        low,
        close,
    };
}

function parseBinanceKline(kline) {
    const timestamp = toFiniteNumber(kline?.[0]);
    const open = toFiniteNumber(kline?.[1]);
    const high = toFiniteNumber(kline?.[2]);
    const low = toFiniteNumber(kline?.[3]);
    const close = toFiniteNumber(kline?.[4]);

    if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {
        return null;
    }

    return {
        timestamp,
        open,
        high,
        low,
        close,
    };
}

function parseBybitKline(kline) {
    const timestamp = toFiniteNumber(kline?.[0]);
    const open = toFiniteNumber(kline?.[1]);
    const high = toFiniteNumber(kline?.[2]);
    const low = toFiniteNumber(kline?.[3]);
    const close = toFiniteNumber(kline?.[4]);

    if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {
        return null;
    }

    return {
        timestamp,
        open,
        high,
        low,
        close,
    };
}

function toBybitInterval(binanceInterval) {
    const intervalMap = {
        '1m': '1',
        '5m': '5',
        '30m': '30',
        '1d': 'D',
    };
    return intervalMap[binanceInterval] ?? null;
}

function calcPremium(domesticPrice, globalPriceUsdt, conversionRate) {
    if (
        !Number.isFinite(domesticPrice) ||
        !Number.isFinite(globalPriceUsdt) ||
        !Number.isFinite(conversionRate) ||
        domesticPrice <= 0 ||
        globalPriceUsdt <= 0 ||
        conversionRate <= 0
    ) {
        return null;
    }

    return ((domesticPrice / (globalPriceUsdt * conversionRate)) - 1) * 100;
}

function alignByNearestTimestamp(baseCandles, targetCandles, toleranceMs) {
    const result = new Map();
    if (baseCandles.length === 0 || targetCandles.length === 0) {
        return result;
    }

    let targetIndex = 0;
    for (const base of baseCandles) {
        while (
            targetIndex + 1 < targetCandles.length &&
            Math.abs(targetCandles[targetIndex + 1].timestamp - base.timestamp) <=
            Math.abs(targetCandles[targetIndex].timestamp - base.timestamp)
        ) {
            targetIndex += 1;
        }

        const match = targetCandles[targetIndex];
        if (match && Math.abs(match.timestamp - base.timestamp) <= toleranceMs) {
            result.set(base.timestamp, match);
        }
    }

    return result;
}

async function fetchJson(url) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'user-agent': 'delta-neutral-bot/1.0' },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function fetchUsdKrwFromErApi() {
    const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
    const rate = toFiniteNumber(data?.rates?.KRW);
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Invalid KRW rate from open.er-api');
    }
    return { rate, source: 'open.er-api:USD/KRW' };
}

async function fetchUsdKrwFromFrankfurter() {
    const data = await fetchJson('https://api.frankfurter.app/latest?from=USD&to=KRW');
    const rate = toFiniteNumber(data?.rates?.KRW);
    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Invalid KRW rate from frankfurter');
    }
    return { rate, source: 'frankfurter:USD/KRW' };
}

async function getUsdKrwRate() {
    const now = Date.now();

    if (fxCache.fetchedAt > 0 && now - fxCache.fetchedAt <= fxCacheTtlMs) {
        return fxCache;
    }

    const providers = [fetchUsdKrwFromErApi, fetchUsdKrwFromFrankfurter];
    for (const provider of providers) {
        try {
            const { rate, source } = await provider();
            fxCache.usdKrw = rate;
            fxCache.source = source;
            fxCache.fetchedAt = now;
            console.log(`Updated FX rate (${source}): ${round(rate, 4)}`);
            return fxCache;
        } catch (error) {
            console.warn(`FX provider failed (${provider.name}): ${error.message}`);
        }
    }

    console.warn(
        `Using cached FX fallback (${fxCache.source}) = ${round(fxCache.usdKrw, 4)}`
    );
    return fxCache;
}

async function fetchUpbitBtcAndUsdtKrw() {
    const data = await fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT');
    if (!Array.isArray(data)) {
        throw new Error('Unexpected Upbit ticker response');
    }

    const byMarket = new Map(data.map((item) => [item.market, item]));
    const btcKrw = toFiniteNumber(byMarket.get('KRW-BTC')?.trade_price);
    const usdtKrw = toFiniteNumber(byMarket.get('KRW-USDT')?.trade_price);

    if (!Number.isFinite(btcKrw) || btcKrw <= 0) {
        throw new Error('Invalid KRW-BTC price from Upbit');
    }
    if (!Number.isFinite(usdtKrw) || usdtKrw <= 0) {
        throw new Error('Invalid KRW-USDT price from Upbit');
    }

    return { btcKrw, usdtKrw };
}

async function fetchBinanceBtcUsdt() {
    const data = await fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const btcUsdt = toFiniteNumber(data?.price);

    if (!Number.isFinite(btcUsdt) || btcUsdt <= 0) {
        throw new Error('Invalid BTCUSDT price from Binance');
    }

    return btcUsdt;
}

async function fetchBybitBtcUsdt() {
    const data = await fetchJson(
        'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT'
    );
    const ticker = Array.isArray(data?.result?.list) ? data.result.list[0] : null;
    const btcUsdt = toFiniteNumber(ticker?.lastPrice);

    if (!Number.isFinite(btcUsdt) || btcUsdt <= 0) {
        throw new Error('Invalid BTCUSDT price from Bybit');
    }

    return btcUsdt;
}

async function fetchKrakenBtcUsdt() {
    const data = await fetchJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSDT');
    const ticker = data?.result?.XBTUSDT ?? data?.result?.['XXBTZUSD'];
    const lastPrice = toFiniteNumber(ticker?.c?.[0]);

    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
        throw new Error('Invalid BTCUSDT price from Kraken');
    }

    return lastPrice;
}

async function fetchOkxBtcUsdt() {
    const data = await fetchJson('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const ticker = Array.isArray(data?.data) ? data.data[0] : null;
    const lastPrice = toFiniteNumber(ticker?.last);

    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
        throw new Error('Invalid BTCUSDT price from OKX');
    }

    return lastPrice;
}

async function fetchCoinGeckoBtcUsdt() {
    const data = await fetchJson(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
    );
    const price = toFiniteNumber(data?.bitcoin?.usd);

    if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Invalid BTC/USD price from CoinGecko');
    }

    return price;
}

async function fetchUpbitCandles({ market, upbitPath, limit }) {
    const url = `https://api.upbit.com/v1/candles/${upbitPath}?market=${encodeURIComponent(
        market
    )}&count=${encodeURIComponent(String(limit))}`;
    const data = await fetchJson(url);

    if (!Array.isArray(data)) {
        throw new Error(`Unexpected Upbit candle response for ${market}`);
    }

    return data
        .map(parseUpbitCandle)
        .filter((candle) => candle !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchBinanceCandles({ interval, limit }) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${encodeURIComponent(
        interval
    )}&limit=${encodeURIComponent(String(limit))}`;
    const data = await fetchJson(url);

    if (!Array.isArray(data)) {
        throw new Error('Unexpected Binance kline response');
    }

    return data
        .map(parseBinanceKline)
        .filter((candle) => candle !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchBybitCandles({ interval, limit }) {
    const bybitInterval = toBybitInterval(interval);
    if (!bybitInterval) {
        throw new Error(`Unsupported interval for Bybit: ${interval}`);
    }

    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=${encodeURIComponent(
        bybitInterval
    )}&limit=${encodeURIComponent(String(limit))}`;
    const data = await fetchJson(url);
    const list = data?.result?.list;

    if (!Array.isArray(list)) {
        throw new Error('Unexpected Bybit kline response');
    }

    return list
        .map(parseBybitKline)
        .filter((candle) => candle !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchGlobalBtcUsdt() {
    const providers = [
        { source: 'binance:BTCUSDT', fetcher: fetchBinanceBtcUsdt },
        { source: 'bybit:BTCUSDT', fetcher: fetchBybitBtcUsdt },
        { source: 'kraken:BTCUSDT', fetcher: fetchKrakenBtcUsdt },
        { source: 'okx:BTCUSDT', fetcher: fetchOkxBtcUsdt },
        { source: 'coingecko:BTC/USD', fetcher: fetchCoinGeckoBtcUsdt },
    ];

    let lastErrorMessage = 'unknown error';

    for (const provider of providers) {
        try {
            const price = await provider.fetcher();
            return { price, source: provider.source };
        } catch (error) {
            lastErrorMessage = error instanceof Error ? error.message : String(error);
            console.warn(
                `Global ticker provider failed (${provider.source}): ${lastErrorMessage}`
            );
        }
    }

    throw new Error(`All global ticker providers failed: ${lastErrorMessage}`);
}

function toOkxBar(binanceInterval) {
    const barMap = { '1m': '1m', '5m': '5m', '30m': '30m', '1d': '1D' };
    return barMap[binanceInterval] ?? null;
}

async function fetchOkxCandles({ interval, limit }) {
    const bar = toOkxBar(interval);
    if (!bar) {
        throw new Error(`Unsupported interval for OKX: ${interval}`);
    }
    const url = `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${encodeURIComponent(bar)}&limit=${encodeURIComponent(String(Math.min(limit, 300)))}`;
    const data = await fetchJson(url);
    const list = Array.isArray(data?.data) ? data.data : [];

    if (list.length === 0) {
        throw new Error('Unexpected OKX candle response');
    }

    return list
        .map((item) => {
            const timestamp = toFiniteNumber(item?.[0]);
            const open = toFiniteNumber(item?.[1]);
            const high = toFiniteNumber(item?.[2]);
            const low = toFiniteNumber(item?.[3]);
            const close = toFiniteNumber(item?.[4]);
            if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
                return null;
            }
            return { timestamp, open, high, low, close };
        })
        .filter((c) => c !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchKrakenCandles({ interval, limit }) {
    const krakenIntervalMap = { '1m': 1, '5m': 5, '30m': 30, '1d': 1440 };
    const krakenInterval = krakenIntervalMap[interval];
    if (!krakenInterval) {
        throw new Error(`Unsupported interval for Kraken: ${interval}`);
    }
    const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSDT&interval=${krakenInterval}`;
    const data = await fetchJson(url);
    const ohlcData = data?.result?.XBTUSDT ?? data?.result?.['XXBTZUSD'];

    if (!Array.isArray(ohlcData)) {
        throw new Error('Unexpected Kraken OHLC response');
    }

    const candles = ohlcData
        .map((item) => {
            const timestamp = toFiniteNumber(item?.[0]) * 1000;
            const open = toFiniteNumber(item?.[1]);
            const high = toFiniteNumber(item?.[2]);
            const low = toFiniteNumber(item?.[3]);
            const close = toFiniteNumber(item?.[4]);
            if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
                return null;
            }
            return { timestamp, open, high, low, close };
        })
        .filter((c) => c !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

    return candles.slice(-limit);
}

async function fetchGlobalCandles({ interval, limit }) {
    const bybitInterval = toBybitInterval(interval);
    const okxBar = toOkxBar(interval);
    const providers = [
        {
            source: 'binance:BTCUSDT',
            sourceInterval: interval,
            fetcher: () => fetchBinanceCandles({ interval, limit }),
        },
        bybitInterval
            ? {
                source: 'bybit:BTCUSDT',
                sourceInterval: bybitInterval,
                fetcher: () => fetchBybitCandles({ interval, limit }),
            }
            : null,
        okxBar
            ? {
                source: 'okx:BTC-USDT',
                sourceInterval: okxBar,
                fetcher: () => fetchOkxCandles({ interval, limit }),
            }
            : null,
        {
            source: 'kraken:BTCUSDT',
            sourceInterval: interval,
            fetcher: () => fetchKrakenCandles({ interval, limit }),
        },
    ].filter((provider) => provider !== null);

    let lastErrorMessage = 'unknown error';

    for (const provider of providers) {
        try {
            const candles = await provider.fetcher();
            return {
                candles,
                source: provider.source,
                sourceInterval: provider.sourceInterval,
            };
        } catch (error) {
            lastErrorMessage = error instanceof Error ? error.message : String(error);
            console.warn(
                `Global candle provider failed (${provider.source}): ${lastErrorMessage}`
            );
        }
    }

    throw new Error(`All global candle providers failed: ${lastErrorMessage}`);
}

function calcEstimatedFundingFeeUsdt({
    fundingRate,
    positionNotionalUsdt,
    fundingIntervalHours,
    side,
}) {
    if (
        !Number.isFinite(fundingRate) ||
        !Number.isFinite(positionNotionalUsdt) ||
        !Number.isFinite(fundingIntervalHours)
    ) {
        return null;
    }

    const intervalMultiplier = fundingIntervalHours / 8;
    const sideMultiplier = side === 'SHORT' ? 1 : -1;
    return positionNotionalUsdt * fundingRate * intervalMultiplier * sideMultiplier;
}

async function fetchUsdtKrwRate() {
    try {
        const upbit = await fetchUpbitBtcAndUsdtKrw();
        if (Number.isFinite(upbit.usdtKrw) && upbit.usdtKrw > 0) {
            return upbit.usdtKrw;
        }
    } catch (error) {
        console.warn(`USDT/KRW provider failed (upbit): ${error.message}`);
    }

    const fxRate = await getUsdKrwRate();
    return fxRate.usdKrw;
}

async function fetchBinanceTopFundingSymbols(limit) {
    const [tickers, premiumIndex] = await Promise.all([
        fetchJson('https://fapi.binance.com/fapi/v1/ticker/24hr'),
        fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex'),
    ]);

    if (!Array.isArray(tickers) || !Array.isArray(premiumIndex)) {
        throw new Error('Unexpected Binance futures response');
    }

    const fundingBySymbol = new Map();
    for (const item of premiumIndex) {
        const symbol = typeof item?.symbol === 'string' ? item.symbol : '';
        const fundingRate = toFiniteNumber(item?.lastFundingRate);
        const markPrice = toFiniteNumber(item?.markPrice);
        const nextFundingTime = toFiniteNumber(item?.nextFundingTime);

        if (!symbol || !symbol.endsWith('USDT') || !Number.isFinite(fundingRate)) {
            continue;
        }

        fundingBySymbol.set(symbol, {
            fundingRate,
            markPrice: Number.isFinite(markPrice) && markPrice > 0 ? markPrice : null,
            nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : null,
        });
    }

    const merged = [];
    for (const ticker of tickers) {
        const symbol = typeof ticker?.symbol === 'string' ? ticker.symbol : '';
        if (!symbol || !symbol.endsWith('USDT')) continue;

        const quoteVolume24h = toFiniteNumber(ticker?.quoteVolume);
        const tickerLastPrice = toFiniteNumber(ticker?.lastPrice);
        const funding = fundingBySymbol.get(symbol);

        if (
            !funding ||
            !Number.isFinite(quoteVolume24h) ||
            quoteVolume24h <= 0 ||
            (!Number.isFinite(tickerLastPrice) && !Number.isFinite(funding.markPrice))
        ) {
            continue;
        }

        merged.push({
            symbol,
            quoteVolume24h,
            lastPrice:
                Number.isFinite(funding.markPrice) && funding.markPrice > 0
                    ? funding.markPrice
                    : tickerLastPrice,
            fundingRate: funding.fundingRate,
            nextFundingTime: funding.nextFundingTime,
        });
    }

    merged.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
    return {
        source: 'binance:futures',
        symbols: merged.slice(0, limit),
    };
}

async function fetchBybitTopFundingSymbols(limit) {
    const data = await fetchJson('https://api.bybit.com/v5/market/tickers?category=linear');
    const list = data?.result?.list;

    if (!Array.isArray(list)) {
        throw new Error('Unexpected Bybit linear ticker response');
    }

    const rows = list
        .map((item) => {
            const symbol = typeof item?.symbol === 'string' ? item.symbol : '';
            const quoteVolume24h = toFiniteNumber(item?.turnover24h);
            const lastPrice = toFiniteNumber(item?.lastPrice);
            const fundingRate = toFiniteNumber(item?.fundingRate);
            const nextFundingTime = toFiniteNumber(item?.nextFundingTime);

            if (
                !symbol ||
                !symbol.endsWith('USDT') ||
                !Number.isFinite(quoteVolume24h) ||
                quoteVolume24h <= 0 ||
                !Number.isFinite(lastPrice) ||
                lastPrice <= 0 ||
                !Number.isFinite(fundingRate)
            ) {
                return null;
            }

            return {
                symbol,
                quoteVolume24h,
                lastPrice,
                fundingRate,
                nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : null,
            };
        })
        .filter((row) => row !== null);

    rows.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
    return {
        source: 'bybit:linear',
        symbols: rows.slice(0, limit),
    };
}

async function fetchOkxTopFundingSymbols(limit) {
    // Step 1: Fetch all SWAP tickers for volume and price info
    const tickers = await fetchJson('https://www.okx.com/api/v5/market/tickers?instType=SWAP');

    const tickerList = Array.isArray(tickers?.data) ? tickers.data : [];
    if (tickerList.length === 0) {
        throw new Error('Unexpected OKX swap ticker response');
    }

    // Step 2: Filter and sort by volume, pick top candidates
    const candidates = tickerList
        .map((item) => {
            const instId = typeof item?.instId === 'string' ? item.instId : '';
            if (!instId.endsWith('-USDT-SWAP')) return null;

            const symbol = instId.replace('-SWAP', '').replace('-', '');
            const quoteVolume24h = toFiniteNumber(item?.volCcy24h);
            const lastPrice = toFiniteNumber(item?.last);

            if (
                !Number.isFinite(quoteVolume24h) ||
                quoteVolume24h <= 0 ||
                !Number.isFinite(lastPrice) ||
                lastPrice <= 0
            ) {
                return null;
            }

            return { instId, symbol, quoteVolume24h, lastPrice };
        })
        .filter((row) => row !== null)
        .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
        .slice(0, limit + 5); // fetch a few extra in case some have no funding data

    // Step 3: Fetch funding rates for top candidates
    const fundingPromises = candidates.map(async (candidate) => {
        try {
            const data = await fetchJson(
                `https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(candidate.instId)}`
            );
            const entry = Array.isArray(data?.data) ? data.data[0] : null;
            const fundingRate = toFiniteNumber(entry?.fundingRate);
            const nextFundingTime = toFiniteNumber(entry?.nextFundingTime);

            if (!Number.isFinite(fundingRate)) return null;

            return {
                symbol: candidate.symbol,
                quoteVolume24h: candidate.quoteVolume24h,
                lastPrice: candidate.lastPrice,
                fundingRate,
                nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : null,
            };
        } catch {
            return null;
        }
    });

    const results = (await Promise.all(fundingPromises)).filter((r) => r !== null);
    results.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

    return {
        source: 'okx:swap',
        symbols: results.slice(0, limit),
    };
}

async function fetchTopFundingSymbols(limit) {
    const providers = [
        () => fetchBinanceTopFundingSymbols(limit),
        () => fetchBybitTopFundingSymbols(limit),
        () => fetchOkxTopFundingSymbols(limit),
    ];

    let lastErrorMessage = 'unknown error';
    for (const provider of providers) {
        try {
            return await provider();
        } catch (error) {
            lastErrorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Top funding provider failed: ${lastErrorMessage}`);
        }
    }

    throw new Error(`All top funding providers failed: ${lastErrorMessage}`);
}

function aggregateCandlesByInterval(candles, intervalMs, limit) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const buckets = new Map();
    for (const candle of candles) {
        const bucketStart = Math.floor(candle.timestamp / intervalMs) * intervalMs;
        const existing = buckets.get(bucketStart);

        if (!existing) {
            buckets.set(bucketStart, {
                timestamp: bucketStart,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
            });
            continue;
        }

        existing.high = Math.max(existing.high, candle.high);
        existing.low = Math.min(existing.low, candle.low);
        existing.close = candle.close;
    }

    const aggregated = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (Number.isFinite(limit) && limit > 0) {
        return aggregated.slice(-limit);
    }
    return aggregated;
}

function buildPremiumCandles({
    domesticCandles,
    globalCandles,
    conversionCandles,
    intervalMs,
}) {
    const toleranceMs = Math.max(intervalMs / 2, 60 * 1000);
    const alignedGlobalMap = alignByNearestTimestamp(domesticCandles, globalCandles, toleranceMs);
    const alignedConversionMap = alignByNearestTimestamp(
        domesticCandles,
        conversionCandles,
        toleranceMs
    );

    const candles = [];

    for (const domestic of domesticCandles) {
        const global = alignedGlobalMap.get(domestic.timestamp);
        const conversion = alignedConversionMap.get(domestic.timestamp);
        if (!global || !conversion) continue;

        const premiumOpen = calcPremium(domestic.open, global.open, conversion.open);
        const premiumHigh = calcPremium(domestic.high, global.high, conversion.high);
        const premiumLow = calcPremium(domestic.low, global.low, conversion.low);
        const premiumClose = calcPremium(domestic.close, global.close, conversion.close);

        if (
            premiumOpen === null ||
            premiumHigh === null ||
            premiumLow === null ||
            premiumClose === null
        ) {
            continue;
        }

        const high = Math.max(premiumOpen, premiumHigh, premiumLow, premiumClose);
        const low = Math.min(premiumOpen, premiumHigh, premiumLow, premiumClose);

        candles.push({
            timestamp: domestic.timestamp,
            open: round(premiumOpen, 4),
            high: round(high, 4),
            low: round(low, 4),
            close: round(premiumClose, 4),
            domesticCloseKrw: round(domestic.close, 0),
            globalCloseUsdt: round(global.close, 2),
            conversionClose: round(conversion.close, 4),
        });
    }

    return candles;
}

app.get('/api/ticker', async (req, res) => {
    try {
        const [upbit, globalTicker, fxRate] = await Promise.all([
            fetchUpbitBtcAndUsdtKrw(),
            fetchGlobalBtcUsdt(),
            getUsdKrwRate(),
        ]);

        const krwPrice = upbit.btcKrw;
        const usdPrice = globalTicker.price;
        const exchangeRate = fxRate.usdKrw;
        const usdtKrwRate = upbit.usdtKrw;

        // Primary kimchi premium: USD/KRW (real market premium, matches Korean crypto sites)
        const normalizedGlobalKrwPrice = usdPrice * exchangeRate;
        const kimchiPremiumPercent = ((krwPrice / normalizedGlobalKrwPrice) - 1) * 100;

        // Effective USDT premium: USDT/KRW (actual arbitrage gap after USDT premium)
        const usdtConversionRate = usdtKrwRate > 0 ? usdtKrwRate : exchangeRate;
        const normalizedGlobalKrwPriceUsdt = usdPrice * usdtConversionRate;
        const kimchiPremiumPercentUsdt = ((krwPrice / normalizedGlobalKrwPriceUsdt) - 1) * 100;

        // USDT premium vs USD (shows how much premium USDT itself carries in Korea)
        const usdtPremiumPercent = usdtKrwRate > 0 ? ((usdtKrwRate / exchangeRate) - 1) * 100 : 0;

        res.json({
            timestamp: Date.now(),
            krwPrice: round(krwPrice, 0),
            usdPrice: round(usdPrice, 2),
            exchangeRate: round(exchangeRate, 4),
            usdtKrwRate: round(usdtKrwRate, 4),
            conversionRate: round(exchangeRate, 4),
            normalizedGlobalKrwPrice: round(normalizedGlobalKrwPrice, 0),
            kimchiPremiumPercent: round(kimchiPremiumPercent, 4),
            kimchiPremiumPercentUsdt: round(kimchiPremiumPercentUsdt, 4),
            usdtPremiumPercent: round(usdtPremiumPercent, 4),
            fxCacheAgeMs: fxRate.fetchedAt > 0 ? Date.now() - fxRate.fetchedAt : null,
            sources: {
                domestic: 'upbit:KRW-BTC',
                global: globalTicker.source,
                fx: fxRate.source,
                conversion: fxRate.source,
            },
        });
    } catch (error) {
        console.error('Proxy fetch error:', error.message);
        res.status(500).json({ error: `Failed to fetch live market data: ${error.message}` });
    }
});

app.get('/api/premium-candles', async (req, res) => {
    try {
        const interval = normalizeInterval(req.query.interval);
        const config = CANDLE_INTERVAL_CONFIG[interval];
        const limit = parseLimit(req.query.limit, config.defaultLimit, config.maxLimit);
        const cacheKey = `${interval}:${limit}`;
        const now = Date.now();
        const cached = candleCache.get(cacheKey);

        if (cached && now - cached.updatedAt <= candleCacheTtlMs) {
            res.json({
                ...cached.payload,
                cache: {
                    hit: true,
                    ageMs: now - cached.updatedAt,
                },
            });
            return;
        }

        const binanceFetchLimit = Math.min(
            1000,
            limit * config.binanceFetchMultiplier + Math.max(6, config.binanceFetchMultiplier * 2)
        );

        const [domesticCandles, conversionCandles, globalCandleResult, fxRate] = await Promise.all([
            fetchUpbitCandles({
                market: 'KRW-BTC',
                upbitPath: config.upbitPath,
                limit,
            }),
            fetchUpbitCandles({
                market: 'KRW-USDT',
                upbitPath: config.upbitPath,
                limit,
            }),
            fetchGlobalCandles({
                interval: config.binanceFetchInterval,
                limit: binanceFetchLimit,
            }),
            getUsdKrwRate(),
        ]);

        const globalCandles = aggregateCandlesByInterval(
            globalCandleResult.candles,
            config.intervalMs,
            limit
        );

        const candles = buildPremiumCandles({
            domesticCandles,
            globalCandles,
            conversionCandles,
            intervalMs: config.intervalMs,
        });

        if (!candles.length) {
            throw new Error('No aligned premium candles were generated');
        }

        const payload = {
            interval,
            limit,
            generatedAt: now,
            candles,
            sources: {
                domestic: `upbit:KRW-BTC:${config.upbitPath}`,
                global: `${globalCandleResult.source}:${globalCandleResult.sourceInterval}->${interval}`,
                conversion: `upbit:KRW-USDT:${config.upbitPath}`,
                fxFallback: fxRate.source,
            },
            cache: {
                hit: false,
                ageMs: 0,
            },
        };

        candleCache.set(cacheKey, {
            payload,
            updatedAt: now,
        });

        res.json(payload);
    } catch (error) {
        console.error('Premium candle fetch error:', error.message);
        res.status(500).json({
            error: `Failed to fetch premium candles: ${error.message}`,
        });
    }
});

app.get('/api/top-volume-funding', async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit, 10, 20);
        const positionNotionalUsdt = parsePositiveNumber(
            req.query.notionalUsdt,
            1000,
            50,
            100_000_000
        );
        const fundingIntervalHours = parsePositiveNumber(
            req.query.fundingIntervalHours,
            8,
            1,
            72
        );
        const side = normalizeFundingSide(req.query.side);

        const [topSymbolsResult, usdtKrwRate] = await Promise.all([
            fetchTopFundingSymbols(limit),
            fetchUsdtKrwRate(),
        ]);

        const symbols = topSymbolsResult.symbols.map((item, index) => {
            const estimatedFundingFeeUsdt = calcEstimatedFundingFeeUsdt({
                fundingRate: item.fundingRate,
                positionNotionalUsdt,
                fundingIntervalHours,
                side,
            });

            const estimatedFundingFeeKrw =
                estimatedFundingFeeUsdt !== null && Number.isFinite(usdtKrwRate)
                    ? estimatedFundingFeeUsdt * usdtKrwRate
                    : null;

            return {
                rank: index + 1,
                symbol: item.symbol,
                quoteVolume24h: round(item.quoteVolume24h, 2),
                lastPrice: round(item.lastPrice, 6),
                fundingRate: round(item.fundingRate, 8),
                nextFundingTime: item.nextFundingTime,
                estimatedFundingFeeUsdt:
                    estimatedFundingFeeUsdt === null ? null : round(estimatedFundingFeeUsdt, 6),
                estimatedFundingFeeKrw:
                    estimatedFundingFeeKrw === null ? null : round(estimatedFundingFeeKrw, 2),
            };
        });

        res.json({
            generatedAt: Date.now(),
            source: topSymbolsResult.source,
            limit,
            positionSide: side,
            positionNotionalUsdt: round(positionNotionalUsdt, 6),
            fundingIntervalHours: round(fundingIntervalHours, 4),
            usdtKrwRate: round(usdtKrwRate, 4),
            symbols,
        });
    } catch (error) {
        console.error('Top funding fetch error:', error.message);
        res.status(500).json({
            error: `Failed to fetch top funding symbols: ${error.message}`,
        });
    }
});

// ──────────────────── Multi-coin Premium ────────────────────

const MULTI_PREMIUM_COINS = [
    'BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'LINK',
    'DOT', 'MATIC', 'NEAR', 'ATOM', 'APT', 'ARB', 'OP',
    'SUI', 'SEI', 'TIA', 'AAVE', 'UNI', 'SAND', 'MANA',
    'SHIB', 'PEPE', 'EOS', 'TRX', 'BCH', 'LTC', 'ETC', 'FIL',
];

app.get('/api/multi-premium', async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit, 20, 30);

        // Step 1: Get available Upbit KRW markets
        const allMarkets = await fetchJson('https://api.upbit.com/v1/market/all?isDetails=false');
        if (!Array.isArray(allMarkets)) throw new Error('Cannot fetch Upbit markets');

        const krwSet = new Set(allMarkets
            .filter((m) => typeof m?.market === 'string' && m.market.startsWith('KRW-'))
            .map((m) => m.market.replace('KRW-', '')));

        // Step 2: Filter target coins to only valid Upbit markets
        const validCoins = MULTI_PREMIUM_COINS.filter((s) => krwSet.has(s));
        const upbitMarkets = [...validCoins.map((s) => `KRW-${s}`), 'KRW-USDT'].join(',');

        const [upbitData, okxData, fxRate] = await Promise.all([
            fetchJson(`https://api.upbit.com/v1/ticker?markets=${upbitMarkets}`),
            fetchJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT'),
            getUsdKrwRate(),
        ]);

        if (!Array.isArray(upbitData)) throw new Error('Invalid Upbit multi-ticker response');
        if (!Array.isArray(okxData?.data)) throw new Error('Invalid OKX spot tickers response');

        // Parse Upbit prices
        const upbitMap = new Map();
        let usdtKrw = 0;
        for (const item of upbitData) {
            const market = typeof item?.market === 'string' ? item.market : '';
            const price = toFiniteNumber(item?.trade_price);
            const volume = toFiniteNumber(item?.acc_trade_price_24h);
            if (!market || !Number.isFinite(price) || price <= 0) continue;

            if (market === 'KRW-USDT') {
                usdtKrw = price;
            } else {
                const symbol = market.replace('KRW-', '');
                upbitMap.set(symbol, { krwPrice: price, volume24hKrw: volume || 0 });
            }
        }

        // Parse OKX USDT spot prices
        const okxMap = new Map();
        for (const item of okxData.data) {
            const instId = typeof item?.instId === 'string' ? item.instId : '';
            if (!instId.endsWith('-USDT')) continue;
            const symbol = instId.replace('-USDT', '');
            const price = toFiniteNumber(item?.last);
            if (Number.isFinite(price) && price > 0) {
                okxMap.set(symbol, price);
            }
        }

        const usdKrw = fxRate.usdKrw;
        const effectiveUsdtKrw = usdtKrw > 0 ? usdtKrw : usdKrw;
        const usdtPremiumPercent = usdtKrw > 0 ? ((usdtKrw / usdKrw) - 1) * 100 : 0;

        // Calculate premiums for each matched coin
        const coins = [];
        for (const symbol of MULTI_PREMIUM_COINS) {
            const upbit = upbitMap.get(symbol);
            const globalPrice = okxMap.get(symbol);
            if (!upbit || !globalPrice) continue;

            const premiumUsd = ((upbit.krwPrice / (globalPrice * usdKrw)) - 1) * 100;
            const premiumUsdt = ((upbit.krwPrice / (globalPrice * effectiveUsdtKrw)) - 1) * 100;

            coins.push({
                symbol,
                krwPrice: round(upbit.krwPrice, 0),
                usdtPrice: round(globalPrice, 6),
                volume24hKrw: round(upbit.volume24hKrw, 0),
                premiumUsd: round(premiumUsd, 4),
                premiumUsdt: round(premiumUsdt, 4),
            });
        }

        // Sort by volume descending
        coins.sort((a, b) => b.volume24hKrw - a.volume24hKrw);
        const result = coins.slice(0, limit);

        res.json({
            timestamp: Date.now(),
            usdKrw: round(usdKrw, 4),
            usdtKrw: round(effectiveUsdtKrw, 4),
            usdtPremiumPercent: round(usdtPremiumPercent, 4),
            fxSource: fxRate.source,
            count: result.length,
            coins: result,
        });
    } catch (error) {
        console.error('Multi-premium fetch error:', error.message);
        res.status(500).json({
            error: `Failed to fetch multi-coin premiums: ${error.message}`,
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        fxCacheAgeMs: fxCache.fetchedAt > 0 ? Date.now() - fxCache.fetchedAt : null,
        fxSource: fxCache.source,
        fxValue: round(fxCache.usdKrw, 4),
        candleCacheKeys: candleCache.size,
    });
});

app.listen(port, () => {
    console.log(`Backend proxy running at http://localhost:${port}`);
});
