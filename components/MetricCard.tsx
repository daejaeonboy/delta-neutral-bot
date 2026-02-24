import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subValue, trend, icon, highlight = false }) => {
  return (
    <div className={`relative group p-5 rounded-2xl border transition-all duration-500 overflow-hidden ${highlight
      ? 'bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/40 shadow-[0_8px_32px_rgba(99,102,241,0.15)]'
      : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700/80 shadow-sm'
      }`}>
      {/* Background Glow Effect */}
      {highlight && (
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 blur-3xl rounded-full" />
      )}

      <div className="flex flex-col h-full space-y-3">
        <div className="flex items-start justify-between h-9">
          <span className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-tight block max-w-[80%]">{title}</span>
          {icon && (
            <div className={`${highlight ? 'text-indigo-400' : 'text-slate-600'} transition-colors duration-300`}>
              {icon}
            </div>
          )}
        </div>

        <div className="flex flex-col space-y-1">
          <div className={`text-2xl font-black font-mono tracking-tight leading-none ${highlight ? 'text-white' : 'text-slate-100'
            }`}>
            {value}
          </div>

          {subValue && (
            <div className={`text-[10px] font-medium truncate leading-tight flex items-center gap-1.5 ${trend === 'up' ? 'text-emerald-400/90' :
              trend === 'down' ? 'text-rose-400/90' : 'text-slate-500'
              }`}>
              {trend === 'up' && <span className="w-1 h-1 rounded-full bg-emerald-500" />}
              {trend === 'down' && <span className="w-1 h-1 rounded-full bg-rose-500" />}
              {subValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
