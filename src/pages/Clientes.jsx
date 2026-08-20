
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useClients } from '../hooks/useClients.js';
import ModalPortal from '../components/ModalPortal.jsx';
import { useToast } from '../components/ToastHost.jsx';

const emptyClient = {
  id: '',
  company: '',
  name: '',
  endereco: '',
  email: '',
  phone: '',
  notes: '',
  local: '',
};

const Clientes = () => {
  const { clients, loading, error, refresh, saveClient, deleteClient } = useClients();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmClient, setConfirmClient] = useState(null);
  const [deletingClient, setDeletingClient] = useState(false);
  const [form, setForm] = useState(emptyClient);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const normalizeText = (value) =>
      value
        ?.toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
    const term = normalizeText(search || '');
    const safe = (value) => normalizeText(value || '');
    return (clients || []).filter(
      (c) => safe(c?.company).includes(term) || safe(c?.name || c?.responsavel).includes(term) || safe(c?.email).includes(term),
    );
  }, [clients, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleClients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);
  const stats = useMemo(() => {
    const list = clients || [];
    const withContact = list.filter(
      (c) => (c?.email || '').trim() || (c?.phone || '').trim(),
    ).length;
    return {
      total: list.length,
      filtered: filtered.length,
      withContact,
    };
  }, [clients, filtered.length]);

  useEffect(() => {
    if (!modalOpen) setForm(emptyClient);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (loading) return;
      setModalOpen(false);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [modalOpen, loading]);

  useEffect(() => {
    if (!confirmClient) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (deletingClient) return;
      setConfirmClient(null);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [confirmClient, deletingClient]);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setForm(emptyClient);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, clients]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const maxButtons = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [currentPage, totalPages]);

  const scrollPageToTop = () => {
    if (typeof document === 'undefined') return;
    const scroller = document.querySelector('main.desktop-shell');
    if (scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (nextPage) => {
    const resolvedPage = Math.max(1, Math.min(totalPages, nextPage));
    if (resolvedPage === currentPage) return;
    setPage(resolvedPage);
    scrollPageToTop();
  };

  const openEdit = (client) => {
    setForm(client || emptyClient);
    setModalOpen(true);
  };

  const handleRequestDeleteClient = (client) => {
    setConfirmClient(client);
  };

  const handleDeleteClient = async () => {
    if (!confirmClient) return;
    setDeletingClient(true);
    try {
      await deleteClient(confirmClient.id || confirmClient.company || confirmClient.email);
      pushToast('Cliente exclu?do.', 'success');
      setConfirmClient(null);
    } catch (error) {
      console.error('Falha ao excluir cliente', error);
      pushToast('Falha ao excluir cliente.', 'error');
    } finally {
      setDeletingClient(false);
    }
  };

  const handleSubmit = async () => {
    try {
      await saveClient(form);
      pushToast('Cliente salvo.', 'success');
      setModalOpen(false);
    } catch (error) {
      console.error('Falha ao salvar cliente', error);
      pushToast('Falha ao salvar cliente.', 'error');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 sm:text-sm">CRM</p>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Clientes</h1>
          <p className="text-xs text-slate-400 sm:text-sm">Gerencie a base de clientes: adicionar, editar e remover registros.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            Atualizar
          </button>
          <button className="btn-primary" onClick={() => openEdit(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total de clientes</p>
            <p className="text-lg font-bold text-white sm:text-xl">{stats.total}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Filtrados</p>
            <p className="text-lg font-bold text-white sm:text-xl">{stats.filtered}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Status</p>
            <p className="text-xs font-semibold text-white sm:text-sm">{loading ? 'Carregando...' : 'Sincronizado'}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-amber-300" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Contato cadastrado</p>
            <p className="text-lg font-bold text-white sm:text-xl">{stats.withContact}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-global-search
          placeholder="Buscar por empresa, contato ou email"
          className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/50 sm:text-sm"
        />
      </div>

      {error && (
        <div className="card border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100 sm:text-sm">
          Erro: {error}
        </div>
      )}

      <div className="card overflow-hidden border border-white/10 bg-white/5">
        <div className="hidden grid-cols-12 gap-2 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
          <span className="col-span-1 text-left">ID</span>
          <span className="col-span-3">Empresa</span>
          <span className="col-span-2">Responsavel</span>
          <span className="col-span-2">Local</span>
          <span className="col-span-2">Email</span>
          <span className="col-span-1 text-right">Telefone</span>
          <span className="col-span-1 text-right">Acoes</span>
        </div>
        {visibleClients.length === 0 && (
          <div className="px-4 py-4 text-xs text-slate-400 sm:text-sm">Nenhum cliente encontrado.</div>
        )}
        {visibleClients.map((client, idx) => (
          <div
            key={client.id || client.company || client.email || `client-${idx}`}
            className="border-b border-white/5 px-2.5 py-1.5 text-[11px] leading-tight last:border-b-0 hover:bg-white/5 sm:px-4 sm:py-2"
          >
            <div className="flex items-center justify-between gap-3 md:hidden">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                    {client.id || '--'}
                  </span>
                  <p className="truncate text-xs font-semibold text-white">
                    {client.company || 'Empresa nao informada'}
                  </p>
                </div>
                <p className="truncate text-[11px] text-slate-400">
                  {client.responsavel || client.name || '--'} · {client.email || '--'}
                </p>
                <p className="truncate text-[10px] text-slate-500">{client.local || '--'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-slate-300">{client.phone || '--'}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-primary"
                    onClick={() => openEdit(client)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-rose-500/40 p-1 text-rose-200 hover:bg-rose-500/10"
                    onClick={() => handleRequestDeleteClient(client)}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-2">
              <div className="md:col-span-1 text-slate-300">{client.id || '--'}</div>
              <div className="md:col-span-3 truncate text-white" title={client.company || 'Empresa nao informada'}>
                {client.company || 'Empresa nao informada'}
              </div>
              <div className="md:col-span-2 truncate text-slate-200" title={client.responsavel || client.name || '--'}>
                {client.responsavel || client.name || '--'}
              </div>
              <div className="md:col-span-2 truncate text-slate-300" title={client.local || '--'}>
                {client.local || '--'}
              </div>
              <div className="md:col-span-2 truncate text-slate-300" title={client.email || '--'}>
                {client.email || '--'}
              </div>
              <div className="md:col-span-1 text-right text-slate-300" title={client.phone || '--'}>
                {client.phone || '--'}
              </div>
              <div className="md:col-span-1 flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-primary"
                  onClick={() => openEdit(client)}
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-lg border border-rose-500/40 p-1 text-rose-200 hover:bg-rose-500/10"
                  onClick={() => handleRequestDeleteClient(client)}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 bg-white/5 px-4 py-3">
            <button className="btn-secondary" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
              Anterior
            </button>
            <div className="hidden items-center gap-1 sm:flex">
              {pageNumbers.map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`page-chip ${num === currentPage ? 'page-chip-active' : ''}`}
                  onClick={() => handlePageChange(num)}
                >
                  {num}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400 sm:hidden">
              {currentPage} / {totalPages}
            </span>
            <button
              className="btn-secondary"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Próximo
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || loading) return;
            setModalOpen(false);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl text-xs sm:text-sm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{form.id ? 'Editar cliente' : 'Novo cliente'}</p>
                <h3 className="text-sm font-bold text-white">{form.company || form.name || 'Cadastro de cliente'}</h3>
              </div>
              <button className="text-slate-400 hover:text-white" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-200">
                Empresa
                <input
                  value={form.company}
                  onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                  placeholder="Nome da empresa"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Responsavel
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value, responsavel: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                  placeholder="Contato principal"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Endereco
                <input
                  value={form.endereco}
                  onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                  placeholder="Rua / Cidade / CEP"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Local
                <input
                  value={form.local}
                  onChange={(e) => setForm((prev) => ({ ...prev, local: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                  placeholder="Filial / site / regiao"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-200">
                  Email
                  <input
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                    placeholder="email@empresa.com"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-200">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                    placeholder="(11) 99999-9999"
                  />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-200">
                Notas
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white sm:text-sm outline-none focus:border-primary/60"
                  rows={2}
                  placeholder="Observacoes adicionais"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={loading}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                Salvar
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {confirmClient && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || deletingClient) return;
            setConfirmClient(null);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Excluir cliente</p>
            <h3 className="text-base font-semibold text-white sm:text-lg">Confirmar exclusao</h3>
            <p className="mt-2 text-xs text-slate-300 sm:text-sm">
              Deseja excluir o cliente{' '}
              <span className="font-semibold text-white">{confirmClient.company || confirmClient.name || 'Sem nome'}</span>?
            </p>
            <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">
              Esta acao remove o registro da base de clientes.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmClient(null)} disabled={deletingClient}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleDeleteClient} disabled={deletingClient}>
                {deletingClient ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default Clientes;
