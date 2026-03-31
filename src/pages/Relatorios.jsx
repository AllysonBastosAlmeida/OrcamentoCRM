import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ExportButtons from '../components/ExportButtons.jsx';
import { useQuotes } from '../hooks/useQuotes.js';
import { formatCurrency } from '../utils/formatters.js';

const COLORS = ['#d2a84f', '#f0cb79', '#a77a2f', '#f4dfab', '#7f5b1d'];
const loadExporters = () => import('../utils/exporters.js');

const Relatorios = () => {
  const { quotes } = useQuotes();
  const [exportingFormat, setExportingFormat] = useState(null);

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
    const key = quote.clientCompany || quote.clientName;
    acc[key] = acc[key] || { name: key, total: 0, count: 0 };
    acc[key].total += quote.total || 0;
    acc[key].count += 1;
    return acc;
  }, {});

  const clientRanking = Object.values(topClients).sort((a, b) => b.total - a.total).slice(0, 5);

  const handleExport = async (format) => {
    if (exportingFormat) return;
    try {
      setExportingFormat(format);
      const { exportQuoteToPDF, exportQuotesToCSV, exportQuotesToExcel } = await loadExporters();
      if (format === 'pdf') {
        for (const quote of quotes) {
          // Mantem a ordem e evita disparos simultaneos de download.
          // eslint-disable-next-line no-await-in-loop
          await exportQuoteToPDF(quote);
        }
        return;
      }
      if (format === 'csv') {
        await exportQuotesToCSV(quotes);
        return;
      }
      await exportQuotesToExcel(quotes);
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 sm:text-sm">Relatórios</p>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Insights e Exportação</h1>
          <p className="text-xs text-slate-400 sm:text-sm">Gere PDFs, Excel ou CSV com os dados do funil de orçamentos.</p>
        </div>
        <ExportButtons
          onPDF={() => handleExport('pdf')}
          onCSV={() => handleExport('csv')}
          onExcel={() => handleExport('excel')}
          disabled={Boolean(exportingFormat)}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div className="card p-3 sm:p-5">
          <p className="mb-3 text-xs font-semibold text-white sm:mb-4 sm:text-sm">Status dos orçamentos</p>
          <div className="h-56 sm:h-80">
            <ResponsiveContainer width="100%" height="100%" minHeight={180} minWidth={240}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={100} label isAnimationActive={false}>
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

        <div className="card p-3 sm:p-5">
          <p className="mb-3 text-xs font-semibold text-white sm:mb-4 sm:text-sm">Top clientes por valor</p>
          <div className="space-y-2 sm:space-y-3">
            {clientRanking.map((client, idx) => (
              <div key={client.name} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5 sm:py-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white sm:text-base">{client.name}</p>
                    <p className="text-[11px] text-slate-400 sm:text-xs">{client.count} orçamentos</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-white sm:text-sm">{formatCurrency(client.total)}</p>
              </div>
            ))}
            {clientRanking.length === 0 && <p className="text-xs text-slate-400 sm:text-sm">Nenhum dado disponível.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Relatorios;
