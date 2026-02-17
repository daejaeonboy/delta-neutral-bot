import React from 'react';
import { TradeLog } from '../types';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';

interface LogPanelProps {
  logs: TradeLog[];
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col h-full max-h-[400px]">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur z-10 rounded-t-xl">
        <h3 className="font-semibold text-slate-200">봇 활동 로그</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400">{logs.length} 건</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <Clock className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">시장 진입 조건 대기 중...</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`p-3 rounded-lg border text-sm ${
              log.type === 'ENTRY' 
                ? 'bg-emerald-950/10 border-emerald-900/30' 
                : 'bg-indigo-950/10 border-indigo-900/30'
            }`}>
              <div className="flex justify-between items-start mb-1">
                <span className={`font-bold flex items-center gap-1 ${
                   log.type === 'ENTRY' ? 'text-emerald-400' : 'text-indigo-400'
                }`}>
                  {log.type === 'ENTRY' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {log.type === 'ENTRY' ? '진입' : '청산'}
                </span>
                <span className="text-slate-500 text-xs font-mono">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>김프: <span className="font-mono text-white">{log.premium.toFixed(2)}%</span></span>
                {log.profit !== undefined && (
                  <span className={`font-bold ${log.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    수익: {log.profit >= 0 ? '+' : ''}{log.profit.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{log.description}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
