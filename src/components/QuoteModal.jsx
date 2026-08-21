import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Maximize2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Users, X } from 'lucide-react';
import { computeQuoteTotals } from '../services/quotes.js';
import { getEmployees } from '../services/employees.js';
import { getResolvedProductServiceReference } from '../services/api.js';
import { formatCurrency } from '../utils/formatters.js';
import { buildImportPreview } from '../utils/quoteImporter.js';
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
  showItemValues: false,
  items: [],
  notes: '',
  scope: '',
  createdBy: '',
  createdByEmail: '',
  updatedBy: '',
  updatedByEmail: '',
  updatedAt: '',
};

const createDefaultManualForm = () => ({
  name: '',
  sku: '',
  category: '',
  unit: 'Un',
  price: '0',
  realCost: '',
  quantity: 1,
  type: 'materiais',
  source: 'manual',
});

const manualFormSnapshot = (value = {}) =>
  JSON.stringify({
    name: value.name || '',
    sku: value.sku || '',
    category: value.category || '',
    unit: value.unit || '',
    price: value.price?.toString() || '',
    realCost: value.realCost?.toString() || '',
    quantity: Number(value.quantity || 1),
    type: value.type || 'materiais',
    source: value.source || 'manual',
  });

const laborFormSnapshot = (value = {}) =>
  JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = {
          quantity: `${value[key]?.quantity ?? ''}`,
          rate: `${value[key]?.rate ?? ''}`,
        };
        return acc;
      }, {}),
  );

const CATEGORY_OPTIONS = [
  'Cabeamento Estruturado',
  'Ciber Seguran\u00e7a',
  'Infraestrutura Fibra Optica',
  'Sistema Audiovisuais',
  'Sistema - CFTV',
  'Telecom',
];

const CATEGORY_SCOPE_STORAGE_KEY = 'crm-orcamentos:category-scope-templates';
const DEFAULT_CATEGORY_SCOPES = {
  'Cabeamento Estruturado': 'Execucao de infraestrutura de cabeamento estruturado, observando as boas praticas de instalacao, organizacao e identificacao dos pontos.',
  'Ciber Seguranca': 'Implantacao e configuracao da solucao de ciberseguranca definida para o ambiente, com validacao dos controles aplicados.',
  'Infraestrutura Fibra Optica': 'Execucao da infraestrutura de conectividade em fibra optica, incluindo acomodacao, identificacao e validacao dos enlaces.',
  'Sistema Audiovisuais': 'Implantacao e configuracao do sistema audiovisual, incluindo interligacao e validacao funcional dos equipamentos.',
  'Sistema - CFTV': 'Implantacao e configuracao do sistema de CFTV e monitoramento, com posicionamento e validacao dos recursos previstos.',
  Telecom: 'Execucao e organizacao da infraestrutura de telecomunicacoes, com identificacao e validacao dos recursos instalados.',
};

const readCategoryScopeTemplates = () => {
  if (typeof window === 'undefined') return { ...DEFAULT_CATEGORY_SCOPES };
  try {
    const stored = JSON.parse(window.localStorage.getItem(CATEGORY_SCOPE_STORAGE_KEY) || '{}');
    return { ...DEFAULT_CATEGORY_SCOPES, ...stored };
  } catch {
    return { ...DEFAULT_CATEGORY_SCOPES };
  }
};

const normalizeScopeText = (value) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const splitServiceName = (name) => {
  const [service, ...locationParts] = (name || '').toString().split(/\s+-\s+/);
  return { service: service.trim(), location: locationParts.join(' - ').trim() };
};

const formatServiceQuantity = (item) => {
  const quantity = Number(item?.quantity || 0);
  const rawUnit = (item?.unit || '').toString().trim();
  const normalizedUnit = normalizeScopeText(rawUnit);
  const unit = normalizedUnit === 'm' ? 'm' : normalizedUnit.startsWith('un') ? 'un.' : rawUnit.toLowerCase();
  return quantity > 0 ? `${quantity}${unit ? ` ${unit}` : ''}` : '';
};

const formatServiceLocation = (location) => {
  if (!location) return '';
  return /^(area|setor|andar|pavimento|sala)\b/.test(normalizeScopeText(location))
    ? ` na ${location}`
    : ` em ${location}`;
};

const cleanServiceSubject = (service) =>
  service
    .replace(/^(instala[cç][aã]o|fixa[cç][aã]o|montagem)\s+(de|do|da|dos|das)?\s*/i, '')
    .replace(/^(servico\s+de)\s*/i, '')
    .trim()
    .toLowerCase();

const buildInstallationScope = (item) => {
  const { service, location } = splitServiceName(item?.name || item?.description || '');
  const normalized = normalizeScopeText(service);
  const quantity = formatServiceQuantity(item);
  const amount = quantity ? `${quantity} de ` : '';
  const place = formatServiceLocation(location);

  if (/kit.*fixacao|fixacao.*poste/.test(normalized)) {
    return `Fixação de ${amount}kits em poste${place}, garantindo sustentação adequada, estabilidade mecânica e organização da infraestrutura instalada.`;
  }
  if (/patch\s*cord/.test(normalized)) {
    return `Instalação de ${amount}patch cords${place} para interligação dos equipamentos, com acomodação organizada e conferência da conectividade.`;
  }
  if (/conversor.*(midia|media)|media\s*converter/.test(normalized)) {
    return `Integração de ${amount}conversores de mídia${place}, incluindo conexão aos enlaces ópticos e metálicos, energização e teste de comunicação.`;
  }
  if (/\bdio\b|distribuidor.*optico/.test(normalized)) {
    return `Instalação de ${amount}distribuidores internos ópticos (DIO)${place}, com fixação, acomodação das fibras, identificação e preparação para as terminações.`;
  }
  if (/rack|bracket|gabinete/.test(normalized)) {
    return `Montagem de ${amount}racks ou gabinetes de telecomunicações${place}, contemplando fixação, organização dos componentes e acomodação do cabeamento.`;
  }
  if (/vbox|caixa.*cftv|caixa.*camera/.test(normalized)) {
    return `Instalação de ${amount}caixas de proteção VBOX${place}, destinadas ao acondicionamento das conexões e fontes do sistema de CFTV, com fixação segura, organização interna e vedação adequada.`;
  }
  if (/camera/.test(normalized)) {
    return `Fixação de ${amount}câmeras de CFTV${place}, incluindo posicionamento, conexão, ajuste do campo de visão e validação da imagem.`;
  }
  if (/cftv/.test(normalized)) {
    const subject = cleanServiceSubject(service || 'componentes do sistema de CFTV');
    return `Instalação de ${amount}${subject}${place}, com fixação, interligação ao sistema e testes funcionais de operação.`;
  }
  if (/tomada|espelho|keystone|ponto.*rede/.test(normalized)) {
    return `Montagem de ${amount}pontos de telecomunicações${place}, incluindo fixação dos componentes, terminação, identificação e teste de continuidade.`;
  }

  const subject = cleanServiceSubject(service || 'equipamentos previstos');
  return `Instalação de ${amount}${subject}${place}, contemplando fixação, interligação, organização e testes funcionais após a montagem.`;
};

const buildConfigurationScope = (item) => {
  const { service, location } = splitServiceName(item?.name || item?.description || '');
  const quantity = formatServiceQuantity(item);
  const subject = cleanServiceSubject(service || 'solução prevista');
  return `Configuração de ${quantity ? `${quantity} de ` : ''}${subject}${formatServiceLocation(location)}, com parametrização, integração e validação operacional.`;
};

const buildComplementaryServiceScope = (item) => {
  const { service, location } = splitServiceName(item?.name || item?.description || '');
  const quantity = formatServiceQuantity(item);
  const subject = cleanServiceSubject(service || 'atividade técnica prevista');
  return `Execução de ${quantity ? `${quantity} de ` : ''}${subject}${formatServiceLocation(location)}, seguindo as boas práticas técnicas e com verificação do resultado ao término da atividade.`;
};

const renderServiceScopeTemplate = (item) => {
  const template = (item?.scopeTemplate || '').toString().trim();
  if (!template) return '';
  const { service, location } = splitServiceName(item?.name || item?.description || '');
  const quantity = Number(item?.quantity || 0);
  const unit = (item?.unit || '').toString().trim();
  return template
    .replaceAll('{quantidade}', quantity > 0 ? String(quantity) : '')
    .replaceAll('{unidade}', unit)
    .replaceAll('{local}', location)
    .replaceAll('{servico}', service)
    .replaceAll('{categoria}', item?.category || '')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const buildAutomaticScope = (category, items = [], categoryScopes = DEFAULT_CATEGORY_SCOPES) => {
  const safeCategory = (category || '').toString().trim();
  if (!safeCategory) return '';
  const baseScope = (categoryScopes[safeCategory] || `Execucao dos servicos relacionados a ${safeCategory}.`).trim();
  const services = (items || []).filter((item) => {
    if (item?.type !== 'servicos' || LABOR_ITEM_IDS.has(item?.id)) return false;
    return !/diaria|acompanhamento/.test(normalizeScopeText(item?.name));
  });
  const sections = [baseScope];

  const installationItems = [];
  const configurationItems = [];
  const otherItems = [];

  services.forEach((item) => {
    const catalogTemplateScope = renderServiceScopeTemplate(item);
    if (catalogTemplateScope) {
      sections.push(catalogTemplateScope);
      return;
    }
    const { service, location } = splitServiceName(item?.name || item?.description || '');
    const normalized = normalizeScopeText(service);
    const quantity = formatServiceQuantity(item);
    const place = formatServiceLocation(location);

    if (/lancamento|passagem/.test(normalized) && /cabo.*(rede|dados)|utp|ftp|cat\s*[5-8]/.test(normalized)) {
      sections.push(`Lancamento de ${quantity || 'cabos'} de cabeamento de rede${place}, com acomodacao, identificacao das extremidades e preparacao dos enlaces.`);
      return;
    }
    if (/lancamento|passagem/.test(normalized) && /fibra|optico|optica/.test(normalized)) {
      sections.push(`Lancamento de ${quantity || 'cabo'} de cabo optico${place}, com acomodacao adequada, identificacao das extremidades e preservacao do raio de curvatura.`);
      return;
    }
    if (/fusao|emenda/.test(normalized) && /fibra|optico|optica/.test(normalized)) {
      sections.push(`Fusao de ${quantity || 'fibras opticas'}${place}, incluindo preparacao, acomodacao, identificacao e verificacao do enlace.`);
      return;
    }
    if (/certificacao|teste/.test(normalized) && /rede|cabo|ponto/.test(normalized)) {
      sections.push(`Certificacao de ${quantity || 'pontos de rede'}${place}, com validacao dos enlaces e registro dos resultados.`);
      return;
    }
    if (/instalacao|fixacao|montagem/.test(normalized)) {
      installationItems.push(buildInstallationScope(item));
      return;
    }
    if (/configuracao|programacao|ativacao/.test(normalized)) {
      configurationItems.push(buildConfigurationScope(item));
      return;
    }
    otherItems.push(buildComplementaryServiceScope(item));
  });

  if (installationItems.length) {
    sections.push(...installationItems);
  }
  if (configurationItems.length) {
    sections.push(...configurationItems);
  }
  if (otherItems.length) {
    sections.push(...otherItems);
  }
  return sections.join('\n\n');
};

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
const getQuoteItemKey = (item) => `${item?.type || 'item'}::${item?.id || ''}`;
const isManualQuoteItem = (item) => item?.source === 'manual' || `${item?.id || ''}`.startsWith('manual-');
const buildCatalogQuoteItem = (product, quantity, typeOverride, source = 'catalog') => ({
  id: product.id,
  name: product.name,
  sku: product.sku,
  category: product.category || '',
  price: Number(product.price || 0),
  quantity: Number(quantity || 1),
  unit: product.unit || '',
  type: typeOverride || product.type || 'materiais',
  source,
  scopeTemplate: product.scopeTemplate || '',
});
const mergeQuoteItems = (currentItems = [], incomingItems = []) => {
  const items = currentItems.map((item) => ({ ...item }));
  incomingItems.forEach((incomingItem) => {
    const matchIndex = items.findIndex(
      (item) => item.id === incomingItem.id && (item.type || 'materiais') === (incomingItem.type || 'materiais'),
    );

    if (matchIndex === -1) {
      items.push({ ...incomingItem });
      return;
    }

    items[matchIndex] = {
      ...items[matchIndex],
      quantity: Number(items[matchIndex].quantity || 0) + Number(incomingItem.quantity || 0),
      unit: items[matchIndex].unit || incomingItem.unit || '',
      category: items[matchIndex].category || incomingItem.category || '',
      source: items[matchIndex].source || incomingItem.source || 'catalog',
    };
  });
  return items;
};
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
  initialActiveTab = 'materiais',
  initialActiveStep = 'cliente',
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
  const [manualForm, setManualForm] = useState(createDefaultManualForm);
  const [manualError, setManualError] = useState('');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [importError, setImportError] = useState('');
  const [editingItemKey, setEditingItemKey] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState('');
  const [laborModalOpen, setLaborModalOpen] = useState(false);
  const [scopeHelpOpen, setScopeHelpOpen] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [scopeTemplateCategory, setScopeTemplateCategory] = useState(CATEGORY_OPTIONS[0]);
  const [categoryScopes, setCategoryScopes] = useState(readCategoryScopeTemplates);
  const [laborForm, setLaborForm] = useState({});
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftMeta, setDraftMeta] = useState(null);
  const [hideFloatingTotal, setHideFloatingTotal] = useState(false);
  const savingRef = useRef(false);
  const automaticScopeRef = useRef('');
  const draftBaseSnapshotRef = useRef('');
  const sessionSnapshotRef = useRef(draftSnapshot(defaultQuote));
  const manualFormBaseRef = useRef(manualFormSnapshot(createDefaultManualForm()));
  const laborFormBaseRef = useRef(laborFormSnapshot({}));
  const scrollContainerRef = useRef(null);
  const manualEditorRef = useRef(null);
  const importSectionRef = useRef(null);
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

  const findClientByValue = useCallback((value) => {
    const norm = normalizeValue(value);
    return (
      clients.find((c) => normalizeValue(c.id) === norm) ||
      clients.find((c) => normalizeValue(c.company) === norm) ||
      clients.find((c) => normalizeValue(c.name) === norm)
    );
  }, [clients]);

  useEffect(() => {
    const baseForm = buildInitialForm(sourceQuote, isEditing);
    draftBaseSnapshotRef.current = draftSnapshot(baseForm);
    const restoredDraft = open && draftKey ? readQuoteDraft(draftKey) : null;
    const nextForm = restoredDraft?.data ? { ...baseForm, ...restoredDraft.data } : baseForm;

    // Novos orcamentos e rascunhos recuperados continuam com o escopo em modo
    // automatico. Em orcamentos existentes, um escopo salvo e tratado como
    // texto manual para evitar sobrescrever uma proposta ja personalizada.
    automaticScopeRef.current = isEditing && nextForm.scope?.trim() ? null : nextForm.scope || '';

    setForm(nextForm);
    sessionSnapshotRef.current = draftSnapshot(nextForm);
    setActiveTab(initialActiveTab || 'materiais');
    setSearch('');
    setQuantities({});
    setSelectedClientId(
      nextForm.clientId || nextForm.clientCompany || nextForm.clientName || sourceQuote?.clientId || sourceQuote?.clientCompany || sourceQuote?.clientName || '',
    );
    setLaborModalOpen(false);
    setScopeHelpOpen(false);
    setAssumptionsOpen(false);
    setLaborForm({});
    laborFormBaseRef.current = laborFormSnapshot({});
    setActiveStep(initialActiveStep || 'cliente');
    setShowValidation(false);
    const emptyManualForm = createDefaultManualForm();
    setManualForm(emptyManualForm);
    manualFormBaseRef.current = manualFormSnapshot(emptyManualForm);
    setManualError('');
    setImportText('');
    setImportPreview([]);
    setImportSummary(null);
    setImportError('');
    setEditingItemKey(null);
    setCloseConfirmOpen(false);
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
  }, [draftKey, initialActiveStep, initialActiveTab, isEditing, open, pushToast, sourceQuote]);

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
    if (activeTab !== 'materiais' && activeTab !== 'servicos') {
      setCategoryOptions([]);
      return;
    }
    const sourceList = activeTab === 'materiais' ? materials : services;
    const allCategories = sourceList
      .map((item) => item.category)
      .filter(Boolean)
      .map((c) => c.trim());
    const unique = Array.from(new Set(allCategories)).sort((a, b) => a.localeCompare(b));
    setCategoryOptions(unique);
  }, [materials, services, activeTab]);

  const list = useMemo(() => {
    if (activeTab === 'materiais') return materials;
    if (activeTab === 'servicos') return services;
    return [];
  }, [activeTab, materials, services]);

  const filteredList = useMemo(() => {
    if (activeTab !== 'materiais' && activeTab !== 'servicos') return [];
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
  }, [activeTab, list, search, form.categoryFilter]);

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
  }, [clients.length, findClientByValue, isEditing, selectedClientId]);

  const totals = useMemo(
    () => computeQuoteTotals(form.items, form.discountValue, form.taxRate),
    [form.items, form.discountValue, form.taxRate],
  );

  const taxValue = useMemo(() => {
    const rate = Number(form.taxRate || 0) / 100;
    return (form.items || []).reduce((acc, item) => acc + item.price * item.quantity, 0) * rate;
  }, [form.items, form.taxRate]);
  const shouldShowFloatingTotal = Number(totals.subtotal || 0) > 0;
  const currentFormSnapshot = useMemo(() => draftSnapshot(form), [form]);
  const currentManualFormSnapshot = useMemo(() => manualFormSnapshot(manualForm), [manualForm]);
  const currentLaborFormSnapshot = useMemo(() => laborFormSnapshot(laborForm), [laborForm]);
  const hasUnsavedQuoteChanges = currentFormSnapshot !== sessionSnapshotRef.current;
  const hasPendingManualChanges = currentManualFormSnapshot !== manualFormBaseRef.current;
  const hasPendingImportChanges = Boolean(importText.trim() || importPreview.length || importSummary);
  const hasPendingLaborChanges = laborModalOpen && currentLaborFormSnapshot !== laborFormBaseRef.current;
  const hasPendingAuxChanges = hasPendingManualChanges || hasPendingImportChanges || hasPendingLaborChanges;
  const hasUnsavedChanges = hasUnsavedQuoteChanges || hasPendingAuxChanges;
  const canSaveAndCloseFromConfirm = hasUnsavedQuoteChanges && !hasPendingAuxChanges;
  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, isSaving, onClose]);

  const closeScopeHelp = () => {
    setCategoryScopes(readCategoryScopeTemplates());
    setScopeHelpOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (isSaving) return;
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false);
        return;
      }
      if (scopeHelpOpen) {
        closeScopeHelp();
        return;
      }
      if (assumptionsOpen) {
        setAssumptionsOpen(false);
        return;
      }
      if (laborModalOpen) {
        closeLaborModal();
      } else {
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, isSaving, laborModalOpen, closeConfirmOpen, scopeHelpOpen, assumptionsOpen, requestClose]);

  const hasClient = Boolean(selectedClientId || form.clientCompany || form.clientName);
  const hasInternalContact = Boolean(form.contactName && form.contactName.trim());
  const hasTitle = Boolean(form.title && form.title.trim());
  const hasCategory = Boolean(form.category && form.category.trim());
  const hasItems = (form.items || []).length > 0 || Number(form.total || 0) > 0;
  const hasValidUntil = Boolean(form.validUntil);
  const hasDeliveryTime = Number(form.deliveryTime || 0) > 0;
  const hasPaymentTerms = Number(form.paymentTerms || 0) > 0;
  const hasValues = Boolean(form.status) && hasValidUntil && hasDeliveryTime && hasPaymentTerms;
  const isDraftStatus = normalizeValue(form.status || '') === 'rascunho';
  const canSave = isDraftStatus ? hasItems : hasClient && hasInternalContact && hasTitle && hasCategory && hasItems && hasValues;
  const clientRequired = showValidation && !isDraftStatus && !hasClient;
  const internalContactRequired = showValidation && !isDraftStatus && !hasInternalContact;
  const titleRequired = showValidation && !isDraftStatus && !hasTitle;
  const categoryRequired = showValidation && !isDraftStatus && !hasCategory;
  const validUntilRequired = showValidation && !isDraftStatus && !hasValidUntil;
  const deliveryTimeRequired = showValidation && !isDraftStatus && !hasDeliveryTime;
  const paymentTermsRequired = showValidation && !isDraftStatus && !hasPaymentTerms;
  const missingFields = useMemo(() => {
    const missing = [];
    if (!hasItems) missing.push('Itens');
    if (!isDraftStatus) {
      if (!hasClient) missing.push('Cliente');
      if (!hasInternalContact) missing.push('Contato interno');
      if (!hasTitle) missing.push('Projeto');
      if (!hasCategory) missing.push('Categoria');
      if (!hasValidUntil) missing.push('Validade');
      if (!hasDeliveryTime) missing.push('Prazo de entrega');
      if (!hasPaymentTerms) missing.push('Pagamento');
    }
    return missing;
  }, [hasCategory, hasClient, hasDeliveryTime, hasInternalContact, hasItems, hasPaymentTerms, hasTitle, hasValidUntil, isDraftStatus]);

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

  const automaticScope = useMemo(
    () => buildAutomaticScope(form.category, form.items, categoryScopes),
    [categoryScopes, form.category, form.items],
  );

  const importScopePreview = useMemo(() => {
    if (!form.category || !importPreview.length) return '';
    const suggestedServices = importPreview
      .filter((entry) => entry.status !== 'unmatched' && entry.derivedService?.suggestedItem)
      .map((entry) => entry.derivedService.suggestedItem);
    return buildAutomaticScope(form.category, suggestedServices, categoryScopes);
  }, [categoryScopes, form.category, importPreview]);

  useEffect(() => {
    if (!open || !automaticScope || automaticScopeRef.current === null) return;
    setForm((prev) => {
      const currentScope = (prev.scope || '').trim();
      if (currentScope && currentScope !== automaticScopeRef.current) {
        automaticScopeRef.current = null;
        return prev;
      }
      if (prev.scope === automaticScope) return prev;
      automaticScopeRef.current = automaticScope;
      return { ...prev, scope: automaticScope };
    });
  }, [automaticScope, open]);

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

  useEffect(() => {
    if (!open) return;
    if ((initialActiveStep || 'cliente') === 'cliente' && (initialActiveTab || 'materiais') === 'materiais') return;

    const frame = window.requestAnimationFrame(() => {
      if ((initialActiveTab || 'materiais') === 'lista-ia' && importSectionRef.current) {
        importSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const target = steps.find((step) => step.key === (initialActiveStep || 'cliente'));
      target?.ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialActiveStep, initialActiveTab, open, steps]);

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
    const nextItem = buildCatalogQuoteItem(product, qty, activeTab, 'catalog');
    setForm((prev) => {
      const items = mergeQuoteItems(prev.items, [nextItem]);
      return { ...prev, items };
    });
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
  };

  const handleAnalyzeImport = () => {
    const materialCatalog = materials.map((product) => ({
      ...product,
      serviceReference: getResolvedProductServiceReference(product),
    }));
    const preview = buildImportPreview(importText, { materials: materialCatalog, services });
    setImportPreview(preview.lines);
    setImportSummary(preview.summary);
    setImportError('');

    if (!preview.summary.totalLines) {
      setImportError('Cole ao menos uma linha com quantidade e descricao para analisar.');
      return;
    }

    if (!preview.summary.matchedCount && !preview.summary.reviewCount) {
      pushToast({
        title: 'Nenhuma sugestao encontrada',
        message: 'Nao houve correspondencia suficiente com o catalogo atual.',
        type: 'error',
        duration: 4500,
      });
      return;
    }

    pushToast({
      title: 'Lista analisada',
      message: `${preview.summary.matchedCount} material(is) com match forte, ${preview.summary.reviewCount} para revisao e ${preview.summary.derivedServicesCount} servico(s) sugerido(s).`,
      type: 'success',
      duration: 3500,
    });
  };

  const handleApplyImportedItems = () => {
    const materialItems = importPreview
      .filter((entry) => entry.suggestedItem && entry.status !== 'unmatched')
      .map((entry) => entry.suggestedItem);
    const serviceItems = importPreview
      .filter((entry) => entry.derivedService?.suggestedItem && entry.status !== 'unmatched')
      .map((entry) => entry.derivedService.suggestedItem);
    const suggestedItems = [...materialItems, ...serviceItems];

    if (!suggestedItems.length) {
      setImportError('Nao ha sugestoes validas para adicionar ao orcamento.');
      return;
    }

    setForm((prev) => {
      const items = mergeQuoteItems(prev.items, suggestedItems);
      const nextTitle =
        prev.title ||
        `Rascunho importado - ${new Date().toLocaleDateString('pt-BR')}`;

      return {
        ...prev,
        title: nextTitle,
        status: isEditing ? prev.status : 'Rascunho',
        items,
      };
    });

    setActiveStep('itens');
    setActiveTab('manual');
    setImportText('');
    setImportPreview([]);
    setImportSummary(null);
    setImportError('');

    pushToast({
      title: 'Itens adicionados',
      message: `${materialItems.length} material(is) e ${serviceItems.length} servico(s) foram enviados para o rascunho do orcamento.`,
      type: 'success',
      duration: 4000,
    });
  };

  const openItemEditor = (item) => {
    setActiveStep('itens');
    setActiveTab('manual');
    const nextManualForm = {
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || '',
      unit: item.unit || 'Un',
      price: item.price?.toString() || '',
      realCost: item.realCost?.toString() || '',
      quantity: item.quantity || 1,
      type: item.type || 'materiais',
      source: item.source || (isManualQuoteItem(item) ? 'manual' : 'catalog'),
    };
    setManualForm(nextManualForm);
    manualFormBaseRef.current = manualFormSnapshot(nextManualForm);
    setManualError('');
    setEditingItemKey(getQuoteItemKey(item));
  };

  useEffect(() => {
    if (!open || activeTab !== 'manual' || !editingItemKey) return;
    const target = manualEditorRef.current;
    if (!(target instanceof HTMLElement)) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, editingItemKey, open]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
  }, [activeTab, open]);

  const parsePriceValue = (value) => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = value.toString().replace(/[^0-9,.-]/g, '');
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
    const emptyManualForm = createDefaultManualForm();
    setManualForm(emptyManualForm);
    manualFormBaseRef.current = manualFormSnapshot(emptyManualForm);
    setEditingItemKey(null);
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
    const originalItem = editingItemKey
      ? form.items.find((item) => getQuoteItemKey(item) === editingItemKey) || null
      : null;
    setManualError('');
    const updatedItem = {
      id: originalItem?.id || `manual-${crypto.randomUUID()}`,
      name,
      sku: manualForm.sku.trim(),
      category: manualForm.category.trim(),
      price,
      realCost,
      quantity: qty,
      unit: manualForm.unit,
      type: manualForm.type,
      source: manualForm.source || originalItem?.source || 'manual',
    };
    const nextItemKey = getQuoteItemKey(updatedItem);
    const hasConflict = form.items.some(
      (item) => getQuoteItemKey(item) === nextItemKey && getQuoteItemKey(item) !== editingItemKey,
    );
    if (hasConflict) {
      setManualError('Ja existe um item desse tipo com o mesmo identificador no orcamento.');
      return;
    }
    if (editingItemKey) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item) => (getQuoteItemKey(item) === editingItemKey ? { ...item, ...updatedItem } : item)),
      }));
    } else {
      setForm((prev) => ({ ...prev, items: [...prev.items, updatedItem] }));
    }
    resetManualForm();
  };

  const handleRemoveItem = (targetItem) => {
    const targetKey = getQuoteItemKey(targetItem);
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => getQuoteItemKey(item) !== targetKey) }));
    if (editingItemKey === targetKey) {
      resetManualForm();
    }
  };

  const handleChange = (field, value) => {
    if (field === 'scope') {
      automaticScopeRef.current = null;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const regenerateScope = () => {
    const nextScope = buildAutomaticScope(form.category, form.items, categoryScopes);
    if (!nextScope) {
      pushToast({
        title: 'Selecione uma categoria',
        message: 'A categoria define a estrutura inicial do escopo automatico.',
        type: 'error',
      });
      return;
    }
    automaticScopeRef.current = nextScope;
    setForm((prev) => ({ ...prev, scope: nextScope }));
    pushToast({
      title: 'Escopo atualizado',
      message: 'O texto foi gerado a partir da categoria, materiais e servicos selecionados.',
      type: 'success',
    });
  };

  const updateCategoryScope = (category, value) => {
    setCategoryScopes((prev) => ({ ...prev, [category]: value }));
  };

  const saveCategoryScopes = () => {
    try {
      window.localStorage.setItem(CATEGORY_SCOPE_STORAGE_KEY, JSON.stringify(categoryScopes));
      setScopeHelpOpen(false);
      pushToast({
        title: 'Padroes de escopo salvos',
        message: 'Os proximos escopos usarao os textos personalizados por categoria.',
        type: 'success',
      });
    } catch {
      pushToast({
        title: 'Nao foi possivel salvar',
        message: 'O navegador bloqueou o armazenamento local dos textos de escopo.',
        type: 'error',
      });
    }
  };

  const restoreCategoryScope = () => {
    updateCategoryScope(scopeTemplateCategory, DEFAULT_CATEGORY_SCOPES[scopeTemplateCategory] || '');
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
    laborFormBaseRef.current = laborFormSnapshot(nextForm);
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
      if (!isDraftStatus && (!hasClient || !hasInternalContact || !hasTitle || !hasCategory)) {
        goToStep('cliente');
      } else if (!hasItems) {
        goToStep('itens');
      } else if (!isDraftStatus && !hasValues) {
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
      sessionSnapshotRef.current = draftSnapshot(form);
      setCloseConfirmOpen(false);
      if (draftKey) {
        clearQuoteDraft(draftKey);
        setDraftMeta(null);
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleConfirmSaveAndClose = () => {
    setCloseConfirmOpen(false);
    submit();
  };

  const handleCloseWithoutSaving = () => {
    if (draftKey) {
      clearQuoteDraft(draftKey);
      setDraftMeta(null);
    }
    setCloseConfirmOpen(false);
    onClose();
  };

  const handleDiscardDraft = () => {
    const baseForm = buildInitialForm(sourceQuote, isEditing);
    draftBaseSnapshotRef.current = draftSnapshot(baseForm);
    sessionSnapshotRef.current = draftSnapshot(baseForm);
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
        if (isSaving || laborModalOpen || closeConfirmOpen) return;
        requestClose();
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
                onClick={requestClose}
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
              <span className="flex items-center justify-between gap-2">
                <span>Escopo</span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={regenerateScope}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary-100 transition hover:border-primary/50 hover:bg-primary/20 sm:text-[11px]"
                    title="Gerar novamente usando categoria e servicos"
                  >
                    <Sparkles className="h-3 w-3" />
                    Gerar escopo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScopeTemplateCategory(form.category || CATEGORY_OPTIONS[0]);
                      setScopeHelpOpen(true);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:border-primary/50 hover:bg-primary/10 hover:text-white"
                    title="Como funciona e editar os padroes"
                    aria-label="Ajuda sobre o escopo automatico"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                </span>
              </span>
              <textarea
                value={form.scope}
                onChange={(e) => handleChange('scope', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs sm:py-2 sm:text-sm text-white outline-none focus:border-primary/60 placeholder:text-slate-400"
                placeholder="Descreva brevemente o escopo"
                rows={3}
              />
              <span className="mt-1 block text-[10px] font-normal text-slate-400 sm:text-[11px]">
                Preenchido automaticamente pela categoria e pelos servicos. Materiais nao alteram o escopo.
              </span>
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
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2.5 sm:col-span-3">
                <input
                  type="checkbox"
                  checked={Boolean(form.showItemValues)}
                  onChange={(e) => handleChange('showItemValues', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-200 sm:text-sm">
                    Exibir valores dos itens no orçamento
                  </span>
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400 sm:text-[11px]">
                    Adiciona ao PDF uma coluna com o valor unitário de cada material e serviço.
                  </span>
                </span>
              </label>
              <label className="block text-xs font-semibold text-slate-300 sm:col-span-3 sm:text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>Premissas</span>
                  <button
                    type="button"
                    onClick={() => setAssumptionsOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-primary/40 hover:bg-primary/10 hover:text-white sm:text-[11px]"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Abrir editor
                  </button>
                </span>
                <textarea
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={4}
                  className="mt-1 w-full resize-y rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white outline-none focus:border-primary/60 sm:text-sm placeholder:text-slate-500"
                  placeholder="Ex: infraestrutura existente disponível, execução em horário comercial e acesso às áreas liberado pelo cliente."
                />
                <span className="mt-1 block text-[10px] font-normal text-slate-400 sm:text-[11px]">
                  Registre condições consideradas para composição da proposta e execução dos serviços.
                </span>
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
                <button
                  type="button"
                  className={getTabButtonClass(activeTab === 'lista-ia')}
                  onClick={() => setActiveTab('lista-ia')}
                >
                  Lista IA
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'materiais' || activeTab === 'servicos' ? (
                  <>
                    <div className="relative w-full sm:w-56">
                      <input
                        placeholder="Buscar por nome, SKU ou categoria"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1 pr-9 text-xs text-white outline-none focus:border-primary/50 sm:py-1.5 sm:text-sm"
                      />
                      {search ? (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white"
                          aria-label="Limpar busca"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <select
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1 text-[11px] text-white outline-none focus:border-primary/50 sm:w-44 sm:py-1.5 sm:text-[12px]"
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
                ) : activeTab === 'lista-ia' ? (
                  <span className="text-[11px] text-slate-400 sm:text-xs">
                    Cole a lista e deixe a IA montar o rascunho automaticamente.
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 sm:text-xs">
                    Adicione ou edite um item apenas neste orçamento.
                  </span>
                )}
              </div>
            </div>

            {activeTab === 'lista-ia' ? (
            <div
              ref={importSectionRef}
              className="quote-panel rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 shadow-[0_14px_30px_rgba(245,158,11,0.08)] sm:p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-amber-100 sm:text-sm">Criacao automatica por lista</p>
                  <p className="mt-1 text-[11px] text-amber-50/80 sm:text-xs">
                    Cole uma lista simples. O sistema compara as palavras com o catalogo e monta um rascunho com os itens mais proximos.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-secondary" onClick={handleAnalyzeImport}>
                    Comparar lista
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleApplyImportedItems}
                    disabled={
                      !importPreview.some(
                        (entry) =>
                          entry.status !== 'unmatched' &&
                          (entry.suggestedItem || entry.derivedService?.suggestedItem),
                      )
                    }
                  >
                    Criar rascunho
                  </button>
                </div>
              </div>

              <textarea
                value={importText}
                onChange={(event) => {
                  setImportText(event.target.value);
                  if (importError) setImportError('');
                  if (importPreview.length) {
                    setImportPreview([]);
                    setImportSummary(null);
                  }
                }}
                rows={6}
                className="mt-3 w-full rounded-2xl border border-amber-200/15 bg-slate-950/75 px-3 py-2 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/40 sm:text-sm"
                placeholder={`200m fibra optica sm 4fo\n150m eletrodutos pvc 3/4\n10 conduletes pvc 3/4`}
              />

              {importError ? <p className="mt-2 text-[11px] text-rose-200">{importError}</p> : null}

              {importSummary ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] sm:text-xs">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
                    {importSummary.totalLines} linha(s)
                  </span>
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
                    {importSummary.matchedCount} match forte
                  </span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2.5 py-1 text-amber-50">
                    {importSummary.reviewCount} revisar
                  </span>
                  <span className="rounded-full border border-sky-300/20 bg-sky-500/10 px-2.5 py-1 text-sky-100">
                    {importSummary.derivedServicesCount} servicos
                  </span>
                  <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-2.5 py-1 text-rose-100">
                    {importSummary.unmatchedCount} sem match
                  </span>
                </div>
              ) : null}

              {importPreview.length ? (
                <div className="mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-violet-50 sm:text-xs">Prévia do escopo</p>
                    <span className="text-[10px] text-violet-100/70 sm:text-[11px]">
                      {form.category ? form.category : 'Categoria ainda não selecionada'}
                    </span>
                  </div>
                  {importScopePreview ? (
                    <div className="mt-2 whitespace-pre-line rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-[10px] leading-relaxed text-slate-200 sm:text-[11px]">
                      {importScopePreview}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-violet-100/75 sm:text-[11px]">
                      Selecione a categoria do orçamento para visualizar o escopo que será criado com os serviços sugeridos.
                    </p>
                  )}
                </div>
              ) : null}

              {importPreview.length ? (
                <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                  {importPreview.map((entry) => {
                    const badgeClass =
                      entry.status === 'matched'
                        ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                        : entry.status === 'review'
                          ? 'border-amber-300/20 bg-amber-500/10 text-amber-50'
                          : 'border-rose-300/20 bg-rose-500/10 text-rose-100';

                    return (
                      <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-white sm:text-xs">{entry.rawLine}</p>
                            <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">Solicitado: {entry.requestedLabel}</p>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
                            {entry.status === 'matched' ? 'Match forte' : entry.status === 'review' ? 'Revisar' : 'Sem match'}
                          </span>
                        </div>

                        {entry.bestMatch ? (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold text-white sm:text-xs">{entry.bestMatch.name}</p>
                              <span className="text-[10px] text-slate-400 sm:text-[11px]">{entry.confidence}% de confianca</span>
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">
                              {entry.bestMatch.sku || 'SKU'} · {entry.bestMatch.type} · {formatCurrency(entry.bestMatch.price)}
                            </p>
                            <p className="mt-2 text-[10px] text-slate-300 sm:text-[11px]">
                              Quantidade sugerida: <span className="font-semibold text-white">{entry.suggestedItem?.quantity || 0}</span>
                            </p>
                            {entry.note ? <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">{entry.note}</p> : null}
                            {entry.matchedTokens.length ? (
                              <p className="mt-1 text-[10px] text-slate-500 sm:text-[11px]">Palavras consideradas: {entry.matchedTokens.join(', ')}</p>
                            ) : null}
                            {entry.alternatives.length ? (
                              <p className="mt-1 text-[10px] text-slate-500 sm:text-[11px]">
                                Alternativas: {entry.alternatives.map((option) => option.name).join(' | ')}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] text-rose-100 sm:text-[11px]">
                            Nenhum item do catalogo teve correspondencia suficiente para esta linha.
                          </p>
                        )}

                        {entry.derivedService?.bestMatch ? (
                          <div className="mt-2 rounded-xl border border-sky-300/20 bg-sky-500/10 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold text-sky-50 sm:text-xs">
                                Servico sugerido: {entry.derivedService.bestMatch.name}
                              </p>
                              <span className="text-[10px] text-sky-100/80 sm:text-[11px]">
                                {formatCurrency(entry.derivedService.bestMatch.price)}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] text-sky-100/80 sm:text-[11px]">
                              {entry.derivedService.bestMatch.sku || 'SKU'} · Quantidade sugerida:{' '}
                              <span className="font-semibold text-white">{entry.derivedService.suggestedItem?.quantity || 0}</span>
                            </p>
                            {entry.derivedService.note ? (
                              <p className="mt-1 text-[10px] text-sky-100/70 sm:text-[11px]">{entry.derivedService.note}</p>
                            ) : null}
                            {entry.derivedService.alternatives.length ? (
                              <p className="mt-1 text-[10px] text-sky-100/60 sm:text-[11px]">
                                Alternativas de servico: {entry.derivedService.alternatives.map((option) => option.name).join(' | ')}
                              </p>
                            ) : null}
                          </div>
                        ) : entry.bestMatch ? (
                          <p className="mt-2 text-[10px] text-slate-500 sm:text-[11px]">
                            Nenhum servico compativel foi encontrado automaticamente para este material.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            ) : null}

            <div className={`${insetPanelClass} p-3 sm:p-3.5`}>
              {activeTab === 'lista-ia' ? (
                <p className="text-xs text-slate-400 sm:text-sm">
                  A previa da comparacao e a criacao do rascunho aparecem logo acima.
                </p>
              ) : activeTab === 'manual' ? (
                <div ref={manualEditorRef} className="space-y-2">
                  {editingItemKey && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
                      <span>Editando item do orçamento</span>
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
                        {editingItemKey ? 'Atualizar' : 'Adicionar'}
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
                    const isManualItem = isManualQuoteItem(item);
                    return (
                      <div
                        key={getQuoteItemKey(item)}
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
                          <button
                            type="button"
                            onClick={() => openItemEditor(item)}
                            className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-amber-400/50 hover:text-amber-100"
                            title="Editar item"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item)}
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
              <p className="text-xs font-semibold text-white sm:text-sm">
                {isDraftStatus ? 'Rascunho pode ser salvo sem cliente e dados comerciais completos' : 'Confira antes de salvar'}
              </p>
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

        <div className="relative z-40 mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-4">
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
              <button type="button" className="btn-secondary" onClick={requestClose} disabled={isSaving}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                    Salvando...
                  </>
                ) : (
                  isDraftStatus ? 'Salvar rascunho' : 'Salvar orcamento'
                )}
              </button>
            </div>
          </div>
        </div>
        </div>

        <div className={`quote-modal-floating-total pointer-events-none absolute bottom-20 right-3 z-20 transition-all duration-200 sm:bottom-5 sm:right-4 ${hideFloatingTotal || !shouldShowFloatingTotal ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'}`}>
          <div className="quote-total-box min-w-[9rem] rounded-2xl border border-white/10 px-3 py-2 text-right shadow-[0_14px_34px_rgba(2,6,23,0.24)] sm:min-w-[10rem] sm:px-4 sm:py-3">
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

      {assumptionsOpen && !isSaving && (
        <div
          className="cyber-overlay fixed inset-0 z-[73] flex items-center justify-center bg-slate-950/78 px-3 py-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAssumptionsOpen(false);
          }}
        >
          <div
            className={`cyber-dialog w-full max-w-2xl rounded-2xl border p-4 sm:p-5 ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-primary-200">Condições da proposta</p>
                <h4 className="mt-1 text-base font-semibold text-white sm:text-lg">Premissas do orçamento</h4>
                <p className="mt-1 text-xs text-slate-400">
                  Informe condições de acesso, infraestrutura disponível, horários, responsabilidades e limitações consideradas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssumptionsOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-primary/40 hover:text-white"
                aria-label="Fechar editor de premissas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={form.notes}
              onChange={(event) => handleChange('notes', event.target.value)}
              rows={12}
              className="mt-4 w-full resize-y rounded-2xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm leading-relaxed text-white outline-none focus:border-primary/60 placeholder:text-slate-500"
              placeholder={`Exemplos:\n• Execução prevista em horário comercial.\n• Infraestrutura de encaminhamento disponibilizada pelo cliente.\n• Acesso às áreas técnicas previamente autorizado.`}
            />
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setAssumptionsOpen(false)}>
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {scopeHelpOpen && !isSaving && (
        <div
          className="cyber-overlay fixed inset-0 z-[74] flex items-center justify-center bg-slate-950/78 px-3 py-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeScopeHelp();
          }}
        >
          <div
            className={`cyber-dialog w-full max-w-xl rounded-2xl border p-4 sm:p-5 ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-primary-200">Escopo inteligente</p>
                <h4 className="mt-1 text-base font-semibold text-white sm:text-lg">Como funciona</h4>
              </div>
              <button
                type="button"
                onClick={closeScopeHelp}
                className="rounded-lg border border-white/10 p-2 text-slate-300 hover:border-primary/40 hover:text-white"
                aria-label="Fechar ajuda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-300 sm:text-sm">
              <p>
                A categoria fornece a introducao padrao. Cada servico selecionado acrescenta uma descricao tecnica,
                considerando a atividade, o quantitativo e o local indicado depois do hifen no nome do servico.
              </p>
              <p className="mt-2 text-slate-400">
                Materiais nao sao copiados para o escopo. Uma edicao manual tambem nao sera sobrescrita; use
                <span className="font-semibold text-slate-200"> Gerar escopo</span> quando quiser recalcular todo o texto.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white sm:text-sm">Texto padrao da categoria</p>
                  <p className="text-[10px] text-slate-400 sm:text-[11px]">Salvo somente neste navegador.</p>
                </div>
                <select
                  value={scopeTemplateCategory}
                  onChange={(event) => setScopeTemplateCategory(event.target.value)}
                  className="rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-primary/60"
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={categoryScopes[scopeTemplateCategory] || ''}
                onChange={(event) => updateCategoryScope(scopeTemplateCategory, event.target.value)}
                rows={4}
                className="mt-3 w-full resize-y rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-primary/60 sm:text-sm"
                placeholder="Digite a introducao padrao desta categoria"
              />
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                <button type="button" className="btn-secondary" onClick={restoreCategoryScope}>
                  Restaurar este padrao
                </button>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" onClick={closeScopeHelp}>
                    Cancelar
                  </button>
                  <button type="button" className="btn-primary" onClick={saveCategoryScopes}>
                    Salvar padroes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {closeConfirmOpen && !isSaving && (
        <div
          className="cyber-overlay fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/78 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setCloseConfirmOpen(false);
          }}
        >
          <div
            className={`cyber-dialog w-full max-w-md rounded-2xl border p-4 sm:p-5 ${modalPalette.surface} ${modalPalette.border} ${modalPalette.glow}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Alteracoes nao salvas</p>
            <h4 className="mt-1 text-base font-semibold text-white sm:text-lg">
              {hasPendingAuxChanges ? 'Existem alteracoes pendentes de aplicar' : 'Salvar antes de fechar?'}
            </h4>
            {hasPendingAuxChanges ? (
              <p className="mt-2 text-xs text-slate-300 sm:text-sm">
                Ha digitacoes ou ajustes ainda nao aplicados ao orcamento nos formularios auxiliares. Para preserva-los,
                continue editando e conclua a acao antes de fechar.
                {hasUnsavedQuoteChanges
                  ? ' O orcamento atual tambem possui alteracoes ja aplicadas, mas o fechamento com salvamento so fica disponivel depois que essas pendencias forem resolvidas.'
                  : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-300 sm:text-sm">
                Existem modificacoes neste orcamento que ainda nao foram salvas. Deseja salvar antes de fechar a janela?
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCloseConfirmOpen(false)}>
                Continuar editando
              </button>
              <button
                type="button"
                className="btn-secondary border-rose-400/25 text-rose-100 hover:border-rose-400/45 hover:text-rose-50"
                onClick={handleCloseWithoutSaving}
              >
                Fechar sem salvar
              </button>
              {canSaveAndCloseFromConfirm ? (
                <button type="button" className="btn-primary" onClick={handleConfirmSaveAndClose}>
                  Salvar e fechar
                </button>
              ) : null}
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
