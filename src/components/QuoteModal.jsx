import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { computeQuoteTotals } from '../services/quotes.js';
import { getEmployees } from '../services/employees.js';
import { formatCurrency } from '../utils/formatters.js';
import { getCurrentUser } from '../utils/userSession.js';
import { useToast } from './ToastHost.jsx';

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
  deliveryTime: '5',
  paymentTerms: '30',
  category: '',
  poNumber: '',
  discountValue: 0,
  taxRate: 6,
  items: [],
  notes: '',
  scope: '',
  createdBy: '',
  createdByEmail: '',
  updatedBy: '',
  updatedByEmail: '',
  updatedAt: '',
};

const CATEGORY_OPTIONS = [
  'Cabeamento Estruturado',
  'Ciber Seguran\u00e7a',
  'Infraestrutura Fibra Optica',
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
const QUOTE_DRAFT_STORAGE_PREFIX = 'crm-orcamentos:quote-draft';
const sanitizeDraftForm = (value) => {
  const items = Array.isArray(value?.items) ? value.items.map((item) => ({ ...item })) : [];
  return {
    ...defaultQuote,
    ...value,
    id: '',
    poNumber: '',
    createdAt: '',
    createdBy: '',
    createdByEmail: '',
    updatedAt: '',
    updatedBy: '',
    updatedByEmail: '',
    items,
    validUntil: value?.validUntil ? value.validUntil.slice(0, 10) : defaultValid(),
  };
};

const draftSnapshot = (value) => JSON.stringify(sanitizeDraftForm(value));

const buildDraftKey = ({ isEditing, isDuplicating, sourceQuote }) => {
  if (isEditing) return '';
  if (isDuplicating) {
    const seed = sourceQuote?.id || sourceQuote?.poNumber || sourceQuote?.title || 'base';
    return `${QUOTE_DRAFT_STORAGE_PREFIX}:duplicate:${seed}`;
  }
  return `${QUOTE_DRAFT_STORAGE_PREFIX}:new`;
};

const readQuoteDraft = (key) => {
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return {
      savedAt: parsed.savedAt || '',
      data: sanitizeDraftForm(parsed.data),
    };
  } catch (error) {
    console.warn('[quoteDraft] Falha ao ler rascunho', error);
    return null;
  }
};

const writeQuoteDraft = (key, form) => {
  if (!key || typeof window === 'undefined') return '';
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        savedAt,
        data: sanitizeDraftForm(form),
      }),
    );
    return savedAt;
  } catch (error) {
    console.warn('[quoteDraft] Falha ao salvar rascunho', error);
    return '';
  }
};

const clearQuoteDraft = (key) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('[quoteDraft] Falha ao limpar rascunho', error);
  }
};

const QuoteModal = ({
  open,
  onClose,
  onSave,
  quote,
  initialQuote,
  materials = [],
  services = [],
  loadingCatalog = false,
  onRefreshCatalog,
  clients = [],
}) => {
  const { pushToast } = useToast();
  const [form, setForm] = useState(defaultQuote);
  const [activeTab, setActiveTab] = useState('materiais');
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientDebug, setClientDebug] = useState('');
  const [manualForm, setManualForm] = useState({
    name: '',
    sku: '',
    category: '',
    unit: 'Un',
    price: '0',
    realCost: '',
    quantity: 1,
    type: 'materiais',
  });
  const [manualError, setManualError] = useState('');
  const [editingManualId, setEditingManualId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [laborForm, setLaborForm] = useState({});
  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftMeta, setDraftMeta] = useState(null);
  const [hideFloatingTotal, setHideFloatingTotal] = useState(false);
  const savingRef = useRef(false);
  const draftBaseSnapshotRef = useRef('');
  const scrollContainerRef = useRef(null);
  const manualEditorRef = useRef(null);
  const clientSectionRef = useRef(null);
  const itemsSectionRef = useRef(null);
  const valuesSectionRef = useRef(null);
  const summarySectionRef = useRef(null);
  const reviewSectionRef = useRef(null);
  const [activeStep, setActiveStep] = useState('cliente');
  const sourceQuote = quote || initialQuote;
  const isEditing = Boolean(quote);
  const isDuplicating = Boolean(initialQuote) && !isEditing;
  const headerPoNumber = form.poNumber || sourceQuote?.poNumber || 'Pendente';
  const draftKey = useMemo(
    () => buildDraftKey({ isEditing, isDuplicating, sourceQuote }),
    [isDuplicating, isEditing, sourceQuote],
  );
  const currentUser = useMemo(() => getCurrentUser(), []);
  const modalPalette = {
    overlay: 'quote-modal-overlay bg-slate-950/80',
    surface: 'quote-modal-surface',
    border: 'quote-modal-border border-white/12',
    glow: 'shadow-2xl shadow-black/65',
  };
  const buildInitialForm = (baseQuote, editing) => {
    if (!baseQuote) {
      return { ...defaultQuote, validUntil: defaultValid() };
    }

    const normalizedItems = Array.isArray(baseQuote.items)
      ? baseQuote.items.map((item) => ({ ...item }))
      : [];

    return {
      ...defaultQuote,
      ...baseQuote,
      id: editing ? baseQuote.id : '',
      poNumber: editing ? baseQuote.poNumber || '' : '',
      createdBy: editing ? baseQuote.createdBy || '' : '',
      createdByEmail: editing ? baseQuote.createdByEmail || '' : '',
      updatedBy: editing ? baseQuote.updatedBy || '' : '',
      updatedByEmail: editing ? baseQuote.updatedByEmail || '' : '',
      updatedAt: editing ? baseQuote.updatedAt || '' : '',
      createdAt: editing ? baseQuote.createdAt || '' : '',
      status: editing ? baseQuote.status || defaultQuote.status : 'Rascunho',
      approvalStatus: editing ? baseQuote.approvalStatus : '',
      validUntil: baseQuote.validUntil ? baseQuote.validUntil.slice(0, 10) : defaultValid(),
      deliveryTime: baseQuote.deliveryTime || defaultQuote.deliveryTime,
      paymentTerms: baseQuote.paymentTerms || defaultQuote.paymentTerms,
      items: normalizedItems,
    };
  };

  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;

  const normalizeValue = (val) =>
    (val ?? '')
      .toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();

  const findClientByValue = (value) => {
    const norm = normalizeValue(value);
    return (
      clients.find((c) => normalizeValue(c.id) === norm) ||
      clients.find((c) => normalizeValue(c.company) === norm) ||
      clients.find((c) => normalizeValue(c.name) === norm)
    );
  };

  useEffect(() => {
    const baseForm = buildInitialForm(sourceQuote, isEditing);
    draftBaseSnapshotRef.current = draftSnapshot(baseForm);
    const restoredDraft = open && draftKey ? readQuoteDraft(draftKey) : null;
    const nextForm = restoredDraft?.data ? { ...baseForm, ...restoredDraft.data } : baseForm;

    setForm(nextForm);
    setActiveTab('materiais');
    setSearch('');
    setQuantities({});
    setSelectedClientId(
      nextForm.clientId || nextForm.clientCompany || nextForm.clientName || sourceQuote?.clientId || sourceQuote?.clientCompany || sourceQuote?.clientName || '',
    );
    setLaborModalOpen(false);
    setLaborForm({});
    setActiveStep('cliente');
    setShowValidation(false);
    setManualForm({
      name: '',
      sku: '',
      category: '',
      unit: 'Un',
      price: '0',
      realCost: '',
      quantity: 1,
      type: 'materiais',
    });
    setManualError('');
    setEditingManualId(null);
    setDraftMeta(
      draftKey
        ? {
            savedAt: restoredDraft?.savedAt || '',
            restored: Boolean(restoredDraft?.data),
          }
        : null,
    );

    if (restoredDraft?.data) {
      pushToast({
        title: 'Rascunho recuperado',
        message: restoredDraft.savedAt
          ? `Continuando a partir do rascunho salvo em ${new Date(restoredDraft.savedAt).toLocaleString('pt-BR')}.`
          : 'Continuando a partir do ultimo rascunho salvo.',
        type: 'info',
        duration: 5000,
      });
    }
  }, [draftKey, isEditing, open, pushToast, sourceQuote]);

  useEffect(() => {
    if (!open || !draftKey || isSaving) return;

    const timer = window.setTimeout(() => {
      const nextSnapshot = draftSnapshot(form);
      if (nextSnapshot === draftBaseSnapshotRef.current) {
        clearQuoteDraft(draftKey);
        setDraftMeta(null);
        return;
      }

      const savedAt = writeQuoteDraft(draftKey, form);
      if (savedAt) {
        setDraftMeta((prev) => ({
          savedAt,
          restored: prev?.restored || false,
        }));
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [draftKey, form, isSaving, open]);

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
    if (!open) return;
    const scrollContainer = scrollContainerRef.current;
    const summarySection = summarySectionRef.current;
    if (!scrollContainer || !summarySection) return;

    const syncFloatingTotal = () => {
      const scrollRect = scrollContainer.getBoundingClientRect();
      const summaryRect = summarySection.getBoundingClientRect();
      const summaryTouchesViewport =
        summaryRect.top < scrollRect.bottom - 24 && summaryRect.bottom > scrollRect.top + 24;
      setHideFloatingTotal(summaryTouchesViewport);
    };

    syncFloatingTotal();
    scrollContainer.addEventListener('scroll', syncFloatingTotal, { passive: true });
    window.addEventListener('resize', syncFloatingTotal);

    return () => {
      scrollContainer.removeEventListener('scroll', syncFloatingTotal);
      window.removeEventListener('resize', syncFloatingTotal);
    };
  }, [activeTab, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (isSaving) return;
      if (laborModalOpen) {
        closeLaborModal();
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, isSaving, laborModalOpen, onClose]);

  useEffect(() => {
    const sourceList = activeTab === 'materiais' ? materials : services;
    const allCategories = sourceList
      .map((item) => item.category)
      .filter(Boolean)
      .map((c) => c.trim());
    const unique = Array.from(new Set(allCategories)).sort((a, b) => a.localeCompare(b));
    setCategoryOptions(unique);
  }, [materials, services, activeTab]);

  const list = activeTab === 'materiais' ? materials : activeTab === 'servicos' ? services : [];

  const filteredList = useMemo(() => {
    if (activeTab === 'manual') return [];
    const term = normalizeValue(search);
    const category = normalizeValue(form.categoryFilter);
    return list.filter((item) => {
      const matchesTerm =
        normalizeValue(item.name).includes(term) ||
        normalizeValue(item.sku).includes(term) ||
        normalizeValue(item.category).includes(term);
      const matchesCategory = !category || normalizeValue(item.category) === category;
      return matchesTerm && matchesCategory;
    });
  }, [list, search, form.categoryFilter]);

  // Refaz preenchimento quando o cliente selecionado ou a lista muda (ex: dados carregaram depois do select)
  useEffect(() => {
    if (!selectedClientId || !clients.length) return;
    if (isEditing) return;
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
  }, [selectedClientId, clients, isEditing]);

  const totals = useMemo(
    () => computeQuoteTotals(form.items, form.discountValue, form.taxRate),
    [form.items, form.discountValue, form.taxRate],
  );

  const taxValue = useMemo(() => {
    const rate = Number(form.taxRate || 0) / 100;
    return (form.items || []).reduce((acc, item) => acc + item.price * item.quantity, 0) * rate;
  }, [form.items, form.taxRate]);
  const shouldShowFloatingTotal = Number(totals.subtotal || 0) > 0;

  const hasClient = Boolean(selectedClientId || form.clientCompany || form.clientName);
  const hasInternalContact = Boolean(form.contactName && form.contactName.trim());
  const hasTitle = Boolean(form.title && form.title.trim());
  const hasCategory = Boolean(form.category && form.category.trim());
  const hasItems = (form.items || []).length > 0 || Number(form.total || 0) > 0;
  const hasValidUntil = Boolean(form.validUntil);
  const hasDeliveryTime = Number(form.deliveryTime || 0) > 0;
  const hasPaymentTerms = Number(form.paymentTerms || 0) > 0;
  const hasValues = Boolean(form.status) && hasValidUntil && hasDeliveryTime && hasPaymentTerms;
  const canSave = hasClient && hasInternalContact && hasTitle && hasCategory && hasItems && hasValues;
  const clientRequired = showValidation && !hasClient;
  const internalContactRequired = showValidation && !hasInternalContact;
  const titleRequired = showValidation && !hasTitle;
  const categoryRequired = showValidation && !hasCategory;
  const validUntilRequired = showValidation && !hasValidUntil;
  const deliveryTimeRequired = showValidation && !hasDeliveryTime;
  const paymentTermsRequired = showValidation && !hasPaymentTerms;
  const missingFields = useMemo(() => {
    const missing = [];
    if (!hasClient) missing.push('Cliente');
    if (!hasInternalContact) missing.push('Contato interno');
    if (!hasTitle) missing.push('Projeto');
    if (!hasCategory) missing.push('Categoria');
    if (!hasItems) missing.push('Itens');
    if (!hasValidUntil) missing.push('Validade');
    if (!hasDeliveryTime) missing.push('Prazo de entrega');
    if (!hasPaymentTerms) missing.push('Pagamento');
    return missing;
  }, [hasCategory, hasClient, hasDeliveryTime, hasInternalContact, hasItems, hasPaymentTerms, hasTitle, hasValidUntil]);

  const getRequiredFieldClass = (isMissing) =>
    `quote-form-field mt-1 w-full rounded-xl border bg-slate-900 px-3 py-1.5 text-xs text-white outline-none sm:py-2 sm:text-sm ${
      isMissing
        ? 'quote-form-field-missing border-rose-400/70 focus:border-rose-300 focus:ring-2 focus:ring-rose-400/20'
        : 'border-white/15 focus:border-primary/60'
    }`;

  const getSectionShellClass = (isActive) =>
    `quote-section-shell rounded-[1.4rem] border p-3 shadow-[0_14px_34px_rgba(2,6,23,0.16)] sm:p-4 ${
      isActive
        ? 'quote-section-shell-active ring-1'
        : 'quote-section-shell-idle'
    }`;

  const insetPanelClass =
    'quote-panel rounded-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';

  const sectionEyebrowClass =
    'quote-eyebrow inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400';

  const getTabButtonClass = (isActive) =>
    `quote-tab-button rounded-xl px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:py-2 sm:text-sm ${
      isActive
        ? 'quote-tab-button-active border text-white shadow-[0_10px_30px_rgba(171,118,38,0.18)]'
        : 'quote-tab-button-idle border border-transparent text-slate-300'
    }`;

  const steps = useMemo(
    () => [
      { key: 'cliente', label: 'Cliente', done: hasClient && hasInternalContact && hasTitle && hasCategory, ref: clientSectionRef },
      { key: 'itens', label: 'Itens', done: hasItems, ref: itemsSectionRef },
      { key: 'valores', label: 'Valores', done: hasValues, ref: valuesSectionRef },
      { key: 'revisao', label: 'Revisao', done: canSave, ref: reviewSectionRef },
    ],
    [canSave, hasCategory, hasClient, hasInternalContact, hasItems, hasTitle, hasValues],
  );

  const activeIndex = useMemo(() => steps.findIndex((step) => step.key === activeStep), [steps, activeStep]);
  const goToStep = (key) => {
    const target = steps.find((step) => step.key === key);
    if (!target) return;
    setActiveStep(key);
    target.ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const goNextStep = () => {
    const next = steps[activeIndex + 1];
    if (next) goToStep(next.key);
  };
  const goPrevStep = () => {
    const prev = steps[activeIndex - 1];
    if (prev) goToStep(prev.key);
  };

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
        item.id === product.id && item.type === activeTab
          ? { ...item, quantity: item.quantity + qty, unit: item.unit || product.unit || '' }
          : item,
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
          unit: product.unit || '',
          type: activeTab,
        },
      ];
    }
    setForm((prev) => ({ ...prev, items }));
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
  };

  const openManualEdit = (item) => {
    setActiveStep('itens');
    setActiveTab('manual');
    setManualForm({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || '',
      unit: item.unit || 'Un',
      price: item.price?.toString() || '',
      realCost: item.realCost?.toString() || '',
      quantity: item.quantity || 1,
      type: item.type || 'materiais',
    });
    setManualError('');
    setEditingManualId(item.id);
  };

  useEffect(() => {
    if (!open || activeTab !== 'manual' || !editingManualId) return;
    const target = manualEditorRef.current;
    if (!(target instanceof HTMLElement)) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, editingManualId, open]);

  const parsePriceValue = (value) => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = value.toString().replace(/[^0-9,.\-]/g, '');
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

  const resetManualForm = () => {
    setManualForm((prev) => ({
      ...prev,
      name: '',
      sku: '',
      category: '',
      price: '0',
      realCost: '',
      quantity: 1,
    }));
    setEditingManualId(null);
    setManualError('');
  };

  const handleAddManualItem = () => {
    const name = manualForm.name.trim();
    const price = parsePriceValue(manualForm.price);
    const realCost = manualForm.realCost === '' ? null : parsePriceValue(manualForm.realCost);
    const qty = Math.max(1, Number(manualForm.quantity || 1));
    if (!name) {
      setManualError('Informe o nome do item.');
      return;
    }
    if (!price || price <= 0) {
      setManualError('Informe um valor valido.');
      return;
    }
    if (manualForm.realCost !== '' && (realCost === null || realCost < 0)) {
      setManualError('Informe um valor real valido.');
      return;
    }
    setManualError('');
    const updatedItem = {
      id: editingManualId || `manual-${crypto.randomUUID()}`,
      name,
      sku: manualForm.sku.trim(),
      category: manualForm.category.trim(),
      price,
      realCost,
      quantity: qty,
      unit: manualForm.unit,
      type: manualForm.type,
      source: 'manual',
    };
    if (editingManualId) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === editingManualId ? { ...item, ...updatedItem } : item)),
      }));
    } else {
      setForm((prev) => ({ ...prev, items: [...prev.items, updatedItem] }));
    }
    resetManualForm();
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
          unit: option.unitLabel || '',
          type: 'servicos',
        });
      });
      return { ...prev, items };
    });
    closeLaborModal();
  };

  const submit = async () => {
    if (savingRef.current) return;
    if (!canSave) {
      setShowValidation(true);
      if (!hasClient || !hasInternalContact || !hasTitle || !hasCategory) {
        goToStep('cliente');
      } else if (!hasItems) {
        goToStep('itens');
      } else if (!hasValues) {
        goToStep('valores');
      } else {
        goToStep('revisao');
      }
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({ ...form, ...totals });
      if (draftKey) {
        clearQuoteDraft(draftKey);
        setDraftMeta(null);
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = () => {
    const baseForm = buildInitialForm(sourceQuote, isEditing);
    draftBaseSnapshotRef.current = draftSnapshot(baseForm);
    clearQuoteDraft(draftKey);
    setDraftMeta(null);
    setForm(baseForm);
    setSelectedClientId(baseForm.clientId || baseForm.clientCompany || baseForm.clientName || '');
    setActiveStep('cliente');
    setShowValidation(false);
    pushToast({
      title: 'Rascunho descartado',
      message: 'O formulario voltou para a versao base deste orcamento.',
      type: 'success',
    });
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`cyber-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain px-2 py-4 sm:items-center sm:px-3 sm:py-6 ${modalPalette.overlay}`}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (isSaving || laborModalOpen) return;
        onClose();
      }}
    >
      <div
        className={`quote-modal-shell cyber-dialog relative mx-auto my-auto w-full max-w-[96vw] sm:max-w-6xl max-h-[85vh] overflow-hidden rounded-2xl border p-3 text-xs sm:p-4 sm:text-sm ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow} [&_input]:font-normal [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500 [&_select]:font-normal [&_select]:text-slate-100 [&_textarea]:font-normal [&_textarea]:text-slate-100 [&_textarea]:placeholder:text-slate-500`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          ref={scrollContainerRef}
          className="quote-modal-scroll max-h-[calc(85vh-1.5rem)] overflow-y-auto overflow-x-hidden pb-24 pr-1 sm:max-h-[calc(85vh-2rem)] sm:pb-20"
        >
        <div className="quote-modal-header mb-3 rounded-[1.2rem] border border-white/10 px-3 py-1.5 shadow-[0_8px_20px_rgba(2,6,23,0.14)] sm:mb-4 sm:px-4 sm:py-2">
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Bem-vindo</p>
              <h3 className="mt-0.5 truncate text-sm font-bold text-white sm:text-base">
                {currentUser?.name || 'Usuário'}
              </h3>
              <p className="mt-0.5 text-[10px] text-slate-400 sm:text-[11px]">
                {isEditing ? 'Editando orçamento' : isDuplicating ? 'Duplicando orçamento' : 'Novo orçamento'}
              </p>
            </div>
            <span className="quote-po-badge mx-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
              <span className="text-[9px] uppercase tracking-[0.18em] text-slate-300/80">PO</span>
              <span className="text-xs font-bold text-white sm:text-sm">{headerPoNumber}</span>
            </span>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={onRefreshCatalog}
                title="Recarregar planilha"
                aria-label="Recarregar planilha"
                className="quote-action-chip rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-white transition hover:border-primary/40 hover:bg-white/10 sm:px-2.5 sm:py-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loadingCatalog ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="quote-action-chip rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-200 transition hover:border-primary/40 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        </div>

        {draftKey ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 sm:mb-4 sm:text-xs">
            <div>
              <p className="font-semibold text-amber-50">Rascunho automatico ativo</p>
              <p className="text-amber-100/80">
                {draftMeta?.restored
                  ? `Rascunho recuperado${draftMeta?.savedAt ? ` em ${new Date(draftMeta.savedAt).toLocaleString('pt-BR')}` : ''}.`
                  : draftMeta?.savedAt
                    ? `Ultimo salvamento local em ${new Date(draftMeta.savedAt).toLocaleString('pt-BR')}.`
                    : 'As alteracoes deste modal sao salvas localmente enquanto voce preenche.'}
              </p>
            </div>
            {(draftMeta?.savedAt || draftMeta?.restored) && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="rounded-xl border border-amber-200/20 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-amber-50 transition hover:border-amber-200/40 hover:bg-black/30"
              >
                Descartar rascunho
              </button>
            )}
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2 sm:mb-4">
          {steps.map((step, idx) => {
            const isActive = step.key === activeStep;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => goToStep(step.key)}
                className={`quote-step-pill flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] transition sm:px-3 sm:py-1.5 sm:text-xs ${
                  isActive
                    ? 'quote-step-pill-active border text-white'
                    : 'quote-step-pill-idle border text-slate-300'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <span
                  className={`quote-step-index flex h-5 w-5 items-center justify-center rounded-full text-[10px] sm:h-6 sm:w-6 sm:text-[11px] ${
                    step.done ? 'quote-step-index-done' : isActive ? 'quote-step-index-active' : 'quote-step-index-idle'
                  }`}
                >
                  {step.done ? <Check className="h-3 w-3" /> : idx + 1}
                </span>
                <span className="text-[11px] font-semibold sm:text-xs">{step.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
          <div className="space-y-2 sm:space-y-3">
            <div ref={clientSectionRef} className={`${getSectionShellClass(activeStep === 'cliente')} space-y-3`}>
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition sm:px-3.5 sm:py-2.5 ${
                clientRequired ? 'quote-highlight-box quote-highlight-box-required' : 'quote-highlight-box'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-white">
                <Users className="h-4 w-4 text-slate-300" />
                <span>Cliente</span>
                {clientRequired && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
                  </span>
                )}
              </div>
              <select
                className={`quote-form-field w-full rounded-lg border bg-slate-900 px-2.5 py-1 text-xs text-white outline-none transition sm:max-w-xs sm:px-3 sm:py-1.5 sm:text-sm ${
                  clientRequired
                    ? 'quote-form-field-missing border-amber-300/70 focus:border-amber-200/80 focus:ring-2 focus:ring-amber-300/20'
                    : 'border-white/10 focus:border-primary/50'
                }`}
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

            <p className={sectionEyebrowClass}>Dados do cliente</p>

            <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
              Responsavel
              <input
                value={form.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Nome do responsavel"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
              Empresa
              <input
                value={form.clientCompany}
                onChange={(e) => handleChange('clientCompany', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Nome da empresa"
              />
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                E-mail
                <input
                  value={form.clientEmail}
                  onChange={(e) => handleChange('clientEmail', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="email@empresa.com"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Telefone
                <input
                  value={form.clientPhone}
                  onChange={(e) => handleChange('clientPhone', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="(11) 99999-9999"
                />
              </label>
            </div>

            <p className={sectionEyebrowClass}>Contato interno (Clever)</p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Contato interno <span className="text-rose-300">*</span>
                <select
                  value={form.contactName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setForm((prev) => ({
                        ...prev,
                        contactName: '',
                        contactPhone: '',
                        contactEmail: '',
                      }));
                      return;
                    }
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
                  className={getRequiredFieldClass(internalContactRequired)}
                >
                  <option value="">Contato</option>
                  {employees.map((emp) => (
                    <option key={emp.id || emp.name} value={emp.name || emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                {internalContactRequired && <p className="mt-1 text-[11px] text-rose-300">Selecione um contato interno.</p>}
                {employeesError && <p className="mt-1 text-xs text-rose-300">{employeesError}</p>}
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Telefone contato
                <input
                  value={form.contactPhone}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="(11) 99999-9999"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                E-mail contato
                <input
                  value={form.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="contato@clever.com"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
              Projeto <span className="text-rose-300">*</span>
              <input
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className={`${getRequiredFieldClass(titleRequired)} placeholder:text-slate-400`}
                placeholder="Nome do projeto"
              />
              {titleRequired && <p className="mt-1 text-[11px] text-rose-300">Informe o nome do projeto.</p>}
            </label>

            {isEditing && (
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                PO
                <input
                  value={form.poNumber || ''}
                  onChange={(e) => handleChange('poNumber', e.target.value.replace(/[^0-9]/g, ''))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="Numero da PO"
                  inputMode="numeric"
                />
              </label>
            )}

            <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
              Categoria <span className="text-rose-300">*</span>
              <select
                value={form.category || ''}
                onChange={(e) => handleChange('category', e.target.value)}
                className={getRequiredFieldClass(categoryRequired)}
              >
                <option value="">Selecione a categoria</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {categoryRequired && <p className="mt-1 text-[11px] text-rose-300">Selecione a categoria do orcamento.</p>}
            </label>

            <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
              Escopo
              <textarea
                value={form.scope}
                onChange={(e) => handleChange('scope', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Descreva brevemente o escopo"
                rows={3}
              />
            </label>

            </div>

            <div
              ref={valuesSectionRef}
              className={`${getSectionShellClass(activeStep === 'valores')} space-y-3`}
            >
            <div className="flex items-center justify-between">
              <p className={sectionEyebrowClass}>Valores e condicoes</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300">
                Comercial
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Status
                <select
                  value={form.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60"
                >
                  <option>Rascunho</option>
                  <option>Enviado</option>
                  <option>Aprovado</option>
                  <option>Perdido</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    Validade <span className="text-rose-300">*</span>
                  </span>
                  <span className="text-xs text-slate-400">(30 dias)</span>
                </div>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => handleChange('validUntil', e.target.value)}
                  className={getRequiredFieldClass(validUntilRequired)}
                />
                {validUntilRequired && <p className="mt-1 text-[11px] text-rose-300">Defina a validade do orcamento.</p>}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Prazo de entrega <span className="text-rose-300">*</span>
                <input
                  type="number"
                  min="0"
                  value={form.deliveryTime}
                  onChange={(e) => handleChange('deliveryTime', e.target.value.replace(/[^0-9]/g, ''))}
                  className={`${getRequiredFieldClass(deliveryTimeRequired)} placeholder:text-slate-400`}
                  placeholder="Ex: 15"
                />
                {deliveryTimeRequired && <p className="mt-1 text-[11px] text-rose-300">Informe o prazo de entrega em dias.</p>}
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Pagamento <span className="text-rose-300">*</span>
                <input
                  type="number"
                  min="0"
                  value={form.paymentTerms}
                  onChange={(e) => handleChange('paymentTerms', e.target.value.replace(/[^0-9]/g, ''))}
                  className={`${getRequiredFieldClass(paymentTermsRequired)} placeholder:text-slate-400`}
                  placeholder="Ex: 30"
                />
                {paymentTermsRequired && <p className="mt-1 text-[11px] text-rose-300">Informe o prazo de pagamento em dias.</p>}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Desconto (R$)
                <input
                  type="number"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => handleChange('discountValue', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Imposto (%)
                <input
                  type="number"
                  min="0"
                  value={form.taxRate}
                  onChange={(e) => handleChange('taxRate', Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Notas
                <textarea
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                  placeholder="Observacoes internas"
                />
              </label>
            </div>

            <div className={`${insetPanelClass} quote-combos-panel p-3 sm:p-3.5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white sm:text-sm">Diaria</p>
                  <p className="text-[11px] text-slate-400 sm:text-xs">Defina as diarias dos tecnicos e acompanhamento.</p>
                </div>
                <button type="button" className="btn-secondary" onClick={openLaborModal}>
                  Diaria
                </button>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-300 sm:text-xs">
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

            <div
              ref={summarySectionRef}
              className="quote-panel rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(15,23,42,0.72))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.1)] sm:p-4"
            >
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300/80">Resumo financeiro</p>
                <p className="text-sm font-semibold text-white sm:text-base">Totais do orcamento</p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 sm:text-sm">
                <span>Total materiais</span>
                <span>{formatCurrency(materialsTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 sm:text-sm">
                <span>Total serviços (Mão de Obra)</span>
                <span>{formatCurrency(servicesTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 sm:text-sm">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 sm:text-sm">
                <span>Impostos</span>
                <span>{formatCurrency(taxValue)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300 sm:text-sm">
                <span>Descontos</span>
                <span>{formatCurrency(form.discountValue || 0)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-base font-bold text-white sm:text-lg">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

          <div
            ref={itemsSectionRef}
            className={`${getSectionShellClass(activeStep === 'itens')} space-y-3`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white sm:text-sm">
                <button
                  type="button"
                  className={getTabButtonClass(activeTab === 'materiais')}
                  onClick={() => setActiveTab('materiais')}
                >
                  Materiais ({materials.length})
                </button>
                <button
                  type="button"
                  className={getTabButtonClass(activeTab === 'servicos')}
                  onClick={() => setActiveTab('servicos')}
                >
                  Servicos ({services.length})
                </button>
                <button
                  type="button"
                  className={getTabButtonClass(activeTab === 'manual')}
                  onClick={() => setActiveTab('manual')}
                >
                  Manual
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTab !== 'manual' ? (
                  <>
                    <input
                      placeholder="Buscar por nome, SKU ou categoria"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1 text-xs text-white outline-none focus:border-primary/50 sm:w-56 sm:py-1.5 sm:text-sm"
                    />
                    <select
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1 text-xs text-white outline-none focus:border-primary/50 sm:w-44 sm:py-1.5 sm:text-sm"
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
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400 sm:text-xs">
                    Adicione um item manual apenas neste orçamento.
                  </span>
                )}
              </div>
            </div>

            <div className={`${insetPanelClass} p-3 sm:p-3.5`}>
              {activeTab === 'manual' ? (
                <div ref={manualEditorRef} className="space-y-2">
                  {editingManualId && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
                      <span>Editando item manual</span>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:border-primary/40"
                        onClick={resetManualForm}
                      >
                        Cancelar edição
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Nome do item
                      <input
                        value={manualForm.name}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="Ex: Cabo especial"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      SKU (opcional)
                      <input
                        value={manualForm.sku}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, sku: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="SKU interno"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Categoria (opcional)
                      <input
                        value={manualForm.category}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, category: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="Categoria"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Tipo
                      <select
                        value={manualForm.type}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, type: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                      >
                        <option value="materiais">Materiais</option>
                        <option value="servicos">Serviços</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Unidade
                      <input
                        value={manualForm.unit}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, unit: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="Un"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Valor cobrado (R$)
                      <input
                        value={manualForm.price}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, price: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="Ex: 120,50"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Valor real (R$)
                      <input
                        value={manualForm.realCost}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, realCost: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                        placeholder="Opcional para margem"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                      Quantidade
                      <input
                        type="number"
                        min="1"
                        value={manualForm.quantity}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, quantity: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        className="btn-primary h-[42px] w-full justify-center gap-1.5 rounded-xl px-3 text-sm"
                        type="button"
                        onClick={handleAddManualItem}
                      >
                        <Plus className="h-4 w-4" />
                        {editingManualId ? 'Atualizar' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                  {manualError && <p className="text-[11px] text-rose-200">{manualError}</p>}
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-xs text-slate-400 sm:text-sm">Nenhum item encontrado.</p>
              ) : (
                <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1 sm:max-h-[45vh]">
                  {filteredList.map((item) => (
                    <div
                      key={item.id}
                      className="quote-catalog-item flex flex-col gap-2 rounded-xl px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:py-2"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-[11px] font-semibold text-white sm:text-xs">{item.name}</p>
                        <p className="break-words text-[10px] text-slate-400 sm:text-[11px]">
                          {item.sku || 'SKU'} · {item.category || 'Categoria'} · {item.unit || 'Unidade'}
                        </p>
                      </div>
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                        <span className="text-[11px] font-semibold text-white sm:text-xs">{formatCurrency(item.price)}</span>
                        <input
                          type="number"
                          min="1"
                          value={quantities[item.id] || 1}
                          onChange={(e) =>
                            setQuantities((prev) => ({ ...prev, [item.id]: Number(e.target.value) || 1 }))
                          }
                          className="w-12 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[11px] text-white outline-none focus:border-primary/50 sm:w-14 sm:text-xs"
                        />
                        <button type="button" className="btn-secondary" onClick={() => handleAddItem(item)}>
                          <Plus className="h-3.5 w-3.5" />
                          <span className="text-[11px] sm:text-xs">Adicionar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${insetPanelClass} quote-selected-panel p-3 sm:p-3.5`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-white sm:text-sm">Itens do orcamento</p>
                <p className="text-[11px] text-slate-400 sm:text-xs">{form.items.length} itens</p>
              </div>
              {form.items.length === 0 ? (
                <p className="text-xs text-slate-400 sm:text-sm">Nenhum item adicionado.</p>
              ) : (
                <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1 sm:max-h-[40rem]">
                  {form.items.map((item) => {
                    const isManualItem = item.source === 'manual' || `${item.id}`.startsWith('manual-');
                    return (
                      <div
                      key={item.id}
                      className={`flex flex-col gap-2 rounded-xl px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:py-2 ${
                        isManualItem
                          ? 'quote-manual-item border'
                          : 'quote-selected-item'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="break-words text-[11px] font-semibold text-white sm:text-xs">
                          {item.name} <span className="text-xs text-slate-400">({item.type || 'item'})</span>
                        </p>
                        <p className="break-words text-[10px] text-slate-400 sm:text-[11px]">
                          {item.quantity} x {formatCurrency(item.price)} · {item.sku}
                        </p>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                        <p className="text-[11px] font-semibold text-white sm:text-xs">
                          {formatCurrency(item.quantity * item.price)}
                        </p>
                        <div className="flex items-center gap-2">
                          {isManualItem && (
                            <button
                              type="button"
                              onClick={() => openManualEdit(item)}
                              className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-amber-400/50 hover:text-amber-100"
                              title="Editar item manual"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-rose-500/50 hover:text-rose-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          ref={reviewSectionRef}
          className={`mt-3 rounded-[1.4rem] border p-3 shadow-[0_14px_32px_rgba(2,6,23,0.16)] sm:mt-4 sm:p-4 ${
            activeStep === 'revisao'
              ? 'quote-panel border-amber-300/25 ring-1 ring-amber-300/15'
              : 'quote-panel border-white/10'
          }`}
        >
          <div className="mb-2 flex items-center justify-between sm:mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Revisao</p>
              <p className="text-xs font-semibold text-white sm:text-sm">Confira antes de salvar</p>
            </div>
            <div className="text-right text-[11px] text-slate-400 sm:text-xs">
              <p>Total</p>
              <p className="text-sm font-semibold text-white sm:text-base">{formatCurrency(form.total ?? totals.total)}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:gap-3 md:grid-cols-3">
            <div className="quote-panel rounded-xl border border-white/10 p-2.5 sm:p-3">
              <p className="text-xs text-slate-400">Cliente</p>
              <p className="text-xs text-white sm:text-sm">{form.clientCompany || form.clientName || 'Sem cliente'}</p>
              <p className="text-[11px] text-slate-400 sm:text-xs">{form.clientEmail || '--'}</p>
            </div>
            <div className="quote-panel rounded-xl border border-white/10 p-2.5 sm:p-3">
              <p className="text-xs text-slate-400">Projeto</p>
              <p className="text-xs text-white sm:text-sm">{form.title || 'Sem titulo'}</p>
              <p className="text-[11px] text-slate-400 sm:text-xs">Itens: {form.items.length}</p>
            </div>
            <div className="quote-panel rounded-xl border border-white/10 p-2.5 sm:p-3">
              <p className="text-xs text-slate-400">Status</p>
              <p className="text-xs text-white sm:text-sm">{form.status || 'Sem status'}</p>
              <p className="text-[11px] text-slate-400 sm:text-xs">Validade: {form.validUntil || '--'}</p>
            </div>
          </div>
          {(form.createdBy || form.updatedBy) && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 sm:mt-3 sm:text-xs">
              <span>
                Criado por: {form.createdBy || '—'} {form.createdByEmail ? `(${form.createdByEmail})` : ''}
              </span>
              <span>
                Atualizado por: {form.updatedBy || '—'} {form.updatedByEmail ? `(${form.updatedByEmail})` : ''}{' '}
                {form.updatedAt ? `em ${new Date(form.updatedAt).toLocaleString('pt-BR')}` : ''}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={goPrevStep}
              disabled={activeIndex <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={goNextStep}
              disabled={activeIndex >= steps.length - 1}
            >
              Proximo
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col items-end gap-2">
            {showValidation && missingFields.length > 0 && (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100 shadow-[0_12px_30px_rgba(244,63,94,0.12)] sm:text-xs">
                Preencha: {missingFields.join(', ')}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                    Salvando...
                  </>
                ) : (
                  'Salvar orcamento'
                )}
              </button>
            </div>
          </div>
        </div>
        </div>

        <div className={`quote-modal-floating-total pointer-events-none absolute bottom-20 right-3 z-30 transition-all duration-200 sm:bottom-5 sm:right-4 ${hideFloatingTotal || !shouldShowFloatingTotal ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'}`}>
          <div className="quote-total-box pointer-events-auto min-w-[9rem] rounded-2xl border border-white/10 px-3 py-2 text-right shadow-[0_14px_34px_rgba(2,6,23,0.24)] sm:min-w-[10rem] sm:px-4 sm:py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300/80">Total</p>
            <p className="mt-1 text-base font-bold text-white sm:text-lg">{formatCurrency(totals.total)}</p>
          </div>
        </div>
      </div>

      {isSaving && (
        <div className="cyber-overlay fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="cyber-dialog cyber-loading-dialog flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
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
        <div className={`cyber-overlay fixed inset-0 z-[60] flex items-center justify-center px-2 py-4 sm:px-3 sm:py-6 ${modalPalette.overlay}`}>
          <div
            className={`cyber-dialog w-full max-w-md rounded-2xl border p-3 sm:p-4 ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
          >
            <div className="mb-2 flex items-center justify-between sm:mb-3">
              <h4 className="text-sm font-semibold text-white sm:text-base">Diarias</h4>
              <button
                type="button"
                onClick={closeLaborModal}
                className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-primary/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-3">
              {LABOR_OPTIONS.map((option) => {
                const entry = laborForm[option.id] || {};
                const quantity = entry.quantity ?? '';
                const rate = entry.rate ?? option.rate;
                const breakdownText = buildBreakdownText(option.breakdown);
                const unitLabel = option.unitLabel ? `por ${option.unitLabel}` : 'por unidade';

                return (
                  <div key={option.id} className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-white sm:text-sm">{option.label}</p>
                        <p className="text-[11px] text-slate-400 sm:text-xs">
                          {formatCurrency(option.rate)} {unitLabel}
                          {breakdownText ? ` (${breakdownText})` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                        {option.quantityLabel || 'Quantidade'}
                        <input
                          type="number"
                          min="0"
                          value={quantity}
                          onChange={(e) => updateLaborField(option.id, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60"
                          placeholder="Ex: 3"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                        Valor
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rate}
                          onChange={(e) => updateLaborField(option.id, 'rate', e.target.value.replace(/[^0-9,]/g, ''))}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60"
                          placeholder={String(option.rate)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end gap-2 sm:mt-4">
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
    </div>,
    document.body,
  );
};

export default QuoteModal;
