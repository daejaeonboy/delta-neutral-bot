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
  usdPrice: number; // International Price (BTC/USDT)
  exchangeRate: number; // USD/KRW
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
  conversionClose: number; // KRW/USDT used for close conversion
}

export interface PremiumCandleResponse {
  interval: CandleInterval;
  limit: number;
  generatedAt: number;
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
  entryThreshold: number; // e.g., 3.0%
  exitThreshold: number;  // e.g., 0.5%
  leverage: number;
  investmentKrw: number;
}

export interface StrategyRisk {
  id: string;
  name: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}
