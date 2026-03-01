import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ccxt from 'ccxt';

// Load .env.local if it exists (minimal dotenv replacement)
try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex <= 0) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
} catch (e) {
    console.warn('Failed to load .env.local:', e.message);
}

const app = express();
const port = Number(process.env.PORT ?? 4000);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 7000);
const requestRetryCount = Number(process.env.REQUEST_RETRY_COUNT ?? 1);
const requestRetryDelayMs = Number(process.env.REQUEST_RETRY_DELAY_MS ?? 250);
const fxCacheTtlMs = Number(process.env.FX_CACHE_TTL_MS ?? 5 * 60 * 1000);
const candleCacheTtlMs = Number(process.env.CANDLE_CACHE_TTL_MS ?? 20 * 1000);
const runtimeEventLimit = Number(process.env.RUNTIME_EVENT_LIMIT ?? 500);
const parsedPremiumHistoryMaxPoints = Number(process.env.PREMIUM_HISTORY_MAX_POINTS);
const premiumHistoryMaxPoints =
    Number.isFinite(parsedPremiumHistoryMaxPoints) && parsedPremiumHistoryMaxPoints >= 500
        ? Math.floor(parsedPremiumHistoryMaxPoints)
        : 50_000;
const parsedMaxBacktestRangeCandles = Number(process.env.MAX_BACKTEST_RANGE_CANDLES);
const maxBacktestRangeCandles =
    Number.isFinite(parsedMaxBacktestRangeCandles) && parsedMaxBacktestRangeCandles >= 500
        ? Math.floor(parsedMaxBacktestRangeCandles)
        : 30_000;
const parsedDefaultBacktestChartPoints = Number(process.env.BACKTEST_CHART_MAX_POINTS);
const defaultBacktestChartPoints =
    Number.isFinite(parsedDefaultBacktestChartPoints) && parsedDefaultBacktestChartPoints >= 200
        ? Math.floor(parsedDefaultBacktestChartPoints)
        : 2400;
const envBinanceExecutionApiKey = (process.env.BINANCE_API_KEY ?? '').trim();
const envBinanceExecutionApiSecret = (process.env.BINANCE_API_SECRET ?? '').trim();
const envBithumbApiKey = (process.env.BITHUMB_API_KEY ?? '').trim();
const envBithumbApiSecret = (process.env.BITHUMB_API_SECRET ?? '').trim();
const rawBinanceExecutionMarketType = (process.env.BINANCE_EXECUTION_MARKET ?? 'coinm').trim().toLowerCase();
const binanceExecutionMarketType = rawBinanceExecutionMarketType === 'usdm' ? 'usdm' : 'coinm';
const rawBinanceExecutionTestnet = (process.env.BINANCE_TESTNET ?? 'true').trim().toLowerCase();
const binanceExecutionTestnet = !['0', 'false', 'no', 'off'].includes(rawBinanceExecutionTestnet);
const parsedBinanceRecvWindow = Number(process.env.BINANCE_RECV_WINDOW_MS);
const binanceRecvWindowMs =
    Number.isFinite(parsedBinanceRecvWindow) && parsedBinanceRecvWindow >= 1000
        ? Math.floor(parsedBinanceRecvWindow)
        : 5000;
const executionAlertWebhookUrl = (process.env.EXECUTION_ALERT_WEBHOOK_URL ?? '').trim();
let discordWebhookUrl = (process.env.DISCORD_WEBHOOK_URL ?? '').trim();
const discordNotificationSettings = {
    premiumAlertEnabled: false,
    premiumAlertThresholds: [
        { id: 'default-high', value: 3.0 },
        { id: 'default-low', value: -1.0 },
    ],
    periodicReportEnabled: true,
    reportIntervalMinutes: 60,
};
let discordPeriodicReportTimer = null;
let discordPremiumAlertTimer = null;
let lastPremiumAlertValue = null;
const lastPremiumAlertAtMap = {};
const PREMIUM_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const parsedExecutionAlertTimeoutMs = Number(process.env.EXECUTION_ALERT_TIMEOUT_MS);
const executionAlertTimeoutMs =
    Number.isFinite(parsedExecutionAlertTimeoutMs) && parsedExecutionAlertTimeoutMs >= 1000
        ? Math.floor(parsedExecutionAlertTimeoutMs)
        : 5000;
const parsedExecutionAlertCooldownMs = Number(process.env.EXECUTION_ALERT_COOLDOWN_MS);
const executionAlertCooldownMs =
    Number.isFinite(parsedExecutionAlertCooldownMs) && parsedExecutionAlertCooldownMs >= 0
        ? Math.floor(parsedExecutionAlertCooldownMs)
        : 60_000;
const parsedExecutionFailureSafeModeThreshold = Number(process.env.EXECUTION_FAILURE_SAFE_MODE_THRESHOLD);
const executionFailureSafeModeThreshold =
    Number.isFinite(parsedExecutionFailureSafeModeThreshold) && parsedExecutionFailureSafeModeThreshold >= 1
        ? Math.floor(parsedExecutionFailureSafeModeThreshold)
        : 3;
const rawExecutionAllowLiveOrders = (process.env.EXECUTION_ALLOW_LIVE_ORDERS ?? 'false').trim().toLowerCase();
const executionAllowLiveOrders = ['1', 'true', 'yes', 'on'].includes(rawExecutionAllowLiveOrders);
const rawExecutionAllowTestnetOrders = (process.env.EXECUTION_ALLOW_TESTNET_ORDERS ?? 'true').trim().toLowerCase();
const executionAllowTestnetOrders = !['0', 'false', 'no', 'off'].includes(rawExecutionAllowTestnetOrders);
const parsedExecutionOrderRetryCount = Number(process.env.EXECUTION_ORDER_RETRY_COUNT);
const executionOrderRetryCount =
    Number.isFinite(parsedExecutionOrderRetryCount) && parsedExecutionOrderRetryCount >= 0
        ? Math.min(5, Math.floor(parsedExecutionOrderRetryCount))
        : 1;
const parsedExecutionOrderRetryDelayMs = Number(process.env.EXECUTION_ORDER_RETRY_DELAY_MS);
const executionOrderRetryDelayMs =
    Number.isFinite(parsedExecutionOrderRetryDelayMs) && parsedExecutionOrderRetryDelayMs >= 100
        ? Math.floor(parsedExecutionOrderRetryDelayMs)
        : 400;
const parsedExecutionIdempotencyTtlMs = Number(process.env.EXECUTION_IDEMPOTENCY_TTL_MS);
const executionIdempotencyTtlMs =
    Number.isFinite(parsedExecutionIdempotencyTtlMs) && parsedExecutionIdempotencyTtlMs >= 60_000
        ? Math.floor(parsedExecutionIdempotencyTtlMs)
        : 24 * 60 * 60 * 1000;
const parsedExecutionIdempotencyMaxEntries = Number(process.env.EXECUTION_IDEMPOTENCY_MAX_ENTRIES);
const executionIdempotencyMaxEntries =
    Number.isFinite(parsedExecutionIdempotencyMaxEntries) && parsedExecutionIdempotencyMaxEntries >= 100
        ? Math.floor(parsedExecutionIdempotencyMaxEntries)
        : 2000;
const parsedExecutionEnginePollIntervalMs = Number(process.env.EXECUTION_ENGINE_POLL_INTERVAL_MS);
const executionEnginePollIntervalMs =
    Number.isFinite(parsedExecutionEnginePollIntervalMs) &&
        parsedExecutionEnginePollIntervalMs >= 1000
        ? Math.floor(parsedExecutionEnginePollIntervalMs)
        : 3000;
const parsedExecutionEngineOrderCooldownMs = Number(process.env.EXECUTION_ENGINE_ORDER_COOLDOWN_MS);
const executionEngineOrderCooldownMs =
    Number.isFinite(parsedExecutionEngineOrderCooldownMs) &&
        parsedExecutionEngineOrderCooldownMs >= 1000
        ? Math.floor(parsedExecutionEngineOrderCooldownMs)
        : 5000;
const rawExecutionEngineAutoStart = (process.env.EXECUTION_ENGINE_AUTO_START ?? 'false').trim().toLowerCase();
const executionEngineAutoStart = ['1', 'true', 'yes', 'on'].includes(rawExecutionEngineAutoStart);
const rawExecutionEngineAutoDryRun = (process.env.EXECUTION_ENGINE_AUTO_DRY_RUN ?? 'true').trim().toLowerCase();
const executionEngineAutoDryRun = !['0', 'false', 'no', 'off'].includes(rawExecutionEngineAutoDryRun);
const rawExecutionEngineAutoMarketType = (process.env.EXECUTION_ENGINE_AUTO_MARKET_TYPE ?? binanceExecutionMarketType).trim().toLowerCase();
const executionEngineAutoMarketType = rawExecutionEngineAutoMarketType === 'usdm' ? 'usdm' : 'coinm';
const executionEngineAutoSymbol = (process.env.EXECUTION_ENGINE_AUTO_SYMBOL ?? '').trim();
const parsedExecutionEngineAutoEntryPct = Number(
    process.env.EXECUTION_ENGINE_AUTO_ENTRY_PCT ??
        process.env.EXECUTION_ENGINE_AUTO_BALANCE_PCT ??
        process.env.EXECUTION_ENGINE_AUTO_AMOUNT
);
const parsedExecutionEngineAutoExitPct = Number(
    process.env.EXECUTION_ENGINE_AUTO_EXIT_PCT ??
        process.env.EXECUTION_ENGINE_AUTO_BALANCE_PCT ??
        process.env.EXECUTION_ENGINE_AUTO_AMOUNT
);
const executionEngineAutoEntryPct =
    Number.isFinite(parsedExecutionEngineAutoEntryPct) &&
        parsedExecutionEngineAutoEntryPct > 0 &&
        parsedExecutionEngineAutoEntryPct <= 100
        ? parsedExecutionEngineAutoEntryPct
        : 1;
const executionEngineAutoExitPct =
    Number.isFinite(parsedExecutionEngineAutoExitPct) &&
        parsedExecutionEngineAutoExitPct > 0 &&
        parsedExecutionEngineAutoExitPct <= 100
        ? parsedExecutionEngineAutoExitPct
        : executionEngineAutoEntryPct;
const parsedExecutionEngineAutoEntryThreshold = Number(process.env.EXECUTION_ENGINE_AUTO_ENTRY_THRESHOLD);
const executionEngineAutoEntryThreshold =
    Number.isFinite(parsedExecutionEngineAutoEntryThreshold)
        ? parsedExecutionEngineAutoEntryThreshold
        : 2.0;
const parsedExecutionEngineAutoExitThreshold = Number(process.env.EXECUTION_ENGINE_AUTO_EXIT_THRESHOLD);
const executionEngineAutoExitThreshold =
    Number.isFinite(parsedExecutionEngineAutoExitThreshold)
        ? parsedExecutionEngineAutoExitThreshold
        : 0.0;
const rawExecutionEngineAutoPremiumBasis = (process.env.EXECUTION_ENGINE_AUTO_PREMIUM_BASIS ?? 'USD').trim().toUpperCase();
const executionEngineAutoPremiumBasis = rawExecutionEngineAutoPremiumBasis === 'USDT' ? 'USDT' : 'USD';
const executionEngineLeaderReplicaId = (process.env.EXECUTION_ENGINE_LEADER_REPLICA_ID ?? '').trim();
const railwayReplicaId = (process.env.RAILWAY_REPLICA_ID ?? '').trim();
const executionAdminToken = (process.env.EXECUTION_ADMIN_TOKEN ?? '').trim();
const executionAuthUsername = parseOptionalString(process.env.EXECUTION_AUTH_USERNAME, 120) ?? 'admin';
const executionAuthPassword = (process.env.EXECUTION_AUTH_PASSWORD ?? '').trim();
const parsedExecutionAuthSessionTtlMs = Number(process.env.EXECUTION_AUTH_SESSION_TTL_MS);
const executionAuthSessionTtlMs =
    Number.isFinite(parsedExecutionAuthSessionTtlMs) &&
        parsedExecutionAuthSessionTtlMs >= 5 * 60 * 1000
        ? Math.floor(parsedExecutionAuthSessionTtlMs)
        : 12 * 60 * 60 * 1000;

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json({ limit: '1mb' }));

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
        maxLimit: 2000,
    },
    '10m': {
        upbitPath: 'minutes/10',
        binanceFetchInterval: '5m',
        binanceFetchMultiplier: 2,
        intervalMs: 10 * 60 * 1000,
        defaultLimit: 200,
        maxLimit: 2000,
    },
    '30m': {
        upbitPath: 'minutes/30',
        binanceFetchInterval: '30m',
        binanceFetchMultiplier: 1,
        intervalMs: 30 * 60 * 1000,
        defaultLimit: 200,
        maxLimit: 2000,
    },
    '1d': {
        upbitPath: 'days',
        binanceFetchInterval: '1d',
        binanceFetchMultiplier: 1,
        intervalMs: 24 * 60 * 60 * 1000,
        defaultLimit: 120,
        maxLimit: 2000,
    },
};
const CANDLE_INTERVAL_KEYS = Object.keys(CANDLE_INTERVAL_CONFIG);

const candleCache = new Map();
const runtimeLogDir = path.resolve(process.cwd(), 'logs');
const runtimeLogFile = path.join(runtimeLogDir, 'data-load-events.ndjson');
const runtimeStateDir = path.resolve(process.cwd(), '.runtime');
const executionEngineStateFile = path.join(runtimeStateDir, 'execution-engine-state.json');
const executionCredentialsStateFile = path.join(runtimeStateDir, 'execution-credentials.json');
const discordConfigStateFile = path.join(runtimeStateDir, 'discord-config.json');
const frontendDistDir = path.resolve(process.cwd(), 'dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');
const runtimeEvents = [];
const premiumHistoryDir = path.resolve(process.cwd(), 'data', 'premium-history');
const premiumHistoryByInterval = new Map();
const premiumHistoryUpdatedAtByInterval = new Map();
const usdKrwDailyRateCache = new Map();
let binanceExecutionClient = null;
let binanceExecutionClientCacheKey = null;
let runtimeBinanceExecutionApiKey = '';
let runtimeBinanceExecutionApiSecret = '';
let runtimeBinanceExecutionCredentialsUpdatedAt = null;
let runtimeBinanceExecutionCredentialsPersisted = false;

let bithumbClient = null; // To be initialized later
let bithumbClientCacheKey = null;
let runtimeBithumbApiKey = '';
let runtimeBithumbApiSecret = '';
let runtimeBithumbCredentialsUpdatedAt = null;
let runtimeBithumbCredentialsPersisted = false;
let lastExecutionAlertSentAt = 0;
const executionIdempotencyStore = new Map();
const executionAuthSessions = new Map();
const executionAuthCookieName = 'execution_auth';
let executionEngineSessionId = null;
const executionFailureState = {
    consecutiveFailures: 0,
    safeMode: false,
    lastFailureAt: null,
    lastFailureEvent: null,
    lastFailureMessage: null,
    lastSuccessAt: null,
};
const executionEngineState = {
    running: false,
    desiredRunning: false,
    busy: false,
    marketType: binanceExecutionMarketType,
    symbol: defaultExecutionSymbolByMarketType(binanceExecutionMarketType),
    orderBalancePctEntry: 0,
    orderBalancePctExit: 0,
    dryRun: true,
    premiumBasis: 'USD',
    entryThreshold: 0,
    exitThreshold: 0,
    positionState: 'IDLE',
    positionSideMode: 'UNKNOWN',
    pollIntervalMs: executionEnginePollIntervalMs,
    orderCooldownMs: executionEngineOrderCooldownMs,
    startedAt: null,
    stoppedAt: null,
    lastTickAt: null,
    lastDecisionAt: null,
    lastOrderAt: null,
    lastOrderSide: null,
    lastOrderId: null,
    lastOrderAmount: null,
    lastPremium: null,
    lastEffectivePremium: null,
    lastMarketDataTimestamp: null,
    iterations: 0,
    lastError: null,
    lastOrderError: null,
    stopReason: null,
    loopTimer: null,
};

try {
    fs.mkdirSync(runtimeLogDir, { recursive: true });
    fs.mkdirSync(runtimeStateDir, { recursive: true });
    fs.mkdirSync(premiumHistoryDir, { recursive: true });
} catch (error) {
    console.error(`Failed to create runtime log directory: ${error.message}`);
}

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

function parseNumber(value, fallback, minValue, maxValue) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    const minClamped = Number.isFinite(minValue) ? Math.max(minValue, parsed) : parsed;
    return Number.isFinite(maxValue) ? Math.min(minClamped, maxValue) : minClamped;
}

function parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function parseTimestampQuery(value) {
    if (value === undefined || value === null) {
        return { provided: false, valid: true, value: null, raw: null };
    }

    const raw = String(value).trim();
    if (!raw) {
        return { provided: false, valid: true, value: null, raw };
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
        return { provided: true, valid: true, value: Math.floor(numeric), raw };
    }

    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
        return { provided: true, valid: true, value: parsed, raw };
    }

    return { provided: true, valid: false, value: null, raw };
}

function toUtcDateKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function utcDayStartTimestamp(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function listUtcDateKeysInRange(startTimestamp, endTimestamp) {
    const start = utcDayStartTimestamp(startTimestamp);
    const end = utcDayStartTimestamp(endTimestamp);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];

    const keys = [];
    for (let ts = start; ts <= end; ts += 24 * 60 * 60 * 1000) {
        keys.push(toUtcDateKey(ts));
    }
    return keys;
}

function fillMissingDailyRates(dayKeys, seedRates) {
    const rates = dayKeys.map((day) => (Number.isFinite(seedRates.get(day)) ? seedRates.get(day) : null));
    let carryForwardFilled = 0;
    let carryBackwardFilled = 0;

    let lastKnown = null;
    for (let i = 0; i < rates.length; i += 1) {
        if (Number.isFinite(rates[i])) {
            lastKnown = rates[i];
            continue;
        }
        if (Number.isFinite(lastKnown)) {
            rates[i] = lastKnown;
            carryForwardFilled += 1;
        }
    }

    let nextKnown = null;
    for (let i = rates.length - 1; i >= 0; i -= 1) {
        if (Number.isFinite(rates[i])) {
            nextKnown = rates[i];
            continue;
        }
        if (Number.isFinite(nextKnown)) {
            rates[i] = nextKnown;
            carryBackwardFilled += 1;
        }
    }

    return {
        rates,
        carryForwardFilled,
        carryBackwardFilled,
    };
}

async function getUsdKrwDailyRatesForRange(startTimestamp, endTimestamp) {
    const dayKeys = listUtcDateKeysInRange(startTimestamp, endTimestamp);
    if (!dayKeys.length) {
        throw new Error('Invalid day range for USD/KRW history');
    }

    const seedRates = new Map();
    for (const dayKey of dayKeys) {
        const cachedRate = usdKrwDailyRateCache.get(dayKey);
        if (Number.isFinite(cachedRate) && cachedRate > 0) {
            seedRates.set(dayKey, cachedRate);
        }
    }

    let source = 'cache:usd-krw-daily';
    try {
        const from = dayKeys[0];
        const to = dayKeys[dayKeys.length - 1];
        const response = await fetchJson(
            `https://api.frankfurter.app/${from}..${to}?from=USD&to=KRW`,
            { context: 'fx-history-frankfurter', retries: 1 }
        );
        const rates = response?.rates && typeof response.rates === 'object' ? response.rates : {};
        for (const [dayKey, value] of Object.entries(rates)) {
            const numeric = toFiniteNumber(value?.KRW);
            if (Number.isFinite(numeric) && numeric > 0) {
                usdKrwDailyRateCache.set(dayKey, numeric);
                seedRates.set(dayKey, numeric);
            }
        }
        source = 'frankfurter:USD/KRW:daily';
    } catch (error) {
        recordRuntimeEvent('warn', 'fx_history_daily_fetch_failed', {
            startDay: dayKeys[0],
            endDay: dayKeys[dayKeys.length - 1],
            error: toErrorMessage(error),
        });
    }

    const filled = fillMissingDailyRates(dayKeys, seedRates);
    let fallbackFilled = 0;

    if (filled.rates.some((rate) => !Number.isFinite(rate))) {
        const fallbackRate = (await getUsdKrwRate()).usdKrw;
        for (let i = 0; i < filled.rates.length; i += 1) {
            if (!Number.isFinite(filled.rates[i])) {
                filled.rates[i] = fallbackRate;
                fallbackFilled += 1;
            }
        }
        source = `${source}+fallback-current`;
    }

    const rateByDay = new Map();
    for (let i = 0; i < dayKeys.length; i += 1) {
        rateByDay.set(dayKeys[i], filled.rates[i]);
    }

    const validRates = filled.rates.filter((rate) => Number.isFinite(rate));
    return {
        source,
        dayCount: dayKeys.length,
        carryForwardFilled: filled.carryForwardFilled,
        carryBackwardFilled: filled.carryBackwardFilled,
        fallbackFilled,
        rateByDay,
        minRate: validRates.length ? Math.min(...validRates) : null,
        maxRate: validRates.length ? Math.max(...validRates) : null,
        latestRate: validRates.length ? validRates[validRates.length - 1] : null,
    };
}

function normalizePremiumHistoryCandle(candle) {
    const timestamp = toFiniteNumber(candle?.timestamp);
    const open = toFiniteNumber(candle?.open);
    const high = toFiniteNumber(candle?.high);
    const low = toFiniteNumber(candle?.low);
    const close = toFiniteNumber(candle?.close);
    const domesticCloseKrw = toFiniteNumber(candle?.domesticCloseKrw);
    const globalCloseUsdt = toFiniteNumber(candle?.globalCloseUsdt);
    const conversionClose = toFiniteNumber(candle?.conversionClose);

    if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(domesticCloseKrw) ||
        !Number.isFinite(globalCloseUsdt) ||
        !Number.isFinite(conversionClose)
    ) {
        return null;
    }

    return {
        timestamp: Math.floor(timestamp),
        open: round(open, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(close, 4),
        domesticCloseKrw: round(domesticCloseKrw, 0),
        globalCloseUsdt: round(globalCloseUsdt, 2),
        conversionClose: round(conversionClose, 4),
    };
}

function getPremiumHistoryFilePath(interval) {
    return path.join(premiumHistoryDir, `premium-candles-${interval}.ndjson`);
}

function persistPremiumHistoryInterval(interval) {
    const candles = premiumHistoryByInterval.get(interval) ?? [];
    const filePath = getPremiumHistoryFilePath(interval);
    const serialized = candles.map((candle) => JSON.stringify(candle)).join('\n');

    fs.writeFileSync(filePath, serialized ? `${serialized}\n` : '', { encoding: 'utf8' });
    premiumHistoryUpdatedAtByInterval.set(interval, Date.now());
}

function loadPremiumHistoryInterval(interval) {
    const filePath = getPremiumHistoryFilePath(interval);
    const existing = [];

    if (!fs.existsSync(filePath)) {
        premiumHistoryByInterval.set(interval, existing);
        premiumHistoryUpdatedAtByInterval.set(interval, null);
        return;
    }

    let content = '';
    try {
        content = fs.readFileSync(filePath, { encoding: 'utf8' });
    } catch (error) {
        console.warn(`Failed to read premium history file (${interval}): ${toErrorMessage(error)}`);
        premiumHistoryByInterval.set(interval, existing);
        premiumHistoryUpdatedAtByInterval.set(interval, null);
        return;
    }

    const byTimestamp = new Map();
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const parsed = JSON.parse(trimmed);
            const normalized = normalizePremiumHistoryCandle(parsed);
            if (!normalized) continue;
            byTimestamp.set(normalized.timestamp, normalized);
        } catch {
            continue;
        }
    }

    const candles = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
    const trimmedCandles = candles.slice(-premiumHistoryMaxPoints);
    premiumHistoryByInterval.set(interval, trimmedCandles);

    try {
        const stats = fs.statSync(filePath);
        premiumHistoryUpdatedAtByInterval.set(interval, stats.mtimeMs);
    } catch {
        premiumHistoryUpdatedAtByInterval.set(interval, null);
    }
}

function loadPremiumHistoryFromDisk() {
    for (const interval of CANDLE_INTERVAL_KEYS) {
        loadPremiumHistoryInterval(interval);
    }
}

function mergePremiumHistory(interval, candles) {
    const existing = premiumHistoryByInterval.get(interval) ?? [];
    const byTimestamp = new Map(existing.map((candle) => [candle.timestamp, candle]));

    let added = 0;
    let updated = 0;

    for (const candle of candles) {
        const normalized = normalizePremiumHistoryCandle(candle);
        if (!normalized) continue;

        const previous = byTimestamp.get(normalized.timestamp);
        if (!previous) {
            byTimestamp.set(normalized.timestamp, normalized);
            added += 1;
            continue;
        }

        if (
            previous.open !== normalized.open ||
            previous.high !== normalized.high ||
            previous.low !== normalized.low ||
            previous.close !== normalized.close ||
            previous.domesticCloseKrw !== normalized.domesticCloseKrw ||
            previous.globalCloseUsdt !== normalized.globalCloseUsdt ||
            previous.conversionClose !== normalized.conversionClose
        ) {
            byTimestamp.set(normalized.timestamp, normalized);
            updated += 1;
        }
    }

    const merged = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
    const trimmed = merged.slice(-premiumHistoryMaxPoints);
    premiumHistoryByInterval.set(interval, trimmed);

    const shouldPersist =
        added > 0 || updated > 0 || existing.length !== trimmed.length || merged.length !== trimmed.length;

    if (shouldPersist) {
        try {
            persistPremiumHistoryInterval(interval);
        } catch (error) {
            console.warn(`Failed to persist premium history (${interval}): ${toErrorMessage(error)}`);
        }
    }

    return {
        added,
        updated,
        total: trimmed.length,
    };
}

function getPremiumHistoryCoverage(interval) {
    const candles = premiumHistoryByInterval.get(interval) ?? [];
    return {
        interval,
        storedCandles: candles.length,
        earliestTimestamp: candles[0]?.timestamp ?? null,
        latestTimestamp: candles[candles.length - 1]?.timestamp ?? null,
        updatedAt: premiumHistoryUpdatedAtByInterval.get(interval) ?? null,
    };
}

function selectPremiumHistoryCandles({ interval, startTime, endTime, limit }) {
    let candles = premiumHistoryByInterval.get(interval) ?? [];

    if (Number.isFinite(startTime)) {
        candles = candles.filter((candle) => candle.timestamp >= startTime);
    }

    if (Number.isFinite(endTime)) {
        candles = candles.filter((candle) => candle.timestamp <= endTime);
    }

    if (Number.isFinite(limit) && limit > 0 && candles.length > limit) {
        candles = candles.slice(-limit);
    }

    return candles;
}

function convertPremiumCandlesForBasis(candles, premiumBasis, options = {}) {
    if (premiumBasis === 'USDT') {
        return candles;
    }

    const usdKrwRateByDay = options?.usdKrwRateByDay;
    if (!(usdKrwRateByDay instanceof Map)) {
        throw new Error('USD premium basis requires usdKrwRateByDay map');
    }

    const converted = [];
    for (const candle of candles) {
        const usdKrwRate = usdKrwRateByDay.get(toUtcDateKey(candle.timestamp));
        if (!Number.isFinite(usdKrwRate) || usdKrwRate <= 0) {
            continue;
        }

        const usdtKrwRate = toFiniteNumber(candle?.conversionClose);
        if (!Number.isFinite(usdtKrwRate) || usdtKrwRate <= 0) {
            continue;
        }

        const usdClose = calcPremium(
            candle.domesticCloseKrw,
            candle.globalCloseUsdt,
            usdKrwRate
        );
        if (usdClose === null) continue;

        const convertedOpen = convertPremiumOhlcValueByRate(candle.open, usdtKrwRate, usdKrwRate);
        const convertedHigh = convertPremiumOhlcValueByRate(candle.high, usdtKrwRate, usdKrwRate);
        const convertedLow = convertPremiumOhlcValueByRate(candle.low, usdtKrwRate, usdKrwRate);

        if (
            convertedOpen === null ||
            convertedHigh === null ||
            convertedLow === null
        ) {
            continue;
        }

        const high = Math.max(convertedOpen, convertedHigh, convertedLow, usdClose);
        const low = Math.min(convertedOpen, convertedHigh, convertedLow, usdClose);

        converted.push({
            ...candle,
            open: round(convertedOpen, 4),
            high: round(high, 4),
            low: round(low, 4),
            close: round(usdClose, 4),
            conversionClose: round(usdKrwRate, 4),
        });
    }

    return converted;
}

function convertPremiumOhlcValueByRate(value, fromRate, toRate) {
    if (
        !Number.isFinite(value) ||
        !Number.isFinite(fromRate) ||
        !Number.isFinite(toRate) ||
        fromRate <= 0 ||
        toRate <= 0
    ) {
        return null;
    }
    return ((1 + value / 100) * (fromRate / toRate) - 1) * 100;
}

function convertPremiumCandleOhlcForBasis(candle, premiumBasis, options = {}) {
    if (premiumBasis === 'USDT') return candle;

    const usdKrwRateByDay = options?.usdKrwRateByDay;
    if (!(usdKrwRateByDay instanceof Map)) {
        throw new Error('USD premium basis requires usdKrwRateByDay map');
    }

    const usdKrwRate = usdKrwRateByDay.get(toUtcDateKey(candle.timestamp));
    const usdtKrwRate = toFiniteNumber(candle?.conversionClose);
    if (!Number.isFinite(usdKrwRate) || usdKrwRate <= 0 || !Number.isFinite(usdtKrwRate) || usdtKrwRate <= 0) {
        return null;
    }

    const convertedOpen = convertPremiumOhlcValueByRate(candle.open, usdtKrwRate, usdKrwRate);
    const convertedHigh = convertPremiumOhlcValueByRate(candle.high, usdtKrwRate, usdKrwRate);
    const convertedLow = convertPremiumOhlcValueByRate(candle.low, usdtKrwRate, usdKrwRate);
    const convertedClose = convertPremiumOhlcValueByRate(candle.close, usdtKrwRate, usdKrwRate);
    if (
        convertedOpen === null ||
        convertedHigh === null ||
        convertedLow === null ||
        convertedClose === null
    ) {
        return null;
    }

    const high = Math.max(convertedOpen, convertedHigh, convertedLow, convertedClose);
    const low = Math.min(convertedOpen, convertedHigh, convertedLow, convertedClose);

    return {
        ...candle,
        open: round(convertedOpen, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(convertedClose, 4),
        conversionClose: round(usdKrwRate, 4),
    };
}

function convertPremiumCandleOhlcSeriesForBasis(candles, premiumBasis, options = {}) {
    if (premiumBasis === 'USDT') return candles;

    const converted = [];
    for (const candle of candles) {
        const row = convertPremiumCandleOhlcForBasis(candle, premiumBasis, options);
        if (row) converted.push(row);
    }
    return converted;
}

function downsamplePremiumSeries(points, maxPoints, preserveTimestamps = new Set()) {
    if (!Array.isArray(points) || points.length <= maxPoints) {
        return Array.isArray(points) ? points : [];
    }

    const safeMax = Math.max(200, Math.floor(maxPoints));
    const bucketSize = Math.max(2, Math.ceil(points.length / safeMax));
    const sampled = [];

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

    const byTimestamp = new Map();
    for (const point of sampled) {
        byTimestamp.set(point.timestamp, point);
    }

    const first = points[0];
    const last = points[points.length - 1];
    byTimestamp.set(first.timestamp, first);
    byTimestamp.set(last.timestamp, last);

    if (preserveTimestamps instanceof Set && preserveTimestamps.size > 0) {
        const originalByTimestamp = new Map(points.map((point) => [point.timestamp, point]));
        for (const timestamp of preserveTimestamps) {
            const point = originalByTimestamp.get(timestamp);
            if (point) {
                byTimestamp.set(point.timestamp, point);
            }
        }
    }

    const sorted = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length <= safeMax) return sorted;

    const stride = Math.ceil(sorted.length / safeMax);
    return sorted.filter((_, index) => index % stride === 0 || index === sorted.length - 1);
}

function toErrorMessage(error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return `timeout after ${requestTimeoutMs}ms`;
    }
    return error instanceof Error ? error.message : String(error);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExecutionRuntimeEvent(event) {
    return typeof event === 'string' && event.startsWith('api_execution_');
}

function isExecutionEventFeedItem(event) {
    return (
        typeof event === 'string' &&
        (
            event.startsWith('api_execution_') ||
            event.startsWith('execution_alert_') ||
            event.startsWith('execution_engine_')
        )
    );
}

function updateExecutionFailureState(level, event, details = {}) {
    if (!isExecutionRuntimeEvent(event)) return;

    const isFailure = level === 'error' || event.endsWith('_failure');
    const isSuccess = level === 'info' && event.endsWith('_success');

    if (isFailure) {
        executionFailureState.consecutiveFailures += 1;
        executionFailureState.safeMode =
            executionFailureState.consecutiveFailures >= executionFailureSafeModeThreshold;
        executionFailureState.lastFailureAt = Date.now();
        executionFailureState.lastFailureEvent = event;
        executionFailureState.lastFailureMessage = typeof details.error === 'string' ? details.error : null;
        return;
    }

    if (isSuccess) {
        executionFailureState.consecutiveFailures = 0;
        executionFailureState.safeMode = false;
        executionFailureState.lastSuccessAt = Date.now();
    }
}

async function sendExecutionAlert(entry) {
    if (!executionAlertWebhookUrl) return;
    if (!isExecutionRuntimeEvent(entry.event)) return;

    const isFailure = entry.level === 'error' || entry.event.endsWith('_failure');
    if (!isFailure) return;

    const now = Date.now();
    if (now - lastExecutionAlertSentAt < executionAlertCooldownMs) {
        return;
    }
    lastExecutionAlertSentAt = now;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), executionAlertTimeoutMs);

    try {
        const payload = {
            source: 'delta-neutral-bot',
            category: 'execution',
            severity: entry.level,
            timestamp: entry.timestamp,
            isoTime: entry.isoTime,
            event: entry.event,
            safeMode: executionFailureState.safeMode,
            consecutiveFailures: executionFailureState.consecutiveFailures,
            details: entry,
        };

        const response = await fetch(executionAlertWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        recordRuntimeEvent('info', 'execution_alert_sent', {
            deliveryStatus: response.status,
            target: 'webhook',
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error(`Execution alert webhook failed: ${message}`);
        recordRuntimeEvent('warn', 'execution_alert_send_failure', {
            error: message,
            target: 'webhook',
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

let lastDiscordNotificationAt = 0;
const DISCORD_COOLDOWN_MS = 10_000;

async function sendDiscordNotification({ title, description, color, fields = [] }) {
    if (!discordWebhookUrl) {
        return { ok: false, error: 'Discord webhook URL is not configured' };
    }
    const now = Date.now();
    if (now - lastDiscordNotificationAt < DISCORD_COOLDOWN_MS) {
        return { ok: false, error: 'Discord notification cooldown active' };
    }
    lastDiscordNotificationAt = now;

    const embed = {
        title,
        description,
        color,
        fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: f.inline ?? true })),
        timestamp: new Date().toISOString(),
        footer: { text: '김프봇 알림' },
    };

    try {
        const response = await fetch(discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
        if (!response.ok) {
            const message = `Discord webhook HTTP ${response.status}`;
            console.error(message);
            return { ok: false, error: message, status: response.status };
        }
        return { ok: true };
    } catch (err) {
        const message = `Discord webhook failed: ${toErrorMessage(err)}`;
        console.error(message);
        return { ok: false, error: message };
    }
}

function recordRuntimeEvent(level, event, details = {}) {
    const entry = {
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        level,
        event,
        ...details,
    };

    runtimeEvents.push(entry);
    if (runtimeEvents.length > runtimeEventLimit) {
        runtimeEvents.shift();
    }

    try {
        fs.appendFileSync(runtimeLogFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    } catch (error) {
        console.error(`Failed to append runtime event log: ${toErrorMessage(error)}`);
    }

    updateExecutionFailureState(level, event, details);
    void sendExecutionAlert(entry);
}

function normalizeFundingSide(value) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'SHORT';
    return normalized === 'LONG' ? 'LONG' : 'SHORT';
}

function normalizePremiumBasis(value) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'USDT';
    return normalized === 'USD' ? 'USD' : 'USDT';
}

function normalizeBacktestTriggerMode(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'touch';
    return normalized === 'close' ? 'close' : 'touch';
}

function normalizeExecutionMarketType(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : binanceExecutionMarketType;
    return normalized === 'usdm' ? 'usdm' : 'coinm';
}

function defaultExecutionSymbolByMarketType(marketType) {
    return marketType === 'usdm' ? 'BTC/USDT:USDT' : 'BTC/USD:BTC';
}

function parseExecutionSymbol(value, marketType) {
    const symbol = typeof value === 'string' ? value.trim() : '';
    return symbol || defaultExecutionSymbolByMarketType(marketType);
}

function parseExecutionOrderSide(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'buy' || normalized === 'sell') return normalized;
    return null;
}

function parseExecutionOrderType(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'market' || normalized === 'limit') return normalized;
    return null;
}

function parseExecutionTimeInForce(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (['GTC', 'IOC', 'FOK', 'PO'].includes(normalized)) return normalized;
    return fallback;
}

function parseExecutionPositionSide(value) {
    if (value === null || value === undefined) return null;
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (['LONG', 'SHORT', 'BOTH'].includes(normalized)) return normalized;
    return null;
}

function parseExecutionStrategyAction(value) {
    if (value === null || value === undefined) return null;
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (normalized === 'ENTRY_SELL' || normalized === 'EXIT_BUY' || normalized === 'ENTRY_BUY' || normalized === 'EXIT_SELL') {
        return normalized;
    }
    return null;
}

function parseExecutionStrategyContext(value) {
    if (!value || typeof value !== 'object') return null;

    const decisionTimestamp = toFiniteNumber(value.decisionTimestamp);
    const premiumPct = toFiniteNumber(value.premiumPct);
    const effectivePremiumPct = toFiniteNumber(value.effectivePremiumPct);
    const usdtKrwRate = toFiniteNumber(value.usdtKrwRate);
    const exchangeRate = toFiniteNumber(value.exchangeRate);
    const usdPrice = toFiniteNumber(value.usdPrice);
    const krwPrice = toFiniteNumber(value.krwPrice);
    const action = parseExecutionStrategyAction(value.action);

    const hasAnyFiniteValue =
        Number.isFinite(decisionTimestamp) ||
        Number.isFinite(premiumPct) ||
        Number.isFinite(effectivePremiumPct) ||
        Number.isFinite(usdtKrwRate) ||
        Number.isFinite(exchangeRate) ||
        Number.isFinite(usdPrice) ||
        Number.isFinite(krwPrice) ||
        Boolean(action);

    if (!hasAnyFiniteValue) return null;

    return {
        action,
        decisionTimestamp: Number.isFinite(decisionTimestamp) ? Number(decisionTimestamp) : null,
        premiumPct: Number.isFinite(premiumPct) ? round(premiumPct, 6) : null,
        effectivePremiumPct: Number.isFinite(effectivePremiumPct) ? round(effectivePremiumPct, 6) : null,
        usdtKrwRate: Number.isFinite(usdtKrwRate) ? round(usdtKrwRate, 6) : null,
        exchangeRate: Number.isFinite(exchangeRate) ? round(exchangeRate, 6) : null,
        usdPrice: Number.isFinite(usdPrice) ? round(usdPrice, 6) : null,
        krwPrice: Number.isFinite(krwPrice) ? round(krwPrice, 2) : null,
    };
}

function parseOptionalString(value, maxLength = 128) {
    if (Array.isArray(value)) {
        return parseOptionalString(value[0], maxLength);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
}

function normalizeExecutionOrderIdToken(value, maxLength = 80) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed.slice(0, maxLength) : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value).slice(0, maxLength);
    }
    return null;
}

function buildExecutionOrderContextMap() {
    const map = new Map();
    for (let index = runtimeEvents.length - 1; index >= 0; index -= 1) {
        const event = runtimeEvents[index];
        if (!event || event.event !== 'api_execution_binance_order_success') continue;

        const orderId = normalizeExecutionOrderIdToken(event.orderId);
        if (!orderId || map.has(orderId)) continue;

        const strategyContext = parseExecutionStrategyContext(event.strategyContext);
        if (!strategyContext) continue;

        map.set(orderId, strategyContext);
    }
    return map;
}

function buildBithumbOrderContextMap() {
    const map = new Map();
    for (let index = runtimeEvents.length - 1; index >= 0; index -= 1) {
        const event = runtimeEvents[index];
        if (!event || event.event !== 'api_execution_bithumb_order_success') continue;

        const orderId = normalizeExecutionOrderIdToken(event.orderId);
        if (!orderId || map.has(orderId)) continue;

        const strategyContext = parseExecutionStrategyContext(event.strategyContext);
        if (!strategyContext) continue;

        map.set(orderId, strategyContext);
    }
    return map;
}

function pruneExecutionIdempotencyStore() {
    if (executionIdempotencyStore.size === 0) return;

    const now = Date.now();
    for (const [key, record] of executionIdempotencyStore.entries()) {
        if (!record || !Number.isFinite(record.createdAt) || now - record.createdAt > executionIdempotencyTtlMs) {
            executionIdempotencyStore.delete(key);
        }
    }

    if (executionIdempotencyStore.size <= executionIdempotencyMaxEntries) return;

    const entries = Array.from(executionIdempotencyStore.entries()).sort(
        (a, b) => (a?.[1]?.createdAt ?? 0) - (b?.[1]?.createdAt ?? 0)
    );
    const deleteCount = executionIdempotencyStore.size - executionIdempotencyMaxEntries;
    for (let i = 0; i < deleteCount; i += 1) {
        executionIdempotencyStore.delete(entries[i][0]);
    }
}

function buildExecutionOrderFingerprint({
    marketType,
    symbol,
    side,
    type,
    amount,
    price,
    reduceOnly,
    timeInForce,
    positionSide,
    clientOrderId,
    dryRun,
}) {
    const priceToken = Number.isFinite(price) ? round(price, 12) : null;
    return JSON.stringify({
        marketType,
        symbol,
        side,
        type,
        amount: round(amount, 12),
        price: priceToken,
        reduceOnly: Boolean(reduceOnly),
        timeInForce: timeInForce ?? null,
        positionSide: positionSide ?? null,
        clientOrderId: clientOrderId ?? null,
        dryRun: Boolean(dryRun),
    });
}

function getExecutionIdempotencyKey(req) {
    const fromHeader = parseOptionalString(req.headers?.['idempotency-key'], 128);
    if (fromHeader) return fromHeader;
    if (req?.body && typeof req.body === 'object') {
        return parseOptionalString(req.body.idempotencyKey, 128);
    }
    return null;
}

function getExecutionIdempotencyReplay(idempotencyKey, fingerprint) {
    if (!idempotencyKey) {
        return { kind: 'none', record: null };
    }

    pruneExecutionIdempotencyStore();
    const existing = executionIdempotencyStore.get(idempotencyKey);
    if (!existing) {
        return { kind: 'new', record: null };
    }

    if (existing.fingerprint !== fingerprint) {
        return { kind: 'conflict', record: existing };
    }

    if (existing.state === 'pending') {
        return { kind: 'pending', record: existing };
    }

    return { kind: 'replay', record: existing };
}

function beginExecutionIdempotentRequest(idempotencyKey, fingerprint) {
    if (!idempotencyKey) return;
    pruneExecutionIdempotencyStore();
    executionIdempotencyStore.set(idempotencyKey, {
        createdAt: Date.now(),
        fingerprint,
        state: 'pending',
        statusCode: null,
        responseBody: null,
    });
}

function completeExecutionIdempotentRequest(idempotencyKey, statusCode, responseBody, fingerprint = null) {
    if (!idempotencyKey) return;

    const existing = executionIdempotencyStore.get(idempotencyKey);
    executionIdempotencyStore.set(idempotencyKey, {
        createdAt: Date.now(),
        fingerprint: fingerprint ?? existing?.fingerprint ?? null,
        state: 'completed',
        statusCode,
        responseBody,
    });
    pruneExecutionIdempotencyStore();
}

function failExecutionIdempotentRequest(idempotencyKey) {
    if (!idempotencyKey) return;
    const existing = executionIdempotencyStore.get(idempotencyKey);
    if (!existing || existing.state !== 'pending') return;
    executionIdempotencyStore.delete(idempotencyKey);
}

function resetExecutionSafetyState(reason = 'manual-reset') {
    const previousConsecutiveFailures = executionFailureState.consecutiveFailures;
    const wasSafeMode = executionFailureState.safeMode;

    executionFailureState.consecutiveFailures = 0;
    executionFailureState.safeMode = false;
    executionFailureState.lastSuccessAt = Date.now();

    return {
        reason,
        previousConsecutiveFailures,
        wasSafeMode,
    };
}

function getExecutionSafetySummary() {
    return {
        safeMode: executionFailureState.safeMode,
        consecutiveFailures: executionFailureState.consecutiveFailures,
        threshold: executionFailureSafeModeThreshold,
        lastFailureAt: executionFailureState.lastFailureAt,
        lastFailureEvent: executionFailureState.lastFailureEvent,
        lastFailureMessage: executionFailureState.lastFailureMessage,
        lastSuccessAt: executionFailureState.lastSuccessAt,
        alertWebhookConfigured: executionAlertWebhookUrl.length > 0,
        alertCooldownMs: executionAlertCooldownMs,
        alertTimeoutMs: executionAlertTimeoutMs,
        lastAlertSentAt: lastExecutionAlertSentAt > 0 ? lastExecutionAlertSentAt : null,
        orderExecution: {
            allowLiveOrders: executionAllowLiveOrders,
            allowTestnetOrders: executionAllowTestnetOrders,
            defaultRetryCount: executionOrderRetryCount,
            defaultRetryDelayMs: executionOrderRetryDelayMs,
            idempotencyTtlMs: executionIdempotencyTtlMs,
            idempotencyMaxEntries: executionIdempotencyMaxEntries,
            idempotencyEntries: executionIdempotencyStore.size,
        },
    };
}

function getRuntimeCredentialMask(apiKey) {
    const normalized = parseOptionalString(apiKey, 256);
    if (!normalized) return null;
    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
    }
    return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function getActiveBinanceExecutionCredentials() {
    const runtimeConfigured =
        runtimeBinanceExecutionApiKey.length > 0 &&
        runtimeBinanceExecutionApiSecret.length > 0;
    if (runtimeConfigured) {
        return {
            configured: true,
            source: 'runtime',
            apiKey: runtimeBinanceExecutionApiKey,
            apiSecret: runtimeBinanceExecutionApiSecret,
            keyHint: getRuntimeCredentialMask(runtimeBinanceExecutionApiKey),
            updatedAt: runtimeBinanceExecutionCredentialsUpdatedAt,
            persisted: runtimeBinanceExecutionCredentialsPersisted,
        };
    }

    const envConfigured =
        envBinanceExecutionApiKey.length > 0 &&
        envBinanceExecutionApiSecret.length > 0;
    if (envConfigured) {
        return {
            configured: true,
            source: 'env',
            apiKey: envBinanceExecutionApiKey,
            apiSecret: envBinanceExecutionApiSecret,
            keyHint: getRuntimeCredentialMask(envBinanceExecutionApiKey),
            updatedAt: null,
            persisted: false,
        };
    }

    return {
        configured: false,
        source: 'none',
        apiKey: '',
        apiSecret: '',
        keyHint: null,
        updatedAt: null,
        persisted: false,
    };
}

function getActiveBithumbExecutionCredentials() {
    const runtimeConfigured =
        runtimeBithumbApiKey.length > 0 &&
        runtimeBithumbApiSecret.length > 0;
    if (runtimeConfigured) {
        return {
            configured: true,
            source: 'runtime',
            apiKey: runtimeBithumbApiKey,
            apiSecret: runtimeBithumbApiSecret,
            keyHint: getRuntimeCredentialMask(runtimeBithumbApiKey),
            updatedAt: runtimeBithumbCredentialsUpdatedAt,
            persisted: runtimeBithumbCredentialsPersisted,
        };
    }

    const envConfigured =
        envBithumbApiKey.length > 0 &&
        envBithumbApiSecret.length > 0;
    if (envConfigured) {
        return {
            configured: true,
            source: 'env',
            apiKey: envBithumbApiKey,
            apiSecret: envBithumbApiSecret,
            keyHint: getRuntimeCredentialMask(envBithumbApiKey),
            updatedAt: null,
            persisted: false,
        };
    }

    return {
        configured: false,
        source: 'none',
        apiKey: '',
        apiSecret: '',
        keyHint: null,
        updatedAt: null,
        persisted: false,
    };
}

function clearExecutionClientCaches() {
    binanceExecutionClient = null;
    binanceExecutionClientCacheKey = null;
    bithumbClient = null;
}

function persistRuntimeExecutionCredentials(reason = 'update') {
    if (
        (runtimeBinanceExecutionApiKey.length === 0 || runtimeBinanceExecutionApiSecret.length === 0) &&
        (runtimeBithumbApiKey.length === 0 || runtimeBithumbApiSecret.length === 0)
    ) {
        runtimeBinanceExecutionCredentialsPersisted = false;
        runtimeBithumbCredentialsPersisted = false;
        try {
            if (fs.existsSync(executionCredentialsStateFile)) {
                fs.unlinkSync(executionCredentialsStateFile);
            }
        } catch (error) {
            console.error(`Failed to remove execution credentials state: ${toErrorMessage(error)}`);
        }
        return;
    }

    try {
        const payload = {
            updatedAt: runtimeBinanceExecutionCredentialsUpdatedAt || runtimeBithumbCredentialsUpdatedAt || Date.now(),
            reason,
            credentials: {
                apiKey: runtimeBinanceExecutionApiKey,
                apiSecret: runtimeBinanceExecutionApiSecret,
                bithumbApiKey: runtimeBithumbApiKey,
                bithumbApiSecret: runtimeBithumbApiSecret,
            },
        };
        fs.writeFileSync(executionCredentialsStateFile, `${JSON.stringify(payload, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
        });
        if (runtimeBinanceExecutionApiKey) runtimeBinanceExecutionCredentialsPersisted = true;
        if (runtimeBithumbApiKey) runtimeBithumbCredentialsPersisted = true;
    } catch (error) {
        runtimeBinanceExecutionCredentialsPersisted = false;
        runtimeBithumbCredentialsPersisted = false;
        console.error(`Failed to persist execution credentials: ${toErrorMessage(error)}`);
    }
}

function restoreRuntimeExecutionCredentialsFromDisk() {
    try {
        if (!fs.existsSync(executionCredentialsStateFile)) return;
        const raw = fs.readFileSync(executionCredentialsStateFile, { encoding: 'utf8' }).trim();
        if (!raw) return;

        const payload = JSON.parse(raw);
        const credentials =
            payload?.credentials && typeof payload.credentials === 'object'
                ? payload.credentials
                : null;
        if (!credentials) return;

        const apiKey = parseOptionalString(credentials.apiKey, 256) ?? '';
        const apiSecret = parseOptionalString(credentials.apiSecret, 256) ?? '';
        let binanceRestored = false;
        if (apiKey && apiSecret) {
            runtimeBinanceExecutionApiKey = apiKey;
            runtimeBinanceExecutionApiSecret = apiSecret;
            runtimeBinanceExecutionCredentialsUpdatedAt = Number.isFinite(toFiniteNumber(payload?.updatedAt))
                ? Number(payload.updatedAt)
                : Date.now();
            runtimeBinanceExecutionCredentialsPersisted = true;
            binanceRestored = true;
        }

        const bApiKey = parseOptionalString(credentials.bithumbApiKey, 256) ?? '';
        const bApiSecret = parseOptionalString(credentials.bithumbApiSecret, 256) ?? '';
        let bithumbRestored = false;
        if (bApiKey && bApiSecret) {
            runtimeBithumbApiKey = bApiKey;
            runtimeBithumbApiSecret = bApiSecret;
            runtimeBithumbCredentialsUpdatedAt = Number.isFinite(toFiniteNumber(payload?.updatedAt))
                ? Number(payload.updatedAt)
                : Date.now();
            runtimeBithumbCredentialsPersisted = true;
            bithumbRestored = true;
        }

        clearExecutionClientCaches();

        if (binanceRestored || bithumbRestored) {
            recordRuntimeEvent('info', 'execution_credentials_state_restored', {
                source: 'disk',
                updatedAt: payload?.updatedAt || Date.now(),
            });
        }
    } catch (error) {
        recordRuntimeEvent('error', 'execution_credentials_state_restore_failed', {
            error: toErrorMessage(error),
        });
    }
}

function setRuntimeExecutionCredentials({ apiKey, apiSecret, bithumbApiKey, bithumbApiSecret, persist = true, reason = 'manual-set' }) {
    if (apiKey !== undefined && apiSecret !== undefined) {
        const normalizedApiKey = parseOptionalString(apiKey, 256);
        const normalizedApiSecret = parseOptionalString(apiSecret, 256);
        if (normalizedApiKey && normalizedApiSecret) {
            runtimeBinanceExecutionApiKey = normalizedApiKey;
            runtimeBinanceExecutionApiSecret = normalizedApiSecret;
            runtimeBinanceExecutionCredentialsUpdatedAt = Date.now();
            if (!persist) runtimeBinanceExecutionCredentialsPersisted = false;
        }
    }

    if (bithumbApiKey !== undefined && bithumbApiSecret !== undefined) {
        const normalizedBApiKey = parseOptionalString(bithumbApiKey, 256);
        const normalizedBApiSecret = parseOptionalString(bithumbApiSecret, 256);
        if (normalizedBApiKey && normalizedBApiSecret) {
            runtimeBithumbApiKey = normalizedBApiKey;
            runtimeBithumbApiSecret = normalizedBApiSecret;
            runtimeBithumbCredentialsUpdatedAt = Date.now();
            if (!persist) runtimeBithumbCredentialsPersisted = false;
        }
    }

    clearExecutionClientCaches();

    if (persist) {
        persistRuntimeExecutionCredentials(reason);
    } else {
        try {
            if (fs.existsSync(executionCredentialsStateFile)) {
                fs.unlinkSync(executionCredentialsStateFile);
            }
        } catch (error) {
            console.error(`Failed to remove execution credentials state: ${toErrorMessage(error)}`);
        }
    }

    recordRuntimeEvent('warn', 'execution_credentials_updated', {
        source: 'runtime',
        persisted: Boolean(persist),
    });
}

function clearRuntimeExecutionCredentials(reason = 'manual-clear') {
    runtimeBinanceExecutionApiKey = '';
    runtimeBinanceExecutionApiSecret = '';
    runtimeBinanceExecutionCredentialsUpdatedAt = Date.now();
    runtimeBinanceExecutionCredentialsPersisted = false;

    runtimeBithumbApiKey = '';
    runtimeBithumbApiSecret = '';
    runtimeBithumbCredentialsUpdatedAt = Date.now();
    runtimeBithumbCredentialsPersisted = false;

    clearExecutionClientCaches();
    persistRuntimeExecutionCredentials(reason);

    recordRuntimeEvent('warn', 'execution_credentials_cleared', {
        source: 'runtime',
    });
}

function getExecutionCredentialsStatusSummary() {
    const activeBinance = getActiveBinanceExecutionCredentials();
    const activeBithumb = getActiveBithumbExecutionCredentials();
    return {
        configured: activeBinance.configured,     // legacy
        source: activeBinance.source,             // legacy
        keyHint: activeBinance.keyHint,           // legacy
        updatedAt: activeBinance.updatedAt,       // legacy
        persisted: activeBinance.persisted,       // legacy
        envConfigured: envBinanceExecutionApiKey.length > 0 && envBinanceExecutionApiSecret.length > 0, // legacy
        runtimeConfigured: runtimeBinanceExecutionApiKey.length > 0 && runtimeBinanceExecutionApiSecret.length > 0, // legacy

        binance: {
            configured: activeBinance.configured,
            source: activeBinance.source,
            keyHint: activeBinance.keyHint,
            updatedAt: activeBinance.updatedAt,
            persisted: activeBinance.persisted,
        },
        bithumb: {
            configured: activeBithumb.configured,
            source: activeBithumb.source,
            keyHint: activeBithumb.keyHint,
            updatedAt: activeBithumb.updatedAt,
            persisted: activeBithumb.persisted,
        }
    };
}

function hasBinanceExecutionCredentials() {
    return getActiveBinanceExecutionCredentials().configured;
}

function hasBithumbExecutionCredentials() {
    return getActiveBithumbExecutionCredentials().configured;
}

function isExecutionPasswordAuthEnabled() {
    return executionAuthPassword.length > 0;
}

function isExecutionAdminAuthEnabled() {
    return executionAdminToken.length > 0;
}

function isExecutionApiAuthEnabled() {
    return isExecutionAdminAuthEnabled() || isExecutionPasswordAuthEnabled();
}

function pruneExecutionAuthSessions() {
    if (executionAuthSessions.size === 0) return;
    const now = Date.now();
    for (const [sessionId, session] of executionAuthSessions.entries()) {
        if (!session || !Number.isFinite(toFiniteNumber(session.expiresAt)) || session.expiresAt <= now) {
            executionAuthSessions.delete(sessionId);
        }
    }
}

function parseCookies(cookieHeader) {
    if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) {
        return {};
    }

    const cookies = {};
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
        const trimmed = pair.trim();
        if (!trimmed) continue;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex <= 0) continue;
        const name = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        if (!name) continue;
        try {
            cookies[name] = decodeURIComponent(rawValue);
        } catch {
            cookies[name] = rawValue;
        }
    }
    return cookies;
}

function getExecutionAuthSessionIdFromRequest(req) {
    const cookies = parseCookies(req.headers?.cookie);
    const token = parseOptionalString(cookies?.[executionAuthCookieName], 256);
    return token;
}

function getExecutionAuthSessionFromRequest(req) {
    pruneExecutionAuthSessions();
    const sessionId = getExecutionAuthSessionIdFromRequest(req);
    if (!sessionId) return null;

    const session = executionAuthSessions.get(sessionId);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
        executionAuthSessions.delete(sessionId);
        return null;
    }

    session.lastSeenAt = Date.now();
    return {
        ...session,
        sessionId,
    };
}

function shouldUseSecureExecutionCookie(req) {
    const forced = parseOptionalString(process.env.EXECUTION_AUTH_COOKIE_SECURE, 16);
    if (forced) {
        return ['1', 'true', 'yes', 'on'].includes(forced.toLowerCase());
    }

    const forwardedProto = parseOptionalString(req.headers?.['x-forwarded-proto'], 64);
    if (forwardedProto) {
        return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
    }

    return false;
}

function setExecutionAuthCookie(res, req, sessionId, maxAgeMs = executionAuthSessionTtlMs) {
    res.cookie(executionAuthCookieName, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: shouldUseSecureExecutionCookie(req),
        maxAge: maxAgeMs,
        path: '/',
    });
}

function clearExecutionAuthCookie(res, req) {
    res.clearCookie(executionAuthCookieName, {
        httpOnly: true,
        sameSite: 'lax',
        secure: shouldUseSecureExecutionCookie(req),
        path: '/',
    });
}

function createExecutionAuthSession(username) {
    pruneExecutionAuthSessions();
    const now = Date.now();
    const sessionId = crypto.randomBytes(32).toString('hex');
    executionAuthSessions.set(sessionId, {
        username,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + executionAuthSessionTtlMs,
    });
    return sessionId;
}

function revokeExecutionAuthSession(sessionId) {
    if (!sessionId) return;
    executionAuthSessions.delete(sessionId);
}

function getExecutionEngineAuthHeaders() {
    if (isExecutionAdminAuthEnabled()) {
        return { 'x-admin-token': executionAdminToken };
    }

    if (!isExecutionPasswordAuthEnabled()) {
        return {};
    }

    const now = Date.now();
    if (executionEngineSessionId) {
        const existing = executionAuthSessions.get(executionEngineSessionId);
        if (!existing || existing.expiresAt <= now) {
            revokeExecutionAuthSession(executionEngineSessionId);
            executionEngineSessionId = null;
        }
    }

    if (!executionEngineSessionId) {
        executionEngineSessionId = createExecutionAuthSession(executionAuthUsername);
    }

    return {
        Cookie: `${executionAuthCookieName}=${encodeURIComponent(executionEngineSessionId)}`,
    };
}

function getExecutionAuthSessionSummary(req) {
    const session = getExecutionAuthSessionFromRequest(req);
    return {
        enabled: isExecutionApiAuthEnabled(),
        tokenEnabled: isExecutionAdminAuthEnabled(),
        passwordEnabled: isExecutionPasswordAuthEnabled(),
        authenticated: Boolean(session),
        username: session?.username ?? null,
        expiresAt: session?.expiresAt ?? null,
    };
}

function extractExecutionAdminToken(req) {
    const fromHeader = parseOptionalString(req.headers?.['x-admin-token'], 512);
    if (fromHeader) return fromHeader;

    const authHeader = parseOptionalString(req.headers?.authorization, 1024);
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        return parseOptionalString(authHeader.slice(7), 512);
    }

    return null;
}

function requireExecutionAdminAuth(req, res, next) {
    if (!isExecutionApiAuthEnabled()) {
        next();
        return;
    }

    if (req.method === 'OPTIONS') {
        next();
        return;
    }

    const token = extractExecutionAdminToken(req);
    if (isExecutionAdminAuthEnabled() && token && token === executionAdminToken) {
        next();
        return;
    }

    const session = getExecutionAuthSessionFromRequest(req);
    if (isExecutionPasswordAuthEnabled() && session) {
        next();
        return;
    }

    res.status(401).json({
        error: 'Unauthorized execution API access',
        code: 'execution_admin_auth_required',
        timestamp: Date.now(),
    });
}

function isExecutionEngineLeaderReplica() {
    if (!executionEngineLeaderReplicaId) return true;
    if (!railwayReplicaId) return false;
    return railwayReplicaId === executionEngineLeaderReplicaId;
}

function getExecutionEngineSnapshot() {
    return {
        running: executionEngineState.running,
        desiredRunning: executionEngineState.desiredRunning,
        busy: executionEngineState.busy,
        marketType: executionEngineState.marketType,
        symbol: executionEngineState.symbol,
        orderBalancePctEntry: round(executionEngineState.orderBalancePctEntry, 4),
        orderBalancePctExit: round(executionEngineState.orderBalancePctExit, 4),
        dryRun: executionEngineState.dryRun,
        premiumBasis: executionEngineState.premiumBasis,
        entryThreshold: round(executionEngineState.entryThreshold, 6),
        exitThreshold: round(executionEngineState.exitThreshold, 6),
        positionState: executionEngineState.positionState,
        pollIntervalMs: executionEngineState.pollIntervalMs,
        orderCooldownMs: executionEngineState.orderCooldownMs,
        startedAt: executionEngineState.startedAt,
        stoppedAt: executionEngineState.stoppedAt,
        lastTickAt: executionEngineState.lastTickAt,
        lastDecisionAt: executionEngineState.lastDecisionAt,
        lastOrderAt: executionEngineState.lastOrderAt,
        lastOrderSide: executionEngineState.lastOrderSide,
        lastOrderId: executionEngineState.lastOrderId,
        lastOrderAmount: toNullableRounded(executionEngineState.lastOrderAmount, 8),
        lastPremium: executionEngineState.lastPremium,
        lastEffectivePremium: executionEngineState.lastEffectivePremium,
        lastMarketDataTimestamp: executionEngineState.lastMarketDataTimestamp,
        iterations: executionEngineState.iterations,
        lastError: executionEngineState.lastError,
        lastOrderError: executionEngineState.lastOrderError,
        stopReason: executionEngineState.stopReason,
        leaderReplicaId: executionEngineLeaderReplicaId || null,
        currentReplicaId: railwayReplicaId || null,
    };
}

function persistExecutionEngineState(reason = 'state-update') {
    try {
        const payload = {
            updatedAt: Date.now(),
            reason,
            engine: getExecutionEngineSnapshot(),
        };
        fs.writeFileSync(executionEngineStateFile, `${JSON.stringify(payload, null, 2)}\n`, {
            encoding: 'utf8',
        });
    } catch (error) {
        console.error(`Failed to persist execution engine state: ${toErrorMessage(error)}`);
    }
}

function restoreExecutionEngineStateFromDisk() {
    try {
        if (!fs.existsSync(executionEngineStateFile)) return;

        const raw = fs.readFileSync(executionEngineStateFile, { encoding: 'utf8' }).trim();
        if (!raw) return;
        const payload = JSON.parse(raw);
        const engine = payload?.engine && typeof payload.engine === 'object' ? payload.engine : null;
        if (!engine) return;

        executionEngineState.marketType = normalizeExecutionMarketType(engine.marketType);
        executionEngineState.symbol = parseExecutionSymbol(engine.symbol, executionEngineState.marketType);
        const rawEntryPct = toFiniteNumber(engine.orderBalancePctEntry);
        const rawExitPct = toFiniteNumber(engine.orderBalancePctExit);
        const legacyPct = toFiniteNumber(engine.orderBalancePct ?? engine.amount);
        const resolvedLegacyPct =
            Number.isFinite(legacyPct) && legacyPct > 0 ? Math.min(100, legacyPct) : 0;
        const resolvedEntryPct =
            Number.isFinite(rawEntryPct) && rawEntryPct > 0 ? Math.min(100, rawEntryPct) : resolvedLegacyPct;
        const resolvedExitPct =
            Number.isFinite(rawExitPct) && rawExitPct > 0 ? Math.min(100, rawExitPct) : resolvedLegacyPct;
        executionEngineState.orderBalancePctEntry = resolvedEntryPct;
        executionEngineState.orderBalancePctExit = resolvedExitPct;
        executionEngineState.dryRun = parseBoolean(engine.dryRun, true);
        executionEngineState.premiumBasis = normalizePremiumBasis(engine.premiumBasis);
        executionEngineState.entryThreshold = parseNumber(engine.entryThreshold, 0, -20, 40);
        executionEngineState.exitThreshold = parseNumber(engine.exitThreshold, 0, -20, 40);
        executionEngineState.positionState = engine.positionState === 'ENTERED' ? 'ENTERED' : 'IDLE';
        executionEngineState.positionSideMode = 'UNKNOWN';
        executionEngineState.pollIntervalMs = parsePositiveNumber(
            engine.pollIntervalMs,
            executionEnginePollIntervalMs,
            1000,
            60_000
        );
        executionEngineState.orderCooldownMs = parsePositiveNumber(
            engine.orderCooldownMs,
            executionEngineOrderCooldownMs,
            1000,
            300_000
        );
        executionEngineState.lastTickAt = Number.isFinite(toFiniteNumber(engine.lastTickAt))
            ? Number(engine.lastTickAt)
            : null;
        executionEngineState.lastDecisionAt = Number.isFinite(toFiniteNumber(engine.lastDecisionAt))
            ? Number(engine.lastDecisionAt)
            : null;
        executionEngineState.lastOrderAt = Number.isFinite(toFiniteNumber(engine.lastOrderAt))
            ? Number(engine.lastOrderAt)
            : null;
        executionEngineState.lastOrderSide =
            engine.lastOrderSide === 'buy'
                ? 'buy'
                : engine.lastOrderSide === 'sell'
                    ? 'sell'
                    : null;
        executionEngineState.lastOrderId = normalizeExecutionOrderIdToken(engine.lastOrderId, 120);
        executionEngineState.lastOrderAmount = Number.isFinite(toFiniteNumber(engine.lastOrderAmount))
            ? Number(engine.lastOrderAmount)
            : null;
        executionEngineState.lastPremium = Number.isFinite(toFiniteNumber(engine.lastPremium))
            ? Number(engine.lastPremium)
            : null;
        executionEngineState.lastEffectivePremium = Number.isFinite(
            toFiniteNumber(engine.lastEffectivePremium)
        )
            ? Number(engine.lastEffectivePremium)
            : null;
        executionEngineState.lastMarketDataTimestamp = Number.isFinite(
            toFiniteNumber(engine.lastMarketDataTimestamp)
        )
            ? Number(engine.lastMarketDataTimestamp)
            : null;
        executionEngineState.iterations = Number.isFinite(toFiniteNumber(engine.iterations))
            ? Math.max(0, Math.floor(Number(engine.iterations)))
            : 0;
        executionEngineState.lastError =
            typeof engine.lastError === 'string' ? engine.lastError : null;
        executionEngineState.lastOrderError =
            typeof engine.lastOrderError === 'string' ? engine.lastOrderError : null;
        executionEngineState.stopReason =
            typeof engine.stopReason === 'string' ? engine.stopReason : null;
        executionEngineState.desiredRunning = parseBoolean(engine.desiredRunning, false);

        recordRuntimeEvent('info', 'execution_engine_state_restored', {
            desiredRunning: executionEngineState.desiredRunning,
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            dryRun: executionEngineState.dryRun,
            premiumBasis: executionEngineState.premiumBasis,
            orderBalancePctEntry: round(executionEngineState.orderBalancePctEntry, 4),
            orderBalancePctExit: round(executionEngineState.orderBalancePctExit, 4),
            entryThreshold: round(executionEngineState.entryThreshold, 6),
            exitThreshold: round(executionEngineState.exitThreshold, 6),
            positionState: executionEngineState.positionState,
        });
    } catch (error) {
        recordRuntimeEvent('error', 'execution_engine_state_restore_failed', {
            error: toErrorMessage(error),
        });
    }
}

function clearExecutionEngineTimer() {
    if (executionEngineState.loopTimer) {
        clearTimeout(executionEngineState.loopTimer);
        executionEngineState.loopTimer = null;
    }
}

function stopExecutionEngine(reason = 'manual-stop') {
    const wasRunning = executionEngineState.running;
    executionEngineState.running = false;
    executionEngineState.desiredRunning = false;
    executionEngineState.busy = false;
    executionEngineState.stoppedAt = Date.now();
    executionEngineState.stopReason = reason;
    clearExecutionEngineTimer();
    persistExecutionEngineState(`stop:${reason}`);

    if (wasRunning) {
        recordRuntimeEvent('warn', 'execution_engine_stopped', {
            reason,
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            dryRun: executionEngineState.dryRun,
        });
        void (async () => {
            const marketFields = await getDiscordMarketCoreFields();
            void sendDiscordNotification({
                title: '⏹️ 자동매매 엔진 정지',
                description: `사유: ${reason}`,
                color: 0xf59e0b,
                fields: [
                    { name: '심볼', value: executionEngineState.symbol },
                    { name: '마켓', value: executionEngineState.marketType },
                    ...marketFields,
                ],
            });
        })();
    }
}

async function fetchExecutionEngineMarketSnapshot() {
    const [globalTicker, fxRate, bithumbPrice, bithumbUsdt] = await Promise.all([
        fetchGlobalBtcUsdt(),
        getUsdKrwRate(),
        fetchBithumbBtcKrw(),
        fetchBithumbUsdtKrw().catch(() => null),
    ]);

    const krwPrice = bithumbPrice;
    const usdPrice = globalTicker.price;
    const exchangeRate = fxRate.usdKrw;
    const usdtKrwRate =
        Number.isFinite(toFiniteNumber(bithumbUsdt)) && Number(bithumbUsdt) > 0
            ? Number(bithumbUsdt)
            : exchangeRate;
    const normalizedGlobalKrwPrice = usdPrice * exchangeRate;
    const kimchiPremiumPercent = ((krwPrice / normalizedGlobalKrwPrice) - 1) * 100;
    const usdtConversionRate = usdtKrwRate > 0 ? usdtKrwRate : exchangeRate;
    const normalizedGlobalKrwPriceUsdt = usdPrice * usdtConversionRate;
    const kimchiPremiumPercentUsdt = ((krwPrice / normalizedGlobalKrwPriceUsdt) - 1) * 100;

    return {
        timestamp: Date.now(),
        krwPrice: round(krwPrice, 0),
        usdPrice: round(usdPrice, 2),
        exchangeRate: round(exchangeRate, 4),
        usdtKrwRate: round(usdtKrwRate, 4),
        usdtConversionRate: round(usdtConversionRate, 4),
        kimchiPremiumPercent: round(kimchiPremiumPercent, 6),
        kimchiPremiumPercentUsdt: round(kimchiPremiumPercentUsdt, 6),
    };
}

function buildDiscordMarketCoreFields(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') return [];
    const fields = [];
    const premiumLabel = typeof options.premiumLabel === 'string' && options.premiumLabel.trim()
        ? options.premiumLabel.trim()
        : '김치프리미엄';
    const premiumValue = toFiniteNumber(options.premiumValue);
    const includePremium = options.includePremium !== false;
    const includeUsdtPremium = options.includeUsdtPremium === true;
    const syntheticRate = Number.isFinite(toFiniteNumber(snapshot.usdtConversionRate))
        ? Number(snapshot.usdtConversionRate)
        : Number.isFinite(toFiniteNumber(snapshot.usdtKrwRate)) && Number(snapshot.usdtKrwRate) > 0
            ? Number(snapshot.usdtKrwRate)
            : Number(snapshot.exchangeRate);

    if (includePremium) {
        const resolvedPremium = Number.isFinite(premiumValue)
            ? Number(premiumValue)
            : Number(snapshot.kimchiPremiumPercent);
        if (Number.isFinite(resolvedPremium)) {
            fields.push({ name: premiumLabel, value: `${round(resolvedPremium, 4)}%` });
        }
    }

    if (includeUsdtPremium && Number.isFinite(toFiniteNumber(snapshot.kimchiPremiumPercentUsdt))) {
        fields.push({ name: '김치프리미엄(USDT)', value: `${round(Number(snapshot.kimchiPremiumPercentUsdt), 4)}%` });
    }

    if (Number.isFinite(toFiniteNumber(snapshot.krwPrice))) {
        fields.push({ name: '국내 비트코인', value: `₩${Math.round(Number(snapshot.krwPrice)).toLocaleString()}` });
    }
    if (Number.isFinite(toFiniteNumber(snapshot.usdPrice))) {
        fields.push({ name: '해외 비트코인', value: `$${round(Number(snapshot.usdPrice), 2).toLocaleString()}` });
    }
    if (Number.isFinite(toFiniteNumber(snapshot.exchangeRate))) {
        fields.push({ name: 'USD/KRW', value: `₩${round(Number(snapshot.exchangeRate), 4).toLocaleString()}` });
    }
    if (Number.isFinite(toFiniteNumber(snapshot.usdtKrwRate))) {
        fields.push({ name: 'USDT/KRW', value: `₩${round(Number(snapshot.usdtKrwRate), 4).toLocaleString()}` });
    }
    if (Number.isFinite(toFiniteNumber(syntheticRate))) {
        fields.push({ name: '합성환율', value: `₩${round(Number(syntheticRate), 4).toLocaleString()}` });
    }
    return fields;
}

async function getDiscordMarketCoreFields(options = {}) {
    try {
        const snapshot = await fetchExecutionEngineMarketSnapshot();
        return buildDiscordMarketCoreFields(snapshot, options);
    } catch {
        return [];
    }
}

function normalizePositionSideToken(value) {
    if (typeof value !== 'string') return null;
    const token = value.trim().toLowerCase();
    if (token === 'long') return 'LONG';
    if (token === 'short') return 'SHORT';
    if (token === 'both') return 'BOTH';
    return null;
}

function extractPositionSideToken(position) {
    if (!position || typeof position !== 'object') return null;
    return normalizePositionSideToken(
        position.positionSide ?? position.side ?? position.info?.positionSide
    );
}

function resolveShortPositionSnapshot(positions, symbol) {
    if (!Array.isArray(positions)) {
        return { shortContracts: 0, hedgeModeDetected: false, hadPositions: false };
    }

    let shortContracts = 0;
    let hedgeModeDetected = false;
    let hadPositions = false;

    for (const pos of positions) {
        if (!pos || typeof pos !== 'object') continue;
        if (symbol && typeof pos.symbol === 'string' && pos.symbol !== symbol) continue;
        hadPositions = true;

        const sideToken = extractPositionSideToken(pos);
        if (sideToken === 'LONG' || sideToken === 'SHORT') {
            hedgeModeDetected = true;
        }

        const contracts = toFiniteNumber(pos.contracts);
        const positionAmt = toFiniteNumber(pos.info?.positionAmt);
        const quantity = Number.isFinite(contracts)
            ? Math.abs(contracts)
            : Number.isFinite(positionAmt)
                ? Math.abs(positionAmt)
                : 0;

        if (quantity <= 0) continue;

        let isShort = false;
        if (sideToken === 'SHORT') {
            isShort = true;
        } else if (sideToken === 'LONG') {
            isShort = false;
        } else if (Number.isFinite(positionAmt)) {
            isShort = positionAmt < 0;
        } else {
            continue;
        }

        if (isShort) shortContracts += quantity;
    }

    return { shortContracts, hedgeModeDetected, hadPositions };
}

function isPositionSideMismatchError(message) {
    if (!message) return false;
    const normalized = message.toLowerCase();
    return normalized.includes('position side') || normalized.includes('positionside');
}

async function syncExecutionEnginePositionState() {
    if (executionEngineState.dryRun) {
        return executionEngineState.positionState;
    }

    const client = await getBinanceExecutionClient(executionEngineState.marketType, true);
    const positions = await client.fetchPositions([executionEngineState.symbol]);
    const snapshot = resolveShortPositionSnapshot(positions, executionEngineState.symbol);
    if (snapshot.hadPositions) {
        executionEngineState.positionSideMode = snapshot.hedgeModeDetected ? 'HEDGE' : 'ONEWAY';
    }
    const hasPosition = snapshot.shortContracts > 1e-12;

    executionEngineState.positionState = hasPosition ? 'ENTERED' : 'IDLE';
    return executionEngineState.positionState;
}

async function placeExecutionEngineOrder(side, orderAmount, marketSnapshot, premiumValue, options = {}) {
    const url = `http://127.0.0.1:${port}/api/execution/binance/order`;
    const allowInSafeMode = Boolean(options.allowInSafeMode);
    const idempotencyKeyPrefix = options.idempotencyKeyPrefix ?? 'engine';

    const requestExecutionOrder = async (positionSide) => {
        const idempotencyKey = `${idempotencyKeyPrefix}-${side}-${marketSnapshot.timestamp}-${Math.random().toString(36).slice(2, 10)}`;
        const body = {
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            side,
            type: 'market',
            amount: orderAmount,
            dryRun: executionEngineState.dryRun,
            reduceOnly: side === 'buy',
            strategyContext: {
                action: side === 'sell' ? 'ENTRY_SELL' : 'EXIT_BUY',
                decisionTimestamp: marketSnapshot.timestamp,
                premiumPct: marketSnapshot.kimchiPremiumPercent,
                effectivePremiumPct: premiumValue,
                usdtKrwRate: marketSnapshot.usdtKrwRate,
                exchangeRate: marketSnapshot.exchangeRate,
                usdPrice: marketSnapshot.usdPrice,
                krwPrice: marketSnapshot.krwPrice,
            },
        };

        if (allowInSafeMode) {
            body.allowInSafeMode = true;
        }

        if (positionSide) {
            body.positionSide = positionSide;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
                ...getExecutionEngineAuthHeaders(),
            },
            body: JSON.stringify(body),
        });

        let text = '';
        try {
            text = (await response.text()).trim();
        } catch {
            text = '';
        }
        let payload = null;
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = null;
            }
        }

        if (!response.ok) {
            const message =
                (payload && typeof payload.error === 'string' && payload.error) ||
                text ||
                `HTTP ${response.status}`;
            throw new Error(message);
        }

        return payload;
    };

    const preferredPositionSide = executionEngineState.positionSideMode === 'HEDGE' ? 'SHORT' : null;

    try {
        const payload = await requestExecutionOrder(preferredPositionSide);
        executionEngineState.positionSideMode = preferredPositionSide ? 'HEDGE' : 'ONEWAY';
        return payload;
    } catch (error) {
        const message = toErrorMessage(error);
        if (isPositionSideMismatchError(message)) {
            const fallbackPositionSide = preferredPositionSide ? null : 'SHORT';
            if (fallbackPositionSide !== preferredPositionSide) {
                const payload = await requestExecutionOrder(fallbackPositionSide);
                executionEngineState.positionSideMode = fallbackPositionSide ? 'HEDGE' : 'ONEWAY';
                return payload;
            }
        }
        throw error;
    }
}

function deriveSpotAmountFromBinanceOrder(orderAmount, binanceClient, marketSnapshot) {
    const amount = toFiniteNumber(orderAmount);
    if (!Number.isFinite(amount) || amount <= 0) return NaN;

    const price = toFiniteNumber(marketSnapshot?.usdPrice);
    const market =
        binanceClient && typeof binanceClient.market === 'function'
            ? binanceClient.market(executionEngineState.symbol)
            : null;
    const contractSize = toFiniteNumber(market?.contractSize);

    if (market?.inverse && Number.isFinite(contractSize) && contractSize > 0) {
        if (!Number.isFinite(price) || price <= 0) return NaN;
        return round((amount * contractSize) / price, 8);
    }

    return round(amount, 8);
}

async function placeExecutionEngineBithumbOrder(
    side,
    amount,
    marketSnapshot,
    premiumValue,
    options = {}
) {
    const idempotencyKeyPrefix = options.idempotencyKeyPrefix ?? 'engine-bithumb';
    const allowInSafeMode = Boolean(options.allowInSafeMode);
    const strategyAction = options.strategyAction ?? null;
    const idempotencyKey = `${idempotencyKeyPrefix}-${side}-${marketSnapshot.timestamp}-${Math.random().toString(36).slice(2, 10)}`;
    const url = `http://127.0.0.1:${port}/api/execution/bithumb/order`;
    const body = {
        symbol: 'BTC/KRW',
        side,
        type: 'market',
        amount,
        dryRun: executionEngineState.dryRun,
        strategyContext: {
            action: strategyAction,
            decisionTimestamp: marketSnapshot.timestamp,
            premiumPct: marketSnapshot.kimchiPremiumPercent,
            effectivePremiumPct: premiumValue,
            usdtKrwRate: marketSnapshot.usdtKrwRate,
            exchangeRate: marketSnapshot.exchangeRate,
            usdPrice: marketSnapshot.usdPrice,
            krwPrice: marketSnapshot.krwPrice,
        },
    };

    if (allowInSafeMode) {
        body.allowInSafeMode = true;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            ...getExecutionEngineAuthHeaders(),
        },
        body: JSON.stringify(body),
    });

    let text = '';
    try {
        text = (await response.text()).trim();
    } catch {
        text = '';
    }
    let payload = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch {
            payload = null;
        }
    }

    if (!response.ok) {
        const message =
            (payload && typeof payload.error === 'string' && payload.error) ||
            text ||
            `HTTP ${response.status}`;
        throw new Error(message);
    }

    return payload;
}

function scheduleExecutionEngineTick(delayMs = executionEngineState.pollIntervalMs) {
    if (!executionEngineState.running) return;
    clearExecutionEngineTimer();
    const waitMs = Math.max(0, Math.floor(delayMs));
    executionEngineState.loopTimer = setTimeout(() => {
        executionEngineState.loopTimer = null;
        void runExecutionEngineTick();
    }, waitMs);
}

async function runExecutionEngineTick() {
    if (!executionEngineState.running) return;
    if (executionEngineState.busy) {
        scheduleExecutionEngineTick(executionEngineState.pollIntervalMs);
        return;
    }

    executionEngineState.busy = true;
    executionEngineState.lastTickAt = Date.now();
    executionEngineState.iterations += 1;

    try {
        if (!executionEngineState.dryRun && executionFailureState.safeMode) {
            return;
        }

        const marketSnapshot = await fetchExecutionEngineMarketSnapshot();
        const premiumValue =
            executionEngineState.premiumBasis === 'USDT'
                ? marketSnapshot.kimchiPremiumPercentUsdt
                : marketSnapshot.kimchiPremiumPercent;

        const previousPremium = executionEngineState.lastPremium;
        executionEngineState.lastMarketDataTimestamp = marketSnapshot.timestamp;
        executionEngineState.lastPremium = round(premiumValue, 6);
        executionEngineState.lastEffectivePremium = round(
            marketSnapshot.kimchiPremiumPercentUsdt,
            6
        );
        executionEngineState.lastError = null;

        // --- Premium threshold Discord alert (multi-threshold) ---
        handlePremiumThresholdAlerts({
            marketSnapshot,
            premiumValue,
            previousPremium,
        });

        if (!Number.isFinite(premiumValue)) {
            throw new Error('premium value is not available');
        }

        if (
            Number.isFinite(executionEngineState.lastOrderAt) &&
            Date.now() - executionEngineState.lastOrderAt < executionEngineState.orderCooldownMs
        ) {
            return;
        }

        // --- Simple Threshold Strategy execution ---
        const entryThreshold = executionEngineState.entryThreshold;
        const exitThreshold = executionEngineState.exitThreshold;
        const positionState = executionEngineState.positionState;

        let action = null;
        if (positionState === 'IDLE' && premiumValue >= entryThreshold) {
            action = 'ENTRY';
        } else if (positionState === 'ENTERED' && premiumValue <= exitThreshold) {
            action = 'EXIT';
        }

        if (!action) return;

        const side = action === 'ENTRY' ? 'sell' : 'buy';
        const bithumbSide = action === 'ENTRY' ? 'buy' : 'sell';
        let orderAmount = 0;
        let spotOrderAmount = 0;
        let binanceClient = null;

        try {
            const rawPct =
                action === 'ENTRY'
                    ? executionEngineState.orderBalancePctEntry
                    : executionEngineState.orderBalancePctExit;
            const pctFactor =
                Number.isFinite(rawPct) && rawPct > 0
                    ? Math.min(100, rawPct) / 100
                    : NaN;

            if (!Number.isFinite(pctFactor) || pctFactor <= 0) {
                throw new Error(`order balance pct is invalid: ${rawPct}`);
            }

            const computeEntryAmount = async (client, freeBalance) => {
                if (!Number.isFinite(freeBalance) || freeBalance <= 0) {
                    throw new Error('free balance is not available');
                }

                const price = toFiniteNumber(marketSnapshot.usdPrice);
                if (!Number.isFinite(price) || price <= 0) {
                    throw new Error('BTC price is not available');
                }

                if (executionEngineState.marketType === 'usdm') {
                    return round((freeBalance * pctFactor) / price, 8);
                }

                const market = client && typeof client.market === 'function'
                    ? client.market(executionEngineState.symbol)
                    : null;
                const contractSize = toFiniteNumber(market?.contractSize);
                if (market?.inverse && Number.isFinite(contractSize) && contractSize > 0) {
                    const notionalUsd = freeBalance * pctFactor * price;
                    return round(notionalUsd / contractSize, 8);
                }

                return round(freeBalance * pctFactor, 8);
            };

            if (!executionEngineState.dryRun) {
                binanceClient = await getBinanceExecutionClient(executionEngineState.marketType, true);

                if (action === 'ENTRY') {
                    const balance = await binanceClient.fetchBalance();
                    const balanceAsset = executionEngineState.marketType === 'usdm' ? 'USDT' : 'BTC';
                    const freeBalance = toFiniteNumber(balance?.[balanceAsset]?.free);
                    if (!Number.isFinite(freeBalance) || freeBalance <= 0) {
                        throw new Error(`Insufficient ${balanceAsset} balance (${freeBalance})`);
                    }
                    orderAmount = await computeEntryAmount(binanceClient, freeBalance);
                } else {
                    const positions = await binanceClient.fetchPositions([executionEngineState.symbol]);
                    const snapshot = resolveShortPositionSnapshot(positions, executionEngineState.symbol);
                    if (snapshot.hadPositions) {
                        executionEngineState.positionSideMode = snapshot.hedgeModeDetected ? 'HEDGE' : 'ONEWAY';
                    }
                    if (snapshot.shortContracts <= 0) {
                        throw new Error(`No short position to close for ${executionEngineState.symbol}`);
                    }
                    orderAmount = round(snapshot.shortContracts * pctFactor, 8);
                }
            } else {
                let freeBalance = NaN;
                if (hasBinanceExecutionCredentials()) {
                    try {
                        binanceClient = await getBinanceExecutionClient(executionEngineState.marketType, true);
                        const balance = await binanceClient.fetchBalance();
                        const balanceAsset = executionEngineState.marketType === 'usdm' ? 'USDT' : 'BTC';
                        freeBalance = toFiniteNumber(balance?.[balanceAsset]?.free);
                    } catch {
                        binanceClient = null;
                        freeBalance = NaN;
                    }
                }

                if (!Number.isFinite(freeBalance) || freeBalance <= 0) {
                    freeBalance = executionEngineState.marketType === 'usdm' ? 1000 : 1;
                }

                if (action === 'ENTRY') {
                    orderAmount = await computeEntryAmount(binanceClient, freeBalance);
                } else if (
                    executionEngineState.lastOrderSide === 'sell' &&
                    Number.isFinite(executionEngineState.lastOrderAmount)
                ) {
                    orderAmount = round(executionEngineState.lastOrderAmount * pctFactor, 8);
                } else {
                    orderAmount = await computeEntryAmount(binanceClient, freeBalance);
                }
            }

            spotOrderAmount = deriveSpotAmountFromBinanceOrder(orderAmount, binanceClient, marketSnapshot);
            if (!Number.isFinite(spotOrderAmount) || spotOrderAmount <= 0) {
                throw new Error(`Calculated spot amount is invalid: ${spotOrderAmount}`);
            }

            if (!executionEngineState.dryRun) {
                if (!hasBithumbExecutionCredentials()) {
                    throw new Error('BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured');
                }

                const bithumbClient = await getBithumbExecutionClient(true);
                const balance = await bithumbClient.fetchBalance();

                if (action === 'ENTRY') {
                    const freeKrw = toFiniteNumber(balance?.KRW?.free ?? balance?.krw?.free);
                    const krwPrice = toFiniteNumber(marketSnapshot.krwPrice);
                    if (!Number.isFinite(freeKrw) || freeKrw <= 0) {
                        throw new Error('Insufficient KRW balance on Bithumb');
                    }
                    if (!Number.isFinite(krwPrice) || krwPrice <= 0) {
                        throw new Error('KRW price is not available for spot sizing');
                    }
                    const maxSpotAmount = freeKrw / krwPrice;
                    if (maxSpotAmount <= 0) {
                        throw new Error('Bithumb KRW balance is too small');
                    }
                    if (maxSpotAmount < spotOrderAmount) {
                        const ratio = maxSpotAmount / spotOrderAmount;
                        orderAmount = round(orderAmount * ratio, 8);
                        spotOrderAmount = round(maxSpotAmount, 8);
                        recordRuntimeEvent('warn', 'execution_engine_spot_balance_clamped', {
                            action,
                            maxSpotAmount: round(maxSpotAmount, 8),
                            orderAmount: round(orderAmount, 8),
                            spotOrderAmount,
                        });
                    }
                } else {
                    const freeBtc = toFiniteNumber(balance?.BTC?.free ?? balance?.btc?.free);
                    if (!Number.isFinite(freeBtc) || freeBtc <= 0) {
                        throw new Error('Insufficient BTC balance on Bithumb');
                    }
                    if (freeBtc < spotOrderAmount) {
                        const ratio = freeBtc / spotOrderAmount;
                        orderAmount = round(orderAmount * ratio, 8);
                        spotOrderAmount = round(freeBtc, 8);
                        recordRuntimeEvent('warn', 'execution_engine_spot_balance_clamped', {
                            action,
                            maxSpotAmount: round(freeBtc, 8),
                            orderAmount: round(orderAmount, 8),
                            spotOrderAmount,
                        });
                    }
                }
            }

            if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
                throw new Error(`Calculated order amount is invalid: ${orderAmount}`);
            }
        } catch (calcError) {
            const msg = toErrorMessage(calcError);
            executionEngineState.lastError = msg;
            recordRuntimeEvent('warn', 'execution_engine_amount_calc_failed', {
                action,
                error: msg,
            });
            return;
        }

        executionEngineState.lastDecisionAt = Date.now();
        let binancePayload = null;
        let bithumbPayload = null;

        if (action === 'ENTRY') {
            bithumbPayload = await placeExecutionEngineBithumbOrder(
                bithumbSide,
                spotOrderAmount,
                marketSnapshot,
                premiumValue,
                { strategyAction: 'ENTRY_BUY' }
            );
            try {
                binancePayload = await placeExecutionEngineOrder(side, orderAmount, marketSnapshot, premiumValue);
            } catch (error) {
                try {
                    await placeExecutionEngineBithumbOrder(
                        'sell',
                        spotOrderAmount,
                        marketSnapshot,
                        premiumValue,
                        { strategyAction: 'EXIT_SELL', allowInSafeMode: true, idempotencyKeyPrefix: 'engine-rollback' }
                    );
                } catch (rollbackError) {
                    recordRuntimeEvent('error', 'execution_engine_bithumb_rollback_failure', {
                        action,
                        error: toErrorMessage(rollbackError),
                    });
                }
                throw error;
            }
        } else {
            binancePayload = await placeExecutionEngineOrder(side, orderAmount, marketSnapshot, premiumValue);
            try {
                bithumbPayload = await placeExecutionEngineBithumbOrder(
                    bithumbSide,
                    spotOrderAmount,
                    marketSnapshot,
                    premiumValue,
                    { strategyAction: 'EXIT_SELL' }
                );
            } catch (error) {
                try {
                    await placeExecutionEngineOrder('sell', orderAmount, marketSnapshot, premiumValue, {
                        allowInSafeMode: true,
                        idempotencyKeyPrefix: 'engine-rollback',
                    });
                } catch (rollbackError) {
                    recordRuntimeEvent('error', 'execution_engine_binance_rollback_failure', {
                        action,
                        error: toErrorMessage(rollbackError),
                    });
                }
                throw error;
            }
        }

        executionEngineState.lastOrderAt = Date.now();
        executionEngineState.lastOrderSide = side;
        executionEngineState.lastOrderId = normalizeExecutionOrderIdToken(binancePayload?.order?.id, 120);
        executionEngineState.lastOrderAmount = orderAmount;
        executionEngineState.lastOrderError = null;

        // Update position state
        executionEngineState.positionState = action === 'ENTRY' ? 'ENTERED' : 'IDLE';

        persistExecutionEngineState('threshold-triggered');

        recordRuntimeEvent('info', 'execution_engine_threshold_triggered', {
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            side,
            action,
            dryRun: executionEngineState.dryRun,
            premiumBasis: executionEngineState.premiumBasis,
            premiumValue: round(premiumValue, 6),
            entryThreshold: round(entryThreshold, 4),
            exitThreshold: round(exitThreshold, 4),
            orderAmount: round(orderAmount, 8),
            spotOrderAmount: round(spotOrderAmount, 8),
            orderId: executionEngineState.lastOrderId,
            spotOrderId: bithumbPayload?.order?.id ?? null,
        });

        const marketFields = buildDiscordMarketCoreFields(marketSnapshot, {
            includePremium: false,
            includeUsdtPremium: false,
        });
        void sendDiscordNotification({
            title: action === 'ENTRY' ? '🔴 숏 진입 (ENTRY)' : '🟢 포지션 청산 (EXIT)',
            description: `${executionEngineState.symbol} ${side.toUpperCase()} · 김프 ${round(premiumValue, 2)}% 도달 (기준: ${action === 'ENTRY' ? entryThreshold : exitThreshold}%)`,
            color: action === 'ENTRY' ? 0xef4444 : 0x10b981,
            fields: [
                { name: '김프', value: `${round(premiumValue, 4)}%` },
                { name: '기준가', value: `${action === 'ENTRY' ? entryThreshold : exitThreshold}%` },
                { name: '선물수량', value: `${round(orderAmount, 8)}` },
                { name: '현물수량', value: `${round(spotOrderAmount, 8)}` },
                { name: 'DryRun', value: executionEngineState.dryRun ? '✅ 시뮬' : '❌ 실매매' },
                { name: 'Order ID', value: executionEngineState.lastOrderId ?? 'N/A', inline: false },
                ...marketFields,
            ],
        });

        if (!executionEngineState.dryRun) {
            await syncExecutionEnginePositionState();
            persistExecutionEngineState('position-synced');
        }
    } catch (error) {
        const message = toErrorMessage(error);
        executionEngineState.lastError = message;
        executionEngineState.lastOrderError = message;
        persistExecutionEngineState('tick-error');
        recordRuntimeEvent('error', 'execution_engine_tick_failure', {
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            dryRun: executionEngineState.dryRun,
            error: message,
        });
    } finally {
        executionEngineState.busy = false;
        if (executionEngineState.running) {
            scheduleExecutionEngineTick(executionEngineState.pollIntervalMs);
        }
    }
}

async function startExecutionEngine({
    marketType,
    symbol,
    orderBalancePctEntry,
    orderBalancePctExit,
    dryRun,
    premiumBasis,
    entryThreshold,
    exitThreshold,
}) {
    const resolvedDryRun = Boolean(dryRun);
    if (!resolvedDryRun) {
        if (executionFailureState.safeMode) {
            throw new Error('Execution safe mode is active. Reset safety state first.');
        }

        if (!hasBinanceExecutionCredentials()) {
            throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET is not configured');
        }

        if (binanceExecutionTestnet && !executionAllowTestnetOrders) {
            throw new Error('EXECUTION_ALLOW_TESTNET_ORDERS is disabled');
        }

        if (!binanceExecutionTestnet && !executionAllowLiveOrders) {
            throw new Error('EXECUTION_ALLOW_LIVE_ORDERS is disabled');
        }

        if (!hasBithumbExecutionCredentials()) {
            throw new Error('BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured');
        }
    }

    const resolvedOrderBalancePctEntry = parseNumber(orderBalancePctEntry, NaN, 0.0001, 100);
    const resolvedOrderBalancePctExitRaw = parseNumber(orderBalancePctExit, NaN, 0.0001, 100);
    const resolvedOrderBalancePctExit = Number.isFinite(resolvedOrderBalancePctExitRaw)
        ? resolvedOrderBalancePctExitRaw
        : resolvedOrderBalancePctEntry;
    if (
        !Number.isFinite(resolvedOrderBalancePctEntry) ||
        resolvedOrderBalancePctEntry <= 0 ||
        resolvedOrderBalancePctEntry > 100
    ) {
        throw new Error('orderBalancePctEntry must be between 0 and 100');
    }
    if (
        !Number.isFinite(resolvedOrderBalancePctExit) ||
        resolvedOrderBalancePctExit <= 0 ||
        resolvedOrderBalancePctExit > 100
    ) {
        throw new Error('orderBalancePctExit must be between 0 and 100');
    }

    const resolvedEntryThreshold = parseNumber(entryThreshold, NaN, -20, 40);
    const resolvedExitThreshold = parseNumber(exitThreshold, NaN, -20, 40);
    if (!Number.isFinite(resolvedEntryThreshold) || !Number.isFinite(resolvedExitThreshold)) {
        throw new Error('entryThreshold and exitThreshold are required');
    }
    if (resolvedEntryThreshold <= resolvedExitThreshold) {
        throw new Error('entryThreshold must be greater than exitThreshold');
    }

    executionEngineState.marketType = normalizeExecutionMarketType(marketType);
    executionEngineState.symbol = parseExecutionSymbol(symbol, executionEngineState.marketType);
    executionEngineState.orderBalancePctEntry = resolvedOrderBalancePctEntry;
    executionEngineState.orderBalancePctExit = resolvedOrderBalancePctExit;
    executionEngineState.dryRun = resolvedDryRun;
    executionEngineState.premiumBasis = premiumBasis === 'USDT' ? 'USDT' : 'USD';
    executionEngineState.entryThreshold = resolvedEntryThreshold;
    executionEngineState.exitThreshold = resolvedExitThreshold;
    executionEngineState.running = true;
    executionEngineState.busy = false;
    executionEngineState.positionState = 'IDLE';
    executionEngineState.positionSideMode = 'UNKNOWN';
    executionEngineState.startedAt = Date.now();
    executionEngineState.stoppedAt = null;
    executionEngineState.lastTickAt = null;
    executionEngineState.lastDecisionAt = null;
    executionEngineState.lastOrderAt = null;
    executionEngineState.lastOrderSide = null;
    executionEngineState.lastOrderId = null;
    executionEngineState.lastOrderAmount = null;
    executionEngineState.lastPremium = null;
    executionEngineState.lastEffectivePremium = null;
    executionEngineState.lastMarketDataTimestamp = null;
    executionEngineState.iterations = 0;
    executionEngineState.lastError = null;
    executionEngineState.lastOrderError = null;
    executionEngineState.stopReason = null;
    executionEngineState.desiredRunning = true;
    clearExecutionEngineTimer();
    persistExecutionEngineState('start-initialized');

    try {
        if (!executionEngineState.dryRun) {
            await syncExecutionEnginePositionState();
        }
    } catch (error) {
        executionEngineState.running = false;
        executionEngineState.busy = false;
        executionEngineState.desiredRunning = false;
        executionEngineState.stoppedAt = Date.now();
        executionEngineState.stopReason = 'start-failed';
        executionEngineState.lastError = toErrorMessage(error);
        clearExecutionEngineTimer();
        persistExecutionEngineState('start-failed');
        throw error;
    }

    recordRuntimeEvent('info', 'execution_engine_started', {
        marketType: executionEngineState.marketType,
        symbol: executionEngineState.symbol,
        dryRun: executionEngineState.dryRun,
        premiumBasis: executionEngineState.premiumBasis,
        orderBalancePctEntry: executionEngineState.orderBalancePctEntry,
        orderBalancePctExit: executionEngineState.orderBalancePctExit,
        entryThreshold: executionEngineState.entryThreshold,
        exitThreshold: executionEngineState.exitThreshold,
        positionState: executionEngineState.positionState,
    });
    persistExecutionEngineState('start-ready');
    const startMarketFields = await getDiscordMarketCoreFields();
    void sendDiscordNotification({
        title: '▶️ 자동매매 엔진 시작',
        description: `${executionEngineState.symbol} 김프 모니터링 시작 (진입: ${executionEngineState.entryThreshold}%, 청산: ${executionEngineState.exitThreshold}%)`,
        color: 0x3b82f6,
        fields: [
            { name: '마켓', value: executionEngineState.marketType },
            { name: 'DryRun', value: executionEngineState.dryRun ? '✅' : '❌' },
            ...startMarketFields,
        ],
    });

    scheduleExecutionEngineTick(0);
}

function toNullableRounded(value, digits = 8) {
    const numeric = toFiniteNumber(value);
    if (!Number.isFinite(numeric)) return null;
    return round(numeric, digits);
}

async function getBinanceExecutionClient(marketType, requireCredentials = true) {
    const resolvedMarketType = normalizeExecutionMarketType(marketType);
    const activeCredentials = getActiveBinanceExecutionCredentials();
    const hasCredentials = activeCredentials.configured;

    if (requireCredentials && !hasCredentials) {
        throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET is not configured');
    }

    const credentialToken = hasCredentials
        ? `${activeCredentials.source}:${activeCredentials.keyHint ?? 'unknown'}`
        : 'none';
    const cacheKey = `${resolvedMarketType}:${binanceExecutionTestnet ? 'testnet' : 'mainnet'}:${hasCredentials ? 'auth' : 'public'}:${credentialToken}`;
    if (binanceExecutionClient && binanceExecutionClientCacheKey === cacheKey) {
        return binanceExecutionClient;
    }

    const ExchangeClass =
        resolvedMarketType === 'usdm'
            ? ccxt.binanceusdm
            : ccxt.binancecoinm;

    if (typeof ExchangeClass !== 'function') {
        throw new Error(`Unsupported Binance execution market: ${resolvedMarketType}`);
    }

    const client = new ExchangeClass({
        apiKey: hasCredentials ? activeCredentials.apiKey : undefined,
        secret: hasCredentials ? activeCredentials.apiSecret : undefined,
        enableRateLimit: true,
        options: {
            recvWindow: binanceRecvWindowMs,
        },
    });

    if (binanceExecutionTestnet) {
        if (typeof client.enableDemoTrading === 'function') {
            client.enableDemoTrading(true);
        } else if (typeof client.setSandboxMode === 'function') {
            client.setSandboxMode(true);
        }
    } else if (typeof client.enableDemoTrading === 'function') {
        client.enableDemoTrading(false);
    }

    await client.loadMarkets();

    binanceExecutionClient = client;
    binanceExecutionClientCacheKey = cacheKey;
    return client;
}

async function getBithumbExecutionClient(requireCredentials = true) {
    const activeCredentials = getActiveBithumbExecutionCredentials();
    const hasCredentials = activeCredentials.configured;

    if (requireCredentials && !hasCredentials) {
        throw new Error('BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured');
    }

    const credentialToken = hasCredentials
        ? `${activeCredentials.source}:${activeCredentials.keyHint ?? 'unknown'}`
        : 'none';
    const cacheKey = `bithumb:${hasCredentials ? 'auth' : 'public'}:${credentialToken}`;

    if (bithumbClient && bithumbClientCacheKey === cacheKey) {
        return bithumbClient;
    }

    const client = new ccxt.bithumb({
        apiKey: hasCredentials ? activeCredentials.apiKey : undefined,
        secret: hasCredentials ? activeCredentials.apiSecret : undefined,
        enableRateLimit: true,
    });

    await client.loadMarkets();

    bithumbClient = client;
    bithumbClientCacheKey = cacheKey;
    return client;
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

async function fetchJson(url, options = {}) {
    const retryCount = Math.floor(parseNumber(options.retries, requestRetryCount, 0, 5));
    const context = typeof options.context === 'string' && options.context.trim()
        ? options.context.trim()
        : url;
    let lastError = new Error('unknown error');

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
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

            if (attempt > 0) {
                recordRuntimeEvent('warn', 'fetch_json_retry_success', {
                    context,
                    url,
                    attempt: attempt + 1,
                    maxAttempts: retryCount + 1,
                });
            }

            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorMessage = toErrorMessage(error);
            const isLastAttempt = attempt >= retryCount;

            recordRuntimeEvent(isLastAttempt ? 'error' : 'warn', 'fetch_json_attempt_failed', {
                context,
                url,
                attempt: attempt + 1,
                maxAttempts: retryCount + 1,
                error: errorMessage,
            });

            if (isLastAttempt) break;
            await wait(requestRetryDelayMs * (attempt + 1));
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    throw new Error(`${context} failed after ${retryCount + 1} attempts: ${toErrorMessage(lastError)}`);
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

async function fetchBithumbBtcKrw() {
    const data = await fetchJson('https://api.bithumb.com/public/ticker/BTC_KRW', {
        context: 'bithumb-btc',
    });
    const btcKrw = toFiniteNumber(data?.data?.closing_price);

    if (!Number.isFinite(btcKrw) || btcKrw <= 0) {
        throw new Error('Invalid BTC_KRW price from Bithumb');
    }

    return btcKrw;
}

async function fetchBithumbUsdtKrw() {
    const data = await fetchJson('https://api.bithumb.com/public/ticker/USDT_KRW', {
        context: 'bithumb-usdt',
    });
    const usdtKrw = toFiniteNumber(data?.data?.closing_price);

    if (!Number.isFinite(usdtKrw) || usdtKrw <= 0) {
        throw new Error('Invalid USDT_KRW price from Bithumb');
    }

    return usdtKrw;
}

async function fetchBinanceCoinMBtcUsd() {
    // COIN-M Perpetual: BTCUSD_PERP
    // Note: dapi returns an array even for single symbol queries
    const data = await fetchJson('https://dapi.binance.com/dapi/v1/ticker/price?symbol=BTCUSD_PERP', {
        context: 'binance-coinm-btc',
    });
    const price = toFiniteNumber(Array.isArray(data) ? data[0]?.price : data?.price);

    if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Invalid BTCUSD_PERP price from Binance COIN-M');
    }

    return price;
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

async function fetchOkxSpotPriceMap() {
    const data = await fetchJson('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    const list = Array.isArray(data?.data) ? data.data : [];
    if (list.length === 0) {
        throw new Error('Invalid OKX spot tickers response');
    }

    const prices = new Map();
    for (const item of list) {
        const instId = typeof item?.instId === 'string' ? item.instId : '';
        if (!instId.endsWith('-USDT')) continue;
        const symbol = instId.replace('-USDT', '');
        const price = toFiniteNumber(item?.last);
        if (Number.isFinite(price) && price > 0) {
            prices.set(symbol, price);
        }
    }

    if (prices.size === 0) {
        throw new Error('No valid OKX spot symbols');
    }

    return {
        source: 'okx:spot',
        prices,
    };
}

async function fetchBinanceSpotPriceMap() {
    const data = await fetchJson('https://api.binance.com/api/v3/ticker/price');
    if (!Array.isArray(data)) {
        throw new Error('Invalid Binance spot ticker response');
    }

    const prices = new Map();
    for (const item of data) {
        const symbol = typeof item?.symbol === 'string' ? item.symbol : '';
        if (!symbol.endsWith('USDT')) continue;
        const baseSymbol = symbol.slice(0, -4);
        const price = toFiniteNumber(item?.price);
        if (baseSymbol && Number.isFinite(price) && price > 0) {
            prices.set(baseSymbol, price);
        }
    }

    if (prices.size === 0) {
        throw new Error('No valid Binance spot symbols');
    }

    return {
        source: 'binance:spot',
        prices,
    };
}

async function fetchBybitSpotPriceMap() {
    const data = await fetchJson('https://api.bybit.com/v5/market/tickers?category=spot');
    const list = Array.isArray(data?.result?.list) ? data.result.list : [];
    if (list.length === 0) {
        throw new Error('Invalid Bybit spot ticker response');
    }

    const prices = new Map();
    for (const item of list) {
        const symbol = typeof item?.symbol === 'string' ? item.symbol : '';
        if (!symbol.endsWith('USDT')) continue;
        const baseSymbol = symbol.slice(0, -4);
        const price = toFiniteNumber(item?.lastPrice);
        if (baseSymbol && Number.isFinite(price) && price > 0) {
            prices.set(baseSymbol, price);
        }
    }

    if (prices.size === 0) {
        throw new Error('No valid Bybit spot symbols');
    }

    return {
        source: 'bybit:spot',
        prices,
    };
}

async function fetchGlobalSpotPriceMap() {
    const providers = [fetchOkxSpotPriceMap, fetchBinanceSpotPriceMap, fetchBybitSpotPriceMap];
    let lastErrorMessage = 'unknown error';

    for (const provider of providers) {
        try {
            return await provider();
        } catch (error) {
            lastErrorMessage = toErrorMessage(error);
            recordRuntimeEvent('warn', 'global_spot_provider_failed', {
                provider: provider.name,
                error: lastErrorMessage,
            });
            console.warn(`Global spot provider failed (${provider.name}): ${lastErrorMessage}`);
        }
    }

    throw new Error(`All global spot providers failed: ${lastErrorMessage}`);
}

async function fetchUpbitCandles({ market, upbitPath, limit }) {
    const byTimestamp = new Map();
    let cursor = null; // null means now
    let pages = 0;
    const maxPages = Math.ceil(limit / 200) + 1;

    while (byTimestamp.size < limit && pages < maxPages) {
        if (pages > 0) {
            await wait(120);
        }

        const remaining = limit - byTimestamp.size;
        const count = Math.min(200, remaining);

        let url = `https://api.upbit.com/v1/candles/${upbitPath}?market=${encodeURIComponent(
            market
        )}&count=${encodeURIComponent(String(count))}`;

        if (cursor) {
            url += `&to=${encodeURIComponent(toUpbitToParam(cursor))}`;
        }

        const data = await fetchJson(url, { context: `upbit-candles:${market}:${upbitPath}` });

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        const candles = data
            .map(parseUpbitCandle)
            .filter((candle) => candle !== null);

        if (candles.length === 0) break;

        for (const candle of candles) {
            if (!byTimestamp.has(candle.timestamp)) {
                byTimestamp.set(candle.timestamp, candle);
            }
        }

        // Move cursor to the earliest candle's timestamp minus 1ms to get previous page
        const earliest = Math.min(...candles.map(c => c.timestamp));
        if (cursor && earliest >= cursor) break; // No progress
        cursor = earliest;
        pages += 1;

        if (data.length < count) break;
    }

    return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function toUpbitToParam(timestamp) {
    return new Date(timestamp).toISOString().replace('.000Z', 'Z');
}

async function fetchUpbitCandlesRange({
    market,
    upbitPath,
    startTime,
    endTime,
    maxCandles,
}) {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
        throw new Error(`Invalid range for Upbit candles (${market})`);
    }

    const maxCount = Number.isFinite(maxCandles) && maxCandles > 0
        ? Math.max(1, Math.floor(maxCandles))
        : maxBacktestRangeCandles;
    const byTimestamp = new Map();
    let cursor = endTime + 1;
    let pages = 0;
    let previousOldest = Number.POSITIVE_INFINITY;
    let backoffMs = 0;
    let consecutiveRateLimitHits = 0;

    while (pages < 200 && byTimestamp.size < maxCount) {
        if (pages > 0) {
            await wait(backoffMs > 0 ? backoffMs : 120);
        }

        const remaining = Math.max(1, maxCount - byTimestamp.size);
        const count = Math.min(200, remaining);
        const url = `https://api.upbit.com/v1/candles/${upbitPath}?market=${encodeURIComponent(
            market
        )}&count=${encodeURIComponent(String(count))}&to=${encodeURIComponent(toUpbitToParam(cursor))}`;
        let data;
        try {
            data = await fetchJson(url, {
                context: `upbit-candles-range:${market}:${upbitPath}`,
                retries: 1,
            });
            backoffMs = Math.max(0, Math.floor(backoffMs * 0.75));
            consecutiveRateLimitHits = 0;
        } catch (error) {
            const message = toErrorMessage(error);
            if (message.includes('HTTP 429')) {
                consecutiveRateLimitHits += 1;
                if (consecutiveRateLimitHits > 8) {
                    throw error;
                }
                backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 250, 4000);
                recordRuntimeEvent('warn', 'upbit_candle_range_rate_limited', {
                    market,
                    upbitPath,
                    interval: upbitPath,
                    backoffMs,
                    consecutiveRateLimitHits,
                });
                await wait(backoffMs);
                continue;
            }
            throw error;
        }

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        const candles = data
            .map(parseUpbitCandle)
            .filter((candle) => candle !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        if (!candles.length) break;

        for (const candle of candles) {
            if (candle.timestamp < startTime || candle.timestamp > endTime) continue;
            byTimestamp.set(candle.timestamp, candle);
        }

        const oldestTimestamp = candles[0].timestamp;
        if (!Number.isFinite(oldestTimestamp)) break;
        if (oldestTimestamp <= startTime) break;
        if (oldestTimestamp >= previousOldest) break;

        previousOldest = oldestTimestamp;
        cursor = oldestTimestamp - 1;
        pages += 1;
    }

    return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function intervalToMs(interval) {
    const mapping = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
    };
    return mapping[interval] ?? null;
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

async function fetchBinanceCandlesRange({ interval, startTime, endTime, maxCandles }) {
    const intervalMs = intervalToMs(interval);
    if (!Number.isFinite(intervalMs)) {
        throw new Error(`Unsupported Binance interval for range fetch: ${interval}`);
    }
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
        throw new Error('Invalid range for Binance candles');
    }

    const maxCount = Number.isFinite(maxCandles) && maxCandles > 0
        ? Math.max(1, Math.floor(maxCandles))
        : maxBacktestRangeCandles;
    const byTimestamp = new Map();
    let cursor = startTime;
    let pages = 0;

    while (pages < 500 && cursor <= endTime && byTimestamp.size < maxCount) {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${encodeURIComponent(
            interval
        )}&startTime=${encodeURIComponent(String(cursor))}&endTime=${encodeURIComponent(
            String(endTime)
        )}&limit=1000`;
        const data = await fetchJson(url, {
            context: `binance-candles-range:${interval}`,
            retries: 1,
        });

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        const candles = data
            .map(parseBinanceKline)
            .filter((candle) => candle !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        if (!candles.length) break;

        for (const candle of candles) {
            if (candle.timestamp < startTime || candle.timestamp > endTime) continue;
            byTimestamp.set(candle.timestamp, candle);
        }

        const lastTimestamp = candles[candles.length - 1].timestamp;
        const nextCursor = lastTimestamp + intervalMs;
        if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
            break;
        }

        cursor = nextCursor;
        pages += 1;
    }

    return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
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
        { source: 'binance:COIN-M', fetcher: fetchBinanceCoinMBtcUsd },
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
            lastErrorMessage = toErrorMessage(error);
            recordRuntimeEvent('warn', 'global_ticker_provider_failed', {
                provider: provider.source,
                error: lastErrorMessage,
            });
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
            lastErrorMessage = toErrorMessage(error);
            recordRuntimeEvent('warn', 'global_candle_provider_failed', {
                provider: provider.source,
                interval,
                error: lastErrorMessage,
            });
            console.warn(
                `Global candle provider failed (${provider.source}): ${lastErrorMessage}`
            );
        }
    }

    throw new Error(`All global candle providers failed: ${lastErrorMessage}`);
}

async function fetchGlobalCandlesRange({ interval, startTime, endTime, maxCandles }) {
    try {
        const candles = await fetchBinanceCandlesRange({
            interval,
            startTime,
            endTime,
            maxCandles,
        });
        return {
            candles,
            source: 'binance:BTCUSDT',
            sourceInterval: interval,
        };
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('warn', 'global_candle_range_provider_failed', {
            provider: 'binance:BTCUSDT',
            interval,
            startTime,
            endTime,
            error: message,
        });

        const intervalMs = intervalToMs(interval) ?? 60_000;
        const approxLimit = Math.min(
            1000,
            Math.max(20, Math.ceil((endTime - startTime) / intervalMs) + 8)
        );
        const fallback = await fetchGlobalCandles({ interval, limit: approxLimit });
        const filtered = fallback.candles.filter(
            (candle) => candle.timestamp >= startTime && candle.timestamp <= endTime
        );
        return {
            candles: filtered.length ? filtered : fallback.candles,
            source: fallback.source,
            sourceInterval: fallback.sourceInterval,
        };
    }
}

async function backfillPremiumHistoryRange({ interval, startTime, endTime }) {
    const config = CANDLE_INTERVAL_CONFIG[interval];
    const effectiveEnd = Number.isFinite(endTime) ? endTime : Date.now();
    const effectiveStart = Number.isFinite(startTime)
        ? startTime
        : effectiveEnd - config.intervalMs * config.maxLimit;

    if (!Number.isFinite(effectiveStart) || !Number.isFinite(effectiveEnd) || effectiveStart > effectiveEnd) {
        throw new Error('Invalid backfill range');
    }

    const requestedCandles = Math.ceil((effectiveEnd - effectiveStart) / config.intervalMs) + 1;
    if (requestedCandles > maxBacktestRangeCandles) {
        throw new Error(
            `Requested range is too large for ${interval}. requested=${requestedCandles}, max=${maxBacktestRangeCandles}`
        );
    }

    const rawIntervalMs = intervalToMs(config.binanceFetchInterval) ?? config.intervalMs;
    const rawStart = Math.max(0, effectiveStart - config.intervalMs);
    const rawEnd = effectiveEnd + config.intervalMs;
    const rawMaxCandles = Math.ceil((rawEnd - rawStart) / rawIntervalMs) + 12;

    const globalCandlePromise = fetchGlobalCandlesRange({
        interval: config.binanceFetchInterval,
        startTime: rawStart,
        endTime: rawEnd,
        maxCandles: rawMaxCandles,
    });
    const domesticCandles = await fetchUpbitCandlesRange({
        market: 'KRW-BTC',
        upbitPath: config.upbitPath,
        startTime: effectiveStart,
        endTime: effectiveEnd,
        maxCandles: requestedCandles + 12,
    });
    const conversionCandles = await fetchUpbitCandlesRange({
        market: 'KRW-USDT',
        upbitPath: config.upbitPath,
        startTime: effectiveStart,
        endTime: effectiveEnd,
        maxCandles: requestedCandles + 12,
    });
    const globalCandleResult = await globalCandlePromise;

    const globalCandles = aggregateCandlesByInterval(
        globalCandleResult.candles,
        config.intervalMs,
        null
    );

    const builtCandles = buildPremiumCandles({
        domesticCandles,
        globalCandles,
        conversionCandles,
        intervalMs: config.intervalMs,
    }).filter((candle) => candle.timestamp >= effectiveStart && candle.timestamp <= effectiveEnd);

    if (!builtCandles.length) {
        throw new Error('No premium candles built for requested range');
    }

    const historySync = mergePremiumHistory(interval, builtCandles);
    return {
        interval,
        added: historySync.added,
        updated: historySync.updated,
        totalStored: historySync.total,
        fetchedCandles: builtCandles.length,
        source: globalCandleResult.source,
        sourceInterval: globalCandleResult.sourceInterval,
        rangeStart: effectiveStart,
        rangeEnd: effectiveEnd,
    };
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
        const bithumb = await fetchBithumbUsdtKrw();
        if (Number.isFinite(bithumb) && bithumb > 0) {
            return bithumb;
        }
    } catch (error) {
        console.warn(`USDT/KRW provider failed (bithumb): ${error.message}`);
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
            lastErrorMessage = toErrorMessage(error);
            recordRuntimeEvent('warn', 'top_funding_provider_failed', {
                provider: provider.name,
                error: lastErrorMessage,
            });
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

async function getPremiumCandlePayload(interval, limit) {
    const config = CANDLE_INTERVAL_CONFIG[interval];
    const cacheKey = `${interval}:${limit}`;
    const now = Date.now();
    const cached = candleCache.get(cacheKey);

    if (cached && now - cached.updatedAt <= candleCacheTtlMs) {
        const historyCoverage = getPremiumHistoryCoverage(interval);
        return {
            payload: {
                ...cached.payload,
                cache: {
                    hit: true,
                    ageMs: now - cached.updatedAt,
                },
                history: {
                    ...historyCoverage,
                    added: 0,
                    updated: 0,
                },
            },
            fromCache: true,
            updatedAt: cached.updatedAt,
        };
    }

    const binanceFetchLimit = Math.min(
        2400,
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

    const historySync = mergePremiumHistory(interval, candles);
    const historyCoverage = getPremiumHistoryCoverage(interval);

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
        history: {
            ...historyCoverage,
            added: historySync.added,
            updated: historySync.updated,
        },
    };

    candleCache.set(cacheKey, {
        payload,
        updatedAt: now,
    });

    return {
        payload,
        fromCache: false,
        updatedAt: now,
    };
}

function runPremiumBacktest({
    candles,
    entryThreshold,
    exitThreshold,
    leverage,
    initialCapitalKrw,
    feeBps,
    slippageBps,
    forceCloseAtEnd,
    triggerMode,
    fillAtThreshold,
}) {
    if (!Array.isArray(candles) || candles.length === 0) {
        throw new Error('No candles for backtest');
    }

    const trades = [];
    let capitalKrw = initialCapitalKrw;
    let peakCapitalKrw = initialCapitalKrw;
    let maxDrawdownPct = 0;
    const oneSideCostPct = (feeBps + slippageBps) / 100;
    const roundTripCostPct = oneSideCostPct * 2;
    let openPosition = null;

    const useTouchTrigger = triggerMode === 'touch';
    const useThresholdFill = fillAtThreshold === true;

    const closePosition = (exitIndex, exitReason, exitPremiumOverride = null) => {
        if (!openPosition) return;

        const exitCandle = candles[exitIndex];
        const exitPremium = Number.isFinite(exitPremiumOverride) ? exitPremiumOverride : exitCandle.close;
        const capitalBeforeKrw = capitalKrw;
        const grossReturnPct = (openPosition.entryPremium - exitPremium) * leverage;
        const netReturnPct = grossReturnPct - roundTripCostPct;
        const profitKrw = capitalBeforeKrw * (netReturnPct / 100);
        const capitalAfterKrw = capitalBeforeKrw + profitKrw;

        capitalKrw = capitalAfterKrw;
        peakCapitalKrw = Math.max(peakCapitalKrw, capitalKrw);
        const drawdownPct = peakCapitalKrw > 0
            ? ((peakCapitalKrw - capitalKrw) / peakCapitalKrw) * 100
            : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

        trades.push({
            entryTimestamp: openPosition.entryTimestamp,
            exitTimestamp: exitCandle.timestamp,
            entryPremium: round(openPosition.entryPremium, 4),
            exitPremium: round(exitPremium, 4),
            holdingCandles: Math.max(1, exitIndex - openPosition.entryIndex + 1),
            grossReturnPct: round(grossReturnPct, 4),
            netReturnPct: round(netReturnPct, 4),
            profitKrw: round(profitKrw, 2),
            capitalBeforeKrw: round(capitalBeforeKrw, 2),
            capitalAfterKrw: round(capitalAfterKrw, 2),
            exitReason,
        });

        openPosition = null;
    };

    for (let i = 0; i < candles.length; i += 1) {
        const candle = candles[i];
        const entrySignal = useTouchTrigger ? candle.high >= entryThreshold : candle.close >= entryThreshold;
        const exitSignal = useTouchTrigger ? candle.low <= exitThreshold : candle.close <= exitThreshold;

        if (!openPosition && entrySignal) {
            const entryPremium = useThresholdFill ? entryThreshold : candle.close;
            openPosition = {
                entryIndex: i,
                entryTimestamp: candle.timestamp,
                entryPremium,
            };
            continue;
        }

        if (openPosition && exitSignal) {
            const exitPremium = useThresholdFill ? exitThreshold : candle.close;
            closePosition(i, 'threshold', exitPremium);
        }
    }

    if (openPosition && forceCloseAtEnd) {
        closePosition(candles.length - 1, 'forced-close');
    }

    const totalProfitKrw = capitalKrw - initialCapitalKrw;
    const totalReturnPct = initialCapitalKrw > 0
        ? (totalProfitKrw / initialCapitalKrw) * 100
        : 0;
    const winCount = trades.filter((trade) => trade.profitKrw > 0).length;
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;
    const avgTradeReturnPct = trades.length > 0
        ? trades.reduce((sum, trade) => sum + trade.netReturnPct, 0) / trades.length
        : 0;

    return {
        finalCapitalKrw: capitalKrw,
        totalProfitKrw,
        totalReturnPct,
        tradeCount: trades.length,
        winRate,
        avgTradeReturnPct,
        maxDrawdownPct,
        openPosition: openPosition
            ? {
                entryTimestamp: openPosition.entryTimestamp,
                entryPremium: round(openPosition.entryPremium, 4),
            }
            : null,
        trades,
    };
}

restoreRuntimeExecutionCredentialsFromDisk();
restoreExecutionEngineStateFromDisk();
loadPremiumHistoryFromDisk();

app.get('/api/ticker', async (req, res) => {
    const startedAt = Date.now();
    try {
        const [globalTicker, fxRate, bithumbPrice, bithumbUsdt] = await Promise.all([
            fetchGlobalBtcUsdt(),
            getUsdKrwRate(),
            fetchBithumbBtcKrw(),
            fetchBithumbUsdtKrw().catch(() => null),
        ]);

        // Primary domestic price: Bithumb only
        const krwPrice = bithumbPrice;
        const domesticSource = 'bithumb:BTC_KRW';

        const usdPrice = globalTicker.price;
        const exchangeRate = fxRate.usdKrw;
        const usdtKrwRate =
            Number.isFinite(toFiniteNumber(bithumbUsdt)) && Number(bithumbUsdt) > 0
                ? Number(bithumbUsdt)
                : exchangeRate;
        const conversionSource = Number.isFinite(toFiniteNumber(bithumbUsdt))
            ? 'bithumb:USDT_KRW'
            : fxRate.source;

        // Primary kimchi premium: USD/KRW (real market premium, matches Korean crypto sites)
        const normalizedGlobalKrwPrice = usdPrice * exchangeRate;
        const kimchiPremiumPercent = ((krwPrice / normalizedGlobalKrwPrice) - 1) * 100;

        // Effective USDT premium: USDT/KRW (actual arbitrage gap after USDT premium)
        const usdtConversionRate = usdtKrwRate > 0 ? usdtKrwRate : exchangeRate;
        const normalizedGlobalKrwPriceUsdt = usdPrice * usdtConversionRate;
        const kimchiPremiumPercentUsdt = ((krwPrice / normalizedGlobalKrwPriceUsdt) - 1) * 100;

        // USDT premium vs USD (shows how much premium USDT itself carries in Korea)
        const usdtPremiumPercent = usdtKrwRate > 0 ? ((usdtKrwRate / exchangeRate) - 1) * 100 : 0;

        const payload = {
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
                domestic: domesticSource,
                global: globalTicker.source,
                fx: fxRate.source,
                conversion: conversionSource,
            },
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_ticker_success', {
            durationMs: Date.now() - startedAt,
            globalSource: globalTicker.source,
            fxSource: fxRate.source,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error('Proxy fetch error:', message);
        recordRuntimeEvent('error', 'api_ticker_failure', {
            durationMs: Date.now() - startedAt,
            error: message,
        });
        res.status(500).json({ error: `Failed to fetch live market data: ${message}` });
    }
});

app.get('/api/premium-candles', async (req, res) => {
    const startedAt = Date.now();
    res.status(410).json({
        error: 'Upbit 기반 프리미엄 캔들 기능이 비활성화되었습니다.',
        code: 'upbit_disabled',
        timestamp: Date.now(),
    });
    recordRuntimeEvent('warn', 'api_premium_candles_disabled', {
        durationMs: Date.now() - startedAt,
    });
    return;
    try {
        const interval = normalizeInterval(req.query.interval);
        const config = CANDLE_INTERVAL_CONFIG[interval];
        const limit = parseLimit(req.query.limit, config.defaultLimit, config.maxLimit);
        const premiumBasis = normalizePremiumBasis(req.query.premiumBasis);
        const { payload, fromCache } = await getPremiumCandlePayload(interval, limit);
        let candles = payload.candles;
        let usdKrwRateApplied = null;
        let usdKrwRateRange = null;
        let usdKrwHistoryCoverage = null;

        if (premiumBasis === 'USD') {
            const firstCandleTimestamp = candles[0]?.timestamp;
            const lastCandleTimestamp = candles[candles.length - 1]?.timestamp;
            if (!Number.isFinite(firstCandleTimestamp) || !Number.isFinite(lastCandleTimestamp)) {
                throw new Error('No candle timestamps available for USD basis conversion');
            }

            const usdDailyRates = await getUsdKrwDailyRatesForRange(
                firstCandleTimestamp,
                lastCandleTimestamp
            );
            usdKrwRateApplied =
                Number.isFinite(usdDailyRates.latestRate) ? round(usdDailyRates.latestRate, 4) : null;
            usdKrwRateRange =
                Number.isFinite(usdDailyRates.minRate) && Number.isFinite(usdDailyRates.maxRate)
                    ? {
                        min: round(usdDailyRates.minRate, 4),
                        max: round(usdDailyRates.maxRate, 4),
                    }
                    : null;
            usdKrwHistoryCoverage = {
                source: usdDailyRates.source,
                dayCount: usdDailyRates.dayCount,
                carryForwardFilled: usdDailyRates.carryForwardFilled,
                carryBackwardFilled: usdDailyRates.carryBackwardFilled,
                fallbackFilled: usdDailyRates.fallbackFilled,
            };
            candles = convertPremiumCandleOhlcSeriesForBasis(candles, premiumBasis, {
                usdKrwRateByDay: usdDailyRates.rateByDay,
            });
        }

        if (!candles.length) {
            throw new Error('No premium candles available after basis conversion');
        }

        const responsePayload = {
            ...payload,
            premiumBasis,
            usdKrwRateApplied,
            usdKrwRateRange,
            usdKrwHistoryCoverage,
            candles,
            sources: {
                ...payload.sources,
                conversion:
                    premiumBasis === 'USD'
                        ? usdKrwHistoryCoverage?.source ?? payload.sources.fxFallback
                        : payload.sources.conversion,
            },
        };

        res.json(responsePayload);
        recordRuntimeEvent('info', fromCache ? 'api_premium_candles_cache_hit' : 'api_premium_candles_success', {
            durationMs: Date.now() - startedAt,
            interval,
            limit,
            premiumBasis,
            cacheAgeMs: payload.cache?.ageMs ?? 0,
            globalSource: payload?.sources?.global ?? 'unknown',
            candleCount: Array.isArray(candles) ? candles.length : 0,
            storedHistoryCandles: payload?.history?.storedCandles ?? null,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error('Premium candle fetch error:', message);
        recordRuntimeEvent('error', 'api_premium_candles_failure', {
            durationMs: Date.now() - startedAt,
            interval: normalizeInterval(req.query.interval),
            error: message,
        });
        res.status(500).json({
            error: `Failed to fetch premium candles: ${message}`,
        });
    }
});

app.get('/api/backtest/premium', async (req, res) => {
    const startedAt = Date.now();
    res.status(410).json({
        error: 'Upbit 기반 프리미엄 백테스트 기능이 비활성화되었습니다.',
        code: 'upbit_disabled',
        timestamp: Date.now(),
    });
    recordRuntimeEvent('warn', 'api_backtest_premium_disabled', {
        durationMs: Date.now() - startedAt,
    });
    return;
    try {
        const interval = normalizeInterval(req.query.interval);
        const config = CANDLE_INTERVAL_CONFIG[interval];
        const limit = parseLimit(req.query.limit, config.defaultLimit, config.maxLimit);
        const entryThreshold = parseNumber(req.query.entryThreshold, 2.0, -20, 40);
        const exitThreshold = parseNumber(req.query.exitThreshold, 0.0, -20, 40);
        const leverage = parsePositiveNumber(req.query.leverage, 1, 0.1, 10);
        const initialCapitalKrw = parsePositiveNumber(
            req.query.initialCapitalKrw,
            10_000_000,
            100_000,
            100_000_000_000
        );
        const feeBps = parseNumber(req.query.feeBps, 6, 0, 200);
        const slippageBps = parseNumber(req.query.slippageBps, 2, 0, 200);
        const forceCloseAtEnd = parseBoolean(req.query.forceCloseAtEnd, true);
        const useStoredData = parseBoolean(req.query.useStoredData, true);
        const premiumBasis = normalizePremiumBasis(req.query.premiumBasis);
        const triggerMode = normalizeBacktestTriggerMode(req.query.triggerMode);
        const fillAtThreshold = parseBoolean(req.query.fillAtThreshold, true);
        const chartMaxPoints = Math.floor(
            parseNumber(req.query.chartMaxPoints, defaultBacktestChartPoints, 200, 10_000)
        );
        const startTimeQuery = parseTimestampQuery(req.query.startTime);
        const endTimeQuery = parseTimestampQuery(req.query.endTime);
        const hasRequestedRange = startTimeQuery.provided || endTimeQuery.provided;

        if (!startTimeQuery.valid || !endTimeQuery.valid) {
            recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                durationMs: Date.now() - startedAt,
                reason: 'invalid_timestamp',
                startTime: startTimeQuery.raw,
                endTime: endTimeQuery.raw,
            });
            res.status(400).json({
                error: 'startTime/endTime must be unix ms timestamp or ISO date string',
            });
            return;
        }

        const requestedStartTime = startTimeQuery.value;
        const requestedEndTime = endTimeQuery.value;

        if (
            Number.isFinite(requestedStartTime) &&
            Number.isFinite(requestedEndTime) &&
            requestedStartTime > requestedEndTime
        ) {
            recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                durationMs: Date.now() - startedAt,
                reason: 'start_after_end',
                startTime: requestedStartTime,
                endTime: requestedEndTime,
            });
            res.status(400).json({
                error: 'startTime must be less than or equal to endTime',
            });
            return;
        }

        if (entryThreshold <= exitThreshold) {
            recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                durationMs: Date.now() - startedAt,
                entryThreshold,
                exitThreshold,
            });
            res.status(400).json({
                error: 'entryThreshold must be greater than exitThreshold',
            });
            return;
        }

        let premiumPayload = null;
        let fromCache = false;
        let candles = [];
        let dataSource = 'live-fetch';
        let rangeBackfill = null;
        let usdKrwRateApplied = null;
        let usdKrwRateRange = null;
        let usdKrwHistoryCoverage = null;

        if (useStoredData) {
            const warmupLimit = Math.max(config.defaultLimit, limit);
            const { payload, fromCache: fromWarmupCache } = await getPremiumCandlePayload(
                interval,
                Math.min(config.maxLimit, warmupLimit)
            );
            premiumPayload = payload;
            fromCache = fromWarmupCache;
            dataSource = 'stored-history';
            candles = selectPremiumHistoryCandles({
                interval,
                startTime: requestedStartTime,
                endTime: requestedEndTime,
                limit: hasRequestedRange ? null : limit,
            });

            if (hasRequestedRange) {
                const coverage = getPremiumHistoryCoverage(interval);
                const isStartCovered =
                    !Number.isFinite(requestedStartTime) ||
                    (Number.isFinite(coverage.earliestTimestamp) &&
                        coverage.earliestTimestamp <= requestedStartTime);
                const isEndCovered =
                    !Number.isFinite(requestedEndTime) ||
                    (Number.isFinite(coverage.latestTimestamp) &&
                        coverage.latestTimestamp >= requestedEndTime);
                const needsBackfill = !candles.length || !isStartCovered || !isEndCovered;

                if (needsBackfill) {
                    try {
                        rangeBackfill = await backfillPremiumHistoryRange({
                            interval,
                            startTime: requestedStartTime,
                            endTime: requestedEndTime,
                        });
                    } catch (error) {
                        const message = toErrorMessage(error);
                        const isRangeTooLarge = message.includes('Requested range is too large');
                        recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                            durationMs: Date.now() - startedAt,
                            reason: isRangeTooLarge
                                ? 'requested_range_too_large'
                                : 'range_backfill_failed',
                            interval,
                            startTime: requestedStartTime ?? null,
                            endTime: requestedEndTime ?? null,
                            maxBacktestRangeCandles,
                            error: message,
                        });
                        res.status(isRangeTooLarge ? 400 : 500).json({
                            error: isRangeTooLarge
                                ? `${message}. 기간을 줄이거나 더 큰 봉(예: 30m/1d)을 사용해 주세요.`
                                : `Failed to backfill requested range: ${message}`,
                            maxBacktestRangeCandles,
                            interval,
                        });
                        return;
                    }

                    candles = selectPremiumHistoryCandles({
                        interval,
                        startTime: requestedStartTime,
                        endTime: requestedEndTime,
                        limit: null,
                    });
                }
            }

            if (!candles.length) {
                const historyCoverage = getPremiumHistoryCoverage(interval);
                recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                    durationMs: Date.now() - startedAt,
                    reason: 'no_stored_history_in_range',
                    interval,
                    startTime: requestedStartTime,
                    endTime: requestedEndTime,
                    storedCandles: historyCoverage.storedCandles,
                });
                res.status(400).json({
                    error: 'No stored candles for the requested range',
                    historyCoverage,
                });
                return;
            }
        } else {
            const { payload, fromCache: fromLiveCache } = await getPremiumCandlePayload(interval, limit);
            premiumPayload = payload;
            fromCache = fromLiveCache;
            candles = payload.candles;

            if (hasRequestedRange) {
                candles = candles.filter((candle) => {
                    if (Number.isFinite(requestedStartTime) && candle.timestamp < requestedStartTime) return false;
                    if (Number.isFinite(requestedEndTime) && candle.timestamp > requestedEndTime) return false;
                    return true;
                });

                if (!candles.length) {
                    recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                        durationMs: Date.now() - startedAt,
                        reason: 'no_live_candles_in_range',
                        interval,
                        startTime: requestedStartTime,
                        endTime: requestedEndTime,
                    });
                    res.status(400).json({
                        error: 'No live candles for the requested range',
                    });
                    return;
                }
            }
        }

        if (premiumBasis === 'USD') {
            const firstCandleTimestamp = candles[0]?.timestamp;
            const lastCandleTimestamp = candles[candles.length - 1]?.timestamp;
            if (!Number.isFinite(firstCandleTimestamp) || !Number.isFinite(lastCandleTimestamp)) {
                throw new Error('No candle timestamps available for USD basis conversion');
            }

            const usdDailyRates = await getUsdKrwDailyRatesForRange(
                firstCandleTimestamp,
                lastCandleTimestamp
            );
            usdKrwRateApplied =
                Number.isFinite(usdDailyRates.latestRate) ? round(usdDailyRates.latestRate, 4) : null;
            usdKrwRateRange =
                Number.isFinite(usdDailyRates.minRate) && Number.isFinite(usdDailyRates.maxRate)
                    ? {
                        min: round(usdDailyRates.minRate, 4),
                        max: round(usdDailyRates.maxRate, 4),
                    }
                    : null;
            usdKrwHistoryCoverage = {
                source: usdDailyRates.source,
                dayCount: usdDailyRates.dayCount,
                carryForwardFilled: usdDailyRates.carryForwardFilled,
                carryBackwardFilled: usdDailyRates.carryBackwardFilled,
                fallbackFilled: usdDailyRates.fallbackFilled,
            };
            candles = convertPremiumCandlesForBasis(candles, premiumBasis, {
                usdKrwRateByDay: usdDailyRates.rateByDay,
            });
        }

        if (!candles.length) {
            recordRuntimeEvent('warn', 'api_backtest_premium_validation_failed', {
                durationMs: Date.now() - startedAt,
                reason: 'no_candles_after_basis_conversion',
                interval,
                premiumBasis,
            });
            res.status(400).json({
                error: 'No candles available after premium basis conversion',
            });
            return;
        }

        const backtest = runPremiumBacktest({
            candles,
            entryThreshold,
            exitThreshold,
            leverage,
            initialCapitalKrw,
            feeBps,
            slippageBps,
            forceCloseAtEnd,
            triggerMode,
            fillAtThreshold,
        });
        const historyCoverage = getPremiumHistoryCoverage(interval);
        const closeValues = candles
            .map((candle) => toFiniteNumber(candle?.close))
            .filter((value) => Number.isFinite(value));
        const premiumRange =
            closeValues.length > 0
                ? {
                    minClose: round(Math.min(...closeValues), 4),
                    maxClose: round(Math.max(...closeValues), 4),
                }
                : null;
        const rawPremiumSeries = candles.map((candle) => ({
            timestamp: candle.timestamp,
            close: round(candle.close, 4),
        }));
        const preserveTimestamps = new Set();
        for (const trade of backtest.trades) {
            preserveTimestamps.add(trade.entryTimestamp);
            preserveTimestamps.add(trade.exitTimestamp);
        }
        const premiumSeries = downsamplePremiumSeries(
            rawPremiumSeries,
            chartMaxPoints,
            preserveTimestamps
        );

        const payload = {
            generatedAt: Date.now(),
            interval,
            limit,
            candleCount: candles.length,
            premiumBasis,
            usdKrwRateApplied,
            usdKrwRateRange,
            usdKrwHistoryCoverage,
            premiumRange,
            periodStart: candles[0]?.timestamp ?? null,
            periodEnd: candles[candles.length - 1]?.timestamp ?? null,
            entryThreshold: round(entryThreshold, 4),
            exitThreshold: round(exitThreshold, 4),
            triggerMode,
            fillAtThreshold,
            leverage: round(leverage, 4),
            feeBps: round(feeBps, 4),
            slippageBps: round(slippageBps, 4),
            initialCapitalKrw: round(initialCapitalKrw, 2),
            finalCapitalKrw: round(backtest.finalCapitalKrw, 2),
            totalProfitKrw: round(backtest.totalProfitKrw, 2),
            totalReturnPct: round(backtest.totalReturnPct, 4),
            tradeCount: backtest.tradeCount,
            winRate: round(backtest.winRate, 4),
            avgTradeReturnPct: round(backtest.avgTradeReturnPct, 4),
            maxDrawdownPct: round(backtest.maxDrawdownPct, 4),
            openPosition: backtest.openPosition,
            dataSource,
            requestedStartTime: requestedStartTime ?? null,
            requestedEndTime: requestedEndTime ?? null,
            historyCoverage,
            rangeBackfill,
            chartMaxPoints,
            premiumSeriesRawCount: rawPremiumSeries.length,
            premiumSeriesDisplayCount: premiumSeries.length,
            premiumSeries,
            sources: {
                domestic: premiumPayload.sources.domestic,
                global: premiumPayload.sources.global,
                conversion: premiumPayload.sources.conversion,
                fxFallback: premiumPayload.sources.fxFallback,
            },
            trades: backtest.trades,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_backtest_premium_success', {
            durationMs: Date.now() - startedAt,
            interval,
            limit,
            candlesFromCache: fromCache,
            dataSource,
            candleCount: candles.length,
            premiumBasis,
            triggerMode,
            fillAtThreshold,
            usdKrwRateApplied,
            usdKrwRateRange,
            requestedStartTime: requestedStartTime ?? null,
            requestedEndTime: requestedEndTime ?? null,
            rangeBackfillAdded: rangeBackfill?.added ?? 0,
            rangeBackfillUpdated: rangeBackfill?.updated ?? 0,
            premiumSeriesRawCount: rawPremiumSeries.length,
            premiumSeriesDisplayCount: premiumSeries.length,
            chartMaxPoints,
            tradeCount: backtest.tradeCount,
            totalReturnPct: round(backtest.totalReturnPct, 4),
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error('Premium backtest error:', message);
        recordRuntimeEvent('error', 'api_backtest_premium_failure', {
            durationMs: Date.now() - startedAt,
            interval: normalizeInterval(req.query.interval),
            error: message,
        });
        res.status(500).json({
            error: `Failed to run premium backtest: ${message}`,
        });
    }
});

app.get('/api/top-volume-funding', async (req, res) => {
    const startedAt = Date.now();
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

        const payload = {
            generatedAt: Date.now(),
            source: topSymbolsResult.source,
            limit,
            positionSide: side,
            positionNotionalUsdt: round(positionNotionalUsdt, 6),
            fundingIntervalHours: round(fundingIntervalHours, 4),
            usdtKrwRate: round(usdtKrwRate, 4),
            symbols,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_top_funding_success', {
            durationMs: Date.now() - startedAt,
            source: topSymbolsResult.source,
            limit,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error('Top funding fetch error:', message);
        recordRuntimeEvent('error', 'api_top_funding_failure', {
            durationMs: Date.now() - startedAt,
            error: message,
        });
        res.status(500).json({
            error: `Failed to fetch top funding symbols: ${message}`,
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
    const startedAt = Date.now();
    res.status(410).json({
        error: 'Upbit 기반 멀티 프리미엄 기능이 비활성화되었습니다.',
        code: 'upbit_disabled',
        timestamp: Date.now(),
    });
    recordRuntimeEvent('warn', 'api_multi_premium_disabled', {
        durationMs: Date.now() - startedAt,
    });
    return;
    try {
        const limit = parseLimit(req.query.limit, 20, 30);

        // Step 1: Get available Upbit KRW markets
        const allMarkets = await fetchJson('https://api.upbit.com/v1/market/all?isDetails=false', {
            context: 'upbit-market-all',
        });
        if (!Array.isArray(allMarkets)) throw new Error('Cannot fetch Upbit markets');

        const krwSet = new Set(allMarkets
            .filter((m) => typeof m?.market === 'string' && m.market.startsWith('KRW-'))
            .map((m) => m.market.replace('KRW-', '')));

        // Step 2: Filter target coins to only valid Upbit markets
        const validCoins = MULTI_PREMIUM_COINS.filter((s) => krwSet.has(s));
        const upbitMarkets = [...validCoins.map((s) => `KRW-${s}`), 'KRW-USDT'].join(',');

        const [upbitData, globalSpotResult, fxRate] = await Promise.all([
            fetchJson(`https://api.upbit.com/v1/ticker?markets=${upbitMarkets}`, {
                context: 'upbit-multi-ticker',
            }),
            fetchGlobalSpotPriceMap(),
            getUsdKrwRate(),
        ]);

        if (!Array.isArray(upbitData)) throw new Error('Invalid Upbit multi-ticker response');

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

        const usdKrw = fxRate.usdKrw;
        const effectiveUsdtKrw = usdtKrw > 0 ? usdtKrw : usdKrw;
        const usdtPremiumPercent = usdtKrw > 0 ? ((usdtKrw / usdKrw) - 1) * 100 : 0;

        // Calculate premiums for each matched coin
        const coins = [];
        for (const symbol of MULTI_PREMIUM_COINS) {
            const upbit = upbitMap.get(symbol);
            const globalPrice = globalSpotResult.prices.get(symbol);
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
        if (!result.length) {
            throw new Error(`No matched symbols for multi-premium (${globalSpotResult.source})`);
        }

        const payload = {
            timestamp: Date.now(),
            usdKrw: round(usdKrw, 4),
            usdtKrw: round(effectiveUsdtKrw, 4),
            usdtPremiumPercent: round(usdtPremiumPercent, 4),
            fxSource: fxRate.source,
            globalSource: globalSpotResult.source,
            count: result.length,
            coins: result,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_multi_premium_success', {
            durationMs: Date.now() - startedAt,
            limit,
            coinCount: result.length,
            globalSource: globalSpotResult.source,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        console.error('Multi-premium fetch error:', message);
        recordRuntimeEvent('error', 'api_multi_premium_failure', {
            durationMs: Date.now() - startedAt,
            error: message,
        });
        res.status(500).json({
            error: `Failed to fetch multi-coin premiums: ${message}`,
        });
    }
});

function normalizeExecutionWalletBalances(balance, balanceLimit = 8) {
    const totalMap =
        balance?.total && typeof balance.total === 'object'
            ? balance.total
            : {};
    const freeMap =
        balance?.free && typeof balance.free === 'object'
            ? balance.free
            : {};
    const usedMap =
        balance?.used && typeof balance.used === 'object'
            ? balance.used
            : {};

    const rows = [];

    for (const [asset, totalRaw] of Object.entries(totalMap)) {
        const total = toFiniteNumber(totalRaw);
        const free = toFiniteNumber(freeMap?.[asset]);
        const used = toFiniteNumber(usedMap?.[asset]);
        const hasValue =
            (Number.isFinite(total) && Math.abs(total) > 1e-12) ||
            (Number.isFinite(free) && Math.abs(free) > 1e-12) ||
            (Number.isFinite(used) && Math.abs(used) > 1e-12);

        if (!hasValue) continue;

        rows.push({
            asset,
            free: toNullableRounded(free, 8),
            used: toNullableRounded(used, 8),
            total: toNullableRounded(total, 8),
        });
    }

    rows.sort((a, b) => {
        const aTotalAbs = Math.abs(toFiniteNumber(a.total) ?? 0);
        const bTotalAbs = Math.abs(toFiniteNumber(b.total) ?? 0);
        return bTotalAbs - aTotalAbs;
    });

    return rows.slice(0, balanceLimit);
}

function normalizeExecutionPositions(positions) {
    if (!Array.isArray(positions)) return [];

    const normalized = positions
        .map((position) => {
            const contracts = toFiniteNumber(position?.contracts);
            if (!Number.isFinite(contracts) || Math.abs(contracts) <= 1e-12) return null;

            return {
                symbol:
                    typeof position?.symbol === 'string'
                        ? position.symbol
                        : '',
                side:
                    typeof position?.side === 'string'
                        ? position.side
                        : null,
                contracts: toNullableRounded(contracts, 8),
                contractSize: toNullableRounded(position?.contractSize, 8),
                notional: toNullableRounded(position?.notional, 4),
                leverage: toNullableRounded(position?.leverage, 4),
                entryPrice: toNullableRounded(position?.entryPrice, 4),
                markPrice: toNullableRounded(position?.markPrice, 4),
                unrealizedPnl: toNullableRounded(position?.unrealizedPnl, 8),
                liquidationPrice: toNullableRounded(position?.liquidationPrice, 4),
                marginMode:
                    typeof position?.marginMode === 'string'
                        ? position.marginMode
                        : null,
            };
        })
        .filter((position) => position !== null);

    normalized.sort((a, b) => {
        const aNotionalAbs = Math.abs(toFiniteNumber(a?.notional) ?? 0);
        const bNotionalAbs = Math.abs(toFiniteNumber(b?.notional) ?? 0);
        return bNotionalAbs - aNotionalAbs;
    });

    return normalized;
}

app.get('/api/auth/session', (req, res) => {
    res.json({
        timestamp: Date.now(),
        auth: getExecutionAuthSessionSummary(req),
    });
});

app.post('/api/auth/login', (req, res) => {
    if (!isExecutionPasswordAuthEnabled()) {
        res.status(400).json({
            error: 'Password login is disabled on this server',
            timestamp: Date.now(),
            auth: getExecutionAuthSessionSummary(req),
        });
        return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = parseOptionalString(body.username, 120);
    const password = parseOptionalString(body.password, 256);

    if (!username || !password) {
        res.status(400).json({
            error: 'username/password is required',
            timestamp: Date.now(),
            auth: getExecutionAuthSessionSummary(req),
        });
        return;
    }

    if (username !== executionAuthUsername || password !== executionAuthPassword) {
        res.status(401).json({
            error: 'Invalid username or password',
            timestamp: Date.now(),
            auth: getExecutionAuthSessionSummary(req),
        });
        return;
    }

    const previousSessionId = getExecutionAuthSessionIdFromRequest(req);
    if (previousSessionId) {
        revokeExecutionAuthSession(previousSessionId);
    }

    const sessionId = createExecutionAuthSession(username);
    setExecutionAuthCookie(res, req, sessionId, executionAuthSessionTtlMs);

    res.json({
        timestamp: Date.now(),
        auth: {
            enabled: isExecutionApiAuthEnabled(),
            tokenEnabled: isExecutionAdminAuthEnabled(),
            passwordEnabled: isExecutionPasswordAuthEnabled(),
            authenticated: true,
            username,
            expiresAt: Date.now() + executionAuthSessionTtlMs,
        },
    });
});

app.post('/api/auth/logout', (req, res) => {
    const sessionId = getExecutionAuthSessionIdFromRequest(req);
    if (sessionId) {
        revokeExecutionAuthSession(sessionId);
    }
    clearExecutionAuthCookie(res, req);

    res.json({
        timestamp: Date.now(),
        auth: {
            enabled: isExecutionApiAuthEnabled(),
            tokenEnabled: isExecutionAdminAuthEnabled(),
            passwordEnabled: isExecutionPasswordAuthEnabled(),
            authenticated: false,
            username: null,
            expiresAt: null,
        },
    });
});

app.use('/api/execution', requireExecutionAdminAuth);
app.use('/api/discord', requireExecutionAdminAuth);

app.get('/api/execution/credentials/status', (req, res) => {
    res.json({
        timestamp: Date.now(),
        credentials: getExecutionCredentialsStatusSummary(),
    });
});

app.post('/api/execution/credentials', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const apiKey = parseOptionalString(body.apiKey, 256);
    const apiSecret = parseOptionalString(body.apiSecret, 256);
    const bithumbApiKey = parseOptionalString(body.bithumbApiKey, 256);
    const bithumbApiSecret = parseOptionalString(body.bithumbApiSecret, 256);
    const persist = parseBoolean(body.persist, true);

    const hasNewBinance = !!(apiKey && apiSecret);
    const hasNewBithumb = !!(bithumbApiKey && bithumbApiSecret);

    if (!hasNewBinance && !hasNewBithumb) {
        res.status(400).json({
            error: 'apiKey/apiSecret or bithumbApiKey/bithumbApiSecret is required',
            timestamp: Date.now(),
            credentials: getExecutionCredentialsStatusSummary(),
        });
        return;
    }

    if (executionEngineState.running && !executionEngineState.dryRun) {
        res.status(409).json({
            error: 'Cannot update credentials while live execution engine is running',
            timestamp: Date.now(),
            credentials: getExecutionCredentialsStatusSummary(),
            engine: getExecutionEngineSnapshot(),
        });
        return;
    }

    try {
        setRuntimeExecutionCredentials({
            apiKey,
            apiSecret,
            bithumbApiKey,
            bithumbApiSecret,
            persist,
            reason: 'api-set',
        });
        res.json({
            timestamp: Date.now(),
            credentials: getExecutionCredentialsStatusSummary(),
        });
    } catch (error) {
        const message = toErrorMessage(error);
        res.status(500).json({
            error: `Failed to set runtime execution credentials: ${message}`,
            timestamp: Date.now(),
            credentials: getExecutionCredentialsStatusSummary(),
        });
    }
});

app.post('/api/execution/credentials/clear', (req, res) => {
    if (executionEngineState.running && !executionEngineState.dryRun) {
        res.status(409).json({
            error: 'Cannot clear credentials while live execution engine is running',
            timestamp: Date.now(),
            credentials: getExecutionCredentialsStatusSummary(),
            engine: getExecutionEngineSnapshot(),
        });
        return;
    }

    clearRuntimeExecutionCredentials('api-clear');
    res.json({
        timestamp: Date.now(),
        credentials: getExecutionCredentialsStatusSummary(),
    });
});

// --- Discord Config API ---

// Restore discord config from .runtime on startup
try {
    if (fs.existsSync(discordConfigStateFile)) {
        const saved = JSON.parse(fs.readFileSync(discordConfigStateFile, 'utf8'));
        if (typeof saved.webhookUrl === 'string' && saved.webhookUrl.trim()) {
            discordWebhookUrl = saved.webhookUrl.trim();
        }
        if (saved.notifications && typeof saved.notifications === 'object') {
            const n = saved.notifications;
            if (typeof n.premiumAlertEnabled === 'boolean') discordNotificationSettings.premiumAlertEnabled = n.premiumAlertEnabled;
            // Migration: legacy high/low → thresholds array
            if (Array.isArray(n.premiumAlertThresholds)) {
                discordNotificationSettings.premiumAlertThresholds = n.premiumAlertThresholds
                    .filter(t => t && Number.isFinite(Number(t.value)))
                    .slice(0, 10)
                    .map(t => ({
                        id: typeof t.id === 'string' && t.id ? t.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        value: Number(t.value),
                    }));
            } else if (Number.isFinite(Number(n.premiumAlertThresholdHigh)) || Number.isFinite(Number(n.premiumAlertThresholdLow))) {
                const migrated = [];
                if (Number.isFinite(Number(n.premiumAlertThresholdHigh))) {
                    migrated.push({ id: 'default-high', value: Number(n.premiumAlertThresholdHigh) });
                }
                if (Number.isFinite(Number(n.premiumAlertThresholdLow))) {
                    migrated.push({ id: 'default-low', value: Number(n.premiumAlertThresholdLow) });
                }
                discordNotificationSettings.premiumAlertThresholds = migrated;
            }
            if (typeof n.periodicReportEnabled === 'boolean') discordNotificationSettings.periodicReportEnabled = n.periodicReportEnabled;
            if (Number.isFinite(Number(n.reportIntervalMinutes)) && Number(n.reportIntervalMinutes) >= 10) discordNotificationSettings.reportIntervalMinutes = Number(n.reportIntervalMinutes);
        }
    }
} catch (e) {
    console.warn('Failed to restore discord config:', e.message);
}

function getDiscordNotificationSettingsSummary() {
    return {
        premiumAlertEnabled: discordNotificationSettings.premiumAlertEnabled,
        premiumAlertThresholds: discordNotificationSettings.premiumAlertThresholds,
        periodicReportEnabled: discordNotificationSettings.periodicReportEnabled,
        reportIntervalMinutes: discordNotificationSettings.reportIntervalMinutes,
    };
}

function persistDiscordConfig() {
    try {
        if (!fs.existsSync(runtimeStateDir)) fs.mkdirSync(runtimeStateDir, { recursive: true });
        fs.writeFileSync(discordConfigStateFile, JSON.stringify({
            webhookUrl: discordWebhookUrl,
            notifications: getDiscordNotificationSettingsSummary(),
            updatedAt: Date.now(),
        }), 'utf8');
    } catch (e) {
        console.error('Failed to persist discord config:', e.message);
    }
}

function restartDiscordPeriodicReportTimer() {
    if (discordPeriodicReportTimer) {
        clearInterval(discordPeriodicReportTimer);
        discordPeriodicReportTimer = null;
    }

    if (!discordWebhookUrl || !discordNotificationSettings.periodicReportEnabled) {
        return;
    }

    const intervalMs = Math.max(10, discordNotificationSettings.reportIntervalMinutes) * 60 * 1000;

    discordPeriodicReportTimer = setInterval(async () => {
        if (!discordWebhookUrl || !discordNotificationSettings.periodicReportEnabled) return;

        try {
            const snapshot = await fetchExecutionEngineMarketSnapshot();
            const running = executionEngineState.running;
            const posState = executionEngineState.positionState;
            const marketFields = buildDiscordMarketCoreFields(snapshot, {
                premiumLabel: '김치프리미엄(USD)',
                premiumValue: snapshot.kimchiPremiumPercent,
                includePremium: true,
                includeUsdtPremium: true,
            });

            // 정기 보고는 쿨다운 무시
            lastDiscordNotificationAt = 0;
            void sendDiscordNotification({
                title: '📊 김프 정기 보고',
                description: '현재 BTC 김치프리미엄 현황',
                color: 0x6366f1,
                fields: [
                    ...marketFields,
                    { name: '엔진', value: running ? `🟢 ${posState}` : '⏹️ 정지' },
                ],
            });
        } catch (err) {
            console.error(`Discord periodic report failed: ${toErrorMessage(err)}`);
        }
    }, intervalMs);
}

function handlePremiumThresholdAlerts({ marketSnapshot, premiumValue, previousPremium }) {
    if (
        !discordWebhookUrl ||
        !discordNotificationSettings.premiumAlertEnabled ||
        !Number.isFinite(premiumValue) ||
        !Number.isFinite(previousPremium) ||
        !Array.isArray(discordNotificationSettings.premiumAlertThresholds)
    ) {
        return;
    }

    const now = Date.now();
    for (const threshold of discordNotificationSettings.premiumAlertThresholds) {
        if (!threshold || !Number.isFinite(threshold.value)) continue;
        const tv = threshold.value;
        const crossedAbove = previousPremium < tv && premiumValue >= tv;
        const crossedBelow = previousPremium > tv && premiumValue <= tv;

        // Notify only on upward crossing of threshold.
        const aboveKey = `${threshold.id}:above`;
        if (crossedAbove && now - (lastPremiumAlertAtMap[aboveKey] || 0) >= PREMIUM_ALERT_COOLDOWN_MS) {
            lastPremiumAlertAtMap[aboveKey] = now;
            const savedCooldown = lastDiscordNotificationAt;
            lastDiscordNotificationAt = 0;
            const marketFields = buildDiscordMarketCoreFields(marketSnapshot, {
                premiumLabel: executionEngineState.premiumBasis === 'USDT' ? '김치프리미엄(USDT)' : '김치프리미엄(USD)',
                premiumValue,
                includePremium: true,
                includeUsdtPremium: true,
            });
            void sendDiscordNotification({
                title: `🔺 김프 ${round(tv, 2)}% 이상 (${round(premiumValue, 2)}%)`,
                description: `김프가 ${round(tv, 2)}%를 돌파했습니다.`,
                color: 0xef4444,
                fields: marketFields,
            }).then(() => { lastDiscordNotificationAt = savedCooldown; });
        }

        // Notify only on downward crossing of threshold.
        const belowKey = `${threshold.id}:below`;
        if (crossedBelow && now - (lastPremiumAlertAtMap[belowKey] || 0) >= PREMIUM_ALERT_COOLDOWN_MS) {
            lastPremiumAlertAtMap[belowKey] = now;
            const savedCooldown = lastDiscordNotificationAt;
            lastDiscordNotificationAt = 0;
            const marketFields = buildDiscordMarketCoreFields(marketSnapshot, {
                premiumLabel: executionEngineState.premiumBasis === 'USDT' ? '김치프리미엄(USDT)' : '김치프리미엄(USD)',
                premiumValue,
                includePremium: true,
                includeUsdtPremium: true,
            });
            void sendDiscordNotification({
                title: `🔻 김프 ${round(tv, 2)}% 이하 (${round(premiumValue, 2)}%)`,
                description: `김프가 ${round(tv, 2)}% 이하로 내려갔습니다.`,
                color: 0x3b82f6,
                fields: marketFields,
            }).then(() => { lastDiscordNotificationAt = savedCooldown; });
        }
    }
}

function restartDiscordPremiumAlertTimer() {
    if (discordPremiumAlertTimer) {
        clearInterval(discordPremiumAlertTimer);
        discordPremiumAlertTimer = null;
    }

    // Alerts should work even if the engine is stopped.
    const intervalMs = Math.max(2000, Math.floor(executionEnginePollIntervalMs));
    discordPremiumAlertTimer = setInterval(async () => {
        if (!discordWebhookUrl || !discordNotificationSettings.premiumAlertEnabled) return;

        if (executionEngineState.running) {
            if (Number.isFinite(executionEngineState.lastPremium)) {
                lastPremiumAlertValue = executionEngineState.lastPremium;
            }
            return;
        }

        try {
            const marketSnapshot = await fetchExecutionEngineMarketSnapshot();
            const premiumValue =
                executionEngineState.premiumBasis === 'USDT'
                    ? marketSnapshot.kimchiPremiumPercentUsdt
                    : marketSnapshot.kimchiPremiumPercent;

            if (!Number.isFinite(premiumValue)) return;

            const previousPremium = Number.isFinite(lastPremiumAlertValue)
                ? lastPremiumAlertValue
                : premiumValue;
            lastPremiumAlertValue = round(premiumValue, 6);

            handlePremiumThresholdAlerts({
                marketSnapshot,
                premiumValue,
                previousPremium,
            });
        } catch (err) {
            console.error(`Discord premium alert failed: ${toErrorMessage(err)}`);
        }
    }, intervalMs);
}

app.get('/api/discord/config', (req, res) => {
    const url = discordWebhookUrl;
    const masked = url
        ? url.slice(0, 45) + '...' + url.slice(-8)
        : '';
    res.json({
        configured: url.length > 0,
        webhookUrlMasked: masked,
        notifications: getDiscordNotificationSettingsSummary(),
    });
});

app.post('/api/discord/config', express.json(), (req, res) => {
    const body = req.body ?? {};
    const { webhookUrl } = body;
    if (typeof webhookUrl !== 'string') {
        return res.status(400).json({ error: 'webhookUrl is required' });
    }

    // __KEEP__ means preserve existing webhook URL (only updating notification settings)
    if (webhookUrl.trim() !== '__KEEP__') {
        discordWebhookUrl = webhookUrl.trim();
    }

    // Update notification settings if provided
    if (body.notifications && typeof body.notifications === 'object') {
        const n = body.notifications;
        if (typeof n.premiumAlertEnabled === 'boolean') discordNotificationSettings.premiumAlertEnabled = n.premiumAlertEnabled;
        if (Array.isArray(n.premiumAlertThresholds)) {
            discordNotificationSettings.premiumAlertThresholds = n.premiumAlertThresholds
                .filter(t => t && Number.isFinite(Number(t.value)))
                .slice(0, 10)
                .map(t => ({
                    id: typeof t.id === 'string' && t.id ? t.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    value: Number(t.value),
                }));
        }
        if (typeof n.periodicReportEnabled === 'boolean') discordNotificationSettings.periodicReportEnabled = n.periodicReportEnabled;
        if (Number.isFinite(Number(n.reportIntervalMinutes)) && Number(n.reportIntervalMinutes) >= 10) {
            discordNotificationSettings.reportIntervalMinutes = Number(n.reportIntervalMinutes);
        }
    }

    persistDiscordConfig();

    // Restart periodic report timer with new settings
    restartDiscordPeriodicReportTimer();
    restartDiscordPremiumAlertTimer();

    res.json({
        configured: discordWebhookUrl.length > 0,
        message: discordWebhookUrl ? 'Discord webhook URL updated' : 'Discord webhook URL cleared',
        notifications: getDiscordNotificationSettingsSummary(),
    });
});

app.post('/api/discord/test', async (req, res) => {
    if (!discordWebhookUrl) {
        return res.status(400).json({ error: 'Discord webhook URL is not configured' });
    }

    try {
        lastDiscordNotificationAt = 0;
        const marketFields = await getDiscordMarketCoreFields();
        const result = await sendDiscordNotification({
            title: '✅ 테스트 알림',
            description: '디스코드 웹훅이 정상적으로 연결되었습니다!',
            color: 0x10b981,
            fields: [
                { name: '시간', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), inline: false },
                ...marketFields,
            ],
        });
        if (!result?.ok) {
            return res.status(502).json({
                error: `Failed to send test: ${result?.error ?? 'unknown error'}`,
            });
        }
        res.json({ success: true, message: 'Test notification sent' });
    } catch (error) {
        res.status(500).json({ error: `Failed to send test: ${toErrorMessage(error)}` });
    }
});

app.get('/api/execution/binance/status', async (req, res) => {
    const startedAt = Date.now();
    const marketType = normalizeExecutionMarketType(req.query.marketType);
    const credentialStatus = getExecutionCredentialsStatusSummary();
    const hasCredentials = credentialStatus.configured;

    if (!hasCredentials) {
        res.status(200).json({
            timestamp: Date.now(),
            connected: false,
            configured: false,
            marketType,
            testnet: binanceExecutionTestnet,
            credentialSource: credentialStatus.source,
            credentialKeyHint: credentialStatus.keyHint,
            credentialUpdatedAt: credentialStatus.updatedAt,
            credentialPersisted: credentialStatus.persisted,
            safety: getExecutionSafetySummary(),
            error: 'BINANCE_API_KEY/BINANCE_API_SECRET is not configured',
        });
        recordRuntimeEvent('warn', 'api_execution_binance_status_not_configured', {
            durationMs: Date.now() - startedAt,
            marketType,
            testnet: binanceExecutionTestnet,
        });
        return;
    }

    try {
        const client = await getBinanceExecutionClient(marketType, true);
        const [serverTime, balance] = await Promise.all([
            client.fetchTime(),
            client.fetchBalance(),
        ]);

        const balanceAsset = marketType === 'usdm' ? 'USDT' : 'BTC';
        const assetBalance = balance?.[balanceAsset] ?? {};

        const payload = {
            timestamp: Date.now(),
            connected: true,
            configured: true,
            marketType,
            testnet: binanceExecutionTestnet,
            credentialSource: credentialStatus.source,
            credentialKeyHint: credentialStatus.keyHint,
            credentialUpdatedAt: credentialStatus.updatedAt,
            credentialPersisted: credentialStatus.persisted,
            safety: getExecutionSafetySummary(),
            exchangeId: client.id,
            serverTime: Number.isFinite(serverTime) ? serverTime : null,
            balance: {
                asset: balanceAsset,
                free: toNullableRounded(assetBalance?.free, 8),
                used: toNullableRounded(assetBalance?.used, 8),
                total: toNullableRounded(assetBalance?.total, 8),
            },
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_binance_status_success', {
            durationMs: Date.now() - startedAt,
            marketType,
            testnet: binanceExecutionTestnet,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_binance_status_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            testnet: binanceExecutionTestnet,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            connected: false,
            configured: true,
            marketType,
            testnet: binanceExecutionTestnet,
            credentialSource: credentialStatus.source,
            credentialKeyHint: credentialStatus.keyHint,
            credentialUpdatedAt: credentialStatus.updatedAt,
            credentialPersisted: credentialStatus.persisted,
            safety: getExecutionSafetySummary(),
            error: `Failed to connect Binance execution API: ${message}`,
        });
    }
});

app.get('/api/execution/engine/readiness', async (req, res) => {
    const startedAt = Date.now();
    const marketType = normalizeExecutionMarketType(req.query.marketType);
    const symbol = parseExecutionSymbol(req.query.symbol, marketType);
    const mode =
        typeof req.query.mode === 'string' && req.query.mode.trim().toLowerCase() === 'dryrun'
            ? 'dryrun'
            : 'live';

    const checks = [];
    const safety = getExecutionSafetySummary();
    const credentialsConfigured = hasBinanceExecutionCredentials();
    const bithumbCredentialsConfigured = hasBithumbExecutionCredentials();

    checks.push({
        key: 'credentials_configured',
        ok: credentialsConfigured,
        severity: mode === 'dryrun' ? 'warn' : 'error',
        message: credentialsConfigured
            ? 'BINANCE_API_KEY/BINANCE_API_SECRET configured'
            : 'BINANCE_API_KEY/BINANCE_API_SECRET is not configured',
    });

    checks.push({
        key: 'bithumb_credentials_configured',
        ok: bithumbCredentialsConfigured,
        severity: mode === 'dryrun' ? 'warn' : 'error',
        message: bithumbCredentialsConfigured
            ? 'BITHUMB_API_KEY/BITHUMB_API_SECRET configured'
            : 'BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured',
    });

    checks.push({
        key: 'leader_replica_match',
        ok: isExecutionEngineLeaderReplica(),
        severity: 'error',
        message: isExecutionEngineLeaderReplica()
            ? 'leader replica check passed'
            : `leader replica mismatch (required=${executionEngineLeaderReplicaId}, current=${railwayReplicaId || 'unknown'})`,
    });

    checks.push({
        key: 'safe_mode_off',
        ok: !safety.safeMode || mode === 'dryrun',
        severity: mode === 'dryrun' ? 'warn' : 'error',
        message:
            !safety.safeMode || mode === 'dryrun'
                ? 'execution safe mode not blocking current mode'
                : 'safe mode is ON. Reset safety first for live execution',
    });

    if (mode === 'live') {
        if (binanceExecutionTestnet) {
            checks.push({
                key: 'testnet_orders_allowed',
                ok: executionAllowTestnetOrders,
                severity: 'error',
                message: executionAllowTestnetOrders
                    ? 'testnet live execution is allowed'
                    : 'EXECUTION_ALLOW_TESTNET_ORDERS is disabled',
            });
        } else {
            checks.push({
                key: 'live_orders_allowed',
                ok: executionAllowLiveOrders,
                severity: 'error',
                message: executionAllowLiveOrders
                    ? 'mainnet live execution is allowed'
                    : 'EXECUTION_ALLOW_LIVE_ORDERS is disabled',
            });
        }
    }

    checks.push({
        key: 'engine_thresholds_valid',
        ok: executionEngineState.entryThreshold > executionEngineState.exitThreshold,
        severity: 'error',
        message:
            executionEngineState.entryThreshold > executionEngineState.exitThreshold
                ? 'engine thresholds are valid'
                : 'engine entryThreshold must be greater than exitThreshold',
    });

    const orderBalancePctEntryOk =
        Number.isFinite(executionEngineState.orderBalancePctEntry) &&
        executionEngineState.orderBalancePctEntry > 0 &&
        executionEngineState.orderBalancePctEntry <= 100;
    checks.push({
        key: 'engine_order_balance_pct_entry_valid',
        ok: orderBalancePctEntryOk,
        severity: 'error',
        message: orderBalancePctEntryOk
            ? 'engine entry order balance pct is configured'
            : 'engine entry order balance pct must be between 0 and 100',
    });

    const orderBalancePctExitOk =
        Number.isFinite(executionEngineState.orderBalancePctExit) &&
        executionEngineState.orderBalancePctExit > 0 &&
        executionEngineState.orderBalancePctExit <= 100;
    checks.push({
        key: 'engine_order_balance_pct_exit_valid',
        ok: orderBalancePctExitOk,
        severity: 'error',
        message: orderBalancePctExitOk
            ? 'engine exit order balance pct is configured'
            : 'engine exit order balance pct must be between 0 and 100',
    });

    let connectivityOk = false;
    let connectivityError = null;
    try {
        const client = await getBinanceExecutionClient(marketType, mode === 'live');
        await client.fetchTime();
        if (mode === 'live') {
            await client.fetchBalance();
        }
        connectivityOk = true;
    } catch (error) {
        connectivityOk = false;
        connectivityError = toErrorMessage(error);
    }

    checks.push({
        key: 'exchange_connectivity',
        ok: connectivityOk,
        severity: mode === 'dryrun' ? 'warn' : 'error',
        message: connectivityOk
            ? 'exchange connectivity check passed'
            : `exchange connectivity check failed: ${connectivityError}`,
    });

    let bithumbConnectivityOk = false;
    let bithumbConnectivityError = null;
    if (bithumbCredentialsConfigured) {
        try {
            const client = await getBithumbExecutionClient(mode === 'live');
            await client.fetchBalance();
            bithumbConnectivityOk = true;
        } catch (error) {
            bithumbConnectivityOk = false;
            bithumbConnectivityError = toErrorMessage(error);
        }
    } else {
        bithumbConnectivityOk = false;
        bithumbConnectivityError = 'Bithumb credentials not configured';
    }

    checks.push({
        key: 'bithumb_connectivity',
        ok: bithumbConnectivityOk,
        severity: mode === 'dryrun' ? 'warn' : 'error',
        message: bithumbConnectivityOk
            ? 'bithumb connectivity check passed'
            : `bithumb connectivity check failed: ${bithumbConnectivityError}`,
    });

    const blockingFailures = checks.filter((check) => !check.ok && check.severity === 'error');

    res.json({
        timestamp: Date.now(),
        durationMs: Date.now() - startedAt,
        mode,
        marketType,
        symbol,
        testnet: binanceExecutionTestnet,
        ready: blockingFailures.length === 0,
        safety,
        engine: getExecutionEngineSnapshot(),
        checks,
    });
});

app.get('/api/execution/binance/position', async (req, res) => {
    const startedAt = Date.now();
    const marketType = normalizeExecutionMarketType(req.query.marketType);
    const symbol = parseExecutionSymbol(req.query.symbol, marketType);

    try {
        const client = await getBinanceExecutionClient(marketType, true);
        const positions = await client.fetchPositions([symbol]);
        const position = Array.isArray(positions) ? positions[0] : null;

        const payload = {
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            hasPosition: Boolean(position && Math.abs(toFiniteNumber(position?.contracts) ?? 0) > 0),
            position: position
                ? {
                    symbol: position.symbol,
                    side: position.side ?? null,
                    contracts: toNullableRounded(position.contracts, 8),
                    contractSize: toNullableRounded(position.contractSize, 8),
                    notional: toNullableRounded(position.notional, 4),
                    leverage: toNullableRounded(position.leverage, 4),
                    entryPrice: toNullableRounded(position.entryPrice, 4),
                    markPrice: toNullableRounded(position.markPrice, 4),
                    unrealizedPnl: toNullableRounded(position.unrealizedPnl, 4),
                    liquidationPrice: toNullableRounded(position.liquidationPrice, 4),
                    marginMode: position.marginMode ?? null,
                }
                : null,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_binance_position_success', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            hasPosition: payload.hasPosition,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_binance_position_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            error: `Failed to fetch Binance position: ${message}`,
        });
    }
});

app.get('/api/execution/binance/portfolio', async (req, res) => {
    const startedAt = Date.now();
    const marketType = normalizeExecutionMarketType(req.query.marketType);
    const symbol = parseExecutionSymbol(req.query.symbol, marketType);
    const balanceLimit = Math.floor(parseNumber(req.query.balanceLimit, 8, 1, 30));
    const hasCredentials = hasBinanceExecutionCredentials();

    const balanceAsset = marketType === 'usdm' ? 'USDT' : 'BTC';

    if (!hasCredentials) {
        res.status(200).json({
            timestamp: Date.now(),
            connected: false,
            configured: false,
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances: [],
            positions: [],
            summary: {
                walletAssetFree: null,
                walletAssetUsed: null,
                walletAssetTotal: null,
                walletBalanceCount: 0,
                activePositionCount: 0,
                totalUnrealizedPnl: null,
            },
            error: 'BINANCE_API_KEY/BINANCE_API_SECRET is not configured',
        });
        recordRuntimeEvent('warn', 'api_execution_binance_portfolio_not_configured', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
        });
        return;
    }

    try {
        const client = await getBinanceExecutionClient(marketType, true);
        const [balance, rawPositions] = await Promise.all([
            client.fetchBalance(),
            (async () => {
                try {
                    return await client.fetchPositions();
                } catch (error) {
                    return await client.fetchPositions([symbol]);
                }
            })(),
        ]);

        const walletBalances = normalizeExecutionWalletBalances(balance, balanceLimit);
        const positions = normalizeExecutionPositions(rawPositions);
        const assetBalance = balance?.[balanceAsset] ?? {};

        const totalUnrealizedPnl = positions.reduce((sum, position) => {
            const pnl = toFiniteNumber(position?.unrealizedPnl);
            return Number.isFinite(pnl) ? sum + pnl : sum;
        }, 0);
        const hasUnrealizedPnl = positions.some((position) =>
            Number.isFinite(toFiniteNumber(position?.unrealizedPnl))
        );

        const payload = {
            timestamp: Date.now(),
            connected: true,
            configured: true,
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances,
            positions,
            summary: {
                walletAssetFree: toNullableRounded(assetBalance?.free, 8),
                walletAssetUsed: toNullableRounded(assetBalance?.used, 8),
                walletAssetTotal: toNullableRounded(assetBalance?.total, 8),
                walletBalanceCount: walletBalances.length,
                activePositionCount: positions.length,
                totalUnrealizedPnl: hasUnrealizedPnl
                    ? toNullableRounded(totalUnrealizedPnl, 8)
                    : null,
            },
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_binance_portfolio_success', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            walletBalanceCount: walletBalances.length,
            activePositionCount: positions.length,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_binance_portfolio_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            connected: false,
            configured: true,
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances: [],
            positions: [],
            summary: {
                walletAssetFree: null,
                walletAssetUsed: null,
                walletAssetTotal: null,
                walletBalanceCount: 0,
                activePositionCount: 0,
                totalUnrealizedPnl: null,
            },
            error: `Failed to fetch Binance portfolio: ${message}`,
        });
    }
});

app.get('/api/execution/binance/fills', async (req, res) => {
    const startedAt = Date.now();
    const marketType = normalizeExecutionMarketType(req.query.marketType);
    const symbol = parseExecutionSymbol(req.query.symbol, marketType);
    const limit = parseLimit(req.query.limit, 50, 200);
    const sinceQuery = parseTimestampQuery(req.query.since);

    if (!sinceQuery.valid) {
        recordRuntimeEvent('warn', 'api_execution_binance_fills_validation_failed', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            since: sinceQuery.raw,
            reason: 'invalid_since',
        });
        res.status(400).json({
            error: 'since must be unix ms timestamp or ISO date string',
        });
        return;
    }

    try {
        const client = await getBinanceExecutionClient(marketType, true);
        const trades = await client.fetchMyTrades(
            symbol,
            Number.isFinite(sinceQuery.value) ? sinceQuery.value : undefined,
            limit
        );
        const orderContextMap = buildExecutionOrderContextMap();

        const items = (Array.isArray(trades) ? trades : []).map((trade) => ({
            id: trade.id ?? null,
            orderId: normalizeExecutionOrderIdToken(trade.order),
            timestamp: Number.isFinite(toFiniteNumber(trade.timestamp))
                ? Number(trade.timestamp)
                : null,
            datetime: trade.datetime ?? null,
            side: trade.side ?? null,
            type: trade.type ?? null,
            amount: toNullableRounded(trade.amount, 8),
            price: toNullableRounded(trade.price, 8),
            cost: toNullableRounded(trade.cost, 8),
            fee: trade.fee
                ? {
                    currency: trade.fee.currency ?? null,
                    cost: toNullableRounded(trade.fee.cost, 8),
                    rate: toNullableRounded(trade.fee.rate, 8),
                }
                : null,
            realizedPnl: toNullableRounded(trade.info?.realizedPnl, 8),
            maker: typeof trade.maker === 'boolean' ? trade.maker : null,
            takerOrMaker: trade.takerOrMaker ?? null,
            strategyContext: orderContextMap.get(normalizeExecutionOrderIdToken(trade.order)) ?? null,
        }));

        const payload = {
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            limit,
            since: Number.isFinite(sinceQuery.value) ? sinceQuery.value : null,
            count: items.length,
            fills: items,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_binance_fills_success', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            count: items.length,
            since: payload.since,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_binance_fills_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            limit,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            error: `Failed to fetch Binance fills: ${message}`,
        });
    }
});

app.get('/api/execution/bithumb/fills', async (req, res) => {
    const startedAt = Date.now();
    const symbol = parseOptionalString(req.query.symbol, 32) ?? 'BTC/KRW';
    const limit = parseLimit(req.query.limit, 50, 200);
    const sinceQuery = parseTimestampQuery(req.query.since);

    if (!sinceQuery.valid) {
        recordRuntimeEvent('warn', 'api_execution_bithumb_fills_validation_failed', {
            durationMs: Date.now() - startedAt,
            symbol,
            since: sinceQuery.raw,
            reason: 'invalid_since',
        });
        res.status(400).json({
            error: 'since must be unix ms timestamp or ISO date string',
        });
        return;
    }

    try {
        const client = await getBithumbExecutionClient(true);
        const trades = await client.fetchMyTrades(
            symbol,
            Number.isFinite(sinceQuery.value) ? sinceQuery.value : undefined,
            limit
        );
        const orderContextMap = buildBithumbOrderContextMap();

        const items = (Array.isArray(trades) ? trades : []).map((trade) => ({
            id: trade.id ?? null,
            orderId: normalizeExecutionOrderIdToken(trade.order),
            timestamp: Number.isFinite(toFiniteNumber(trade.timestamp))
                ? Number(trade.timestamp)
                : null,
            datetime: trade.datetime ?? null,
            side: trade.side ?? null,
            type: trade.type ?? null,
            amount: toNullableRounded(trade.amount, 8),
            price: toNullableRounded(trade.price, 8),
            cost: toNullableRounded(trade.cost, 8),
            fee: trade.fee
                ? {
                    currency: trade.fee.currency ?? null,
                    cost: toNullableRounded(trade.fee.cost, 8),
                    rate: toNullableRounded(trade.fee.rate, 8),
                }
                : null,
            realizedPnl: toNullableRounded(trade.info?.realizedPnl, 8),
            maker: typeof trade.maker === 'boolean' ? trade.maker : null,
            takerOrMaker: trade.takerOrMaker ?? null,
            strategyContext: orderContextMap.get(normalizeExecutionOrderIdToken(trade.order)) ?? null,
        }));

        const payload = {
            timestamp: Date.now(),
            marketType: 'spot',
            symbol,
            testnet: false,
            safety: getExecutionSafetySummary(),
            limit,
            since: Number.isFinite(sinceQuery.value) ? sinceQuery.value : null,
            count: items.length,
            fills: items,
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_bithumb_fills_success', {
            durationMs: Date.now() - startedAt,
            symbol,
            count: items.length,
            since: payload.since,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_bithumb_fills_failure', {
            durationMs: Date.now() - startedAt,
            symbol,
            limit,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            marketType: 'spot',
            symbol,
            testnet: false,
            safety: getExecutionSafetySummary(),
            error: `Failed to fetch Bithumb fills: ${message}`,
        });
    }
});

app.get('/api/execution/safety', (req, res) => {
    res.json({
        timestamp: Date.now(),
        safety: getExecutionSafetySummary(),
    });
});

app.post('/api/execution/safety/reset', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const reason = parseOptionalString(body.reason, 120) ?? 'manual-reset';
    const resetDetails = resetExecutionSafetyState(reason);

    recordRuntimeEvent('warn', 'api_execution_safety_reset', {
        reason,
        ...resetDetails,
    });

    res.json({
        timestamp: Date.now(),
        reset: resetDetails,
        safety: getExecutionSafetySummary(),
    });
});

app.get('/api/execution/engine/status', (req, res) => {
    res.json({
        timestamp: Date.now(),
        safety: getExecutionSafetySummary(),
        engine: getExecutionEngineSnapshot(),
    });
});

app.post('/api/execution/engine/start', async (req, res) => {
    const startedAt = Date.now();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const marketType = normalizeExecutionMarketType(body.marketType);
    const symbol = parseExecutionSymbol(body.symbol, marketType);
    const dryRun = parseBoolean(body.dryRun, true);
    const premiumBasis = normalizePremiumBasis(body.premiumBasis);
    const entryThreshold = toFiniteNumber(body.entryThreshold);
    const exitThreshold = toFiniteNumber(body.exitThreshold);
    const orderBalancePctEntry = toFiniteNumber(
        body.orderBalancePctEntry ?? body.orderBalancePct ?? body.amount
    );
    const orderBalancePctExit = toFiniteNumber(
        body.orderBalancePctExit ?? body.orderBalancePct ?? body.amount
    );

    if (!Number.isFinite(entryThreshold) || !Number.isFinite(exitThreshold)) {
        res.status(400).json({ error: 'entryThreshold and exitThreshold are required' });
        return;
    }

    if (entryThreshold <= exitThreshold) {
        res.status(400).json({ error: 'entryThreshold must be greater than exitThreshold' });
        return;
    }

    if (!Number.isFinite(orderBalancePctEntry) || orderBalancePctEntry <= 0 || orderBalancePctEntry > 100) {
        res.status(400).json({ error: 'orderBalancePctEntry must be between 0 and 100' });
        return;
    }

    if (!Number.isFinite(orderBalancePctExit) || orderBalancePctExit <= 0 || orderBalancePctExit > 100) {
        res.status(400).json({ error: 'orderBalancePctExit must be between 0 and 100' });
        return;
    }

    if (executionEngineState.running) {
        res.status(409).json({
            error: 'Execution engine is already running',
            timestamp: Date.now(),
            safety: getExecutionSafetySummary(),
            engine: getExecutionEngineSnapshot(),
        });
        return;
    }

    if (!dryRun && executionFailureState.safeMode) {
        res.status(423).json({
            error: 'Execution safe mode is active. Reset safety state first.',
            timestamp: Date.now(),
            safety: getExecutionSafetySummary(),
            engine: getExecutionEngineSnapshot(),
        });
        return;
    }

    if (!isExecutionEngineLeaderReplica()) {
        res.status(409).json({
            error: `This replica is not leader (required=${executionEngineLeaderReplicaId}, current=${railwayReplicaId || 'unknown'})`,
            timestamp: Date.now(),
            safety: getExecutionSafetySummary(),
            engine: getExecutionEngineSnapshot(),
        });
        return;
    }

    if (!dryRun) {
        if (!hasBinanceExecutionCredentials()) {
            res.status(400).json({
                error: 'BINANCE_API_KEY/BINANCE_API_SECRET is not configured',
                timestamp: Date.now(),
                safety: getExecutionSafetySummary(),
                engine: getExecutionEngineSnapshot(),
            });
            return;
        }

        if (!hasBithumbExecutionCredentials()) {
            res.status(400).json({
                error: 'BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured',
                timestamp: Date.now(),
                safety: getExecutionSafetySummary(),
                engine: getExecutionEngineSnapshot(),
            });
            return;
        }

        if (binanceExecutionTestnet && !executionAllowTestnetOrders) {
            res.status(423).json({
                error: 'EXECUTION_ALLOW_TESTNET_ORDERS is disabled',
                timestamp: Date.now(),
                safety: getExecutionSafetySummary(),
                engine: getExecutionEngineSnapshot(),
            });
            return;
        }

        if (!binanceExecutionTestnet && !executionAllowLiveOrders) {
            res.status(423).json({
                error: 'EXECUTION_ALLOW_LIVE_ORDERS is disabled',
                timestamp: Date.now(),
                safety: getExecutionSafetySummary(),
                engine: getExecutionEngineSnapshot(),
            });
            return;
        }
    }

    try {
        if (!dryRun) {
            const client = await getBinanceExecutionClient(marketType, true);
            await Promise.all([
                client.fetchTime(),
                client.fetchBalance(),
            ]);
        }

        await startExecutionEngine({
            marketType,
            symbol,
            dryRun,
            premiumBasis,
            orderBalancePctEntry,
            orderBalancePctExit,
            entryThreshold,
            exitThreshold,
        });

        res.json({
            timestamp: Date.now(),
            safety: getExecutionSafetySummary(),
            engine: getExecutionEngineSnapshot(),
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'execution_engine_start_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            dryRun,
            error: message,
        });
        res.status(500).json({
            error: `Failed to start execution engine: ${message}`,
            timestamp: Date.now(),
            safety: getExecutionSafetySummary(),
            engine: getExecutionEngineSnapshot(),
        });
    }
});

app.post('/api/execution/engine/stop', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const reason = parseOptionalString(body.reason, 120) ?? 'manual-stop';
    stopExecutionEngine(reason);
    res.json({
        timestamp: Date.now(),
        safety: getExecutionSafetySummary(),
        engine: getExecutionEngineSnapshot(),
    });
});

app.post('/api/execution/binance/order', async (req, res) => {
    const startedAt = Date.now();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const marketType = normalizeExecutionMarketType(body.marketType ?? req.query.marketType);
    const symbol = parseExecutionSymbol(body.symbol, marketType);
    const side = parseExecutionOrderSide(body.side);
    const type = parseExecutionOrderType(body.type ?? 'market');
    const amount = toFiniteNumber(body.amount);
    const rawPrice = toFiniteNumber(body.price);
    const dryRun = parseBoolean(body.dryRun, false);
    const allowInSafeMode = parseBoolean(body.allowInSafeMode, false);
    const reduceOnly = parseBoolean(body.reduceOnly, false);
    const timeInForce = parseExecutionTimeInForce(body.timeInForce, type === 'limit' ? 'GTC' : null);
    const positionSide = parseExecutionPositionSide(body.positionSide);
    const clientOrderId = parseOptionalString(body.clientOrderId ?? body.newClientOrderId, 64);
    const strategyContextRaw = parseExecutionStrategyContext(body.strategyContext);
    const strategyContext = strategyContextRaw
        ? {
            ...strategyContextRaw,
            action:
                strategyContextRaw.action ??
                (side === 'sell' ? 'ENTRY_SELL' : side === 'buy' ? 'EXIT_BUY' : null),
        }
        : null;
    const retries = Math.floor(parseNumber(body.retries, executionOrderRetryCount, 0, 5));
    const retryDelayMs = Math.floor(parseNumber(body.retryDelayMs, executionOrderRetryDelayMs, 100, 10_000));
    const idempotencyKey = getExecutionIdempotencyKey(req);

    if (!side || !type) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_validation_failed', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            reason: 'invalid_side_or_type',
            side: body.side ?? null,
            type: body.type ?? null,
        });
        res.status(400).json({
            error: 'side must be buy|sell and type must be market|limit',
        });
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_validation_failed', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            reason: 'invalid_amount',
            amount: body.amount ?? null,
        });
        res.status(400).json({
            error: 'amount must be a positive number',
        });
        return;
    }

    if (type === 'limit' && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_validation_failed', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            reason: 'invalid_limit_price',
            price: body.price ?? null,
        });
        res.status(400).json({
            error: 'price must be a positive number for limit order',
        });
        return;
    }

    if (!dryRun && !idempotencyKey) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_validation_failed', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            reason: 'idempotency_key_required',
        });
        res.status(400).json({
            error: 'Idempotency-Key header (or idempotencyKey body) is required for live order request',
        });
        return;
    }

    if (executionFailureState.safeMode && !allowInSafeMode && !dryRun) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_blocked_safe_mode', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            side,
            type,
        });
        res.status(423).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            safety: getExecutionSafetySummary(),
            error: 'Execution safe mode is active. Reset safety state first or set allowInSafeMode=true.',
        });
        return;
    }

    if (!dryRun && binanceExecutionTestnet && !executionAllowTestnetOrders) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_blocked_testnet_disabled', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
        });
        res.status(403).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            error: 'Testnet order execution is disabled by EXECUTION_ALLOW_TESTNET_ORDERS',
        });
        return;
    }

    if (!dryRun && !binanceExecutionTestnet && !executionAllowLiveOrders) {
        recordRuntimeEvent('warn', 'api_execution_binance_order_blocked_live_disabled', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
        });
        res.status(403).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            safety: getExecutionSafetySummary(),
            error: 'Live order execution is disabled by EXECUTION_ALLOW_LIVE_ORDERS',
        });
        return;
    }

    const price = type === 'limit' ? rawPrice : null;
    const orderFingerprint = buildExecutionOrderFingerprint({
        marketType,
        symbol,
        side,
        type,
        amount,
        price,
        reduceOnly,
        timeInForce,
        positionSide,
        clientOrderId,
        dryRun,
    });

    const idempotencyState = getExecutionIdempotencyReplay(idempotencyKey, orderFingerprint);
    if (idempotencyState.kind === 'conflict') {
        recordRuntimeEvent('warn', 'api_execution_binance_order_idempotency_conflict', {
            durationMs: Date.now() - startedAt,
            idempotencyKey,
            marketType,
            symbol,
        });
        res.status(409).json({
            error: 'Idempotency key already exists for a different order request',
        });
        return;
    }

    if (idempotencyState.kind === 'pending') {
        res.status(409).json({
            error: 'Order with this idempotency key is already in progress',
        });
        return;
    }

    if (idempotencyState.kind === 'replay') {
        const record = idempotencyState.record ?? {};
        res.setHeader('x-idempotency-replay', 'true');
        res.status(Number(record.statusCode) || 200).json({
            ...(record.responseBody ?? {}),
            idempotency: {
                key: idempotencyKey,
                replayed: true,
            },
        });
        return;
    }

    beginExecutionIdempotentRequest(idempotencyKey, orderFingerprint);

    try {
        const baseResponse = {
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            dryRun,
            request: {
                side,
                type,
                amount: round(amount, 8),
                price: Number.isFinite(price) ? round(price, 8) : null,
                reduceOnly,
                timeInForce,
                positionSide,
                clientOrderId,
            },
            retry: {
                configuredRetryCount: retries,
                retryDelayMs,
                attempt: 1,
                maxAttempts: retries + 1,
            },
            idempotency: {
                key: idempotencyKey,
                replayed: false,
            },
            strategyContext,
        };

        if (dryRun) {
            const payload = {
                ...baseResponse,
                order: {
                    id: `dry-run-${Date.now()}`,
                    status: 'simulated',
                    symbol,
                    type,
                    side,
                    amount: round(amount, 8),
                    price: Number.isFinite(price) ? round(price, 8) : null,
                    filled: 0,
                    remaining: round(amount, 8),
                    cost: 0,
                    average: null,
                    timestamp: Date.now(),
                    datetime: new Date().toISOString(),
                },
                safety: getExecutionSafetySummary(),
            };

            recordRuntimeEvent('info', 'api_execution_binance_order_dry_run', {
                durationMs: Date.now() - startedAt,
                marketType,
                symbol,
                side,
                type,
                amount: round(amount, 8),
                strategyContext,
            });
            completeExecutionIdempotentRequest(idempotencyKey, 200, payload, orderFingerprint);
            res.json(payload);
            return;
        }

        const client = await getBinanceExecutionClient(marketType, true);
        const params = {};
        if (reduceOnly) params.reduceOnly = true;
        if (timeInForce) params.timeInForce = timeInForce;
        if (positionSide) params.positionSide = positionSide;
        if (clientOrderId) params.newClientOrderId = clientOrderId;

        let order = null;
        let attempt = 1;
        for (attempt = 1; attempt <= retries + 1; attempt += 1) {
            try {
                order = await client.createOrder(
                    symbol,
                    type,
                    side,
                    amount,
                    Number.isFinite(price) ? price : undefined,
                    params
                );
                break;
            } catch (error) {
                const isLastAttempt = attempt >= retries + 1;
                const message = toErrorMessage(error);

                recordRuntimeEvent('warn', 'api_execution_binance_order_attempt_failed', {
                    durationMs: Date.now() - startedAt,
                    marketType,
                    symbol,
                    side,
                    type,
                    amount: round(amount, 8),
                    attempt,
                    maxAttempts: retries + 1,
                    error: message,
                });

                if (isLastAttempt) {
                    throw error;
                }

                await wait(retryDelayMs * attempt);
            }
        }

        const payload = {
            ...baseResponse,
            retry: {
                ...baseResponse.retry,
                attempt,
            },
            order: {
                id: order?.id ?? null,
                clientOrderId:
                    order?.clientOrderId ??
                    order?.info?.clientOrderId ??
                    order?.info?.newClientOrderId ??
                    clientOrderId ??
                    null,
                status: order?.status ?? null,
                symbol: order?.symbol ?? symbol,
                type: order?.type ?? type,
                side: order?.side ?? side,
                amount: toNullableRounded(order?.amount, 8),
                price: toNullableRounded(order?.price, 8),
                average: toNullableRounded(order?.average, 8),
                filled: toNullableRounded(order?.filled, 8),
                remaining: toNullableRounded(order?.remaining, 8),
                cost: toNullableRounded(order?.cost, 8),
                timestamp: Number.isFinite(toFiniteNumber(order?.timestamp))
                    ? Number(order.timestamp)
                    : null,
                datetime: order?.datetime ?? null,
            },
        };

        recordRuntimeEvent('info', 'api_execution_binance_order_success', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            side,
            type,
            amount: round(amount, 8),
            attempt,
            orderId: payload.order.id,
            clientOrderId: payload.order.clientOrderId,
            strategyContext,
        });
        payload.safety = getExecutionSafetySummary();
        completeExecutionIdempotentRequest(idempotencyKey, 200, payload, orderFingerprint);
        res.json(payload);
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_binance_order_failure', {
            durationMs: Date.now() - startedAt,
            marketType,
            symbol,
            side,
            type,
            amount: Number.isFinite(amount) ? round(amount, 8) : null,
            error: message,
        });
        failExecutionIdempotentRequest(idempotencyKey);
        res.status(500).json({
            timestamp: Date.now(),
            marketType,
            symbol,
            testnet: binanceExecutionTestnet,
            idempotency: {
                key: idempotencyKey,
                replayed: false,
            },
            safety: getExecutionSafetySummary(),
            error: `Failed to place Binance order: ${message}`,
        });
    }
});

app.get('/api/backtest/premium/history', async (req, res) => {
    const startedAt = Date.now();
    res.status(410).json({
        error: 'Upbit 기반 백테스트 히스토리 기능이 비활성화되었습니다.',
        code: 'upbit_disabled',
        timestamp: Date.now(),
    });
    recordRuntimeEvent('warn', 'api_backtest_history_disabled', {
        durationMs: Date.now() - startedAt,
    });
    return;
    try {
        const refresh = parseBoolean(req.query.refresh, false);
        const rawInterval = typeof req.query.interval === 'string' ? req.query.interval : null;

        if (rawInterval) {
            const interval = normalizeInterval(rawInterval);
            if (refresh) {
                const config = CANDLE_INTERVAL_CONFIG[interval];
                await getPremiumCandlePayload(interval, config.maxLimit);
            }

            const coverage = getPremiumHistoryCoverage(interval);
            res.json({
                timestamp: Date.now(),
                interval,
                maxPoints: premiumHistoryMaxPoints,
                coverage,
                dataFile: path.relative(process.cwd(), getPremiumHistoryFilePath(interval)),
            });

            recordRuntimeEvent('info', 'api_backtest_history_status', {
                durationMs: Date.now() - startedAt,
                interval,
                refresh,
                storedCandles: coverage.storedCandles,
            });
            return;
        }

        if (refresh) {
            await Promise.all(
                CANDLE_INTERVAL_KEYS.map(async (interval) => {
                    const config = CANDLE_INTERVAL_CONFIG[interval];
                    await getPremiumCandlePayload(interval, config.maxLimit);
                })
            );
        }

        const intervals = CANDLE_INTERVAL_KEYS.map((interval) => ({
            interval,
            ...getPremiumHistoryCoverage(interval),
            dataFile: path.relative(process.cwd(), getPremiumHistoryFilePath(interval)),
        }));

        res.json({
            timestamp: Date.now(),
            maxPoints: premiumHistoryMaxPoints,
            intervals,
        });

        recordRuntimeEvent('info', 'api_backtest_history_status', {
            durationMs: Date.now() - startedAt,
            refresh,
            intervalCount: intervals.length,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_backtest_history_status_failure', {
            durationMs: Date.now() - startedAt,
            error: message,
        });
        res.status(500).json({
            error: `Failed to fetch backtest history status: ${message}`,
        });
    }
});

app.get('/api/execution/bithumb/portfolio', async (req, res) => {
    const startedAt = Date.now();
    const symbol = parseOptionalString(req.query.symbol, 32) ?? 'BTC/KRW';
    const balanceLimit = Math.floor(parseNumber(req.query.balanceLimit, 8, 1, 30));
    const hasCredentials = hasBithumbExecutionCredentials();

    const balanceAsset = 'KRW';

    if (!hasCredentials) {
        res.status(200).json({
            timestamp: Date.now(),
            connected: false,
            configured: false,
            marketType: 'spot',
            symbol,
            testnet: false,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances: [],
            positions: [],
            summary: {
                walletAssetFree: null,
                walletAssetUsed: null,
                walletAssetTotal: null,
                walletBalanceCount: 0,
                activePositionCount: 0,
                totalUnrealizedPnl: null,
            },
            error: 'BITHUMB_API_KEY/BITHUMB_API_SECRET is not configured',
        });
        recordRuntimeEvent('warn', 'api_execution_bithumb_portfolio_not_configured', {
            durationMs: Date.now() - startedAt,
            symbol,
        });
        return;
    }

    try {
        const client = await getBithumbExecutionClient(true);
        const balance = await client.fetchBalance();

        const walletBalances = normalizeExecutionWalletBalances(balance, balanceLimit);
        const positions = []; // Spot market doesn't have positions in CCXT standard way
        const assetBalance = balance?.[balanceAsset] ?? {};

        const payload = {
            timestamp: Date.now(),
            connected: true,
            configured: true,
            marketType: 'spot',
            symbol,
            testnet: false,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances,
            positions,
            summary: {
                walletAssetFree: toNullableRounded(assetBalance?.free, 8),
                walletAssetUsed: toNullableRounded(assetBalance?.used, 8),
                walletAssetTotal: toNullableRounded(assetBalance?.total, 8),
                walletBalanceCount: walletBalances.length,
                activePositionCount: 0,
                totalUnrealizedPnl: null,
            },
        };

        res.json(payload);
        recordRuntimeEvent('info', 'api_execution_bithumb_portfolio_success', {
            durationMs: Date.now() - startedAt,
            symbol,
            walletBalanceCount: walletBalances.length,
        });
    } catch (error) {
        const message = toErrorMessage(error);
        recordRuntimeEvent('error', 'api_execution_bithumb_portfolio_failure', {
            durationMs: Date.now() - startedAt,
            symbol,
            error: message,
        });
        res.status(500).json({
            timestamp: Date.now(),
            connected: false,
            configured: true,
            marketType: 'spot',
            symbol,
            testnet: false,
            balanceAsset,
            safety: getExecutionSafetySummary(),
            walletBalances: [],
            positions: [],
            summary: {
                walletAssetFree: null,
                walletAssetUsed: null,
                walletAssetTotal: null,
                walletBalanceCount: 0,
                activePositionCount: 0,
                totalUnrealizedPnl: null,
            },
            error: `Failed to fetch Bithumb portfolio: ${message}`,
        });
    }
});

app.post('/api/execution/bithumb/order', async (req, res) => {
    const startedAt = Date.now();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const symbol = parseOptionalString(body.symbol, 32) ?? 'BTC/KRW';
    const side = parseExecutionOrderSide(body.side);
    const type = parseExecutionOrderType(body.type ?? 'market');
    const amount = toFiniteNumber(body.amount);
    const rawPrice = toFiniteNumber(body.price);
    const dryRun = parseBoolean(body.dryRun, false);
    const allowInSafeMode = parseBoolean(body.allowInSafeMode, false);
    const strategyContextRaw = parseExecutionStrategyContext(body.strategyContext);
    const strategyContext = strategyContextRaw
        ? {
            ...strategyContextRaw,
            action:
                strategyContextRaw.action ??
                (side === 'sell' ? 'ENTRY_SELL' : side === 'buy' ? 'EXIT_BUY' : null),
        }
        : null;
    const retries = Math.floor(parseNumber(body.retries, executionOrderRetryCount, 0, 5));
    const retryDelayMs = Math.floor(parseNumber(body.retryDelayMs, executionOrderRetryDelayMs, 100, 10_000));
    const idempotencyKey = getExecutionIdempotencyKey(req);

    if (!side || !type) {
        res.status(400).json({ error: 'side must be buy|sell and type must be market|limit' });
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
    }

    if (type === 'limit' && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
        res.status(400).json({ error: 'price must be a positive number for limit order' });
        return;
    }

    if (!dryRun && !idempotencyKey) {
        res.status(400).json({ error: 'Idempotency-Key header (or idempotencyKey body) is required for live order request' });
        return;
    }

    if (executionFailureState.safeMode && !allowInSafeMode && !dryRun) {
        res.status(423).json({
            timestamp: Date.now(),
            marketType: 'spot',
            symbol,
            safety: getExecutionSafetySummary(),
            error: 'Execution safe mode is active. Reset safety state first or set allowInSafeMode=true.',
        });
        return;
    }

    const orderFingerprint = generateExecutionOrderFingerprint({
        exchange: 'bithumb',
        symbol,
        side,
        type,
        amount,
        price: rawPrice,
    });

    if (!dryRun && checkExecutionIdempotency(idempotencyKey, orderFingerprint, res)) {
        recordRuntimeEvent('info', 'api_execution_bithumb_order_idempotent_hit', {
            durationMs: Date.now() - startedAt,
            symbol,
            side,
            type,
            amount,
        });
        return;
    }

    let price = rawPrice;
    if (type === 'market') {
        price = undefined; // ccxt market order takes undefined for price
    }

    const baseResponse = {
        timestamp: Date.now(),
        marketType: 'spot',
        testnet: false,
        exchange: 'bithumb',
        request: {
            symbol,
            side,
            type,
            amount: round(amount, 8),
            price: Number.isFinite(price) ? round(price, 8) : null,
            dryRun,
        },
        retry: {
            attempt: 1,
            maxAttempts: retries + 1,
        },
        strategyContext,
    };

    if (dryRun) {
        const payload = {
            ...baseResponse,
            order: {
                id: `dry-run-${Date.now()}`,
                status: 'simulated',
                symbol,
                type,
                side,
                amount: round(amount, 8),
                price: Number.isFinite(price) ? round(price, 8) : null,
                filled: 0,
                remaining: round(amount, 8),
                cost: 0,
                average: null,
                timestamp: Date.now(),
                datetime: new Date().toISOString(),
            },
            safety: getExecutionSafetySummary(),
        };

        recordRuntimeEvent('info', 'api_execution_bithumb_order_dry_run', {
            durationMs: Date.now() - startedAt,
            symbol,
            side,
            type,
            amount: round(amount, 8),
            strategyContext,
        });
        completeExecutionIdempotentRequest(idempotencyKey, 200, payload, orderFingerprint);
        res.json(payload);
        return;
    }

    const client = await getBithumbExecutionClient(true);

    let order = null;
    let attempt = 1;
    for (attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
            order = await client.createOrder(
                symbol,
                type,
                side,
                amount,
                Number.isFinite(price) ? price : undefined
            );
            break;
        } catch (error) {
            const isLastAttempt = attempt >= retries + 1;
            const message = toErrorMessage(error);

            recordRuntimeEvent('warn', 'api_execution_bithumb_order_attempt_failed', {
                durationMs: Date.now() - startedAt,
                symbol,
                side,
                type,
                amount: round(amount, 8),
                attempt,
                maxAttempts: retries + 1,
                error: message,
            });

            if (isLastAttempt) {
                throw error;
            }

            await wait(retryDelayMs * attempt);
        }
    }

    const payload = {
        ...baseResponse,
        retry: {
            ...baseResponse.retry,
            attempt,
        },
        order: {
            id: order?.id ?? null,
            clientOrderId: null, // Bithumb typically doesn't support clientOrderId
            status: order?.status ?? null,
            symbol: order?.symbol ?? symbol,
            type: order?.type ?? type,
            side: order?.side ?? side,
            amount: order?.amount == null ? null : round(order.amount, 8),
            price: order?.price == null ? null : round(order.price, 8),
            filled: order?.filled == null ? null : round(order.filled, 8),
            remaining: order?.remaining == null ? null : round(order.remaining, 8),
            cost: order?.cost == null ? null : round(order.cost, 8),
            average: order?.average == null ? null : round(order.average, 8),
            timestamp: order?.timestamp == null ? null : Number(order.timestamp),
            datetime: typeof order?.datetime === 'string' ? order.datetime : null,
            fee: order?.fee
                ? {
                    currency: order.fee.currency ?? null,
                    cost: order.fee.cost == null ? null : round(order.fee.cost, 8),
                    rate: order.fee.rate == null ? null : round(order.fee.rate, 8),
                }
                : null,
        },
        safety: getExecutionSafetySummary(),
    };

    recordRuntimeEvent('info', 'api_execution_bithumb_order_success', {
        durationMs: Date.now() - startedAt,
        symbol,
        side,
        type,
        amount: round(amount, 8),
        orderId: payload.order.id,
        status: payload.order.status,
        attempt,
        strategyContext,
    });

    if (payload.order.status === 'closed') {
        const discordFields = [
            { name: '거래소', value: '빗썸', inline: true },
            { name: '심볼', value: payload.order.symbol, inline: true },
            { name: '방향', value: payload.order.side === 'buy' ? '🟢 매수' : '🔴 매도', inline: true },
            { name: '수량', value: `${payload.order.amount ?? amount}`, inline: true },
            { name: '체결가', value: `${payload.order.average ?? payload.order.price ?? price ?? '시장가'}`, inline: true },
            { name: '상태', value: '✅ 체결 완료', inline: true },
        ];
        if (strategyContext) {
            const isEntryAction =
                strategyContext.action === 'ENTRY_SELL' ||
                strategyContext.action === 'ENTRY_BUY';
            discordFields.push({
                name: '전략',
                value: `${isEntryAction ? '🔴 진입' : '🟢 청산'} (김프: ${strategyContext.effectivePremiumPct ?? strategyContext.premiumPct}%)`,
                inline: false
            });
        }
        const marketFields = await getDiscordMarketCoreFields();
        sendDiscordNotification({
            title: payload.order.side === 'buy' ? '🟢 빗썸 매수 체결' : '🔴 빗썸 매도 체결',
            description: '빗썸 거래소에서 현물 시장가 주문이 체결되었습니다.',
            color: payload.order.side === 'buy' ? 0x10b981 : 0xf43f5e,
            fields: [...discordFields, ...marketFields]
        }).catch(() => {});
    }

    completeExecutionIdempotentRequest(idempotencyKey, 200, payload, orderFingerprint);
    res.json(payload);
});

app.get('/api/execution/events', (req, res) => {
    const limit = parseLimit(req.query.limit, 50, runtimeEventLimit);
    const onlyFailures = parseBoolean(req.query.onlyFailures, false);
    const levelFilter = typeof req.query.level === 'string' ? req.query.level.trim().toLowerCase() : '';
    const rawMarketType =
        typeof req.query.marketType === 'string' ? req.query.marketType.trim().toLowerCase() : '';
    const marketTypeFilter = rawMarketType === 'coinm' || rawMarketType === 'usdm' ? rawMarketType : null;

    let filtered = runtimeEvents.filter((entry) => isExecutionEventFeedItem(entry.event));

    if (levelFilter) {
        filtered = filtered.filter(
            (entry) => typeof entry.level === 'string' && entry.level.toLowerCase() === levelFilter
        );
    }

    if (onlyFailures) {
        filtered = filtered.filter(
            (entry) => entry.level === 'error' || (typeof entry.event === 'string' && entry.event.endsWith('_failure'))
        );
    }

    if (marketTypeFilter) {
        filtered = filtered.filter((entry) => entry.marketType === marketTypeFilter);
    }

    const events = filtered.slice(-limit).reverse();

    res.json({
        timestamp: Date.now(),
        count: events.length,
        totalExecutionEvents: filtered.length,
        totalBuffered: runtimeEvents.length,
        filters: {
            limit,
            onlyFailures,
            level: levelFilter || null,
            marketType: marketTypeFilter,
        },
        logFile: 'logs/data-load-events.ndjson',
        events,
    });
});

app.get('/api/data-load-events', (req, res) => {
    const limit = parseLimit(req.query.limit, 50, runtimeEventLimit);
    const events = runtimeEvents.slice(-limit).reverse();

    res.json({
        timestamp: Date.now(),
        count: events.length,
        totalBuffered: runtimeEvents.length,
        logFile: 'logs/data-load-events.ndjson',
        events,
    });
});

app.get('/api/health', (req, res) => {
    const historySummary = CANDLE_INTERVAL_KEYS.map((interval) => {
        const coverage = getPremiumHistoryCoverage(interval);
        return {
            interval,
            storedCandles: coverage.storedCandles,
            earliestTimestamp: coverage.earliestTimestamp,
            latestTimestamp: coverage.latestTimestamp,
            updatedAt: coverage.updatedAt,
        };
    });

    res.json({
        status: 'ok',
        timestamp: Date.now(),
        fxCacheAgeMs: fxCache.fetchedAt > 0 ? Date.now() - fxCache.fetchedAt : null,
        fxSource: fxCache.source,
        fxValue: round(fxCache.usdKrw, 4),
        candleCacheKeys: candleCache.size,
        premiumHistoryMaxPoints,
        premiumHistory: historySummary,
        execution: {
            adminAuthEnabled: isExecutionAdminAuthEnabled(),
            passwordAuthEnabled: isExecutionPasswordAuthEnabled(),
            binanceConfigured: hasBinanceExecutionCredentials(),
            binanceCredentialStatus: getExecutionCredentialsStatusSummary(),
            binanceMarketType: binanceExecutionMarketType,
            binanceTestnet: binanceExecutionTestnet,
            liveOrderEnabled: executionAllowLiveOrders,
            testnetOrderEnabled: executionAllowTestnetOrders,
            safety: getExecutionSafetySummary(),
            engineAutoStart: executionEngineAutoStart,
            engine: getExecutionEngineSnapshot(),
        },
        runtimeEventCount: runtimeEvents.length,
        runtimeLogFile: 'logs/data-load-events.ndjson',
    });
});

if (fs.existsSync(frontendIndexFile)) {
    app.use(express.static(frontendDistDir));
    app.get(/^\/(?!api\/).*/, (req, res) => {
        res.sendFile(frontendIndexFile);
    });
} else {
    app.get('/', (req, res) => {
        res.status(200).send('Frontend build not found. Build the frontend with `npm run build`.');
    });
}

app.listen(port, () => {
    console.log(`Backend proxy running at http://localhost:${port}`);
    if (discordWebhookUrl) {
        console.log('Discord webhook configured.');
    }

    // 김프 정기 보고 (configurable interval)
    restartDiscordPeriodicReportTimer();
    restartDiscordPremiumAlertTimer();

    const shouldAutoStartFromEnv = executionEngineAutoStart;
    const shouldRecoverFromState = !shouldAutoStartFromEnv && executionEngineState.desiredRunning;
    const shouldStart = shouldAutoStartFromEnv || shouldRecoverFromState;
    if (!shouldStart) return;
    if (!isExecutionEngineLeaderReplica()) {
        recordRuntimeEvent('warn', 'execution_engine_autostart_skipped_not_leader', {
            requiredReplicaId: executionEngineLeaderReplicaId || null,
            currentReplicaId: railwayReplicaId || null,
        });
        return;
    }

    const autoStartConfig = shouldAutoStartFromEnv
        ? {
            marketType: executionEngineAutoMarketType,
            symbol:
                executionEngineAutoSymbol ||
                defaultExecutionSymbolByMarketType(executionEngineAutoMarketType),
            orderBalancePctEntry: executionEngineAutoEntryPct,
            orderBalancePctExit: executionEngineAutoExitPct,
            dryRun: executionEngineAutoDryRun,
            premiumBasis: executionEngineAutoPremiumBasis,
            entryThreshold: executionEngineAutoEntryThreshold,
            exitThreshold: executionEngineAutoExitThreshold,
            source: 'env',
        }
        : {
            marketType: executionEngineState.marketType,
            symbol: executionEngineState.symbol,
            orderBalancePctEntry: executionEngineState.orderBalancePctEntry,
            orderBalancePctExit: executionEngineState.orderBalancePctExit,
            dryRun: executionEngineState.dryRun,
            premiumBasis: executionEngineState.premiumBasis,
            entryThreshold: executionEngineState.entryThreshold,
            exitThreshold: executionEngineState.exitThreshold,
            source: 'restored-state',
        };

    const autoEntryPctOk =
        Number.isFinite(autoStartConfig.orderBalancePctEntry) &&
        autoStartConfig.orderBalancePctEntry > 0 &&
        autoStartConfig.orderBalancePctEntry <= 100;
    const autoExitPctOk =
        Number.isFinite(autoStartConfig.orderBalancePctExit) &&
        autoStartConfig.orderBalancePctExit > 0 &&
        autoStartConfig.orderBalancePctExit <= 100;
    if (!autoEntryPctOk || !autoExitPctOk) {
        recordRuntimeEvent('error', 'execution_engine_autostart_invalid_order_balance_pct', {
            source: autoStartConfig.source,
            orderBalancePctEntry: autoStartConfig.orderBalancePctEntry,
            orderBalancePctExit: autoStartConfig.orderBalancePctExit,
        });
        return;
    }

    if (autoStartConfig.entryThreshold <= autoStartConfig.exitThreshold) {
        recordRuntimeEvent('error', 'execution_engine_autostart_invalid_threshold', {
            source: autoStartConfig.source,
            entryThreshold: autoStartConfig.entryThreshold,
            exitThreshold: autoStartConfig.exitThreshold,
        });
        return;
    }

    void (async () => {
        try {
            await startExecutionEngine(autoStartConfig);

            recordRuntimeEvent('info', 'execution_engine_autostart_success', {
                source: autoStartConfig.source,
                marketType: autoStartConfig.marketType,
                symbol: autoStartConfig.symbol,
                dryRun: autoStartConfig.dryRun,
                premiumBasis: autoStartConfig.premiumBasis,
                orderBalancePctEntry: round(autoStartConfig.orderBalancePctEntry, 4),
                orderBalancePctExit: round(autoStartConfig.orderBalancePctExit, 4),
                entryThreshold: round(autoStartConfig.entryThreshold, 6),
                exitThreshold: round(autoStartConfig.exitThreshold, 6),
            });
        } catch (error) {
            recordRuntimeEvent('error', 'execution_engine_autostart_failure', {
                source: autoStartConfig.source,
                marketType: autoStartConfig.marketType,
                symbol: autoStartConfig.symbol,
                dryRun: autoStartConfig.dryRun,
                premiumBasis: autoStartConfig.premiumBasis,
                orderBalancePctEntry: round(autoStartConfig.orderBalancePctEntry, 4),
                orderBalancePctExit: round(autoStartConfig.orderBalancePctExit, 4),
                entryThreshold: round(autoStartConfig.entryThreshold, 6),
                exitThreshold: round(autoStartConfig.exitThreshold, 6),
                error: toErrorMessage(error),
            });
        }
    })();
});
