import { useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, ExternalLink, Filter, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import QuotesTable from '../components/QuotesTable.jsx';
import { useQuotes } from '../hooks/useQuotes.js';
import { useProducts } from '../hooks/useProducts.js';
import ModalPortal from '../components/ModalPortal.jsx';
import { graphConfig } from '../services/api.js';
import { useClients } from '../hooks/useClients.js';
import { formatCurrency } from '../utils/formatters.js';
import { getAuditLog } from '../utils/audit.js';
import { useToast } from '../components/ToastHost.jsx';
import { createQuoteDraft } from '../services/mail.js';
import { calculateQuoteProfitability } from '../utils/profitability.js';

const FILTERS_KEY = 'crm-orcamentos:orcamentos-filters';
const DEFAULT_EMAIL_CC = 'contato@cleverconnection.com.br';
const QuoteModal = lazy(() => import('../components/QuoteModal.jsx'));
const ExportButtons = lazy(() => import('../components/ExportButtons.jsx'));
const DEFAULT_MODAL_LAUNCH = Object.freeze({
  initialActiveTab: 'materiais',
  initialActiveStep: 'cliente',
});

const normalizeEmailText = (value) =>
  (value || '')
    .toString()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLookupKey = (value) =>
  normalizeEmailText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const SERVICE_SUMMARY_RULES = [
  { pattern: /(telecom|telefonia|telefon|ramal|par metal|dg central|bloco m10)/, summary: 'o serviço de telefonia' },
  { pattern: /(cftv|camera|monitoramento)/, summary: 'os serviços relacionados ao sistema de CFTV e monitoramento' },
  { pattern: /(fibra|optica|fusao)/, summary: 'os serviços de infraestrutura e conectividade em fibra óptica' },
  { pattern: /(cabeamento|rede|dados|lan)/, summary: 'os serviços de rede e cabeamento estruturado' },
  { pattern: /(controle de acesso|catraca|fechadura|interfonia|portaria)/, summary: 'os serviços relacionados ao sistema de controle de acesso' },
  { pattern: /(audiovisual|audio visual)/, summary: 'os serviços relacionados ao sistema audiovisual' },
  { pattern: /(ciber seguranca|cyber security|seguranca)/, summary: 'os serviços relacionados à cibersegurança' },
];

const buildServiceSummary = (quote) => {
  const categoryLabel = normalizeEmailText(quote?.category);
  const categoryKey = normalizeLookupKey(categoryLabel);
  const fallbackContent = [quote?.title, quote?.scope].map(normalizeEmailText).filter(Boolean).join(' ');
  const fallbackKey = normalizeLookupKey(fallbackContent);

  if (categoryKey) {
    const categoryMatch = SERVICE_SUMMARY_RULES.find((rule) => rule.pattern.test(categoryKey));
    if (categoryMatch) return categoryMatch.summary;
  }

  if (fallbackKey) {
    const fallbackMatch = SERVICE_SUMMARY_RULES.find((rule) => rule.pattern.test(fallbackKey));
    if (fallbackMatch) return fallbackMatch.summary;
  }

  if (categoryLabel) {
    return `os serviços de ${categoryLabel.toLowerCase()}`;
  }

  return 'os serviços previstos para atendimento da demanda solicitada';
};

const buildScopeLine = (quote) => `A proposta considera ${buildServiceSummary(quote)}.`;

const formatEmailDate = (value) => {
  const normalized = normalizeEmailText(value);
  if (!normalized) return null;

  const localDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const resolveQuoteTotal = (quote) => {
  if (quote?.total !== undefined && quote?.total !== null && quote?.total !== '') {
    return Number(quote.total || 0);
  }
  if (quote?.totalNumber !== undefined && quote?.totalNumber !== null && quote?.totalNumber !== '') {
    return Number(quote.totalNumber || 0);
  }
  return 0;
};

const buildGreetingLine = (quote) => {
  const clientName = normalizeEmailText(quote?.clientName);
  const companyLabel = normalizeEmailText(quote?.clientCompany);

  if (clientName && normalizeLookupKey(clientName) !== normalizeLookupKey(companyLabel)) {
    return `Prezado(a) ${clientName},`;
  }

  return 'Prezados,';
};

const buildEmailContent = (quote) => {
  const companyLabel = quote?.clientCompany || quote?.clientName || 'cliente';
  const projectLabel = quote?.title || 'projeto em andamento';
  const poLabel = quote?.poNumber ? `PO ${quote.poNumber}` : 'PO pendente';
  const totalLabel = formatCurrency(resolveQuoteTotal(quote));
  const validUntilLabel = formatEmailDate(quote?.validUntil);
  const subjectParts = ['Orçamento'];
  if (quote?.poNumber) {
    subjectParts.push(`PO ${quote.poNumber}`);
  }
  subjectParts.push(projectLabel);

  return {
    to: quote?.clientEmail || '',
    subject: subjectParts.join(' - '),
    greeting: buildGreetingLine(quote),
    intro: 'Conforme alinhado, encaminho o orçamento elaborado para sua análise.',
    scopeLine: buildScopeLine(quote),
    summaryTitle: 'Resumo da proposta',
    summaryRows: [
      { label: 'Cliente', value: companyLabel },
      { label: 'Projeto', value: projectLabel },
      { label: 'Referência interna', value: poLabel },
      { label: 'Valor total', value: totalLabel, emphasis: 'total' },
      ...(validUntilLabel ? [{ label: 'Validade da proposta', value: validUntilLabel }] : []),
    ],
    closing: 'Fico à disposição para esclarecer qualquer ponto e, se necessário, ajustar a proposta conforme sua avaliação.',
  };
};

const renderEmailText = (content) =>
  [
    content.greeting,
    '',
    content.intro,
    '',
    content.scopeLine,
    '',
    `${content.summaryTitle}:`,
    ...content.summaryRows.map((row) => `- ${row.label}: ${row.value}`),
    '',
    content.closing,
  ].join('\n');

const buildEmailDraft = (quote) => {
  const content = buildEmailContent(quote);
  const body = renderEmailText(content);
  return {
    to: content.to,
    cc: DEFAULT_EMAIL_CC,
    subject: content.subject,
    body,
    template: {
      subject: content.subject,
      body,
      content,
    },
  };
};

const buildMailtoUrl = ({ to, subject, body }) =>
  `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;

const buildEmailPreviewHtml = (draft) => {
  if (!draft) return '';

  const trimmedSubject = draft.subject?.trim() || '';
  const trimmedBody = draft.body?.trim() || '';
  const useTemplateHtml = draft.template?.body?.trim() === trimmedBody;

  return useTemplateHtml
    ? buildEmailHtmlFromContent({
        ...draft.template.content,
        subject: trimmedSubject,
      })
    : buildEmailHtml({
        subject: trimmedSubject,
        body: trimmedBody,
      });
};

const buildDraftHint = (quote, subject) => {
  const poLabel = quote?.poNumber ? `PO ${quote.poNumber}` : null;
  const clientLabel = quote?.clientCompany || quote?.clientName || null;
  return [subject, poLabel, clientLabel].filter(Boolean).join(' · ');
};

const loadExporters = () => import('../utils/exporters.js');

const escapeHtml = (value) =>
  (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderSummaryTableHtml = (summaryRows) =>
  summaryRows.length
    ? `<div style="margin:18px 0 18px;">
        <div style="margin:0 0 12px;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Resumo da proposta</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border:1px solid #dbeafe;border-radius:16px;background:#f8fbff;padding:10px 22px;">
          <tbody>
            ${summaryRows
              .map((row, index) => {
                const isTotal = row.emphasis === 'total' || row.label.toLowerCase().includes('valor total');
                const borderTop = isTotal ? 'border-top:1px solid #bfdbfe;' : index > 0 ? 'border-top:1px solid #eff6ff;' : '';
                return `<tr>
                  <td style="padding:${isTotal ? '14px 0 12px' : '10px 0'};${borderTop}">
                    <div style="padding:0 12px;font-size:${isTotal ? '15px' : '13px'};font-weight:800;color:${isTotal ? '#1d4ed8' : '#334155'};margin-bottom:6px;">${escapeHtml(
                      `${row.label}:`,
                    )}</div>
                    <div style="padding:0 12px 0 12px;font-size:${isTotal ? '22px' : '14px'};font-weight:${isTotal ? '800' : '600'};line-height:1.55;color:${isTotal ? '#0f172a' : '#1e293b'};">${escapeHtml(
                      row.value,
                    )}</div>
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`
    : '';

const wrapEmailHtml = ({ subject, bodyContent }) => `
  <div style="margin:0;padding:24px;background:#eef4fb;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px;width:100%;margin:0 auto;background:#ffffff;border:1px solid #d6e4f2;border-radius:22px;">
      <tbody>
        <tr>
          <td style="padding:22px 24px;background:#123c8f;border-top-left-radius:22px;border-top-right-radius:22px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#dbeafe;">Clever Connection</div>
            <div style="margin-top:8px;font-size:20px;line-height:1.3;font-weight:800;color:#ffffff;">${escapeHtml(subject || 'Orçamento')}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 24px;">
        ${bodyContent}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
`;

const buildEmailHtmlFromContent = (content) => {
  const paragraphConfigs = [
    {
      type: 'greeting',
      value: content.greeting,
      style: 'margin:0 0 14px;font-size:18px;line-height:1.7;color:#0f172a;font-weight:700;',
    },
    { type: 'spacer' },
    {
      type: 'paragraph',
      value: content.intro,
      style: 'margin:0 0 14px;font-size:15px;line-height:1.7;color:#1e293b;font-weight:400;',
    },
    { type: 'spacer' },
    {
      type: 'paragraph',
      value: content.scopeLine,
      style: 'margin:0 0 14px;font-size:15px;line-height:1.7;color:#1e293b;font-weight:400;',
    },
    renderSummaryTableHtml(content.summaryRows),
    {
      type: 'paragraph',
      value: content.closing,
      style: 'margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155;font-weight:400;',
    },
  ];

  const bodyContent = paragraphConfigs
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry.type === 'spacer') {
        return '<div style="height:14px;line-height:14px;font-size:14px;">&nbsp;</div>';
      }
      return `<p style="${entry.style}">${escapeHtml(entry.value)}</p>`;
    })
    .join('');

  return wrapEmailHtml({ subject: content.subject, bodyContent });
};

const buildEmailHtml = ({ subject, body }) => {
  const lines = (body || '').split('\n').map((line) => line.trim());
  const summaryRows = [];
  const paragraphs = [];

  lines.forEach((line) => {
    if (!line) {
      paragraphs.push({ type: 'spacer' });
      return;
    }

    if (line === 'Resumo da proposta:') {
      return;
    }

    if (line.startsWith('- ')) {
      const raw = line.slice(2);
      const separatorIndex = raw.indexOf(':');
      if (separatorIndex > -1) {
        summaryRows.push({
          label: raw.slice(0, separatorIndex).trim(),
          value: raw.slice(separatorIndex + 1).trim(),
        });
      } else {
        summaryRows.push({ label: raw.trim(), value: '' });
      }
      return;
    }

    paragraphs.push({ type: 'paragraph', value: line });
  });

  const renderedParagraphs = paragraphs
    .map((entry, index) => {
      if (entry.type === 'spacer') {
        return '<div style="height:14px;line-height:14px;font-size:14px;">&nbsp;</div>';
      }

      const isGreeting = index === 0;
      const isClosing = entry.value.startsWith('Fico à disposição');
      return `<p style="margin:0 0 14px;font-size:${isGreeting ? '18px' : '15px'};line-height:1.7;color:${isGreeting ? '#0f172a' : isClosing ? '#334155' : '#1e293b'};font-weight:${isGreeting ? '700' : '400'};">${escapeHtml(entry.value)}</p>`;
    })
    .join('');

  const renderedSummary = renderSummaryTableHtml(summaryRows);

  return wrapEmailHtml({
    subject,
    bodyContent: `${renderedParagraphs}${renderedSummary}`,
  });
};

const formatPercent = (value) => `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const Orcamentos = () => {
  const { quotes, syncInfo, addQuote, editQuote, editApproval, removeQuote, refreshQuotes } = useQuotes();
  const materiais = useProducts(graphConfig.sheetMateriais);
  const servicos = useProducts(graphConfig.sheetServicos);
  const { clients, loading: loadingClients, error: clientsError } = useClients();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();

  const loadingCatalog = materiais.loading || servicos.loading || loadingClients;
  const catalogError = [materiais.error, servicos.error, clientsError].filter(Boolean).join(' | ');
  const [reloadingQuotes, setReloadingQuotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [prefillQuote, setPrefillQuote] = useState(null);
  const [modalLaunchConfig, setModalLaunchConfig] = useState(DEFAULT_MODAL_LAUNCH);
  const [approvalFilter, setApprovalFilter] = useState('Todos');
  const [clientFilter, setClientFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [auditLog, setAuditLog] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [updatingApproval, setUpdatingApproval] = useState(null);
  const [approvalConfirm, setApprovalConfirm] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [emailCreatedNotice, setEmailCreatedNotice] = useState(null);
  const [preparingEmailPdf, setPreparingEmailPdf] = useState(false);
  const [profitabilityQuote, setProfitabilityQuote] = useState(null);
  const [profitabilityDetailType, setProfitabilityDetailType] = useState(null);
  const [exportingListFormat, setExportingListFormat] = useState(null);

  const normalizeText = (value) =>
    value
      ?.toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  const normalizeApproval = (value) => normalizeText(value);
  const modalClose = () => {
    setSelected(null);
    setPrefillQuote(null);
    setModalLaunchConfig(DEFAULT_MODAL_LAUNCH);
    setOpenModal(false);
  };

  const openNewQuoteModal = (launchConfig = DEFAULT_MODAL_LAUNCH) => {
    setSelected(null);
    setPrefillQuote(null);
    setModalLaunchConfig({ ...DEFAULT_MODAL_LAUNCH, ...launchConfig });
    setOpenModal(true);
  };

  const profitabilityAnalysis = useMemo(
    () => (profitabilityQuote ? calculateQuoteProfitability(profitabilityQuote) : null),
    [profitabilityQuote],
  );
  const profitabilityDetail = useMemo(() => {
    if (!profitabilityAnalysis || !profitabilityDetailType) return null;
    if (profitabilityDetailType === 'materials') {
      return {
        title: 'Detalhes dos materiais',
        items: profitabilityAnalysis.materialDetails || [],
      };
    }
    if (profitabilityDetailType === 'services') {
      return {
        title: 'Detalhes dos servicos',
        items: profitabilityAnalysis.serviceDetails || [],
      };
    }
    return null;
  }, [profitabilityAnalysis, profitabilityDetailType]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILTERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.approvalFilter) setApprovalFilter(parsed.approvalFilter);
        if (parsed?.clientFilter) setClientFilter(parsed.clientFilter);
        if (parsed?.search !== undefined) setSearch(parsed.search);
        if (parsed?.sort?.key) setSort(parsed.sort);
      }
    } catch (error) {
      console.warn('[orcamentos] Falha ao carregar filtros', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ approvalFilter, clientFilter, search, sort }));
    } catch (error) {
      console.warn('[orcamentos] Falha ao salvar filtros', error);
    }
  }, [approvalFilter, clientFilter, search, sort]);

  const loadAudit = async (minDelay = 0, aliveRef = { current: true }) => {
    setLoadingAudit(true);
    const start = Date.now();
    const log = await getAuditLog();
    const elapsed = Date.now() - start;
    const wait = Math.max(0, minDelay - elapsed);
    if (wait) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    if (aliveRef.current) {
      setAuditLog(log);
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    const aliveRef = { current: true };
    loadAudit(200, aliveRef);
    return () => {
      aliveRef.current = false;
    };
  }, [quotes]);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openNewQuoteModal();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!approvalConfirm) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      setApprovalConfirm(null);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [approvalConfirm]);

  const handleApprovalChange = async (quote, nextStatus) => {
    if (!quote) return;
    const current = normalizeApproval(quote.approvalStatus);
    const next = normalizeApproval(nextStatus);
    if (current === next) return;
    if (updatingApproval) return;
    setApprovalConfirm({ quote, nextStatus });
  };

  const confirmApprovalChange = async () => {
    if (!approvalConfirm) return;
    const { quote, nextStatus } = approvalConfirm;
    const key = quote.poNumber || quote.id;
    setUpdatingApproval(key);
    try {
      const updated = await editApproval(quote, nextStatus);
      pushToast({
        title: 'Aprovacao atualizada',
        message: `${updated?.clientCompany || updated?.clientName || quote?.title || 'Orcamento'} agora esta como ${nextStatus}.`,
        type: 'success',
      });
    } catch (error) {
      console.warn('[orcamentos] Falha ao atualizar aprovacao', error);
      pushToast({
        title: 'Falha ao atualizar aprovacao',
        message: 'Nao foi possivel registrar a mudanca de aprovacao agora.',
        type: 'error',
        duration: 5000,
      });
    } finally {
      setUpdatingApproval(null);
      setApprovalConfirm(null);
    }
  };

  const filteredQuotes = useMemo(() => {
    const normalizedSearch = normalizeText(search.trim());
    const filtered = quotes.filter((quote) => {
      const matchesApproval =
        approvalFilter === 'Todos' ||
        normalizeApproval(quote.approvalStatus) === normalizeApproval(approvalFilter);
      const clientLabel = quote.clientCompany || quote.clientName || '';
      const matchesClient =
        clientFilter === 'Todos' ||
        normalizeApproval(clientLabel) === normalizeApproval(clientFilter);
      const searchText = normalizeText(
        [
          quote.poNumber,
          quote.clientCompany,
          quote.clientName,
          quote.clientEmail,
          quote.clientPhone,
          quote.contactName,
          quote.contactEmail,
          quote.title,
        ]
          .filter(Boolean)
          .join(' '),
      );
      const matchesSearch = normalizedSearch ? searchText.includes(normalizedSearch) : true;
      return matchesApproval && matchesClient && matchesSearch;
    });

    const getDateValue = (q) => {
      const dateStr = q.date || q.validUntil || q.createdAt;
      const t = dateStr ? new Date(dateStr).getTime() : 0;
      if (!Number.isNaN(t) && t > 0) return t;
      const poNum = q.poNumber ? Number(q.poNumber) : 0;
      return Number.isNaN(poNum) ? 0 : poNum;
    };

    const dir = sort.dir === 'asc' ? 1 : -1;
    const compareString = (a, b) => a.localeCompare(b, 'pt-BR');

    return filtered.slice().sort((a, b) => {
      switch (sort.key) {
        case 'poNumber': {
          const aNum = Number(a.poNumber || 0);
          const bNum = Number(b.poNumber || 0);
          if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
            return compareString((a.poNumber || '').toString(), (b.poNumber || '').toString()) * dir;
          }
          return (aNum - bNum) * dir;
        }
        case 'client': {
          const aVal = (a.clientCompany || a.clientName || '').toLowerCase();
          const bVal = (b.clientCompany || b.clientName || '').toLowerCase();
          return compareString(aVal, bVal) * dir;
        }
        case 'title':
          return compareString((a.title || '').toLowerCase(), (b.title || '').toLowerCase()) * dir;
        case 'total':
          return (resolveQuoteTotal(a) - resolveQuoteTotal(b)) * dir;
        case 'status':
          return compareString((a.status || '').toLowerCase(), (b.status || '').toLowerCase()) * dir;
        case 'date':
        default:
          return (getDateValue(a) - getDateValue(b)) * dir;
      }
    });
  }, [quotes, approvalFilter, clientFilter, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleQuotes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuotes.slice(start, start + pageSize);
  }, [filteredQuotes, currentPage, pageSize]);

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

  const clientFilterOptions = useMemo(() => {
    const normalize = (val) => (val ?? '').toString().trim();
    const unique = new Set();
    clientOptions.forEach((client) => {
      const label = normalize(client.company || client.name || '');
      if (label) unique.add(label);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [clientOptions]);

  useEffect(() => {
    setPage(1);
  }, [search, approvalFilter, clientFilter, sort]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const handleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: key === 'date' ? 'desc' : 'asc' };
    });
  };

  const resetFilters = () => {
    setApprovalFilter('Todos');
    setClientFilter('Todos');
    setSearch('');
    setSort({ key: 'date', dir: 'desc' });
    setPage(1);
  };

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

  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;

  const handlePageChange = (nextPage) => {
    const resolvedPage = Math.max(1, Math.min(totalPages, nextPage));
    if (resolvedPage === currentPage) return;
    setPage(resolvedPage);
    scrollPageToTop();
  };

  const handleSave = async (payload) => {
    try {
      if (selected) {
        const updated = await editQuote(selected, payload);
        pushToast({
          title: 'Orcamento atualizado',
          message: `${updated?.clientCompany || updated?.clientName || payload.clientCompany || payload.clientName || 'Cliente'} · Total ${new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(Number(updated?.total ?? payload.total ?? 0))}`,
          type: 'success',
        });
      } else {
        const created = await addQuote(payload);
        pushToast({
          title: 'Orcamento criado',
          message: `${created?.clientCompany || created?.clientName || payload.clientCompany || payload.clientName || 'Cliente'}${created?.poNumber ? ` · PO ${created.poNumber}` : ''}`,
          type: 'success',
        });
      }
      modalClose();
    } catch (error) {
      console.error('Falha ao salvar or?amento', error);
      pushToast({
        title: 'Falha ao salvar orcamento',
        message: 'Revise os dados e tente novamente em alguns instantes.',
        type: 'error',
        duration: 5000,
      });
    }
  };

  const [confirmQuote, setConfirmQuote] = useState(null);

  const handleDelete = (quote) => {
    setConfirmQuote(quote);
  };

  const handleConfirmDelete = async () => {
    if (confirmQuote) {
      setDeleting(true);
      try {
        await removeQuote(confirmQuote);
        pushToast({
          title: 'Orcamento excluido',
          message: `${confirmQuote.clientCompany || confirmQuote.clientName || confirmQuote.title || 'Registro'} removido com sucesso.`,
          type: 'success',
        });
      } catch (error) {
        console.error('Falha ao excluir or?amento', error);
        pushToast({
          title: 'Falha ao excluir orcamento',
          message: 'Nao foi possivel excluir o registro agora.',
          type: 'error',
          duration: 5000,
        });
      }
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
    try {
      refreshCatalog();
      await refreshQuotes();
      await loadAudit(200);
      pushToast({
        title: 'Dados recarregados',
        message: 'Planilhas, historico e lista de orcamentos foram atualizados.',
        type: 'success',
      });
    } catch (error) {
      console.error('[orcamentos] Falha ao recarregar dados', error);
      pushToast({
        title: 'Falha ao recarregar',
        message: 'Algumas informacoes nao puderam ser atualizadas agora.',
        type: 'error',
        duration: 5000,
      });
    } finally {
      setReloadingQuotes(false);
    }
  };

  const formatAuditAction = (action) => {
    if (action === 'create') return 'Criado';
    if (action === 'approval') return 'Aprovacao';
    if (action === 'delete') return 'Excluido';
    return 'Atualizado';
  };

  const auditBadgeClass = (action) => {
    if (action === 'create') return 'badge-success';
    if (action === 'approval') return 'badge border border-amber-400/20 bg-amber-500/10 text-amber-100';
    if (action === 'delete') return 'badge bg-rose-500/20 text-rose-200';
    return 'badge-info';
  };

  const openEmailComposer = (quote) => {
    setEmailDraft({
      quote,
      ...buildEmailDraft(quote),
    });
  };

  const copyEmailBody = async () => {
    if (!emailDraft?.body) return;
    try {
      await navigator.clipboard.writeText(emailDraft.body);
      pushToast({
        title: 'Texto copiado',
        message: 'O corpo do e-mail foi copiado para a área de transferência.',
        type: 'success',
      });
    } catch (error) {
      console.error('[orcamentos] Falha ao copiar e-mail', error);
      pushToast({
        title: 'Falha ao copiar',
        message: 'Nao foi possivel copiar o texto do e-mail.',
        type: 'error',
      });
    }
  };

  const openEmailClient = () => {
    if (!emailDraft) return;
    window.open(buildMailtoUrl(emailDraft), '_blank');
  };

  const openEmailWithAttachment = async () => {
    if (!emailDraft) return;
    if (!emailDraft.to?.trim()) {
      pushToast({
        title: 'Destinatario obrigatorio',
        message: 'Informe o e-mail do destinatario antes de abrir o e-mail com anexo.',
        type: 'error',
      });
      return;
    }
    if (!emailDraft.subject?.trim() || !emailDraft.body?.trim()) {
      pushToast({
        title: 'Revisao pendente',
        message: 'Assunto e corpo do e-mail precisam estar preenchidos antes do envio.',
        type: 'error',
      });
      return;
    }
    if (!emailDraft?.quote || preparingEmailPdf) return;
    try {
      setPreparingEmailPdf(true);
      const { exportQuoteToPDF } = await loadExporters();
      const result = await exportQuoteToPDF(emailDraft.quote, { download: false });
      const trimmedSubject = emailDraft.subject.trim();
      const trimmedBody = emailDraft.body.trim();
      const useTemplateHtml = emailDraft.template?.body?.trim() === trimmedBody;
      await createQuoteDraft({
        to: emailDraft.to.trim(),
        cc: emailDraft.cc?.trim() || DEFAULT_EMAIL_CC,
        subject: trimmedSubject,
        body: trimmedBody,
        bodyHtml: useTemplateHtml
          ? buildEmailHtmlFromContent({
              ...emailDraft.template.content,
              subject: trimmedSubject,
            })
          : buildEmailHtml({
              subject: trimmedSubject,
              body: trimmedBody,
            }),
        pdfBlob: result?.blob,
        pdfFilename: result?.filename,
      });
      try {
        await navigator.clipboard.writeText(trimmedSubject);
      } catch (clipboardError) {
        console.warn('[orcamentos] Falha ao copiar assunto apos criar rascunho', clipboardError);
      }
      pushToast({
        title: 'Rascunho criado',
        message: `O rascunho com anexo foi criado no Outlook. Para achar no app, procure por: ${buildDraftHint(
          emailDraft.quote,
          trimmedSubject,
        )}`,
        type: 'success',
        duration: 7000,
      });
      setEmailCreatedNotice({
        subject: trimmedSubject,
        hint: buildDraftHint(emailDraft.quote, trimmedSubject),
      });
      setEmailDraft(null);
    } catch (error) {
      console.error('[orcamentos] Falha ao abrir e-mail com anexo', error);
      const friendlyMessage =
        error?.message?.includes('caixa de correio habilitada')
          ? error.message
          : error?.message || 'Nao foi possivel criar o rascunho com anexo agora.';
      pushToast({
        title: 'Falha ao abrir e-mail com anexo',
        message: friendlyMessage,
        type: 'error',
        duration: 6000,
      });
    } finally {
      setPreparingEmailPdf(false);
    }
  };

  const handleListExport = async (format) => {
    if (exportingListFormat) return;
    try {
      setExportingListFormat(format);
      const { exportQuotesToCSV, exportQuotesToExcel } = await loadExporters();
      if (format === 'csv') {
        await exportQuotesToCSV(filteredQuotes);
        return;
      }
      await exportQuotesToExcel(filteredQuotes);
    } catch (error) {
      console.error(`[orcamentos] Falha ao exportar ${format}`, error);
      pushToast({
        title: 'Falha na exportacao',
        message: 'Nao foi possivel concluir a exportacao agora.',
        type: 'error',
      });
    } finally {
      setExportingListFormat(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 sm:text-sm">Gestão</p>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Orçamentos</h1>
          <p className="text-xs text-slate-400 sm:text-sm">
            Monte o orçamento escolhendo Materiais e Serviços direto da planilha QQP e Orçamento.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
        <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={handleReloadAll} title="Recarregar planilha" aria-label="Recarregar planilha">
              <RefreshCw className={`h-4 w-4 ${loadingCatalog || reloadingQuotes ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="btn-primary"
              onClick={() => openNewQuoteModal()}
            >
              <Plus className="h-4 w-4" />
              Novo orçamento
            </button>
          </div>
          <div className="text-[11px] text-slate-400 sm:text-xs">
            {syncInfo.status === 'loading' && 'Atualizando planilha...'}
            {syncInfo.status === 'local' && 'Sem sincronizacao com planilha configurada.'}
            {syncInfo.status !== 'local' && syncInfo.status !== 'loading' && (
              <>
                Ultima sincronizacao:{' '}
                {syncInfo.lastSync ? new Date(syncInfo.lastSync).toLocaleString('pt-BR') : 'Nao sincronizado'}
              </>
            )}
          </div>
          {syncInfo.error && <div className="text-[11px] text-rose-300 sm:text-xs">{syncInfo.error}</div>}
          {catalogError && <div className="text-[11px] text-rose-300 sm:text-xs">{catalogError}</div>}
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-2 sm:gap-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>

        <div className={`${showFilters ? 'block' : 'hidden'} w-full md:block`}>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-2 md:mt-0">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 sm:px-2.5 sm:py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 sm:text-[11px]">Aprovacao</span>
              <select
                value={approvalFilter}
                onChange={(e) => setApprovalFilter(e.target.value)}
                className="bg-transparent text-xs text-white outline-none sm:text-[11px]"
              >
                <option>Todos</option>
                <option>Aguardando</option>
                <option>Aprovado</option>
                <option>Reprovado</option>
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 sm:px-2.5 sm:py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 sm:text-[11px]">Cliente</span>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="bg-transparent text-xs text-white outline-none sm:text-[11px]"
              >
                <option>Todos</option>
                {clientFilterOptions.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full min-w-[20rem] flex-1 items-center gap-2">
              <div className="min-w-[9rem] flex-1">
                <input
                  placeholder="Buscar por PO, empresa, contato..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-global-search
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-white outline-none focus:border-primary/50 sm:py-1.5 sm:text-[11px]"
                />
              </div>
              <button
                className="rounded-lg border border-white/10 p-2 text-slate-200 hover:border-primary/40 hover:text-white"
                type="button"
                onClick={resetFilters}
                title="Limpar filtros"
              >
                <Eraser className="h-4 w-4" />
              </button>
              <Suspense
                fallback={<div className="h-8 w-[7.5rem] animate-pulse rounded-xl border border-white/10 bg-white/5" />}
              >
                <ExportButtons
                  onCSV={() => handleListExport('csv')}
                  onExcel={() => handleListExport('excel')}
                  disabled={Boolean(exportingListFormat)}
                  compact
                  className="gap-1 flex-nowrap items-center"
                />
              </Suspense>
              <button
                type="button"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-50 transition hover:border-amber-300/45 hover:bg-amber-500/15 sm:py-1.5"
                onClick={() =>
                  openNewQuoteModal({
                    initialActiveTab: 'lista-ia',
                    initialActiveStep: 'itens',
                  })
                }
                title="Criar orçamento por lista com IA"
              >
                <Sparkles className="h-4 w-4" />
                Lista IA
              </button>
            </div>
          </div>
        </div>
      </div>
      {filteredQuotes.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-5 text-center sm:p-8">
          <p className="text-xs text-slate-300 sm:text-sm">Nenhum orçamento encontrado com esses filtros.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={resetFilters}>
              Limpar filtros
            </button>
            <button
              className="btn-primary"
              onClick={() => openNewQuoteModal()}
            >
              Criar novo orçamento
            </button>
          </div>
        </div>
      ) : (
        <QuotesTable
          quotes={visibleQuotes}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={handleSort}
          onApprovalChange={handleApprovalChange}
          updatingApproval={updatingApproval}
          onEdit={(quote) => {
            setPrefillQuote(null);
            setSelected(quote);
            setModalLaunchConfig(DEFAULT_MODAL_LAUNCH);
            setOpenModal(true);
          }}
          onDuplicate={(quote) => {
            setSelected(null);
            setPrefillQuote(quote);
            setModalLaunchConfig(DEFAULT_MODAL_LAUNCH);
            setOpenModal(true);
          }}
          onEmail={openEmailComposer}
          onProfitability={setProfitabilityQuote}
          onDelete={handleDelete}
        />
      )}

      {filteredQuotes.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
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

      <div className="card p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between sm:mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">Historico recente</p>
            <p className="text-xs font-semibold text-white sm:text-sm">Acoes no orcamento</p>
          </div>
          <span className="text-[11px] text-slate-400 sm:text-xs">Ultimas {Math.min(auditLog.length, 6)}</span>
        </div>
        {loadingAudit ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, idx) => (
              <div
                key={`audit-skeleton-${idx}`}
                className="h-12 animate-pulse rounded-xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : auditLog.length === 0 ? (
          <p className="text-xs text-slate-400 sm:text-sm">Nenhuma acao registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {auditLog.slice(0, 6).map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 sm:py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={auditBadgeClass(entry.action)}>{formatAuditAction(entry.action)}</span>
                    <p className="text-xs text-white sm:text-sm">{entry.clientCompany || entry.title || 'Orcamento'}</p>
                  </div>
                  <p className="text-[11px] text-slate-400 sm:text-xs">
                    PO {entry.poNumber || '--'} · {entry.title || 'Sem titulo'}
                  </p>
                  {entry.summary ? (
                    <p className="mt-1 text-[11px] text-slate-300 sm:text-xs">{entry.summary}</p>
                  ) : null}
                  {Array.isArray(entry.details) && entry.details.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.details.slice(0, 4).map((detail, index) => (
                        <span
                          key={`${entry.id}-detail-${index}`}
                          className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          {detail}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-right text-[11px] text-slate-400 sm:text-xs">
                  <p>{entry.userName || 'Usuario'}</p>
                  <p>{entry.timestamp ? new Date(entry.timestamp).toLocaleString('pt-BR') : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openModal ? (
        <Suspense fallback={null}>
          <QuoteModal
            open={openModal}
            onClose={modalClose}
          onSave={handleSave}
          quote={selected}
          initialQuote={prefillQuote}
          initialActiveTab={modalLaunchConfig.initialActiveTab}
          initialActiveStep={modalLaunchConfig.initialActiveStep}
          materials={materiais.products}
          services={servicos.products}
          loadingCatalog={loadingCatalog}
            onRefreshCatalog={refreshCatalog}
            clients={clientOptions}
          />
        </Suspense>
      ) : null}

      {approvalConfirm && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || updatingApproval) return;
            setApprovalConfirm(null);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Alterar aprovacao</p>
            <h3 className="text-base font-semibold text-white sm:text-lg">Confirmar mudanca</h3>
            <p className="mt-2 text-xs text-slate-300 sm:text-sm">
              Deseja alterar a aprovacao do orcamento{' '}
              <span className="font-semibold text-white">PO {approvalConfirm.quote?.poNumber || '--'}</span> para{' '}
              <span className="font-semibold text-white">{approvalConfirm.nextStatus}</span>?
            </p>
            <div className="mt-3 flex justify-end gap-2 sm:mt-4">
              <button
                className="btn-secondary"
                onClick={() => setApprovalConfirm(null)}
                disabled={updatingApproval}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmApprovalChange} disabled={updatingApproval}>
                {updatingApproval ? 'Atualizando...' : 'Confirmar'}
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {confirmQuote && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || deleting) return;
            handleCancelDelete();
          }}
        >
          <div
            className="cyber-dialog w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl sm:p-4"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-white sm:text-lg">Excluir orçamento</h3>
            <p className="mb-4 text-xs text-slate-300 sm:text-sm">
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
        </ModalPortal>
      )}

      {emailDraft &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="cyber-overlay fixed inset-0 z-[74] flex items-center justify-center bg-black/70 px-4 py-6"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget || preparingEmailPdf) return;
              setEmailDraft(null);
            }}
          >
            <div
              className="cyber-dialog w-full max-w-6xl rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl sm:p-4"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">E-mail sugerido</p>
                  <h3 className="text-sm font-semibold text-white sm:text-base">
                    {emailDraft.quote?.clientCompany || emailDraft.quote?.clientName || 'Cliente'}
                  </h3>
                  <p className="text-[11px] text-slate-400 sm:text-xs">
                    {emailDraft.quote?.poNumber ? `PO ${emailDraft.quote.poNumber}` : 'PO pendente'} ·{' '}
                    {formatCurrency(resolveQuoteTotal(emailDraft.quote))}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Revise o conteúdo abaixo. O e-mail com anexo abrirá no browser.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailDraft(null)}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-primary/50 hover:text-white"
                >
                  Fechar
                </button>
              </div>

              <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="grid gap-2">
                  <label className="block text-[11px] font-semibold text-slate-300 sm:text-xs">
                    Destinatário
                    <input
                      value={emailDraft.to}
                      onChange={(e) => setEmailDraft((prev) => ({ ...prev, to: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-[13px] text-white outline-none focus:border-primary/60"
                      placeholder="cliente@empresa.com"
                    />
                  </label>

                  <label className="block text-[11px] font-semibold text-slate-300 sm:text-xs">
                    Cópia
                    <input
                      value={emailDraft.cc || DEFAULT_EMAIL_CC}
                      readOnly
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[13px] text-slate-300 outline-none"
                    />
                  </label>

                  <label className="block text-[11px] font-semibold text-slate-300 sm:text-xs">
                    Assunto
                    <input
                      value={emailDraft.subject}
                      onChange={(e) => setEmailDraft((prev) => ({ ...prev, subject: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-[13px] text-white outline-none focus:border-primary/60"
                    />
                  </label>

                  <label className="block text-[11px] font-semibold text-slate-300 sm:text-xs">
                    Corpo do e-mail
                    <textarea
                      value={emailDraft.body}
                      onChange={(e) => setEmailDraft((prev) => ({ ...prev, body: e.target.value }))}
                      rows={10}
                      className="mt-1 max-h-[38vh] min-h-[15rem] w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-[13px] text-white outline-none focus:border-primary/60"
                    />
                  </label>

                  <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      className="btn-secondary min-w-[8.5rem] justify-center !rounded-lg !px-3 !py-2 !text-[12px]"
                      onClick={copyEmailBody}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar texto
                    </button>
                    <button
                      type="button"
                      className={`btn-primary min-w-[11.25rem] justify-center !rounded-lg !border-amber-300/25 !bg-[linear-gradient(135deg,#7a5417,#c99c4c)] !px-3 !py-2 !text-[12px] !text-[#120d06] hover:!shadow-amber-500/20 ${preparingEmailPdf ? 'cursor-not-allowed opacity-70' : ''}`}
                      onClick={openEmailWithAttachment}
                      disabled={preparingEmailPdf}
                    >
                      <ExternalLink className="h-4 w-4" />
                      {preparingEmailPdf ? 'Criando rascunho...' : 'Crie e-mail com anexo'}
                    </button>
                  </div>
                </div>

                <div className="min-h-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prévia HTML</p>
                      <p className="text-[11px] text-slate-500">Visual aproximado de como o rascunho será criado no Outlook.</p>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                    <iframe
                      title="Prévia do e-mail"
                      sandbox=""
                      srcDoc={buildEmailPreviewHtml(emailDraft)}
                      className="h-[28rem] w-full bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {emailCreatedNotice &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="cyber-overlay fixed inset-0 z-[75] flex items-center justify-center bg-black/70 px-4"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return;
              setEmailCreatedNotice(null);
            }}
          >
            <div
              className="cyber-dialog w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <p className="text-[11px] uppercase tracking-wide text-amber-200">E-mail criado</p>
              <p className="mt-2 text-sm text-slate-300">
                O rascunho foi criado com sucesso e já está disponível na pasta <span className="font-semibold text-white">Rascunho</span>.
              </p>
              <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-100">Assunto</p>
                <p className="mt-1 text-sm font-semibold text-white">{emailCreatedNotice.subject}</p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="btn-primary" onClick={() => setEmailCreatedNotice(null)}>
                  Entendi
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {profitabilityQuote && profitabilityAnalysis && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-[56] overflow-y-auto bg-black/70 px-4 py-6"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setProfitabilityQuote(null);
            setProfitabilityDetailType(null);
          }}
        >
          <div
            className="cyber-dialog quote-profitability-dialog mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-amber-200">Rentabilidade estimada</p>
                <h3 className="text-base font-semibold text-white sm:text-lg">
                  {profitabilityQuote.title || 'Orçamento'}
                </h3>
                <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">
                  PO {profitabilityQuote.poNumber || 'Pendente'} · {profitabilityQuote.clientCompany || profitabilityQuote.clientName || 'Sem cliente'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfitabilityQuote(null);
                  setProfitabilityDetailType(null);
                }}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-primary/50 hover:text-white"
              >
                Fechar
              </button>
            </div>

            {!profitabilityAnalysis.ready ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-50">Cálculo indisponível neste orçamento</p>
                <p className="mt-2 text-sm text-amber-100/90">
                  {profitabilityAnalysis.gaps?.[0] || 'Faltam dados detalhados para calcular a rentabilidade.'}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Valor cobrado</p>
                    <p className="mt-2 text-2xl font-bold text-white">{formatCurrency(profitabilityAnalysis.revenue)}</p>
                    <p className="mt-1 text-[11px] text-slate-400">Valor final usado como base da análise</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-200">Lucro estimado</p>
                    <p className={`mt-2 text-2xl font-bold ${profitabilityAnalysis.estimatedProfit >= 0 ? 'text-emerald-100' : 'text-rose-200'}`}>
                      {formatCurrency(profitabilityAnalysis.estimatedProfit)}
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-100/80">Ja descontando materiais, custos reais de servicos manuais e aliquota real</p>
                  </div>
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-amber-100">Margem estimada</p>
                    <p className={`mt-2 text-2xl font-bold ${profitabilityAnalysis.estimatedMarginPct >= 0 ? 'text-white' : 'text-rose-200'}`}>
                      {formatPercent(profitabilityAnalysis.estimatedMarginPct)}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-100/90">Cobertura de custo conhecido em serviços: {formatPercent(profitabilityAnalysis.coveragePct)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setProfitabilityDetailType('materials')}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-amber-300/40 hover:bg-white/10"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Materiais</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <span>Valor cobrado</span>
                        <span className="font-semibold text-white">{formatCurrency(profitabilityAnalysis.materialRevenue)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Gasto real</span>
                        <span className="font-semibold text-white">{formatCurrency(profitabilityAnalysis.materialCost)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                        <span>Diferença</span>
                        <span className="font-semibold text-emerald-200">{formatCurrency(profitabilityAnalysis.materialProfit)}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400">Clique para ver os itens considerados no calculo</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProfitabilityDetailType('services')}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-amber-300/40 hover:bg-white/10"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Serviços</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <span>Valor cobrado</span>
                        <span className="font-semibold text-white">{formatCurrency(profitabilityAnalysis.serviceRevenue)}</span>
                      </div>
                      {profitabilityAnalysis.manualServiceRevenue > 0 || profitabilityAnalysis.manualServiceCost > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>Serviços manuais</span>
                          <span className="font-semibold text-amber-100">
                            {formatCurrency(profitabilityAnalysis.manualServiceRevenue)}
                            {profitabilityAnalysis.manualServiceCost > 0
                              ? ` / real ${formatCurrency(profitabilityAnalysis.manualServiceCost)}`
                              : ''}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <span>Gasto real</span>
                        <span className="font-semibold text-white">{formatCurrency(profitabilityAnalysis.serviceCost)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                        <span>Diferença</span>
                        <span className="font-semibold text-emerald-200">{formatCurrency(profitabilityAnalysis.serviceProfit)}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400">Clique para ver os itens considerados no calculo</p>
                  </button>

                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Premissas aplicadas</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Materiais: custo = venda / 1,30
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Diária técnica: custo interno de R$ 125,00
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Fusão: custo interno de R$ 300,00
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Acompanhamento: custo interno de R$ 90,00
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Servicos cadastrados: entram como lucro integral
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Serviço manual sem "Valor Real": custo zero até ser preenchido
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Imposto real: 2,00% sobre o valor final
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                        Custos extras manuais entram pelo próprio orçamento
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Observações</p>
                    {profitabilityAnalysis.gaps?.length ? (
                      <div className="mt-3 space-y-2">
                        {profitabilityAnalysis.gaps.map((gap) => (
                          <p key={gap} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            {gap}
                          </p>
                        ))}
                        {profitabilityAnalysis.unmappedServiceLabels?.length ? (
                          <p className="text-[11px] text-slate-400">
                            Itens sem custo configurado: {profitabilityAnalysis.unmappedServiceLabels.join(', ')}.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-300">
                        Este orçamento está totalmente dentro das regras atuais de rentabilidade estimada.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                className="btn-primary"
                onClick={() => {
                  setProfitabilityQuote(null);
                  setProfitabilityDetailType(null);
                }}
              >
                Entendi
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {profitabilityDetail && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-[57] flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setProfitabilityDetailType(null);
          }}
        >
          <div
            className="cyber-dialog w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-amber-200">Detalhamento</p>
                <h3 className="text-base font-semibold text-white sm:text-lg">{profitabilityDetail.title}</h3>
                <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">
                  {profitabilityQuote?.title || 'Orcamento'} · PO {profitabilityQuote?.poNumber || 'Pendente'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfitabilityDetailType(null)}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-primary/50 hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/5">
              {profitabilityDetail.items.length ? (
                <div className="divide-y divide-white/10">
                  {profitabilityDetail.items.map((item) => (
                    <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1.8fr,0.7fr,0.9fr,0.9fr,0.9fr] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>
                      </div>
                      <div className="text-sm text-slate-300">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Quantidade</p>
                        <p className="mt-1 font-semibold text-white">{item.quantity}</p>
                      </div>
                      <div className="text-sm text-slate-300">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Valor cobrado</p>
                        <p className="mt-1 font-semibold text-white">{formatCurrency(item.billed)}</p>
                      </div>
                      <div className="text-sm text-slate-300">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Gasto real</p>
                        <p className="mt-1 font-semibold text-white">{formatCurrency(item.realCost)}</p>
                      </div>
                      <div className="text-sm text-slate-300">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Diferenca</p>
                        <p className="mt-1 font-semibold text-emerald-200">{formatCurrency(item.difference)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-slate-300">Nao ha itens para detalhar nesta secao.</div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button className="btn-primary" onClick={() => setProfitabilityDetailType(null)}>
                Entendi
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {deleting && (
        <ModalPortal>
          <div className="cyber-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="cyber-dialog cyber-loading-dialog flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
              <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/20" />
              <img src={logoUrl} alt="Clever Connection" className="relative h-12 w-12 rounded-full bg-white/10 p-2" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Excluindo orçamento</p>
              <p className="text-xs text-slate-300">Aguarde alguns instantes.</p>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default Orcamentos;
