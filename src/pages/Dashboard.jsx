import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Suspense, lazy } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Filter,
  GripVertical,
  LayoutGrid,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useQuotes } from '../hooks/useQuotes.js';
import { formatCurrency } from '../utils/formatters.js';

const DASHBOARD_LAYOUT_STORAGE_KEY = 'orcamentocrm.dashboard.layouts.v2';
const ExportButtons = lazy(() => import('../components/ExportButtons.jsx'));
const loadExporters = () => import('../utils/exporters.js');
const DASHBOARD_BREAKPOINTS = { lg: 1440, md: 1100, sm: 768, xs: 520, xxs: 0 };
const DASHBOARD_COLS = { lg: 24, md: 16, sm: 8, xs: 4, xxs: 2 };
const METRIC_WIDGET_IDS = [
  'card-approved-count',
  'card-reproved-count',
  'card-waiting-count',
  'card-pipeline-count',
];
const CHART_WIDGET_IDS = [
  'chart-volume',
  'chart-value',
  'chart-approval-pie',
  'chart-category',
  'chart-approval-value',
];
const SECONDARY_LIST_WIDGET_IDS = [
  'list-top-clients',
  'list-top-responsible',
];
const DASHBOARD_WIDGET_IDS = [
  ...METRIC_WIDGET_IDS,
  ...CHART_WIDGET_IDS,
  ...SECONDARY_LIST_WIDGET_IDS,
  'list-recents',
];

const buildLayoutSection = (ids, { cols, startY, width, height, minW, minH = height }) => {
  const itemsPerRow = Math.max(1, Math.floor(cols / width));
  return ids.map((id, index) => ({
    i: id,
    x: (index % itemsPerRow) * width,
    y: startY + Math.floor(index / itemsPerRow) * height,
    w: width,
    h: height,
    minW: Math.min(minW, cols),
    minH,
  }));
};

const getLayoutHeight = (items) => items.reduce((max, item) => Math.max(max, item.y + item.h), 0);

const buildDashboardLayout = ({
  cols,
  metricW,
  chartW,
  listW,
  recentsW,
  metricMinW = 2,
  chartMinW = Math.max(2, Math.floor(chartW * 0.75)),
  listMinW = chartMinW,
  recentsMinW = recentsW,
}) => {
  const metrics = buildLayoutSection(METRIC_WIDGET_IDS, {
    cols,
    startY: 0,
    width: metricW,
    height: 2,
    minW: metricMinW,
    minH: 2,
  });
  const charts = buildLayoutSection(CHART_WIDGET_IDS, {
    cols,
    startY: getLayoutHeight(metrics),
    width: chartW,
    height: 5,
    minW: chartMinW,
    minH: 4,
  });
  const secondaryLists = buildLayoutSection(SECONDARY_LIST_WIDGET_IDS, {
    cols,
    startY: getLayoutHeight(charts),
    width: listW,
    height: 4,
    minW: listMinW,
    minH: 4,
  });

  return [
    ...metrics,
    ...charts,
    ...secondaryLists,
    {
      i: 'list-recents',
      x: 0,
      y: getLayoutHeight(secondaryLists),
      w: recentsW,
      h: 5,
      minW: Math.min(recentsMinW, cols),
      minH: 4,
    },
  ];
};

const DASHBOARD_DEFAULT_LAYOUTS = {
  lg: buildDashboardLayout({ cols: DASHBOARD_COLS.lg, metricW: 3, chartW: 8, listW: 12, recentsW: 24, chartMinW: 6, listMinW: 8, recentsMinW: 12 }),
  md: buildDashboardLayout({ cols: DASHBOARD_COLS.md, metricW: 4, chartW: 8, listW: 8, recentsW: 16, chartMinW: 6, listMinW: 6, recentsMinW: 8 }),
  sm: buildDashboardLayout({ cols: DASHBOARD_COLS.sm, metricW: 2, chartW: 4, listW: 4, recentsW: 8, chartMinW: 4, listMinW: 4, recentsMinW: 4 }),
  xs: buildDashboardLayout({ cols: DASHBOARD_COLS.xs, metricW: 2, chartW: 4, listW: 4, recentsW: 4, chartMinW: 2, listMinW: 2, recentsMinW: 2 }),
  xxs: buildDashboardLayout({ cols: DASHBOARD_COLS.xxs, metricW: 2, chartW: 2, listW: 2, recentsW: 2, chartMinW: 2, listMinW: 2, recentsMinW: 2 }),
};

const cloneLayouts = (layouts) =>
  Object.fromEntries(
    Object.entries(layouts).map(([bp, items]) => [
      bp,
      (items || []).map((item) => ({ ...item })),
    ]),
  );

const sanitizeLayoutItem = (item, cols) => {
  const width = Math.max(1, Math.min(Number(item?.w) || 1, cols));
  const minWidth = Math.max(1, Math.min(Number(item?.minW) || 1, cols));
  const resolvedWidth = Math.max(width, minWidth);
  return {
    i: String(item?.i || ''),
    x: Math.max(0, Math.min(Number(item?.x) || 0, Math.max(cols - resolvedWidth, 0))),
    y: Math.max(0, Number(item?.y) || 0),
    w: resolvedWidth,
    h: Math.max(Number(item?.h) || 2, Number(item?.minH) || 2),
    minW: minWidth,
    minH: Math.max(Number(item?.minH) || 2, 1),
  };
};

const ensureBreakpointLayout = (inputLayout, breakpoint) => {
  const cols = DASHBOARD_COLS[breakpoint];
  const defaults = DASHBOARD_DEFAULT_LAYOUTS[breakpoint] || [];
  const provided = Array.isArray(inputLayout) ? inputLayout : [];
  const validProvided = provided
    .map((item) => sanitizeLayoutItem(item, cols))
    .filter((item) => DASHBOARD_WIDGET_IDS.includes(item.i));

  const seen = new Set(validProvided.map((item) => item.i));
  const withMissing = [...validProvided];

  defaults.forEach((item) => {
    if (seen.has(item.i)) return;
    withMissing.push(sanitizeLayoutItem(item, cols));
  });

  return withMissing;
};

const normalizeLayouts = (input) => {
  const normalized = {};
  Object.keys(DASHBOARD_COLS).forEach((bp) => {
    normalized[bp] = ensureBreakpointLayout(input?.[bp], bp);
  });
  return normalized;
};

const getActiveBreakpoint = (containerWidth) => {
  const ordered = Object.entries(DASHBOARD_BREAKPOINTS).sort((a, b) => b[1] - a[1]);
  const matched = ordered.find(([, minWidth]) => containerWidth >= minWidth);
  return matched?.[0] || 'xxs';
};

const loadLayoutsFromStorage = () => {
  if (typeof window === 'undefined') return cloneLayouts(DASHBOARD_DEFAULT_LAYOUTS);
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return cloneLayouts(DASHBOARD_DEFAULT_LAYOUTS);
    const parsed = JSON.parse(raw);
    return normalizeLayouts(parsed);
  } catch {
    return cloneLayouts(DASHBOARD_DEFAULT_LAYOUTS);
  }
};

const saveLayoutsToStorage = (layouts) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
};

const toNumber = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = val.toString();
  const cleaned = str.replace(/[^0-9,.\-]/g, '');
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

const groupBy = (arr, keySelector, valueSelector = () => 1) => {
  const map = new Map();
  arr.forEach((item) => {
    const key = keySelector(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + valueSelector(item));
  });
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
};

const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const Dashboard = () => {
  const { quotes, refreshQuotes, syncInfo } = useQuotes();
  const [reloading, setReloading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [showSheets, setShowSheets] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [layoutDraftSnapshot, setLayoutDraftSnapshot] = useState(null);
  const [layouts, setLayouts] = useState(() => loadLayoutsFromStorage());
  const [gridDensity, setGridDensity] = useState({ rowHeight: 56, gap: 10 });
  const { width, containerRef, mounted } = useContainerWidth();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateGridDensity = () => {
      const styles = window.getComputedStyle(document.body);
      const rowHeight = Number.parseFloat(styles.getPropertyValue('--dashboard-row-height'));
      const gap = Number.parseFloat(styles.getPropertyValue('--dashboard-grid-gap'));

      setGridDensity({
        rowHeight: Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 56,
        gap: Number.isFinite(gap) && gap >= 0 ? gap : 10,
      });
    };

    updateGridDensity();
    const observer = new MutationObserver(updateGridDensity);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => observer.disconnect();
  }, []);
  const activeBreakpoint = useMemo(() => getActiveBreakpoint(width || 0), [width]);

  const normalizeText = (value) =>
    (value || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

  const enriched = useMemo(
    () =>
      (quotes || []).map((q) => {
        const dateObj = q.createdAt ? new Date(q.createdAt) : null;
        const isValidDate = dateObj && !Number.isNaN(dateObj.getTime());
        const year = isValidDate ? dateObj.getFullYear() : null;
        const monthIndex = isValidDate ? dateObj.getMonth() : null;
        const totalNumber = toNumber(q.totalRaw ?? q.totalNumber ?? q.total);
        return {
          ...q,
          totalNumber,
          year,
          monthIndex,
          monthLabel: monthIndex === null ? 'Sem data' : monthNames[monthIndex],
        };
      }),
    [quotes],
  );

  const baseQuotes = useMemo(() => {
    const sheetOnly = enriched.filter((q) => Object.prototype.hasOwnProperty.call(q, 'totalRaw'));
    return sheetOnly.length ? sheetOnly : enriched;
  }, [enriched]);

  const availableYears = useMemo(
    () => Array.from(new Set(baseQuotes.map((q) => q.year).filter(Boolean))).sort((a, b) => b - a),
    [baseQuotes],
  );

  useEffect(() => {
    if (!availableYears.length) {
      setSelectedYear(null);
      return;
    }
    const defaultYear = availableYears.includes(2026) ? 2026 : availableYears[0];
    setSelectedYear((prev) => (prev && availableYears.includes(prev) ? prev : defaultYear));
  }, [availableYears]);

  const filteredByYear = useMemo(
    () => (selectedYear ? baseQuotes.filter((q) => q.year === selectedYear) : baseQuotes),
    [baseQuotes, selectedYear],
  );

  const approvalKey = (q) => {
    const status = normalizeText(q.approvalStatus);
    if (status.includes('reprov')) return 'reprovado';
    if (status.includes('aprov')) return 'aprovado';
    if (status.includes('aguard')) return 'aguardando';
    return 'aguardando';
  };

  const totalCount = filteredByYear.length;
  const approved = filteredByYear.filter((q) => approvalKey(q) === 'aprovado');
  const reprovados = filteredByYear.filter((q) => approvalKey(q) === 'reprovado');
  const aguardando = filteredByYear.filter((q) => approvalKey(q) === 'aguardando');

  const pipelineValue = filteredByYear.reduce((acc, q) => acc + q.totalNumber, 0);
  const approvedValue = approved.reduce((acc, q) => acc + q.totalNumber, 0);
  const aguardandoValue = aguardando.reduce((acc, q) => acc + q.totalNumber, 0);
  const reprovadoValue = reprovados.reduce((acc, q) => acc + q.totalNumber, 0);

  const monthComparison = useMemo(() => {
    const map = new Map();
    filteredByYear.forEach((q) => {
      if (q.monthIndex === null) return;
      const entry = map.get(q.monthIndex) || { count: 0, value: 0 };
      entry.count += 1;
      entry.value += q.totalNumber;
      map.set(q.monthIndex, entry);
    });
    const months = Array.from(map.keys()).sort((a, b) => a - b);
    const currentMonth = months.length ? months[months.length - 1] : null;
    const prevIndex = currentMonth !== null ? months.indexOf(currentMonth) - 1 : -1;
    const previousMonth = prevIndex >= 0 ? months[prevIndex] : null;
    const current = currentMonth !== null ? map.get(currentMonth) : { count: 0, value: 0 };
    const previous = previousMonth !== null ? map.get(previousMonth) : { count: 0, value: 0 };
    return { currentMonth, previousMonth, current, previous };
  }, [filteredByYear]);

  const formatDelta = (current, previous) => {
    if (!previous || previous === 0) return 'Sem base no mes anterior';
    const pct = Math.round(((current - previous) / previous) * 100);
    const signal = pct >= 0 ? '+' : '-';
    return `${signal}${Math.abs(pct)}% vs mes anterior`;
  };

  const volumeDelta = formatDelta(monthComparison.current.count, monthComparison.previous.count);
  const valueDelta = formatDelta(monthComparison.current.value, monthComparison.previous.value);

  const valorMensalAprovado = useMemo(() => {
    const grouped = new Map();
    filteredByYear.forEach((q) => {
      if (q.monthIndex === null) return;
      if (normalizeText(q.approvalStatus) !== 'aprovado') return;
      const key = q.monthIndex;
      grouped.set(key, (grouped.get(key) || 0) + q.totalNumber);
    });
    return monthNames.map((label, idx) => ({
      key: `${label}/${selectedYear || ''}`.trim(),
      value: grouped.get(idx) || 0,
      monthIndex: idx,
    }));
  }, [filteredByYear, selectedYear]);

  const approvedMonthHighlight = useMemo(() => {
    const validMonths = valorMensalAprovado.filter((item) => item.value > 0);
    if (!validMonths.length) return 'Sem aprovacao no periodo';
    const latestApprovedMonth = validMonths[validMonths.length - 1];
    return `${latestApprovedMonth.key} · ${formatCurrency(latestApprovedMonth.value)}`;
  }, [valorMensalAprovado]);

  const sheetList = useMemo(
    () => [
      { planilha: 'Orcamento Web', aba: import.meta.env.VITE_GRAPH_SHEET_ORCAMENTOS || 'Processos_Orcamentos' },
      { planilha: 'Orcamento Web', aba: import.meta.env.VITE_GRAPH_SHEET_AUDIT || 'Historico_Orcamentos' },
      { planilha: 'QQP', aba: import.meta.env.VITE_GRAPH_SHEET_MATERIAIS || 'Materiais' },
      { planilha: 'QQP', aba: import.meta.env.VITE_GRAPH_SHEET_SERVICOS || 'Servicos' },
      { planilha: 'Clientes', aba: import.meta.env.VITE_GRAPH_SHEET_CLIENTES || 'Clientes' },
      { planilha: 'Funcionarios', aba: import.meta.env.VITE_GRAPH_SHEET_FUNCIONARIOS || 'Funcionarios' },
    ],
    [],
  );

  const cards = [
    {
      id: 'approved-count',
      title: 'Aprovado',
      value: approved.length,
      primaryLabel: 'Quantidade',
      secondaryValue: formatCurrency(approvedValue),
      secondaryLabel: 'Valor',
      subtitle: 'Orcamentos aprovados no periodo.',
      description: 'Orcamentos com aprovacao marcada como aprovado.',
      icon: <CheckCircle2 className="h-5 w-5" />,
      quotes: approved,
    },
    {
      id: 'reproved-count',
      title: 'Reprovado',
      value: reprovados.length,
      primaryLabel: 'Quantidade',
      secondaryValue: formatCurrency(reprovadoValue),
      secondaryLabel: 'Valor',
      subtitle: 'Orcamentos reprovados ou perdidos.',
      description: 'Orcamentos que foram reprovados ou marcados como perdido.',
      icon: <Clock className="h-5 w-5" />,
      quotes: reprovados,
    },
    {
      id: 'waiting-count',
      title: 'Aguardando',
      value: aguardando.length,
      primaryLabel: 'Quantidade',
      secondaryValue: formatCurrency(aguardandoValue),
      secondaryLabel: 'Valor',
      subtitle: 'Orcamentos aguardando retorno do cliente.',
      description: 'Orcamentos pendentes de retorno do cliente.',
      icon: <Clock className="h-5 w-5" />,
      quotes: aguardando,
    },
    {
      id: 'pipeline-count',
      title: 'Pipeline',
      value: totalCount,
      primaryLabel: 'Quantidade total',
      secondaryValue: formatCurrency(pipelineValue),
      secondaryLabel: 'Valor total',
      subtitle: 'Base completa do periodo selecionado.',
      description: 'Total de orcamentos no periodo selecionado.',
      trend: valueDelta,
      icon: <TrendingUp className="h-5 w-5" />,
      quotes: filteredByYear,
      highlights: [
        { label: 'Aprovado no mes', value: approvedMonthHighlight },
        { label: 'Delta mensal', value: valueDelta },
        { label: 'Delta volume', value: volumeDelta },
        { label: 'Periodo', value: `${selectedYear || 'Todos os anos'}` },
      ],
    },
  ];

  const selectedCard = useMemo(() => cards.find((card) => card.id === selectedCardId) || null, [cards, selectedCardId]);

  const selectedCardDetails = useMemo(() => {
    if (!selectedCard) return null;
    const list = [...(selectedCard.quotes || [])]
      .sort((a, b) => {
        const dateA = a.createdAt || a.validUntil || a.date;
        const dateB = b.createdAt || b.validUntil || b.date;
        const tA = dateA ? new Date(dateA).getTime() : 0;
        const tB = dateB ? new Date(dateB).getTime() : 0;
        if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) return tB - tA;
        return (b.totalNumber || 0) - (a.totalNumber || 0);
      })
      .slice(0, 12);

    const totalValue = (selectedCard.quotes || []).reduce((acc, q) => acc + (q.totalNumber || 0), 0);
    const totalQuotes = (selectedCard.quotes || []).length;
    const avgTicket = totalQuotes ? totalValue / totalQuotes : 0;

    return { list, totalValue, totalQuotes, avgTicket };
  }, [selectedCard]);

  useEffect(() => {
    if (!selectedCard) return undefined;
    const onEsc = (event) => {
      if (event.key === 'Escape') setSelectedCardId(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedCard]);

  useEffect(() => {
    if (editingLayout) setSelectedCardId(null);
  }, [editingLayout]);

  const volumeMensal = useMemo(() => {
    const grouped = new Map();
    filteredByYear.forEach((q) => {
      if (q.monthIndex === null) return;
      const key = q.monthIndex;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return monthNames.map((label, idx) => ({ key: `${label}/${selectedYear || ''}`.trim(), value: grouped.get(idx) || 0, monthIndex: idx }));
  }, [filteredByYear, selectedYear]);

  const valorMensal = useMemo(() => {
    const grouped = new Map();
    filteredByYear.forEach((q) => {
      if (q.monthIndex === null) return;
      const key = q.monthIndex;
      grouped.set(key, (grouped.get(key) || 0) + q.totalNumber);
    });
    return monthNames.map((label, idx) => ({
      key: `${label}/${selectedYear || ''}`.trim(),
      value: grouped.get(idx) || 0,
      monthIndex: idx,
    }));
  }, [filteredByYear, selectedYear]);

  const handleExport = async (format) => {
    if (exportingFormat) return;
    try {
      setExportingFormat(format);
      const { exportQuotesToCSV, exportQuotesToExcel } = await loadExporters();
      if (format === 'csv') {
        await exportQuotesToCSV(enriched);
        return;
      }
      await exportQuotesToExcel(enriched);
    } finally {
      setExportingFormat(null);
    }
  };

  const approvalCounts = useMemo(
    () =>
      filteredByYear.reduce(
        (acc, q) => {
          const status = approvalKey(q);
          if (status === 'aprovado') acc.aprovado += 1;
          else if (status === 'reprovado') acc.reprovado += 1;
          else acc.aguardando += 1;
          return acc;
        },
        { aprovado: 0, reprovado: 0, aguardando: 0 },
      ),
    [filteredByYear],
  );
  const approvalPie = [
    { name: 'Aprovado', value: approvalCounts.aprovado, color: '#22c55e' },
    { name: 'Reprovado', value: approvalCounts.reprovado, color: '#ef4444' },
    { name: 'Aguardando', value: approvalCounts.aguardando, color: '#f59e0b' },
  ];
  const approvalStatusTotal = approvalPie.reduce((acc, entry) => acc + entry.value, 0);

  const valorPorCategoria = groupBy(filteredByYear, (q) => q.category || 'Sem categoria', (q) => q.totalNumber);
  const valorPorAprovacao = groupBy(
    filteredByYear,
    (q) => {
      const key = approvalKey(q);
      if (key === 'aprovado') return 'Aprovado';
      if (key === 'reprovado') return 'Reprovado';
      return 'Aguardando';
    },
    (q) => q.totalNumber,
  );
  const valorPorResponsavel = groupBy(filteredByYear, (q) => q.responsible || 'Sem responsavel', (q) => q.totalNumber).slice(0, 6);
  const ranking = groupBy(filteredByYear, (q) => q.clientCompany || q.clientName || 'Sem cliente', (q) => q.totalNumber)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const recents = useMemo(() => {
    const sorted = [...filteredByYear].sort((a, b) => {
      const dateA = a.createdAt || a.validUntil || a.date;
      const dateB = b.createdAt || b.validUntil || b.date;
      const tA = dateA ? new Date(dateA).getTime() : 0;
      const tB = dateB ? new Date(dateB).getTime() : 0;
      if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) return tB - tA;
      const poA = Number(a.poNumber || 0);
      const poB = Number(b.poNumber || 0);
      return poB - poA;
    });
    return sorted.slice(0, 6);
  }, [filteredByYear]);

  const handleReload = async () => {
    setReloading(true);
    await refreshQuotes();
    setReloading(false);
  };

  const handleStartLayoutEdit = () => {
    setLayoutDraftSnapshot(cloneLayouts(layouts));
    setEditingLayout(true);
  };

  const handleSaveLayoutEdit = () => {
    const normalized = normalizeLayouts(layouts);
    setLayouts(normalized);
    saveLayoutsToStorage(normalized);
    setEditingLayout(false);
    setLayoutDraftSnapshot(null);
  };

  const handleCancelLayoutEdit = () => {
    if (layoutDraftSnapshot) {
      setLayouts(cloneLayouts(layoutDraftSnapshot));
    }
    setEditingLayout(false);
    setLayoutDraftSnapshot(null);
  };

  const handleLayoutChange = (_currentLayout, allLayouts) => {
    if (!editingLayout) return;
    const normalized = normalizeLayouts(allLayouts);
    setLayouts(normalized);
  };

  const handleResetLayout = () => {
    setLayouts(cloneLayouts(DASHBOARD_DEFAULT_LAYOUTS));
  };

  const renderWidgetHandle = () =>
    editingLayout ? (
      <div className="dashboard-widget-handle mb-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
        <GripVertical className="h-3 w-3" />
        Arrastar
      </div>
    ) : null;

  const renderDataList = (rows, formatter = (value) => value, emptyText = 'Sem dados no filtro atual.') => (
    <div className="widget-list">
      {rows.length === 0 ? (
        <p className="widget-empty">{emptyText}</p>
      ) : (
        rows.map((row, idx) => (
          <div key={`${row.key}-${idx}`} className="widget-list-item">
            <div className="widget-list-leading">
              <span className="widget-rank">{idx + 1}</span>
              <p className="widget-list-title-text">{row.key}</p>
            </div>
            <p className="widget-list-value">{formatter(row.value)}</p>
          </div>
        ))
      )}
    </div>
  );

  const buildSeriesSummary = (rows) => {
    const validRows = rows.filter((row) => Number(row.value) > 0);
    if (!validRows.length) return null;
    const peak = validRows.reduce((best, row) => (row.value > best.value ? row : best), validRows[0]);
    const latest = validRows[validRows.length - 1];
    const total = validRows.reduce((acc, row) => acc + Number(row.value || 0), 0);
    const average = total / validRows.length;
    return {
      rows: validRows,
      peak,
      latest,
      total,
      average,
      max: Math.max(...validRows.map((row) => Number(row.value || 0)), 1),
    };
  };

  const renderExecutiveTrendPanel = ({
    rows,
    valueFormatter = (value) => value,
    heroLabel = 'Pico do periodo',
    totalLabel = 'Acumulado',
    averageLabel = 'Media mensal',
    emptyText = 'Sem dados no filtro atual.',
    compact = false,
  }) => {
    const summary = buildSeriesSummary(rows);
    if (!summary) return <p className="widget-empty">{emptyText}</p>;

    const visibleRows = compact ? summary.rows.slice(-4) : summary.rows.slice(-6);

    return (
      <div className={`dashboard-trend-panel${compact ? ' is-compact' : ''}`}>
        <div className="dashboard-trend-hero">
          <div className="dashboard-trend-hero-copy">
            <span className="dashboard-trend-kicker">{heroLabel}</span>
            <strong>{summary.peak.key}</strong>
          </div>
          <div className="dashboard-trend-hero-metric">{valueFormatter(summary.peak.value)}</div>
        </div>

        <div className="dashboard-trend-stat-grid">
          <div className="dashboard-trend-stat-card">
            <span>Ultimo mes</span>
            <strong>{summary.latest.key}</strong>
            <em>{valueFormatter(summary.latest.value)}</em>
          </div>
          <div className="dashboard-trend-stat-card">
            <span>{averageLabel}</span>
            <strong>{valueFormatter(summary.average)}</strong>
            <em>{totalLabel}</em>
          </div>
          <div className="dashboard-trend-stat-card">
            <span>{totalLabel}</span>
            <strong>{valueFormatter(summary.total)}</strong>
            <em>{summary.rows.length} meses com movimento</em>
          </div>
        </div>

        <div className="dashboard-trend-bars">
          {visibleRows.map((row) => (
            <div key={row.key} className="dashboard-trend-bar-row">
              <div className="dashboard-trend-bar-head">
                <span className="dashboard-trend-bar-label">{row.key}</span>
                <strong className="dashboard-trend-bar-value">{valueFormatter(row.value)}</strong>
              </div>
              <div className="dashboard-trend-bar-track">
                <span className="dashboard-trend-bar-fill" style={{ width: `${Math.max((row.value / summary.max) * 100, 8)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStatusBreakdownPanel = () => {
    const valueMap = new Map(valorPorAprovacao.map((entry) => [entry.key, entry.value]));
    const rows = approvalPie
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        percentage: approvalStatusTotal ? Math.round((item.value / approvalStatusTotal) * 100) : 0,
        totalValue: valueMap.get(item.name) || 0,
        tone:
          item.name === 'Aprovado'
            ? 'is-approved'
            : item.name === 'Reprovado'
              ? 'is-reproved'
              : 'is-waiting',
      }));

    if (!rows.length) return <p className="widget-empty">Nenhum status de aprovacao para exibir.</p>;

    return (
      <div className="dashboard-breakdown-grid">
        {rows.map((row) => (
          <div key={row.name} className={`dashboard-breakdown-card ${row.tone}`}>
            <div className="dashboard-breakdown-top">
              <span>{row.name}</span>
              <strong>{row.percentage}%</strong>
            </div>
            <div className="dashboard-breakdown-main">{row.value}</div>
            <div className="dashboard-breakdown-sub">{formatCurrency(row.totalValue)}</div>
            <div className="dashboard-breakdown-track">
              <span className="dashboard-breakdown-fill" style={{ width: `${Math.max(row.percentage, 10)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderExecutiveDistributionPanel = ({
    rows,
    valueFormatter = (value) => value,
    emptyText = 'Sem dados no filtro atual.',
    limit = 5,
  }) => {
    const visibleRows = [...rows].filter((row) => Number(row.value) > 0).slice(0, limit);
    if (!visibleRows.length) return <p className="widget-empty">{emptyText}</p>;

    const total = visibleRows.reduce((acc, row) => acc + Number(row.value || 0), 0);
    const max = Math.max(...visibleRows.map((row) => Number(row.value || 0)), 1);

    return (
      <div className="dashboard-distribution-list">
        {visibleRows.map((row) => {
          const share = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <div key={row.key} className="dashboard-distribution-row">
              <div className="dashboard-distribution-head">
                <span className="dashboard-distribution-label">{row.key}</span>
                <strong className="dashboard-distribution-value">{valueFormatter(row.value)}</strong>
              </div>
              <div className="dashboard-distribution-meta">
                <span>{share}% do bloco</span>
              </div>
              <div className="dashboard-distribution-track">
                <span className="dashboard-distribution-fill" style={{ width: `${Math.max((row.value / max) * 100, 10)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMetricWidget = (card, options = {}) => {
    const { className = '', showHighlights = false } = options;

    return (
      <button
        type="button"
        onClick={() => {
          if (!editingLayout) setSelectedCardId(card.id);
        }}
        className={`card dashboard-widget dashboard-metric-widget relative flex h-full w-full cursor-pointer flex-col overflow-hidden text-left ${className}`.trim()}
      >
        {renderWidgetHandle()}
        <div className="metric-icon-wrap">{card.icon}</div>
        <p className="metric-title">{card.title}</p>
        <div className="metric-dual-grid">
          <div className="metric-dual-main">
            <span className="metric-overline">{card.primaryLabel || 'Total'}</span>
            <p className="metric-value">{card.value}</p>
          </div>
          {card.secondaryValue ? (
            <div className="metric-dual-secondary">
              <span className="metric-overline">{card.secondaryLabel || 'Valor'}</span>
              <p className="metric-value-secondary">{card.secondaryValue}</p>
            </div>
          ) : null}
        </div>
        <p className="metric-subtitle">{card.subtitle}</p>
        {card.trend && <p className="metric-trend">{card.trend}</p>}
        {showHighlights && card.highlights?.length ? (
          <div className="dashboard-metric-highlight-grid">
            {card.highlights.slice(0, 4).map((item) => (
              <div key={`${card.id}-${item.label}`} className="dashboard-metric-highlight-item">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </button>
    );
  };

  const renderPanelWidget = ({ title, badge, icon = null, content, className = '' }) => (
    <div className={`card dashboard-widget dashboard-panel-widget chart-compact flex h-full flex-col ${className}`.trim()}>
      {renderWidgetHandle()}
      <div className="widget-header">
        <p className="widget-title">{title}</p>
        {badge ? <span className="widget-badge">{badge}</span> : icon}
      </div>
      <div className="widget-chart-body">{content}</div>
    </div>
  );

  const metricWidgets = cards.map((card) => ({
    id: `card-${card.id}`,
    minW: 2,
    minH: 2,
    content: renderMetricWidget(card),
  }));

  const gridWidgets = [
    ...metricWidgets,
    {
      id: 'chart-volume',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Volume mensal',
        badge: 'Ritmo',
        content: renderExecutiveTrendPanel({
          rows: volumeMensal,
          valueFormatter: (value) => `${Math.round(value)}`,
          heroLabel: 'Melhor volume',
          totalLabel: 'Orcamentos no ano',
          averageLabel: 'Media mensal',
          emptyText: 'Nenhum volume mensal para exibir.',
          compact: true,
        }),
      }),
    },
    {
      id: 'chart-value',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Valor mensal do pipeline',
        badge: 'Radar executivo',
        content: renderExecutiveTrendPanel({
          rows: valorMensal,
          valueFormatter: (value) => formatCurrency(value),
          heroLabel: 'Melhor mes do periodo',
          totalLabel: 'Valor acumulado',
          averageLabel: 'Media mensal',
          emptyText: 'Nenhum valor mensal para exibir.',
        }),
      }),
    },
    {
      id: 'chart-approval-pie',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Distribuicao por status',
        badge: 'Status',
        content: renderStatusBreakdownPanel(),
      }),
    },
    {
      id: 'chart-category',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Categorias com mais peso',
        icon: <Filter className="widget-inline-icon" />,
        content: renderExecutiveDistributionPanel({
          rows: valorPorCategoria.sort((a, b) => b.value - a.value),
          valueFormatter: (value) => formatCurrency(value),
          emptyText: 'Nenhuma categoria para exibir.',
        }),
      }),
    },
    {
      id: 'chart-approval-value',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Valor por etapa do funil',
        badge: 'Mix financeiro',
        content: renderExecutiveDistributionPanel({
          rows: valorPorAprovacao.sort((a, b) => b.value - a.value),
          valueFormatter: (value) => formatCurrency(value),
          emptyText: 'Nenhum valor por aprovacao para exibir.',
          limit: 3,
        }),
      }),
    },
    {
      id: 'list-top-clients',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Top clientes por valor',
        badge: 'Top 5',
        content: (
          <div className="widget-list">
            {ranking.map((client, idx) => (
              <div key={client.key} className="widget-list-item">
                <div className="widget-list-leading">
                  <span className="widget-rank">{idx + 1}</span>
                  <p className="widget-list-title-text">{client.key}</p>
                </div>
                <p className="widget-list-value">{formatCurrency(client.value)}</p>
              </div>
            ))}
            {ranking.length === 0 && <p className="widget-empty">Nenhum cliente ranqueado.</p>}
          </div>
        ),
      }),
    },
    {
      id: 'list-top-responsible',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Valor por responsavel',
        badge: 'Top 6',
        content: (
          <div className="widget-list">
            {valorPorResponsavel.map((resp, idx) => (
              <div key={resp.key} className="widget-list-item">
                <div className="widget-list-leading">
                  <span className="widget-rank">{idx + 1}</span>
                  <p className="widget-list-title-text">{resp.key}</p>
                </div>
                <p className="widget-list-value">{formatCurrency(resp.value)}</p>
              </div>
            ))}
            {valorPorResponsavel.length === 0 && <p className="widget-empty">Nenhum responsavel ranqueado.</p>}
          </div>
        ),
      }),
    },
    {
      id: 'list-recents',
      minW: 2,
      minH: 4,
      content: renderPanelWidget({
        title: 'Ultimos orcamentos',
        badge: 'Atualizados',
        content: (
          <div className="widget-list">
            {recents.map((quote) => (
              <div key={quote.id} className="widget-list-item">
                <div>
                  <p className="widget-list-title-text">{quote.clientCompany || quote.clientName || 'Cliente'}</p>
                  <p className="widget-list-subtitle">{quote.title || 'Sem titulo'}</p>
                  <p className="widget-list-meta">
                    Categoria: {quote.category || '--'} | Aprovacao: {quote.approvalStatus || '--'} | Responsavel: {quote.responsible || '--'}
                  </p>
                </div>
                <div className="widget-list-side">
                  <p className="widget-list-value">{formatCurrency(quote.totalNumber)}</p>
                  <p className="widget-list-subtitle">{quote.status || 'Sem status'}</p>
                  <p className="widget-list-meta">{quote.createdAt}</p>
                </div>
              </div>
            ))}
            {recents.length === 0 && <p className="widget-empty">Sem orcamentos cadastrados.</p>}
          </div>
        ),
      }),
    },
  ];

  const cardById = Object.fromEntries(cards.map((card) => [card.id, card]));
  const widgetContentById = new Map(gridWidgets.map((widget) => [widget.id, widget.content]));

  const activeLayout = useMemo(
    () => ensureBreakpointLayout(layouts?.[activeBreakpoint], activeBreakpoint),
    [activeBreakpoint, layouts],
  );

  const staticGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${DASHBOARD_COLS[activeBreakpoint]}, minmax(0, 1fr))`,
      gridAutoRows: `${gridDensity.rowHeight}px`,
      gap: `${gridDensity.gap}px`,
    }),
    [activeBreakpoint, gridDensity.gap, gridDensity.rowHeight],
  );

  const staticGridItems = useMemo(() => {
    const layoutMap = new Map(activeLayout.map((item) => [item.i, item]));
    return gridWidgets.map((widget) => ({
      ...widget,
      layout: layoutMap.get(widget.id) || sanitizeLayoutItem({ i: widget.id, x: 0, y: 0, w: widget.minW, h: widget.minH }, DASHBOARD_COLS[activeBreakpoint]),
    }));
  }, [activeBreakpoint, activeLayout, gridWidgets]);

  const selectedCardModal =
    selectedCard && selectedCardDetails && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="cyber-overlay fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-3 py-4 backdrop-blur-sm"
            onClick={() => setSelectedCardId(null)}
          >
            <div
              className="card cyber-dialog w-full max-w-4xl border border-white/15 p-4 sm:p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white/10 p-2 text-slate-200">{selectedCard.icon}</div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Detalhes do card</p>
                    <h3 className="text-base font-bold text-white sm:text-lg">{selectedCard.title}</h3>
                    <p className="text-xs text-slate-400 sm:text-sm">{selectedCard.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCardId(null)}
                  className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:border-primary/50 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-3 grid gap-2 sm:mb-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-slate-400">Quantidade</p>
                  <p className="text-sm font-semibold text-white sm:text-base">{selectedCardDetails.totalQuotes}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-slate-400">Valor total</p>
                  <p className="text-sm font-semibold text-white sm:text-base">{formatCurrency(selectedCardDetails.totalValue)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-slate-400">Ticket medio</p>
                  <p className="text-sm font-semibold text-white sm:text-base">{formatCurrency(selectedCardDetails.avgTicket)}</p>
                </div>
              </div>

              {selectedCard.highlights?.length ? (
                <div className="mb-3 grid gap-2 sm:mb-4 sm:grid-cols-2">
                  {selectedCard.highlights.map((item) => (
                    <div key={`${selectedCard.id}-${item.label}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] text-slate-400">{item.label}</p>
                      <p className="text-sm font-semibold text-white sm:text-base">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-xs font-semibold text-white sm:text-sm">Orcamentos relacionados</p>
                {selectedCardDetails.list.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum orcamento para este card no filtro atual.</p>
                ) : (
                  <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                    {selectedCardDetails.list.map((quote) => (
                      <div
                        key={quote.id}
                        className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white sm:text-sm">
                            {quote.clientCompany || quote.clientName || 'Cliente'}
                          </p>
                          <p className="truncate text-[11px] text-slate-400 sm:text-xs">{quote.title || 'Sem titulo'}</p>
                          <p className="text-[10px] text-slate-400 sm:text-[11px]">
                            Status: {quote.status || '--'} | Aprovacao: {quote.approvalStatus || '--'}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-xs font-semibold text-white sm:text-sm">{formatCurrency(quote.totalNumber || 0)}</p>
                          <p className="text-[10px] text-slate-400 sm:text-[11px]">{quote.createdAt || quote.validUntil || '--'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="dashboard-showcase-shell space-y-2.5 sm:space-y-3">
      <div className="dashboard-showcase-atmosphere" aria-hidden="true">
        <span className="dashboard-showcase-orb dashboard-showcase-orb-a" />
        <span className="dashboard-showcase-orb dashboard-showcase-orb-b" />
        <span className="dashboard-showcase-grid" />
        <span className="dashboard-showcase-rings" />
        <span className="dashboard-showcase-beam" />
      </div>

      <div className="dashboard-hero">
        <div className="dashboard-hero-heading min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Visao geral</p>
          <div className="dashboard-hero-title-row mt-1 flex flex-wrap items-center gap-1.5">
            <h1 className="text-[1.8rem] font-bold leading-none text-white sm:text-[1.95rem]">Dashboard de Orcamentos</h1>
            <div className="dashboard-year-filter inline-flex h-8 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs text-slate-300">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={selectedYear || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedYear(val ? Number(val) : null);
                }}
                className="bg-transparent text-xs text-white outline-none"
              >
                <option value="">Todos</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <div className="dashboard-action-row">
            <button className="toolbar-btn" onClick={handleReload} title="Recarregar planilha" aria-label="Recarregar planilha">
              <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            </button>
            {!editingLayout ? (
              <button className="toolbar-btn" onClick={handleStartLayoutEdit}>
                <LayoutGrid className="h-4 w-4" />
                Editar layout
              </button>
            ) : (
              <>
                <button className="toolbar-btn-primary" onClick={handleSaveLayoutEdit}>
                  <LayoutGrid className="h-4 w-4" />
                  Salvar layout
                </button>
                <button className="toolbar-btn" onClick={handleCancelLayoutEdit}>
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              </>
            )}
            {editingLayout && (
              <button className="toolbar-btn" onClick={handleResetLayout}>
                <RotateCcw className="h-4 w-4" />
                Resetar layout
              </button>
            )}
            <button className="toolbar-btn-primary" onClick={() => navigate('/orcamentos')}>
              <Plus className="h-4 w-4" />
              Novo orcamento
            </button>
            <button
              type="button"
              onClick={() => setShowSheets((prev) => !prev)}
              className="toolbar-btn"
            >
              <Database className="h-4 w-4 text-slate-400" />
              <span className="hidden md:inline">Planilhas vinculadas</span>
              {showSheets ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="dashboard-meta-row">
            {editingLayout && (
              <p className="text-[11px] text-sky-200">
                Arraste pela alca e redimensione pelos cantos. Use Salvar layout para confirmar ou Cancelar para descartar.
              </p>
            )}
            <div className="text-[11px] text-slate-400">
              {syncInfo.status === 'loading' && 'Atualizando planilha...'}
              {syncInfo.status === 'local' && 'Sem sincronizacao com planilha configurada.'}
              {syncInfo.status !== 'local' && syncInfo.status !== 'loading' && (
                <>
                  Ultima sincronizacao:{' '}
                  {syncInfo.lastSync ? new Date(syncInfo.lastSync).toLocaleString('pt-BR') : 'Nao sincronizado'}
                </>
              )}
            </div>
          </div>
          {syncInfo.error && <div className="text-[11px] text-rose-300">{syncInfo.error}</div>}
        </div>
      </div>

      {showSheets && (
        <div className="card dashboard-linked-sheets border border-white/10 bg-white/5 p-3 text-xs text-slate-300 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sheetList.map((sheet, idx) => (
              <div
                key={`${sheet.planilha}-${sheet.aba}-${idx}`}
                className="dashboard-linked-sheet-item flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
              >
                <div>
                  <p className="text-[10px] uppercase text-slate-400">Planilha</p>
                  <p className="text-xs font-semibold text-white">{sheet.planilha}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-slate-400">Aba</p>
                  <p className="text-xs font-semibold text-white">{sheet.aba}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef}>
        {mounted && editingLayout && (
          <div className="dashboard-edit-surface">
            <Responsive
              key="dashboard-grid-edit"
              className={`dashboard-grid ${editingLayout ? 'is-editing' : ''}`}
              layouts={layouts}
              breakpoints={DASHBOARD_BREAKPOINTS}
              cols={DASHBOARD_COLS}
              rowHeight={gridDensity.rowHeight}
              margin={[gridDensity.gap, gridDensity.gap]}
              containerPadding={[0, 0]}
              width={width}
              isDraggable={editingLayout}
              isResizable={editingLayout}
              draggableHandle=".dashboard-widget-handle"
              draggableCancel="button, input, select, option, textarea"
              compactType="vertical"
              preventCollision={false}
              onLayoutChange={handleLayoutChange}
            >
              {gridWidgets.map((widget) => (
                <div key={widget.id} data-grid={{ minW: widget.minW, minH: widget.minH }} className="min-h-0">
                  {widget.content}
                </div>
              ))}
            </Responsive>
          </div>
        )}

        {mounted && !editingLayout && (
          <section className="dashboard-stage-layout">
            <div className="dashboard-section-heading">
              <div className="dashboard-section-copy">
                <p className="dashboard-section-kicker">Pulse do funil</p>
                <h2 className="dashboard-section-title">Leitura executiva dos numeros principais</h2>
              </div>
              <p className="dashboard-section-note">Resumo de quantidade, valor e ritmo comercial no periodo selecionado.</p>
            </div>

            <div className="dashboard-kpi-grid">
              {renderMetricWidget(cardById['approved-count'], { className: 'dashboard-kpi-card dashboard-kpi-approved' })}
              {renderMetricWidget(cardById['reproved-count'], { className: 'dashboard-kpi-card dashboard-kpi-reproved' })}
              {renderMetricWidget(cardById['waiting-count'], { className: 'dashboard-kpi-card dashboard-kpi-waiting' })}
            </div>

            <div className="dashboard-value-stage">
              <div className="dashboard-value-feature">
                {renderMetricWidget(cardById['pipeline-count'], {
                  className: 'dashboard-kpi-card dashboard-feature-card dashboard-kpi-pipeline',
                  showHighlights: true,
                })}
              </div>
            </div>

            <div className="dashboard-section-heading">
              <div>
                <p className="dashboard-section-kicker">Tendencias</p>
                <h2 className="dashboard-section-title">Tendencias do funil</h2>
              </div>
            </div>

            <div className="dashboard-analysis-stage">
              <div className="dashboard-analysis-main">{widgetContentById.get('chart-value')}</div>
              <div className="dashboard-analysis-side">
                {widgetContentById.get('chart-volume')}
                {widgetContentById.get('chart-approval-pie')}
              </div>
            </div>

            <div className="dashboard-support-grid">
              {widgetContentById.get('chart-approval-value')}
              {widgetContentById.get('chart-category')}
            </div>

            <div className="dashboard-section-heading">
              <div>
                <p className="dashboard-section-kicker">Relacionamentos</p>
                <h2 className="dashboard-section-title">Quem mais move resultado dentro do CRM</h2>
              </div>
              <p className="dashboard-section-note">Clientes, responsaveis e atividade recente em um bloco mais editorial.</p>
            </div>

            <div className="dashboard-ranking-grid">
              {widgetContentById.get('list-top-clients')}
              {widgetContentById.get('list-top-responsible')}
              <div className="dashboard-ranking-wide">{widgetContentById.get('list-recents')}</div>
            </div>
          </section>
        )}
      </div>

      {selectedCardModal}

      <Suspense fallback={<div className="h-10 w-40 animate-pulse rounded-xl border border-white/10 bg-white/5" />}>
        <ExportButtons
          onCSV={() => handleExport('csv')}
          onExcel={() => handleExport('excel')}
          disabled={Boolean(exportingFormat)}
        />
      </Suspense>
    </div>
  );
};

export default Dashboard;
