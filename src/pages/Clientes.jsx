
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useClients } from '../hooks/useClients.js';

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
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyClient);
  const [visibleCount, setVisibleCount] = useState(5);

  const filtered = useMemo(() => {
    const term = (search || '').toLowerCase();
    const safe = (value) => (value || '').toLowerCase();
    return (clients || []).filter(
      (c) => safe(c?.company).includes(term) || safe(c?.name || c?.responsavel).includes(term) || safe(c?.email).includes(term),
    );
  }, [clients, search]);

  const visibleClients = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  useEffect(() => {
    if (!modalOpen) setForm(emptyClient);
  }, [modalOpen]);

  useEffect(() => {
    setVisibleCount(5);
  }, [search, clients]);

  const openEdit = (client) => {
    setForm(client || emptyClient);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    await saveClient(form);
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">CRM</p>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-sm text-slate-400">Gerencie a base de clientes: adicionar, editar e remover registros.</p>
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Total de clientes</p>
            <p className="text-xl font-bold text-white">{clients?.length || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Filtrados</p>
            <p className="text-xl font-bold text-white">{filtered.length}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <Users className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Status</p>
            <p className="text-sm font-semibold text-white">{loading ? 'Carregando...' : 'Sincronizado'}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por empresa, contato ou email"
          className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
        />
      </div>

      {error && <div className="card border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">Erro: {error}</div>}

      <div className="card overflow-hidden border border-white/10 bg-white/5">
        <div className="grid grid-cols-12 gap-2 border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span className="col-span-1 text-left">ID</span>
          <span className="col-span-3">Empresa</span>
          <span className="col-span-2">Responsavel</span>
          <span className="col-span-2">Local</span>
          <span className="col-span-2">Email</span>
          <span className="col-span-1 text-right">Telefone</span>
          <span className="col-span-1 text-right">Acoes</span>
        </div>
        {visibleClients.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-400">Nenhum cliente encontrado.</div>
        )}
        {visibleClients.map((client, idx) => (
          <div
            key={client.id || client.company || client.email || `client-${idx}`}
            className="grid grid-cols-12 gap-2 border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0 hover:bg-white/5"
          >
            <div className="col-span-1 text-left text-slate-300">{client.id || '--'}</div>
            <div className="col-span-3 truncate text-white" title={client.company || 'Empresa nao informada'}>
              {client.company || 'Empresa nao informada'}
            </div>
            <div className="col-span-2 truncate text-slate-200" title={client.responsavel || client.name || '--'}>
              {client.responsavel || client.name || '--'}
            </div>
            <div className="col-span-2 truncate text-slate-300" title={client.local || '--'}>
              {client.local || '--'}
            </div>
            <div className="col-span-2 truncate text-slate-300" title={client.email || '--'}>
              {client.email || '--'}
            </div>
            <div className="col-span-1 truncate text-right text-slate-300" title={client.phone || '--'}>
              {client.phone || '--'}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-white/10 p-1 text-slate-200 hover:border-primary/50 hover:text-primary"
                onClick={() => openEdit(client)}
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                className="rounded-lg border border-rose-500/40 p-1 text-rose-200 hover:bg-rose-500/10"
                onClick={() => deleteClient(client.id || client.company || client.email)}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length > visibleClients.length && (
          <div className="flex justify-center bg-white/5 px-4 py-3">
            <button
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:border-primary/50 hover:bg-primary/10"
              onClick={() => setVisibleCount((prev) => prev + 5)}
            >
              Listar mais
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl text-sm">
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
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                  placeholder="Nome da empresa"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Responsavel
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value, responsavel: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                  placeholder="Contato principal"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Endereco
                <input
                  value={form.endereco}
                  onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                  placeholder="Rua / Cidade / CEP"
                />
              </label>
              <label className="text-xs font-semibold text-slate-200">
                Local
                <input
                  value={form.local}
                  onChange={(e) => setForm((prev) => ({ ...prev, local: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                  placeholder="Filial / site / regiao"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-200">
                  Email
                  <input
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                    placeholder="email@empresa.com"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-200">
                  Telefone
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
                    placeholder="(11) 99999-9999"
                  />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-200">
                Notas
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60"
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
      )}
    </div>
  );
};

export default Clientes;
