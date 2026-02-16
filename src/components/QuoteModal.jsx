import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, RefreshCw, Users } from 'lucide-react';
import { computeQuoteTotals } from '../services/quotes.js';
import { getEmployees } from '../services/employees.js';
import { formatCurrency } from '../utils/formatters.js';

const defaultValid = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const defaultQuote = {
  title: '',
  clientId: '',
  clientName: '',
  clientCompany: '',
  clientEmail: '',
  clientPhone: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  status: 'Enviado',
  validUntil: defaultValid(),
  deliveryTime: '',
  paymentTerms: '',
  category: '',
  discountValue: 0,
  taxRate: 6,
  items: [],
  notes: '',
  scope: '',
};

const CATEGORY_OPTIONS = [
  'Cabeamento Estruturado',
  'Ciber Seguran\u00e7a',
  'Sistema Audiovisuais',
  'Sistema - CFTV',
  'Telecom',
];

const LABOR_OPTIONS = [
  {
    key: 'tecnica',
    id: 'diaria-tecnico',
    label: 'Diaria tecnica',
    sku: 'DIARIA-TEC',
    rate: 215,
    unitLabel: 'dia',
    quantityLabel: 'Quantidade de dias',
    breakdown: {
      diaria: 150,
      transporte: 15,
      refeicao: 50,
    },
  },
  {
    key: 'fusao',
    id: 'diaria-fusao',
    label: 'Diaria tecnico de fusao',
    sku: 'DIARIA-FUSAO',
    rate: 600,
    unitLabel: 'dia',
    quantityLabel: 'Quantidade de dias',
  },
  {
    key: 'acompanhamento',
    id: 'acompanhamento',
    label: 'Acompanhamento',
    sku: 'ACOMPANHAMENTO',
    rate: 145,
    unitLabel: 'unidade',
    quantityLabel: 'Quantidade',
  },
];

const LABOR_ITEM_IDS = new Set(LABOR_OPTIONS.map((option) => option.id));

const QuoteModal = ({
  open,
  onClose,
  onSave,
  quote,
  materials = [],
  services = [],
  loadingCatalog = false,
  onRefreshCatalog,
  clients = [],
}) => {
  const [form, setForm] = useState(defaultQuote);
  const [activeTab, setActiveTab] = useState('materiais');
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientDebug, setClientDebug] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [laborForm, setLaborForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const modalPalette = {
    overlay: 'bg-slate-950/55',
    surface: 'bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/90',
    border: 'border-white/15',
    glow: 'shadow-2xl shadow-black/40',
  };
  const baseUrl = import.meta.env.BASE_URL || '/';
  const logoUrl = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}logo.png`;

  const normalizeValue = (val) => (val ?? '').toString().trim().toLowerCase();

  const findClientByValue = (value) => {
    const norm = normalizeValue(value);
    return (
      clients.find((c) => normalizeValue(c.id) === norm) ||
      clients.find((c) => normalizeValue(c.company) === norm) ||
      clients.find((c) => normalizeValue(c.name) === norm)
    );
  };

  useEffect(() => {
    if (quote) {
      setForm({
        ...defaultQuote,
        ...quote,
        validUntil: quote.validUntil ? quote.validUntil.slice(0, 10) : defaultValid(),
      });
    } else {
      setForm({ ...defaultQuote, validUntil: defaultValid() });
    }
    setActiveTab('materiais');
    setSearch('');
    setQuantities({});
    setSelectedClientId('');
    setLaborModalOpen(false);
    setLaborForm({});
  }, [quote]);

  useEffect(() => {
    if (!open) return;
    getEmployees()
      .then((data) => {
        setEmployees(data);
        setEmployeesError('');
      })
      .catch((err) => {
        console.error('Erro ao carregar funcionarios', err);
        setEmployeesError('Falha ao carregar lista de colaboradores');
      });
  }, [open]);

  useEffect(() => {
    const sourceList = activeTab === 'materiais' ? materials : services;
    const allCategories = sourceList
      .map((item) => item.category)
      .filter(Boolean)
      .map((c) => c.trim());
    const unique = Array.from(new Set(allCategories)).sort((a, b) => a.localeCompare(b));
    setCategoryOptions(unique);
  }, [materials, services, activeTab]);

  const list = activeTab === 'materiais' ? materials : services;

  const filteredList = useMemo(() => {
    const term = search.toLowerCase();
    const category = form.categoryFilter?.toLowerCase();
    return list.filter((item) => {
      const matchesTerm =
        item.name?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term);
      const matchesCategory = !category || item.category?.toLowerCase() === category;
      return matchesTerm && matchesCategory;
    });
  }, [list, search, form.categoryFilter]);

  // Refaz preenchimento quando o cliente selecionado ou a lista muda (ex: dados carregaram depois do select)
  useEffect(() => {
    if (!selectedClientId || !clients.length) return;
    const client = findClientByValue(selectedClientId);
    if (client) {
      console.info('Cliente selecionado useEffect', client);
      setClientDebug(`Preenchido cliente ${client.id || client.company}`);
      setForm((prev) => ({
        ...prev,
        clientName: client.responsavel || client.name || '',
        clientCompany: client.company || '',
        clientEmail: client.email || '',
        clientPhone: client.phone || '',
        contactEmail: prev.contactEmail || '',
      }));
    } else {
      setClientDebug(`Cliente nao encontrado para ${selectedClientId}`);
    }
  }, [selectedClientId, clients]);

  const totals = useMemo(
    () => computeQuoteTotals(form.items, form.discountValue, form.taxRate),
    [form.items, form.discountValue, form.taxRate],
  );

  const taxValue = useMemo(() => {
    const rate = Number(form.taxRate || 0) / 100;
    return (form.items || []).reduce((acc, item) => acc + item.price * item.quantity, 0) * rate;
  }, [form.items, form.taxRate]);

  const materialsTotal = useMemo(
    () =>
      form.items
        .filter((item) => item.type === 'materiais')
        .reduce((acc, item) => acc + item.price * item.quantity, 0),
    [form.items],
  );
  const servicesTotal = useMemo(
    () =>
      form.items
        .filter((item) => item.type === 'servicos')
        .reduce((acc, item) => acc + item.price * item.quantity, 0),
    [form.items],
  );
  const laborItemsById = useMemo(() => {
    const map = new Map();
    (form.items || []).forEach((item) => {
      if (LABOR_ITEM_IDS.has(item.id)) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [form.items]);

  const laborSummary = useMemo(
    () =>
      LABOR_OPTIONS.map((option) => {
        const item = laborItemsById.get(option.id);
        if (!item) return null;
        const qty = Number(item.quantity || 0);
        const total = qty * Number(item.price || 0);
        return {
          id: option.id,
          label: option.label,
          qty,
          total,
          unitLabel: option.unitLabel,
        };
      }).filter(Boolean),
    [laborItemsById],
  );

  const handleAddItem = (product) => {
    if (!product) return;
    const qty = Number(quantities[product.id] || 1);
    const existing = form.items.find((item) => item.id === product.id && item.type === activeTab);
    let items;
    if (existing) {
      items = form.items.map((item) =>
        item.id === product.id && item.type === activeTab ? { ...item, quantity: item.quantity + qty } : item,
      );
    } else {
      items = [
        ...form.items,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: qty,
          type: activeTab,
        },
      ];
    }
    setForm((prev) => ({ ...prev, items }));
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
  };

  const handleRemoveItem = (id) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildBreakdownText = (breakdown) => {
    if (!breakdown) return '';
    return `${formatCurrency(breakdown.diaria)} diaria + ${formatCurrency(breakdown.transporte)} VT + ${formatCurrency(breakdown.refeicao)} refeicao`;
  };

  const openLaborModal = () => {
    const nextForm = {};
    LABOR_OPTIONS.forEach((option) => {
      const existing = laborItemsById.get(option.id);
      nextForm[option.id] = {
        quantity: existing ? String(existing.quantity || '') : '',
        rate: existing ? String(existing.price || option.rate) : String(option.rate),
      };
    });
    setLaborForm(nextForm);
    setLaborModalOpen(true);
  };

  const closeLaborModal = () => {
    setLaborModalOpen(false);
    setLaborForm({});
  };

  const updateLaborField = (id, field, value) => {
    setLaborForm((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const applyLabor = () => {
    setForm((prev) => {
      const items = (prev.items || []).filter((item) => !LABOR_ITEM_IDS.has(item.id));
      LABOR_OPTIONS.forEach((option) => {
        const entry = laborForm[option.id] || {};
        const qtyRaw = Number(entry.quantity || 0);
        const qty = Math.max(0, Math.floor(qtyRaw));
        if (qty <= 0) return;
        const rateRaw = Number(String(entry.rate ?? '').replace(',', '.'));
        const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : option.rate;
        items.push({
          id: option.id,
          name: option.label,
          sku: option.sku,
          price: rate,
          quantity: qty,
          type: 'servicos',
        });
      });
      return { ...prev, items };
    });
    closeLaborModal();
  };

  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({ ...form, ...totals });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-30 flex items-center justify-center px-3 py-6 ${modalPalette.overlay}`}>
      <div
        className={`w-full max-w-6xl max-h-[85vh] overflow-y-auto rounded-2xl border p-4 text-sm backdrop-blur ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{quote ? 'Editar orcamento' : 'Novo orcamento'}</p>
            <h3 className="text-lg font-bold text-white">{quote?.title || 'Orcamento personalizado'}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshCatalog}
              className="rounded-xl border border-white/10 px-3 py-2 text-white hover:border-primary/40 hover:bg-white/5"
            >
              <RefreshCw className={`mr-2 inline h-4 w-4 ${loadingCatalog ? 'animate-spin' : ''}`} />
              Recarregar planilha
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-white/10 p-2 text-slate-200 transition hover:border-primary/40 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Users className="h-4 w-4 text-slate-300" />
                <span>Cliente</span>
              </div>
              <select
                className="w-full max-w-xs rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
                value={selectedClientId}
                onChange={(e) => {
                  const value = e.target.value;
                  const client = findClientByValue(value);
                  setSelectedClientId(value);
                  if (client) {
                    console.info('Cliente selecionado onchange', client);
                    setClientDebug(`Preenchido cliente ${client.id || client.company}`);
                    setForm((prev) => ({
                      ...prev,
                      clientId: client.id || client.company || '',
                      clientName: client.responsavel || client.name || '',
                      clientCompany: client.company || '',
                      clientEmail: client.email || '',
                      clientPhone: client.phone || '',
                      contactEmail: prev.contactEmail || '',
                    }));
                  } else {
                    setClientDebug(`Cliente nao encontrado para ${value}`);
                  }
                }}
              >
                <option value="" disabled>
                  Selecione um cliente
                </option>
                {clients.map((client) => (
                  <option key={client.id || client.company || client.name} value={client.id || client.company || client.name}>
                    {client.company || client.name || 'Cliente'}
                  </option>
                ))}
              </select>
              {clientDebug && <span className="text-[11px] text-slate-400">{clientDebug}</span>}
            </div>

            <p className="text-xs uppercase tracking-wide text-slate-400">Dados do cliente</p>

            <label className="block text-sm font-semibold text-slate-300">
              Responsavel
              <input
                value={form.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Nome do responsavel"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-300">
              Empresa
              <input
                value={form.clientCompany}
                onChange={(e) => handleChange('clientCompany', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Nome da empresa"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold text-slate-300">
                E-mail
                <input
                  value={form.clientEmail}
                  onChange={(e) => handleChange('clientEmail', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="email@empresa.com"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Telefone
                <input
                  value={form.clientPhone}
                  onChange={(e) => handleChange('clientPhone', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="(11) 99999-9999"
                />
              </label>
            </div>

            <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">Contato interno (Clever)</p>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-semibold text-slate-300">
                Contato interno
                <select
                  value={form.contactName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const emp = employees.find((f) => f.id === val || f.name === val);
                    if (emp) {
                      setForm((prev) => ({
                        ...prev,
                        contactName: emp.name || val,
                        contactPhone: emp.phone || '',
                        contactEmail: emp.email || '',
                      }));
                    } else {
                      handleChange('contactName', val);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                >
                  <option value="">Contato</option>
                  {employees.map((emp) => (
                    <option key={emp.id || emp.name} value={emp.id || emp.name}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                {employeesError && <p className="mt-1 text-xs text-rose-300">{employeesError}</p>}
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Telefone contato
                <input
                  value={form.contactPhone}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                E-mail contato
                <input
                  value={form.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="contato@clever.com"
                />
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-300">
              Projeto
              <input
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Nome do projeto"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-300">
              Categoria
              <select
                value={form.category || ''}
                onChange={(e) => handleChange('category', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
              >
                <option value="">Selecione a categoria</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-300">
              Escopo
              <textarea
                value={form.scope}
                onChange={(e) => handleChange('scope', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Descreva brevemente o escopo"
                rows={3}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold text-slate-300">
                Status
                <select
                  value={form.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                >
                  <option>Rascunho</option>
                  <option>Enviado</option>
                  <option>Aprovado</option>
                  <option>Perdido</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Validade</span>
                  <span className="text-xs text-slate-400">(30 dias)</span>
                </div>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => handleChange('validUntil', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold text-slate-300">
                Prazo de entrega
                <input
                  type="number"
                  min="0"
                  value={form.deliveryTime}
                  onChange={(e) => handleChange('deliveryTime', e.target.value.replace(/[^0-9]/g, ''))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="Ex: 15"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Pagamento
                <input
                  type="number"
                  min="0"
                  value={form.paymentTerms}
                  onChange={(e) => handleChange('paymentTerms', e.target.value.replace(/[^0-9]/g, ''))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="Ex: 30"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-semibold text-slate-300">
                Desconto (R$)
                <input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => handleChange('discountValue', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Imposto (%)
                <input
                  type="number"
                  min="0"
                  value={form.taxRate}
                  onChange={(e) => handleChange('taxRate', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Notas
                <input
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="Observacoes internas"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">Diaria</p>
                  <p className="text-xs text-slate-400">Defina as diarias dos tecnicos e acompanhamento.</p>
                </div>
                <button type="button" className="btn-secondary" onClick={openLaborModal}>
                  Diaria
                </button>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-300">
                {laborSummary.length ? (
                  laborSummary.map((item) => {
                    const unitLabel = item.qty === 1 ? item.unitLabel : `${item.unitLabel}s`;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span>{item.label}</span>
                        <span>
                          {item.qty} {unitLabel} - {formatCurrency(item.total)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <span>Nenhuma diaria adicionada.</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-card p-4">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Total materiais</span>
                <span>{formatCurrency(materialsTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Total serviços (Mão de Obra)</span>
                <span>{formatCurrency(servicesTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Impostos</span>
                <span>{formatCurrency(taxValue)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Descontos</span>
                <span>{formatCurrency(form.discountValue || 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-lg font-bold text-white">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <button
                  className={`rounded-lg px-3 py-2 transition ${activeTab === 'materiais' ? 'bg-primary/30 text-white' : 'bg-transparent text-slate-300'}`}
                  onClick={() => setActiveTab('materiais')}
                >
                  Materiais ({materials.length})
                </button>
                <button
                  className={`rounded-lg px-3 py-2 transition ${activeTab === 'servicos' ? 'bg-primary/30 text-white' : 'bg-transparent text-slate-300'}`}
                  onClick={() => setActiveTab('servicos')}
                >
                  Servicos ({services.length})
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  placeholder="Buscar por nome, SKU ou categoria"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-56 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
                />
                <select
                  className="w-44 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
                  value={form.categoryFilter || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, categoryFilter: e.target.value || undefined }))}
                >
                  <option value="">Todas as categorias</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              {filteredList.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum item encontrado.</p>
              ) : (
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {filteredList.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-black/10 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          {item.sku || 'SKU'} · {item.category || 'Categoria'} · {item.unit || 'Unidade'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{formatCurrency(item.price)}</span>
                        <input
                          type="number"
                          min="1"
                          value={quantities[item.id] || 1}
                          onChange={(e) =>
                            setQuantities((prev) => ({ ...prev, [item.id]: Number(e.target.value) || 1 }))
                          }
                          className="w-16 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white outline-none focus:border-primary/50"
                        />
                        <button className="btn-secondary" onClick={() => handleAddItem(item)}>
                          <Plus className="h-4 w-4" />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Itens do orcamento</p>
                <p className="text-xs text-slate-400">{form.items.length} itens</p>
              </div>
              {form.items.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum item adicionado.</p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {form.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {item.name} <span className="text-xs text-slate-400">({item.type || 'item'})</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.quantity} x {formatCurrency(item.price)} · {item.sku}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold text-white">
                          {formatCurrency(item.quantity * item.price)}
                        </p>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-rose-500/50 hover:text-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar orcamento'}
          </button>
        </div>
      </div>

      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
              <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/20" />
              <img src={logoUrl} alt="Clever Connection" className="relative h-12 w-12 rounded-full bg-white/10 p-2" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Salvando orcamento</p>
              <p className="text-xs text-slate-300">Aguarde alguns instantes.</p>
            </div>
          </div>
        </div>
      )}

      {laborModalOpen && (
        <div className={`fixed inset-0 z-40 flex items-center justify-center px-3 py-6 ${modalPalette.overlay}`}>
          <div
            className={`w-full max-w-md rounded-2xl border p-4 ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-white">Diarias</h4>
              <button
                type="button"
                onClick={closeLaborModal}
                className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-primary/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {LABOR_OPTIONS.map((option) => {
                const entry = laborForm[option.id] || {};
                const quantity = entry.quantity ?? '';
                const rate = entry.rate ?? option.rate;
                const breakdownText = buildBreakdownText(option.breakdown);
                const unitLabel = option.unitLabel ? `por ${option.unitLabel}` : 'por unidade';

                return (
                  <div key={option.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{option.label}</p>
                        <p className="text-xs text-slate-400">
                          {formatCurrency(option.rate)} {unitLabel}
                          {breakdownText ? ` (${breakdownText})` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block text-sm font-semibold text-slate-300">
                        {option.quantityLabel || 'Quantidade'}
                        <input
                          type="number"
                          min="0"
                          value={quantity}
                          onChange={(e) => updateLaborField(option.id, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                          placeholder="Ex: 3"
                        />
                      </label>
                      <label className="block text-sm font-semibold text-slate-300">
                        Valor
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rate}
                          onChange={(e) => updateLaborField(option.id, 'rate', e.target.value.replace(/[^0-9,]/g, ''))}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
                          placeholder={String(option.rate)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={closeLaborModal}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={applyLabor}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteModal;
