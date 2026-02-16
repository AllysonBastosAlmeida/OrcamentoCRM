import { useEffect, useMemo, useState } from 'react';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import QuotesTable from '../components/QuotesTable.jsx';
import QuoteModal from '../components/QuoteModal.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import { useQuotes } from '../hooks/useQuotes.js';
import { useProducts } from '../hooks/useProducts.js';
import { graphConfig } from '../services/api.js';
import { useClients } from '../hooks/useClients.js';
import { exportQuoteToPDF, exportQuotesToCSV, exportQuotesToExcel } from '../utils/exporters.js';

const Orcamentos = () => {
  const { quotes, addQuote, editQuote, cloneQuote, removeQuote, refreshQuotes } = useQuotes();
  const materiais = useProducts(graphConfig.sheetMateriais);
  const servicos = useProducts(graphConfig.sheetServicos);
  const { clients, loading: loadingClients } = useClients();

  const loadingCatalog = materiais.loading || servicos.loading || loadingClients;
  const [reloadingQuotes, setReloadingQuotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(5);

  const filteredQuotes = useMemo(() => {
    const filtered = quotes.filter((quote) => {
      const matchesStatus = statusFilter === 'Todos' || quote.status === statusFilter;
      const searchText = `${quote.clientName} ${quote.title}`.toLowerCase();
      const matchesSearch = searchText.includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    const scoreDate = (q) => {
      const dateStr = q.date || q.validUntil || q.createdAt;
      const t = dateStr ? new Date(dateStr).getTime() : 0;
      if (!Number.isNaN(t) && t > 0) return t;
      const poNum = q.poNumber ? Number(q.poNumber) : 0;
      return Number.isNaN(poNum) ? 0 : poNum;
    };
    return filtered.sort((a, b) => scoreDate(b) - scoreDate(a));
  }, [quotes, statusFilter, search]);

  const visibleQuotes = useMemo(() => filteredQuotes.slice(0, limit), [filteredQuotes, limit]);

  const clientOptions = useMemo(() => {
    const normalize = (val) => (val ?? '').toString().trim().toLowerCase();
    const base = Array.isArray(clients) ? clients : [];
    const fromQuotes = quotes
      .filter((q) => q?.clientCompany || q?.clientName)
      .map((q, idx) => ({
        id: q.clientId || q.clientCompany || q.clientName || `quote-${idx}`,
        company: q.clientCompany || '',
        name: q.clientName || q.clientCompany || '',
        responsavel: q.clientName || '',
        email: q.clientEmail || '',
        phone: q.clientPhone || '',
      }));

    const dedup = new Map();
    [...base, ...fromQuotes].forEach((c) => {
      const key = normalize(c.id || c.company || c.name || c.email);
      if (!key) return;
      if (!dedup.has(key)) dedup.set(key, c);
    });

    return Array.from(dedup.values());
  }, [clients, quotes]);

  useEffect(() => {
    setLimit(5);
  }, [search, statusFilter]);

  const handleSave = async (payload) => {
    if (selected) {
        await editQuote(selected.id, payload);
    } else {
        await addQuote(payload);
    }
    setSelected(null);
    setOpenModal(false);
  };

    const [confirmQuote, setConfirmQuote] = useState(null);

  const handleDelete = (quote) => {
    setConfirmQuote(quote);
  };

  const handleConfirmDelete = async () => {
    if (confirmQuote) {
      setDeleting(true);
      await removeQuote(confirmQuote.id);
      setDeleting(false);
      setConfirmQuote(null);
    }
  };

  const handleCancelDelete = () => setConfirmQuote(null);

  const refreshCatalog = () => {
    materiais.refresh();
    servicos.refresh();
  };

  const handleReloadAll = async () => {
    setReloadingQuotes(true);
    refreshCatalog();
    await refreshQuotes();
    setReloadingQuotes(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Gestão</p>
          <h1 className="text-2xl font-bold text-white">Orçamentos</h1>
          <p className="text-sm text-slate-400">
            Monte o orçamento escolhendo Materiais e Serviços direto da planilha QQP e Orçamento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={handleReloadAll}>
            <RefreshCw className={`h-4 w-4 ${loadingCatalog || reloadingQuotes ? 'animate-spin' : ''}`} />
            Recarregar planilha
          </button>
          <button className="btn-primary" onClick={() => setOpenModal(true)}>
            <Plus className="h-4 w-4" />
            Novo orçamento
          </button>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <Filter className="h-4 w-4 text-slate-300" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm text-white outline-none"
            >
              <option>Todos</option>
              <option>Rascunho</option>
              <option>Enviado</option>
              <option>Aprovado</option>
              <option>Perdido</option>
            </select>
          </div>
          <input
            placeholder="Buscar cliente ou título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
          />
        </div>
        <ExportButtons
          onCSV={() => exportQuotesToCSV(filteredQuotes)}
          onExcel={() => exportQuotesToExcel(filteredQuotes)}
          onPDF={() => filteredQuotes.forEach((quote) => exportQuoteToPDF(quote))}
        />
      </div>
      <QuotesTable
        quotes={visibleQuotes}
        onEdit={(quote) => {
          setSelected(quote);
          setOpenModal(true);
        }}
        onDuplicate={cloneQuote}
        onDelete={handleDelete}
      />

      {visibleQuotes.length < filteredQuotes.length && (
        <div className="flex justify-center">
          <button className="btn-secondary" onClick={() => setLimit((l) => l + 10)}>
            Listar mais
          </button>
        </div>
      )}

      <QuoteModal
        open={openModal}
        onClose={() => {
          setSelected(null);
          setOpenModal(false);
        }}
        onSave={handleSave}
        quote={selected}
        materials={materiais.products}
        services={servicos.products}
        loadingCatalog={loadingCatalog}
        onRefreshCatalog={refreshCatalog}
        clients={clientOptions}
      />

      {confirmQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-white">Excluir orçamento</h3>
            <p className="mb-4 text-sm text-slate-300">
              Deseja excluir o orçamento {confirmQuote.poNumber ? `PO ${confirmQuote.poNumber}` : ''}{' '}
              {confirmQuote.title ? `(${confirmQuote.title})` : ''}?
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={handleCancelDelete}>
                Cancelar
              </button>
              <button
                className={`btn-primary bg-rose-600 border-rose-500 hover:bg-rose-500 ${deleting ? 'opacity-70 cursor-not-allowed' : ''}`}
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orcamentos;
