import { useEffect, useState } from 'react';
import { createQuote, deleteQuote, duplicateQuote, getQuotes, updateQuote } from '../services/quotes.js';
import { fetchQuoteHistory, hasQuoteSheetConfig } from '../services/quoteSheet.js';

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

export const useQuotes = () => {
  const [quotes, setQuotes] = useState([]);

  const buildKey = (quote) => (quote?.poNumber ? `po-${quote.poNumber}` : quote?.id || crypto.randomUUID());

  const mergeQuote = (remote, local) => ({
    ...remote,
    ...local,
    poNumber: local.poNumber || remote.poNumber,
    status: remote.status || local.status,
    approvalStatus: remote.approvalStatus || local.approvalStatus,
    category: remote.category || local.category,
    responsible: remote.responsible || local.responsible,
    total: remote.total ?? local.total,
    subtotal: remote.subtotal ?? local.subtotal,
    totalNumber: remote.totalNumber ?? local.totalNumber,
    createdAt: remote.createdAt || local.createdAt,
    validUntil: remote.validUntil || local.validUntil,
  });

  const loadQuotes = async () => {
    const local = getQuotes();
    let merged = local;

    if (hasQuoteSheetConfig) {
      try {
        const history = await fetchQuoteHistory();
        const mapped = history.map((h, idx) => {
          const totalNumber = toNumber(h.totalNumber ?? h.total);
          return {
            id: `po-${h.poNumber || idx}-${h.clientName || ''}`,
            poNumber: h.poNumber,
            clientId: h.clientId || '',
            clientName: h.clientName || '',
            clientCompany: h.clientName || '',
            title: h.title || '',
            status: h.status || h.condition || 'Enviado',
            createdAt: h.date || '',
            validUntil: h.date || '',
            subtotal: totalNumber,
            total: totalNumber,
            items: [],
            notes: h.notes || '',
            approvalStatus: h.approval || '',
            category: h.category || '',
            responsible: h.responsible || '',
            totalRaw: h.total || '',
          };
        });
        // Mescla mantendo locais criados (prioridade local)
        const byKey = new Map();
        mapped.forEach((q) => byKey.set(buildKey(q), q));
        local.forEach((q) => {
          const key = buildKey(q);
          const existing = byKey.get(key);
          byKey.set(key, existing ? mergeQuote(existing, q) : q);
        });
        merged = Array.from(byKey.values());
      } catch (error) {
        console.warn('[useQuotes] Falha ao carregar historico da planilha', error);
      }
    }

    setQuotes(merged);
    return merged;
  };

  useEffect(() => {
    loadQuotes();
  }, []);

  const addQuote = async (payload) => {
    const created = await createQuote(payload);
    setQuotes((prev) => [created, ...prev]);
    return created;
  };

  const editQuote = async (id, updates) => {
    const updated = await updateQuote(id, updates);
    setQuotes(getQuotes());
    return updated;
  };

  const cloneQuote = (id) => {
    const clone = duplicateQuote(id);
    setQuotes(getQuotes());
    return clone;
  };

  const removeQuote = async (id) => {
    await deleteQuote(id);
    await loadQuotes();
  };

  return { quotes, addQuote, editQuote, cloneQuote, removeQuote, refreshQuotes: loadQuotes };
};
