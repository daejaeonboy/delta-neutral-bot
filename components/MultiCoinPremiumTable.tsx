import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpDown, RefreshCw, TrendingUp } from 'lucide-react';
import { fetchMultiPremium, MultiPremiumCoin, MultiPremiumResponse } from '../services/marketService';

type SortKey = 'symbol' | 'premiumUsd' | 'premiumUsdt' | 'volume24hKrw' | 'krwPrice';
type SortDir = 'asc' | 'desc';

const POLL_INTERVAL_MS = 30_000;

export const MultiCoinPremiumTable: React.FC = () => {
    const [data, setData] = useState<MultiPremiumResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('premiumUsd');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const loadData = useCallback(async () => {
        try {
            const resp = await fetchMultiPremium(20);
            setData(resp);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
        const id = window.setInterval(() => void loadData(), POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [loadData]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'symbol' ? 'asc' : 'desc');
        }
    };

    const sortedCoins: MultiPremiumCoin[] = React.useMemo(() => {
        if (!data?.coins) return [];
        return [...data.coins].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
        });
    }, [data?.coins, sortKey, sortDir]);

    const premiumColor = (v: number) => {
        if (v >= 4) return 'text-rose-400';
        if (v >= 2.5) return 'text-amber-400';
        if (v >= 0) return 'text-emerald-400';
        return 'text-blue-400';
    };

    const SortHeader: React.FC<{ label: string; col: SortKey; className?: string }> = ({
        label,
        col,
        className = '',
    }) => (
        <th
            className={`px-3 py-2.5 text-left text-[11px] uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors ${className}`}
            onClick={() => handleSort(col)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                <ArrowUpDown
                    size={10}
                    className={sortKey === col ? 'text-indigo-400' : 'text-slate-600'}
                />
            </span>
        </th>
    );

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                    멀티코인 김치 프리미엄
                </h3>
                <div className="flex items-center gap-3">
                    {data && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span>USD/KRW: <span className="text-slate-300 font-mono">₩{data.usdKrw.toFixed(2)}</span></span>
                            <span>USDT/KRW: <span className="text-slate-300 font-mono">₩{data.usdtKrw.toFixed(0)}</span></span>
                            <span>USDT 프리미엄: <span className="text-amber-400 font-mono">{data.usdtPremiumPercent.toFixed(2)}%</span></span>
                        </div>
                    )}
                    <button
                        onClick={() => void loadData()}
                        disabled={isLoading}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="text-sm text-rose-400 bg-rose-950/30 border border-rose-800/50 rounded-lg px-3 py-2 mb-3">
                    {error}
                </div>
            )}

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-slate-500 border-b border-slate-800">
                            <SortHeader label="코인" col="symbol" />
                            <SortHeader label="국내가 (KRW)" col="krwPrice" className="text-right" />
                            <SortHeader label="해외가 (USDT)" col="krwPrice" className="text-right" />
                            <SortHeader label="USD 김프" col="premiumUsd" className="text-right" />
                            <SortHeader label="USDT 김프" col="premiumUsdt" className="text-right" />
                            <SortHeader label="24h 거래대금" col="volume24hKrw" className="text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && !data ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-slate-500">
                                    데이터 로딩 중...
                                </td>
                            </tr>
                        ) : sortedCoins.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-slate-500">
                                    데이터 없음
                                </td>
                            </tr>
                        ) : (
                            sortedCoins.map((coin) => (
                                <tr
                                    key={coin.symbol}
                                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                                >
                                    <td className="px-3 py-2.5 font-semibold text-slate-200">
                                        {coin.symbol}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                                        ₩{coin.krwPrice.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                                        ${coin.usdtPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: coin.usdtPrice < 1 ? 6 : 2 })}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${premiumColor(coin.premiumUsd)}`}>
                                        {coin.premiumUsd >= 0 ? '+' : ''}{coin.premiumUsd.toFixed(2)}%
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono ${coin.premiumUsdt >= 0 ? 'text-emerald-400/70' : 'text-blue-400/70'}`}>
                                        {coin.premiumUsdt >= 0 ? '+' : ''}{coin.premiumUsdt.toFixed(2)}%
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-slate-500 text-xs">
                                        {formatVolume(coin.volume24hKrw)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {data && (
                <div className="mt-3 text-[10px] text-slate-600 text-right">
                    {data.count}개 코인 · 30초마다 자동 갱신 · {new Date(data.timestamp).toLocaleTimeString('ko-KR')}
                </div>
            )}
        </div>
    );
};

function formatVolume(v: number): string {
    if (v >= 1e12) return `₩${(v / 1e12).toFixed(1)}조`;
    if (v >= 1e8) return `₩${(v / 1e8).toFixed(0)}억`;
    if (v >= 1e4) return `₩${(v / 1e4).toFixed(0)}만`;
    return `₩${v.toLocaleString()}`;
}
