import React from 'react';
import { ArrowRight, Scale, ShieldCheck, Wallet } from 'lucide-react';

export const StrategyVisualizer: React.FC = () => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-500" />
        델타 중립(Delta Neutral) 구조
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Domestic Leg */}
        <div className="relative p-4 rounded-lg bg-emerald-950/30 border border-emerald-900/50 flex flex-col items-center text-center">
          <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-2">국내 (업비트)</div>
          <Wallet className="w-8 h-8 text-emerald-500 mb-2" />
          <div className="text-lg font-bold text-slate-200">현물 매수 (Buy)</div>
          <div className="text-xs text-slate-400 mt-1">+1 BTC</div>
          <div className="mt-4 text-xs text-emerald-300/80">가격 상승 시 수익 ⬆️</div>
        </div>

        {/* Math/Balance */}
        <div className="flex flex-col justify-center items-center py-4 md:py-0">
          <Scale className="w-10 h-10 text-slate-500 mb-2" />
          <div className="text-center">
            <div className="text-xs text-slate-400">순 노출 (Net Exposure)</div>
            <div className="text-xl font-bold text-indigo-400">0 BTC</div>
            <div className="text-[10px] text-slate-500 mt-1">가격 변동 위험 상쇄</div>
          </div>
        </div>

        {/* International Leg */}
        <div className="relative p-4 rounded-lg bg-rose-950/30 border border-rose-900/50 flex flex-col items-center text-center">
          <div className="text-xs text-rose-400 font-bold uppercase tracking-wider mb-2">해외 (바이낸스)</div>
          <div className="w-8 h-8 flex items-center justify-center mb-2">
             <ArrowRight className="text-rose-500 transform rotate-45" />
          </div>
          <div className="text-lg font-bold text-slate-200">선물 숏 (Short)</div>
          <div className="text-xs text-slate-400 mt-1">-1 BTC</div>
          <div className="mt-4 text-xs text-rose-300/80">가격 하락 시 수익 ⬇️</div>
        </div>
      </div>

      <div className="mt-6 p-3 bg-slate-950/50 rounded-lg border border-slate-800 text-sm text-slate-400 text-center">
        목표: <span className="text-indigo-400 font-bold">김치 프리미엄(괴리)</span>이 평균으로 회귀할 때 발생하는 차익을 확보.
      </div>
    </div>
  );
};
