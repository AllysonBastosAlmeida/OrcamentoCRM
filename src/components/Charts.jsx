import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const Charts = ({ trendData, statusData }) => {
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      <div className="card p-3 sm:p-5 chart-compact">
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <p className="text-xs font-semibold text-slate-300 sm:text-sm">Volume mensal de orçamentos</p>
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary sm:px-3 sm:py-1 sm:text-xs">Tendência</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1, #d2a84f)" stopOpacity={0.72} />
                <stop offset="95%" stopColor="var(--chart-1, #d2a84f)" stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(255,255,255,0.06))" />
            <XAxis dataKey="month" stroke="var(--chart-axis, #94a3b8)" />
            <YAxis stroke="var(--chart-axis, #94a3b8)" />
            <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg, #0f172a)', border: '1px solid var(--chart-tooltip-border, rgba(255,255,255,0.1))', color: 'var(--chart-tooltip-text, #fff)', borderRadius: '12px' }} />
            <Area type="monotone" dataKey="total" stroke="var(--chart-2, #f0cb79)" fill="url(#colorPrimary)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-3 sm:p-5 chart-compact">
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <p className="text-xs font-semibold text-slate-300 sm:text-sm">Status dos orçamentos</p>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 sm:px-3 sm:py-1 sm:text-xs">
            Conversão
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, rgba(255,255,255,0.06))" />
            <XAxis dataKey="status" stroke="var(--chart-axis, #94a3b8)" />
            <YAxis stroke="var(--chart-axis, #94a3b8)" />
            <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg, #0f172a)', border: '1px solid var(--chart-tooltip-border, rgba(255,255,255,0.1))', color: 'var(--chart-tooltip-text, #fff)', borderRadius: '12px' }} />
            <Bar dataKey="value" fill="var(--chart-1, #d2a84f)" radius={[8, 8, 2, 2]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default Charts;
