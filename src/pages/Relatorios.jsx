import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ExportButtons from '../components/ExportButtons.jsx';
import { useQuotes } from '../hooks/useQuotes.js';
import { exportQuoteToPDF, exportQuotesToCSV, exportQuotesToExcel } from '../utils/exporters.js';
import { formatCurrency } from '../utils/formatters.js';

const COLORS = ['#38bdf8', '#a855f7', '#22c55e', '#f59e0b', '#ef4444'];

const Relatorios = () => {
  const { quotes } = useQuotes();

  const byStatus = Object.values(
    quotes.reduce((acc, quote) => {
      const key = quote.status;
      acc[key] = acc[key] || { name: key, value: 0, total: 0 };
      acc[key].value += 1;
      acc[key].total += quote.total || 0;
      return acc;
    }, {}),
  );

  const topClients = quotes.reduce((acc, quote) => {
    const key = quote.clientName;
    acc[key] = acc[key] || { name: key, total: 0, count: 0 };
    acc[key].total += quote.total || 0;
    acc[key].count += 1;
    return acc;
  }, {});

  const clientRanking = Object.values(topClients).sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Relatórios</p>
          <h1 className="text-2xl font-bold text-white">Insights e Exportação</h1>
          <p className="text-sm text-slate-400">Gere PDFs, Excel ou CSV com os dados do funil de orçamentos.</p>
        </div>
        <ExportButtons
          onPDF={() => quotes.forEach((quote) => exportQuoteToPDF(quote))}
          onCSV={() => exportQuotesToCSV(quotes)}
          onExcel={() => exportQuotesToExcel(quotes)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="mb-4 text-sm font-semibold text-white">Status dos orçamentos</p>
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={120} label>
                  {byStatus.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <p className="mb-4 text-sm font-semibold text-white">Top clientes por valor</p>
          <div className="space-y-3">
            {clientRanking.map((client, idx) => (
              <div key={client.name} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{client.name}</p>
                    <p className="text-xs text-slate-400">{client.count} orçamentos</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-white">{formatCurrency(client.total)}</p>
              </div>
            ))}
            {clientRanking.length === 0 && <p className="text-sm text-slate-400">Nenhum dado disponível.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Relatorios;

