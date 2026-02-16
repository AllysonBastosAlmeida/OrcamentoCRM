import { Copy, FileDown, Pencil, Trash2 } from 'lucide-react';
import { exportQuoteToPDF } from '../utils/exporters.js';
import { formatCurrency, formatDate, statusBadgeClass } from '../utils/formatters.js';

const QuotesTable = ({ quotes, onEdit, onDuplicate, onDelete }) => {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead className="bg-white/5">
            <tr>
              <th className="px-4 py-3">PO</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Titulo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {(quotes || []).map((quote, idx) => (
              <tr key={quote.id || quote.poNumber || `quote-${idx}`} className="hover:bg-white/5">
                <td className="px-4 py-3 font-semibold text-white">{quote.poNumber || '--'}</td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-semibold text-white">{quote.clientName}</p>
                    <p className="text-xs text-slate-400">{quote.clientEmail}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{quote.title}</p>
                  <p className="text-xs text-slate-400">{quote.items?.length || 0} itens</p>
                </td>
                <td className="px-4 py-3 font-semibold text-white">{formatCurrency(quote.total)}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(quote.status)}>{quote.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatDate(quote.date || quote.validUntil || quote.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="rounded-lg border border-white/10 p-2 text-slate-200 hover:border-primary/50 hover:text-white"
                      onClick={() => onEdit(quote)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg border border-white/10 p-2 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-200"
                      onClick={() => onDuplicate(quote.id || quote.poNumber)}
                      title="Duplicar"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg border border-white/10 p-2 text-slate-200 hover:border-sky-500/50 hover:text-sky-200"
                      onClick={() => exportQuoteToPDF(quote)}
                      title="Exportar PDF"
                    >
                      <FileDown className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg border border-white/10 p-2 text-slate-200 hover:border-rose-500/50 hover:text-rose-200"
                      onClick={() => onDelete(quote)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuotesTable;
