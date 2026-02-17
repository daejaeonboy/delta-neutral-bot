import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { FundingPositionSide, TopVolumeFundingResponse } from '../types';
import { fetchTopVolumeFunding } from '../services/marketService';

const AUTO_REFRESH_MS = 30_000;

interface TopFundingTableProps {
  defaultNotionalUsdt?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatSigned(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatDateTime(timestamp: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TopFundingTable: React.FC<TopFundingTableProps> = ({ defaultNotionalUsdt = 1000 }) => {
  const [side, setSide] = useState<FundingPositionSide>('SHORT');
  const [notionalUsdt, setNotionalUsdt] = useState<number>(() => clamp(defaultNotionalUsdt, 50, 100_000_000));
  const [fundingIntervalHours, setFundingIntervalHours] = useState<number>(8);
  const [data, setData] = useState<TopVolumeFundingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const requestIdRef = useRef(0);
  const latestInitialRequestIdRef = useRef<number | null>(null);
  const latestManualRequestIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadTopFunding = useCallback(
    async (manual = false, initial = false) => {
      const requestId = ++requestIdRef.current;
      if (manual) {
        latestManualRequestIdRef.current = requestId;
        setIsRefreshing(true);
      }
      if (initial) {
        latestInitialRequestIdRef.current = requestId;
        setIsLoading(true);
      }

      try {
        const response = await fetchTopVolumeFunding({
          limit: 10,
          side,
          notionalUsdt,
          fundingIntervalHours,
        });

        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setData(response);
        setError(null);
      } catch (err) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : '상위 거래량/펀딩 데이터 조회 실패';
        setError(message);
      } finally {
        if (!mountedRef.current) return;
        if (manual && latestManualRequestIdRef.current === requestId) {
          setIsRefreshing(false);
        }
        if (initial && latestInitialRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [fundingIntervalHours, notionalUsdt, side]
  );

  useEffect(() => {
    void loadTopFunding(false, true);

    const timer = window.setInterval(() => {
      void loadTopFunding(false, false);
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }, [loadTopFunding]);

  const summaryText = useMemo(() => {
    if (!data) return '-';
    return `${data.source} · 기준 ${data.positionSide} · ${data.positionNotionalUsdt.toLocaleString()} USDT · ${data.fundingIntervalHours}h`;
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 min-h-[340px] flex items-center justify-center text-slate-500">
        상위 거래량/펀딩 데이터 불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-200">상위 거래량 10개 + 펀딩비 계산</h3>
          <p className="text-[11px] text-slate-500 mt-1">{summaryText}</p>
          {data && (
            <p className="text-[11px] text-slate-600 mt-1">
              다음 펀딩 시각: {formatDateTime(data.symbols[0]?.nextFundingTime ?? null)} (상위 1개 기준)
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            포지션
            <select
              value={side}
              onChange={(e) => setSide(e.target.value === 'LONG' ? 'LONG' : 'SHORT')}
              className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
            >
              <option value="SHORT">숏 (펀딩 수취 기대)</option>
              <option value="LONG">롱 (펀딩 지급 가능)</option>
            </select>
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            규모(USDT)
            <input
              type="number"
              min={50}
              max={100000000}
              step={10}
              value={notionalUsdt}
              onChange={(e) => setNotionalUsdt(clamp(Number(e.target.value), 50, 100_000_000))}
              className="w-36 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-100 font-mono"
            />
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            계산 시간(h)
            <input
              type="number"
              min={1}
              max={72}
              step={1}
              value={fundingIntervalHours}
              onChange={(e) => setFundingIntervalHours(clamp(Number(e.target.value), 1, 72))}
              className="w-28 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-100 font-mono"
            />
          </label>

          <button
            onClick={() => void loadTopFunding(true, false)}
            disabled={isRefreshing}
            className="h-[34px] px-3 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            갱신
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-md px-3 py-2">
          상위 거래량/펀딩 데이터 오류: {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-2 text-left">#</th>
              <th className="py-2 pr-2 text-left">심볼</th>
              <th className="py-2 pr-2 text-right">24h 거래대금(USDT)</th>
              <th className="py-2 pr-2 text-right">마크가</th>
              <th className="py-2 pr-2 text-right">펀딩비(8h)</th>
              <th className="py-2 pr-2 text-right">예상 펀딩손익(USDT)</th>
              <th className="py-2 text-right">예상 펀딩손익(KRW)</th>
            </tr>
          </thead>
          <tbody>
            {(data?.symbols ?? []).map((item) => {
              const isReceive = (item.estimatedFundingFeeUsdt ?? 0) >= 0;
              return (
                <tr key={item.symbol} className="border-b border-slate-900/80 hover:bg-slate-900/30">
                  <td className="py-2 pr-2 text-slate-500">{item.rank}</td>
                  <td className="py-2 pr-2 font-semibold text-slate-100">{item.symbol}</td>
                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                    {item.quoteVolume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-slate-300">
                    ${item.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </td>
                  <td className={`py-2 pr-2 text-right font-mono ${item.fundingRate >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {(item.fundingRate * 100).toFixed(4)}%
                  </td>
                  <td className={`py-2 pr-2 text-right font-mono ${isReceive ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {item.estimatedFundingFeeUsdt == null ? '-' : formatSigned(item.estimatedFundingFeeUsdt, 4)}
                  </td>
                  <td className={`py-2 text-right font-mono ${isReceive ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {item.estimatedFundingFeeKrw == null ? '-' : formatSigned(item.estimatedFundingFeeKrw, 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        양수(+)는 해당 포지션 기준 펀딩비 수취, 음수(-)는 지급 의미입니다. 계산식:
        <span className="font-mono ml-1">포지션규모 × 펀딩비율 × (시간/8h)</span>
      </div>
    </div>
  );
};

