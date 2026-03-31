import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useEmployees } from '../hooks/useEmployees.js';
import { useToast } from '../components/ToastHost.jsx';

const emptyEmployee = {
  id: '',
  name: '',
  email: '',
  phone: '',
  role: '',
  area: '',
  notes: '',
};

const toText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const normalizeText = (value) =>
  toText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const ContatosInternos = () => {
  const { employees, loading, error, refresh, saveEmployee, deleteEmployee } = useEmployees();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmEmployee, setConfirmEmployee] = useState(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const term = normalizeText(search || '');
    const safe = (value) => normalizeText(value);
    return (employees || []).filter(
      (employee) =>
        safe(employee?.name).includes(term) ||
        safe(employee?.email).includes(term) ||
        safe(employee?.phone).includes(term),
    );
  }, [employees, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const stats = useMemo(() => {
    const list = employees || [];
    const withPhone = list.filter((employee) => toText(employee?.phone).trim()).length;
    const withEmail = list.filter((employee) => toText(employee?.email).trim()).length;
    return {
      total: list.length,
      filtered: filtered.length,
      withPhone,
      withEmail,
    };
  }, [employees, filtered.length]);

  useEffect(() => {
    if (!modalOpen) setForm(emptyEmployee);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (savingEmployee) return;
      setModalOpen(false);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [modalOpen, savingEmployee]);

  useEffect(() => {
    if (!confirmEmployee) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (deletingEmployee) return;
      setConfirmEmployee(null);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [confirmEmployee, deletingEmployee]);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setForm(emptyEmployee);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, employees]);

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

  const openEdit = (employee) => {
    setForm(employee || emptyEmployee);
    setModalOpen(true);
  };

  const handleRequestDeleteEmployee = (employee) => {
    setConfirmEmployee(employee);
  };

  const handleDeleteEmployee = async () => {
    if (!confirmEmployee) return;
    setDeletingEmployee(true);
    try {
      await deleteEmployee(confirmEmployee.id || confirmEmployee.name || confirmEmployee.email);
      pushToast('Contato interno excluido.', 'success');
      setConfirmEmployee(null);
    } catch (deleteError) {
      console.error('Falha ao excluir contato interno', deleteError);
      pushToast('Falha ao excluir contato interno.', 'error');
    } finally {
      setDeletingEmployee(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || savingEmployee) return;
    setSavingEmployee(true);
    const startedAt = Date.now();
    try {
      await saveEmployee(form);
      await refresh();
      pushToast('Contato interno salvo.', 'success');
      setModalOpen(false);
    } catch (saveError) {
      console.error('Falha ao salvar contato interno', saveError);
      pushToast('Falha ao salvar contato interno.', 'error');
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 300) {
        await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
      }
      setSavingEmployee(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 sm:text-sm">Equipe</p>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Contatos internos</h1>
          <p className="text-xs text-slate-400 sm:text-sm">Gerencie a lista de colaboradores usada no campo de contato interno do orçamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            Atualizar
          </button>
          <button className="btn-primary" onClick={() => openEdit(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo contato
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Total de contatos</p>
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
            <Briefcase className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Com telefone</p>
            <p className="text-lg font-bold text-white sm:text-xl">{stats.withPhone}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3 sm:p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Briefcase className="h-6 w-6 text-amber-300" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Com e-mail</p>
            <p className="text-lg font-bold text-white sm:text-xl">{stats.withEmail}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-global-search
          placeholder="Buscar por nome, e-mail ou telefone"
          className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/50 sm:text-sm"
        />
      </div>

      {error && <div className="card border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100 sm:text-sm">Erro: {error}</div>}

      <div className="card overflow-hidden border border-white/10 bg-white/5">
        <div className="hidden grid-cols-12 gap-2 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
          <span className="col-span-1 text-left">ID</span>
          <span className="col-span-4">Nome</span>
          <span className="col-span-4">E-mail</span>
          <span className="col-span-2 text-right">Telefone</span>
          <span className="col-span-1 text-right">Acoes</span>
        </div>
        {visibleEmployees.length === 0 && <div className="px-4 py-4 text-xs text-slate-400 sm:text-sm">Nenhum contato interno encontrado.</div>}
        {visibleEmployees.map((employee, idx) => (
          <div
            key={employee.id || employee.email || employee.name || `employee-${idx}`}
            className="border-b border-white/5 px-2.5 py-1.5 text-[11px] leading-tight last:border-b-0 hover:bg-white/5 sm:px-4 sm:py-2"
          >
            <div className="flex items-center justify-between gap-3 md:hidden">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                    {employee.id || '--'}
                  </span>
                  <p className="truncate text-xs font-semibold text-white">{employee.name || 'Contato nao informado'}</p>
                </div>
                <p className="truncate text-[11px] text-slate-400">{employee.email || '--'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-slate-300">{employee.phone || '--'}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-primary"
                    onClick={() => openEdit(employee)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-lg border border-rose-500/40 p-1 text-rose-200 hover:bg-rose-500/10"
                    onClick={() => handleRequestDeleteEmployee(employee)}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-2">
              <div className="md:col-span-1 text-slate-300">{employee.id || '--'}</div>
              <div className="md:col-span-4 truncate text-white" title={employee.name || 'Contato nao informado'}>
                {employee.name || 'Contato nao informado'}
              </div>
              <div className="md:col-span-4 truncate text-slate-300" title={employee.email || '--'}>
                {employee.email || '--'}
              </div>
              <div className="md:col-span-2 text-right text-slate-300" title={employee.phone || '--'}>
                {employee.phone || '--'}
              </div>
              <div className="md:col-span-1 flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-primary"
                  onClick={() => openEdit(employee)}
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-lg border border-rose-500/40 p-1 text-rose-200 hover:bg-rose-500/10"
                  onClick={() => handleRequestDeleteEmployee(employee)}
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
            <button className="btn-secondary" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
              Proximo
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="cyber-overlay fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || savingEmployee) return;
            setModalOpen(false);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-3 text-xs shadow-2xl sm:text-sm"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{form.id ? 'Editar contato interno' : 'Novo contato interno'}</p>
                <h3 className="text-sm font-bold text-white">{form.name || 'Cadastro de colaborador'}</h3>
              </div>
              <button className="text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setModalOpen(false)} disabled={savingEmployee}>
                Fechar
              </button>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-200">
                Nome
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:text-sm"
                  placeholder="Nome do colaborador"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-200">
                  E-mail
                  <input
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:text-sm"
                    placeholder="email@empresa.com"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-200">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:text-sm"
                    placeholder="(11) 99999-9999"
                  />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-200">
                Notas
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:text-sm"
                  rows={2}
                  placeholder="Observacoes adicionais"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={savingEmployee}>
                Cancelar
              </button>
              <button className="btn-primary inline-flex items-center justify-center gap-2" onClick={handleSubmit} disabled={savingEmployee || !form.name.trim()}>
                {savingEmployee ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {savingEmployee && modalOpen && (
        <div className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="cyber-dialog cyber-loading-dialog flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
              <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/20" />
              <img src={logoUrl} alt="Clever Connection" className="relative h-12 w-12 rounded-full bg-white/10 p-2" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Salvando contato interno</p>
              <p className="text-xs text-slate-300">Aguarde alguns instantes.</p>
            </div>
          </div>
        </div>
      )}

      {confirmEmployee && (
        <div
          className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || deletingEmployee) return;
            setConfirmEmployee(null);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Excluir contato interno</p>
            <h3 className="text-base font-semibold text-white sm:text-lg">Confirmar exclusao</h3>
            <p className="mt-2 text-xs text-slate-300 sm:text-sm">
              Deseja excluir o contato interno{' '}
              <span className="font-semibold text-white">{confirmEmployee.name || 'Sem nome'}</span>?
            </p>
            <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">Esta acao remove o registro da aba Funcionarios.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmEmployee(null)} disabled={deletingEmployee}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleDeleteEmployee} disabled={deletingEmployee}>
                {deletingEmployee ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContatosInternos;
