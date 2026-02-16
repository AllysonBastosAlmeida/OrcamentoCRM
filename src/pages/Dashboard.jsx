import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Briefcase, CheckCircle2, Clock, Filter, Plus, RefreshCw, TrendingUp } from 'lucide-react';
import { useQuotes } from '../hooks/useQuotes.js';
import { formatCurrency } from '../utils/formatters.js';
import ExportButtons from '../components/ExportButtons.jsx';
import { exportQuoteToPDF, exportQuotesToCSV, exportQuotesToExcel } from '../utils/exporters.js';

const toNumber = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = val.toString();
  const cleaned = str.replace(/[^0-9,.\-]/g, '');
  if (!cleaned) return 0;

  if (cleaned.includes('.') && cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const num = Number(normalized);
    return Number.isNaN(num) ? 0 : num;
  }

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let decimalSep = -1;
  if (lastDot > lastComma) decimalSep = lastDot;
  if (lastComma > lastDot) decimalSep = lastComma;

  if (decimalSep === -1) {
    const num = Number(cleaned.replace(/[.,]/g, ''));
    return Number.isNaN(num) ? 0 : num;
  }

  const intPart = cleaned.slice(0, decimalSep).replace(/[.,]/g, '');
  const decPart = cleaned.slice(decimalSep + 1);
  const num = Number(`${intPart}.${decPart}`);
  return Number.isNaN(num) ? 0 : num;
};

const groupBy = (arr, keySelector, valueSelector = () => 1) => {
  const map = new Map();
  arr.forEach((item) => {
    const key = keySelector(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + valueSelector(item));
  });
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
};

const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const barPalette = ['#38bdf8', '#a855f7', '#22c55e', '#f97316', '#eab308', '#0ea5e9', '#ef4444', '#10b981'];

const Dashboard = () => {
  const { quotes, refreshQuotes } = useQuotes();
  const [reloading, setReloading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);

  const enriched = useMemo(
    () =>
      (quotes || []).map((q) => {
        const dateObj = q.createdAt ? new Date(q.createdAt) : null;
        const isValidDate = dateObj && !Number.isNaN(dateObj.getTime());
        const year = isValidDate ? dateObj.getFullYear() : null;
        const monthIndex = isValidDate ? dateObj.getMonth() : null;
        return {
          ...q,
          totalNumber: toNumber(q.total),
          year,
          monthIndex,
          monthLabel: monthIndex === null ? 'Sem data' : monthNames[monthIndex],
        };
      }),
    [quotes],
  );

  const availableYears = useMemo(
    () => Array.from(new Set(enriched.map((q) => q.year).filter(Boolean))).sort((a, b) => b - a),
    [enriched],
  );

  useEffect(() => {
    if (availableYears.length > 0) {
      setSelectedYear((prev) => (prev && availableYears.includes(prev) ? prev : availableYears[0]));
    }
  }, [availableYears]);

  const filtered = useMemo(
    () => (selectedYear ? enriched.filter((q) => q.year === selectedYear) : enriched),
    [enriched, selectedYear],
  );

  const isLost = (q) =>
    (q.status || '').toLowerCase() === 'perdido' || (q.approvalStatus || '').toLowerCase() === 'reprovado';
  const activeQuotes = enriched.filter((q) => !isLost(q));
  const totalCount = activeQuotes.length;
  const approved = enriched.filter((q) => (q.approvalStatus || '').toLowerCase() === 'aprovado');
  const reprovados = enriched.filter((q) => (q.approvalStatus || '').toLowerCase() === 'reprovado');
  const enviados = enriched.filter((q) => (q.status || '').toLowerCase() === 'enviado');
  const rascunhos = enriched.filter((q) => (q.status || '').toLowerCase() === 'rascunho');

  const pipelineValue = activeQuotes.reduce((acc, q) => acc + q.totalNumber, 0);
  const approvedValue = approved.reduce((acc, q) => acc + q.totalNumber, 0);
  const avgTicket = totalCount ? pipelineValue / totalCount : 0;
  const conversion = totalCount ? Math.round((approved.length / totalCount) * 100) : 0;

  const cards = [
    {
      title: 'Orcamentos ativos',
      value: totalCount,
      subtitle: `${approved.length} aprovados / ${enviados.length} enviados`,
      icon: <Briefcase className="h-5 w-5" />,
    },
    {
      title: 'Valor em pipeline',
      value: formatCurrency(pipelineValue),
      subtitle: 'Soma de todos os orcamentos',
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      title: 'Taxa de conversao',
      value: `${conversion}%`,
      subtitle: 'Aprovados / total',
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      title: 'Rascunhos pendentes',
      value: rascunhos.length,
      subtitle: 'Aguardando envio',
      icon: <Clock className="h-5 w-5" />,
    },
    {
      title: 'Valor aprovado',
      value: formatCurrency(approvedValue),
      subtitle: `${approved.length} aprovados`,
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      title: 'Valor reprovado',
      value: formatCurrency(reprovados.reduce((acc, q) => acc + q.totalNumber, 0)),
      subtitle: `${reprovados.length} reprovados`,
      icon: <Clock className="h-5 w-5" />,
    },
    {
      title: 'Ticket medio',
      value: formatCurrency(avgTicket),
      subtitle: 'Valor medio por orcamento',
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      title: 'Em andamento',
      value: enviados.length,
      subtitle: 'Status: Enviado',
      icon: <Briefcase className="h-5 w-5" />,
    },
  ];

  const volumeMensal = useMemo(() => {
    const grouped = new Map();
    filtered.forEach((q) => {
      if (q.monthIndex === null) return;
      const key = q.monthIndex;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return monthNames.map((label, idx) => ({ key: `${label}/${selectedYear || ''}`.trim(), value: grouped.get(idx) || 0, monthIndex: idx }));
  }, [filtered, selectedYear]);

  const valorMensal = useMemo(() => {
    const grouped = new Map();
    filtered.forEach((q) => {
      if (q.monthIndex === null) return;
      const key = q.monthIndex;
      grouped.set(key, (grouped.get(key) || 0) + q.totalNumber);
    });
    return monthNames.map((label, idx) => ({
      key: `${label}/${selectedYear || ''}`.trim(),
      value: grouped.get(idx) || 0,
      monthIndex: idx,
    }));
  }, [filtered, selectedYear]);

  const valorPorStatus = groupBy(enriched, (q) => q.status || 'Sem status', (q) => q.totalNumber);
  const qtdPorStatus = groupBy(enriched, (q) => q.status || 'Sem status');
  const valorPorCategoria = groupBy(enriched, (q) => q.category || 'Sem categoria', (q) => q.totalNumber);
  const valorPorAprovacao = groupBy(enriched, (q) => q.approvalStatus || 'Sem aprovacao', (q) => q.totalNumber);
  const valorPorResponsavel = groupBy(enriched, (q) => q.responsible || 'Sem responsavel', (q) => q.totalNumber).slice(0, 6);
  const ranking = groupBy(enriched, (q) => q.clientName || 'Sem cliente', (q) => q.totalNumber)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const recents = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => {
      const dateA = a.createdAt || a.validUntil || a.date;
      const dateB = b.createdAt || b.validUntil || b.date;
      const tA = dateA ? new Date(dateA).getTime() : 0;
      const tB = dateB ? new Date(dateB).getTime() : 0;
      if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) return tB - tA;
      const poA = Number(a.poNumber || 0);
      const poB = Number(b.poNumber || 0);
      return poB - poA;
    });
    return sorted.slice(0, 6);
  }, [enriched]);

  const tooltipStyle = {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0',
  };
  const tooltipLabelStyle = { color: '#e2e8f0' };
  const tooltipItemStyle = { color: '#e2e8f0' };

  const handleReload = async () => {
    setReloading(true);
    await refreshQuotes();
    setReloading(false);
  };

  const renderBars = (data, dataKey) => (
    <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>
      {data.map((_, idx) => (
        <Cell key={idx} fill={barPalette[idx % barPalette.length]} />
      ))}
    </Bar>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Visao geral</p>
          <h1 className="text-2xl font-bold text-white">Dashboard de Orcamentos</h1>
          <p className="text-sm text-slate-400">
            Dados da planilha Processos_Orcamentos (Orcamento Web) com visao executiva do funil.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={handleReload}>
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            Recarregar planilha
          </button>
          <button className="btn-primary" onClick={() => (window.location.href = '/orcamentos')}>
            <Plus className="h-4 w-4" />
            Novo orcamento
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.title} className="card relative overflow-hidden p-5">
            <div className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-slate-300">{card.icon}</div>
            <p className="text-sm text-slate-400">{card.title}</p>
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-xs text-slate-400">{card.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-white">Volume mensal (quantidade)</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                {renderBars(volumeMensal, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Valor mensal (R$)</p>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Tendencia</span>
              <select
                value={selectedYear || ''}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valorMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                {renderBars(valorMensal, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Valor por status</p>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">R$</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valorPorStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Legend />
                {renderBars(valorPorStatus, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Quantidade por status</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Funil</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qtdPorStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend />
                {renderBars(qtdPorStatus, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Valor por categoria</p>
            <Filter className="h-4 w-4 text-slate-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valorPorCategoria}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Legend />
                {renderBars(valorPorCategoria, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Valor por aprovacao</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Aprovacao</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valorPorAprovacao}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="key" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Legend />
                {renderBars(valorPorAprovacao, 'value')}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Top clientes por valor</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Top 5</span>
          </div>
          <div className="space-y-3">
            {ranking.map((client, idx) => (
              <div key={client.key} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">{idx + 1}</span>
                  <p className="font-semibold text-white">{client.key}</p>
                </div>
                <p className="text-sm font-semibold text-white">{formatCurrency(client.value)}</p>
              </div>
            ))}
            {ranking.length === 0 && <p className="text-sm text-slate-400">Nenhum cliente ranqueado.</p>}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Valor por responsavel</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Top 6</span>
          </div>
          <div className="space-y-3">
            {valorPorResponsavel.map((resp, idx) => (
              <div key={resp.key} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">{idx + 1}</span>
                  <p className="font-semibold text-white">{resp.key}</p>
                </div>
                <p className="text-sm font-semibold text-white">{formatCurrency(resp.value)}</p>
              </div>
            ))}
            {valorPorResponsavel.length === 0 && <p className="text-sm text-slate-400">Nenhum responsavel ranqueado.</p>}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Ultimos orcamentos</p>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Atualizados</span>
        </div>
        <div className="space-y-3">
          {recents.map((quote) => (
            <div key={quote.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <div>
                <p className="font-semibold text-white">{quote.clientName || 'Cliente'}</p>
                <p className="text-xs text-slate-400">{quote.title || 'Sem titulo'}</p>
                <p className="text-[11px] text-slate-400">
                  Categoria: {quote.category || '--'} | Aprovacao: {quote.approvalStatus || '--'} | Responsavel: {quote.responsible || '--'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{formatCurrency(quote.totalNumber)}</p>
                <p className="text-xs text-slate-400">{quote.status || 'Sem status'}</p>
                <p className="text-[11px] text-slate-400">{quote.createdAt}</p>
              </div>
            </div>
          ))}
          {recents.length === 0 && <p className="text-sm text-slate-400">Sem orcamentos cadastrados.</p>}
        </div>
      </div>

      <ExportButtons
        onCSV={() => exportQuotesToCSV(enriched)}
        onExcel={() => exportQuotesToExcel(enriched)}
        onPDF={() => enriched.forEach((quote) => exportQuoteToPDF(quote))}
      />
    </div>
  );
};

export default Dashboard;
