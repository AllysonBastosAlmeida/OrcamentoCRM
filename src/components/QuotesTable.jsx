import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, BadgePercent, Copy, FileDown, FileSpreadsheet, Mail, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, statusBadgeClass } from '../utils/formatters.js';
import { calculateQuoteProfitability } from '../utils/profitability.js';

const normalizeApproval = (value) =>
  value
    ?.toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const approvalOptions = [
  { key: 'aguardando', label: 'Aguardando', color: 'bg-amber-400' },
  { key: 'aprovado', label: 'Aprovado', color: 'bg-emerald-400' },
  { key: 'reprovado', label: 'Reprovado', color: 'bg-rose-500' },
];

const resolveApprovalKey = (value) => {
  const normalized = normalizeApproval(value);
  if (!normalized) return 'aguardando';
  if (normalized.includes('reprov')) return 'reprovado';
  if (normalized.includes('aprov')) return 'aprovado';
  if (normalized.includes('aguard')) return 'aguardando';
  return 'aguardando';
};

const getMarginValue = (quote) => {
  const analysis = calculateQuoteProfitability(quote);
  return analysis?.ready ? analysis.estimatedMarginPct : null;
};

const QuotesTable = ({
  quotes,
  onEdit,
  onDuplicate,
  onDelete,
  onEmail,
  onProfitability,
  sortKey,
  sortDir,
  onSort,
  onApprovalChange,
  updatingApproval,
}) => {
  const actionButtonClass =
    'rounded-lg border border-white/10 p-[3px] text-slate-200 transition hover:bg-white/5';
  const [exportingQuoteKey, setExportingQuoteKey] = useState(null);

  const handleExportPdf = async (quote) => {
    const quoteKey = String(quote?.id || quote?.poNumber || '');
    const exportKey = `pdf:${quoteKey}`;
    if (!quoteKey || exportingQuoteKey) return;
    try {
      setExportingQuoteKey(exportKey);
      const { exportQuoteToPDF } = await import('../utils/exporters.js');
      await exportQuoteToPDF(quote);
    } finally {
      setExportingQuoteKey(null);
    }
  };

  const handleExportExcel = async (quote) => {
    const quoteKey = String(quote?.id || quote?.poNumber || '');
    const exportKey = `excel:${quoteKey}`;
    if (!quoteKey || exportingQuoteKey) return;
    try {
      setExportingQuoteKey(exportKey);
      const { exportQuoteDetailsToExcel } = await import('../utils/exporters.js');
      await exportQuoteDetailsToExcel(quote);
    } finally {
      setExportingQuoteKey(null);
    }
  };

  const renderSortIcon = (key) => {
    if (!onSort) return null;
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-amber-200" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-amber-200" />
    );
  };

  const headerButton = (label, key, align = 'left') => (
    <button
      type="button"
      onClick={() => onSort && onSort(key)}
      className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-[11px] ${
        align === 'center' ? 'mx-auto justify-center' : align === 'right' ? 'ml-auto justify-end' : ''
      }`}
    >
      <span>{label}</span>
      {renderSortIcon(key)}
    </button>
  );

  const renderApprovalDots = (quote) => {
    const currentKey = resolveApprovalKey(quote?.approvalStatus);
    const isUpdating =
      (updatingApproval || updatingApproval === 0) &&
      (quote?.poNumber || quote?.id) &&
      String(quote.poNumber || quote.id) === String(updatingApproval);
    return (
      <div className="flex items-center gap-1">
        {approvalOptions.map((option) => {
          const isActive = option.key === currentKey;
          return (
            <button
              key={option.key}
              type="button"
              title={option.label}
              onClick={() => onApprovalChange && onApprovalChange(quote, option.label)}
              disabled={!onApprovalChange || isUpdating}
              className={`h-3 w-3 rounded-full ${option.color} ${
                isActive
                  ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 shadow-[0_0_8px_rgba(255,255,255,0.35)] animate-pulse'
                  : 'opacity-70 hover:opacity-100'
              } ${!onApprovalChange || isUpdating ? 'cursor-not-allowed opacity-40' : ''}`}
              aria-label={option.label}
            />
          );
        })}
      </div>
    );
  };
  return (
    <div className="card overflow-hidden">
      <div className="md:hidden">
        {(quotes || []).map((quote, idx) => (
          (() => {
            const margin = getMarginValue(quote);
            const quoteKey = String(quote.id || quote.poNumber || '');
            const isExportingPdf = exportingQuoteKey === `pdf:${quoteKey}`;
            const isExportingExcel = exportingQuoteKey === `excel:${quoteKey}`;
            return (
          <div
            key={quote.id || quote.poNumber || `quote-${idx}`}
            className="border-b border-white/5 px-3 py-2 text-[11px] last:border-b-0 hover:bg-white/5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                    PO {quote.poNumber || '--'}
                  </span>
                  <span className={statusBadgeClass(quote.status)}>{quote.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {renderApprovalDots(quote)}
                </div>
                <p className="truncate text-xs font-semibold text-white">{quote.clientCompany || quote.clientName}</p>
                <p className="truncate text-[11px] text-slate-400">{quote.title || 'Sem titulo'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-semibold text-white">{formatCurrency(quote.total)}</span>
                <span className={`text-[10px] font-semibold ${margin !== null && margin >= 0 ? 'text-emerald-300' : margin !== null ? 'text-rose-300' : 'text-slate-400'}`}>
                  {margin !== null ? `${margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% margem` : 'Margem --'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {formatDate(quote.date || quote.validUntil || quote.createdAt)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-white"
                    onClick={() => onEdit(quote)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-200"
                    onClick={() => onDuplicate && onDuplicate(quote)}
                    title="Duplicar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-amber-400/50 hover:text-amber-100"
                    onClick={() => handleExportPdf(quote)}
                    title="Exportar PDF"
                    disabled={isExportingPdf}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-emerald-400/50 hover:text-emerald-100"
                    onClick={() => handleExportExcel(quote)}
                    title="Baixar Excel detalhado"
                    disabled={isExportingExcel}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-amber-500/50 hover:text-amber-200"
                    onClick={() => onEmail && onEmail(quote)}
                    title="Gerar e-mail"
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-amber-300/50 hover:text-amber-100"
                    onClick={() => onProfitability && onProfitability(quote)}
                    title="Rentabilidade"
                  >
                    <BadgePercent className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-rose-500/50 hover:text-rose-200"
                    onClick={() => onDelete(quote)}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
            );
          })()
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="table w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[20%]" />
            <col className="w-[22%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
            <col className="w-[7%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-white/5">
            <tr>
              <th className="px-2 py-2">{headerButton('PO', 'poNumber')}</th>
              <th className="px-2 py-2">{headerButton('Cliente', 'client')}</th>
              <th className="px-2 py-2">{headerButton('Titulo', 'title')}</th>
              <th className="px-2 py-2">{headerButton('Valor', 'total', 'right')}</th>
              <th className="px-2 py-2 text-center">
                <span className="inline-flex flex-col items-center text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-[11px]">
                  <span>Margem</span>
                  <span>%</span>
                </span>
              </th>
              <th className="px-2 py-2">{headerButton('Status', 'status', 'center')}</th>
              <th className="px-2 py-2 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-[11px]">Aprov.</span>
              </th>
              <th className="px-2 py-2">{headerButton('Data', 'date', 'center')}</th>
              <th className="px-2 py-2 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-[11px]">Acoes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(quotes || []).map((quote, idx) => {
              const margin = getMarginValue(quote);
              const quoteKey = String(quote.id || quote.poNumber || '');
                const isExportingPdf = exportingQuoteKey === `pdf:${quoteKey}`;
                const isExportingExcel = exportingQuoteKey === `excel:${quoteKey}`;
              return (
              <tr key={quote.id || quote.poNumber || `quote-${idx}`} className="hover:bg-white/5">
                <td className="px-2 py-2 text-white align-top">
                  <div className="flex flex-col gap-1">
                    <span className="truncate">{quote.poNumber || '--'}</span>
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <div className="min-w-0">
                    <p className="truncate text-white">{quote.clientCompany || quote.clientName}</p>
                    <p className="truncate text-[10px] text-slate-400">{quote.clientEmail}</p>
                  </div>
                </td>
                <td className="px-2 py-2 align-top">
                  <p className="truncate text-white">{quote.title}</p>
                  <p className="text-[10px] text-slate-400">{quote.items?.length || 0} itens</p>
                </td>
                <td className="px-2 py-2 text-right align-top text-white">{formatCurrency(quote.total)}</td>
                <td className="px-2 py-2 text-center align-top">
                  <span className={`text-[10px] font-semibold ${margin !== null && margin >= 0 ? 'text-emerald-300' : margin !== null ? 'text-rose-300' : 'text-slate-400'}`}>
                    {margin !== null ? `${margin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '--'}
                  </span>
                </td>
                <td className="px-2 py-2 text-center align-top">
                  <span className={`${statusBadgeClass(quote.status)} inline-flex max-w-full whitespace-nowrap px-2 py-1 text-[10px]`}>
                    {quote.status}
                  </span>
                </td>
                <td className="px-2 py-2 align-top">
                  <div className="flex justify-center">
                    {renderApprovalDots(quote)}
                  </div>
                </td>
                <td className="px-2 py-2 text-center align-top text-slate-300">
                  <span className="block whitespace-nowrap text-[10px]">
                    {formatDate(quote.date || quote.validUntil || quote.createdAt)}
                  </span>
                </td>
                <td className="px-2 py-2 align-top">
                  <div className="mx-auto grid w-fit grid-cols-3 gap-0.5">
                    <button
                      className={`${actionButtonClass} hover:border-primary/50 hover:text-white`}
                      onClick={() => onEdit(quote)}
                      title="Editar"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-emerald-500/50 hover:text-emerald-200`}
                      onClick={() => onDuplicate && onDuplicate(quote)}
                      title="Duplicar"
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-amber-400/50 hover:text-amber-100 ${isExportingPdf ? 'cursor-not-allowed opacity-60' : ''}`}
                      onClick={() => handleExportPdf(quote)}
                      title="Exportar PDF"
                      disabled={isExportingPdf}
                    >
                      <FileDown className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-emerald-400/50 hover:text-emerald-100 ${isExportingExcel ? 'cursor-not-allowed opacity-60' : ''}`}
                      onClick={() => handleExportExcel(quote)}
                      title="Baixar Excel detalhado"
                      disabled={isExportingExcel}
                    >
                      <FileSpreadsheet className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-amber-500/50 hover:text-amber-200`}
                      onClick={() => onEmail && onEmail(quote)}
                      title="Gerar e-mail"
                    >
                      <Mail className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-amber-300/50 hover:text-amber-100`}
                      onClick={() => onProfitability && onProfitability(quote)}
                      title="Rentabilidade"
                    >
                      <BadgePercent className="h-2.5 w-2.5" />
                    </button>
                    <button
                      className={`${actionButtonClass} hover:border-rose-500/50 hover:text-rose-200`}
                      onClick={() => onDelete(quote)}
                      title="Excluir"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuotesTable;
