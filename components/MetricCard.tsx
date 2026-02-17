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
    <div className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 ${
      highlight 
        ? 'bg-indigo-950/40 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
        : 'bg-slate-900/50 border-slate-800'
    }`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-slate-400 text-sm font-medium">{title}</span>
        {icon && <div className="text-slate-500">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono ${
          highlight ? 'text-indigo-400' : 'text-slate-100'
        }`}>
          {value}
        </span>
        {subValue && (
          <span className={`text-xs font-mono ${
            trend === 'up' ? 'text-emerald-400' : 
            trend === 'down' ? 'text-rose-400' : 'text-slate-500'
          }`}>
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
};
