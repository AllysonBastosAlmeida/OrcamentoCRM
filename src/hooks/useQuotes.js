import { useEffect, useState } from 'react';
import { createQuote, deleteQuote, duplicateQuote, getQuotes, updateQuote, updateQuoteApproval } from '../services/quotes.js';
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
  const [syncInfo, setSyncInfo] = useState({ status: 'idle', lastSync: null, error: null });

  const buildKey = (quote) => (quote?.poNumber ? `po-${quote.poNumber}` : quote?.id || crypto.randomUUID());
  const preferNonEmpty = (localValue, remoteValue) => {
    if (Array.isArray(localValue)) return localValue.length ? localValue : remoteValue;
    if (typeof localValue === 'string') return localValue.trim().length ? localValue : remoteValue;
    if (localValue === undefined || localValue === null) return remoteValue;
    return localValue;
  };

  const mergeQuote = (remote, local) => {
    const merged = { ...remote, ...local };
    return {
      ...merged,
      poNumber: local?.poNumber || remote?.poNumber,
      status: remote?.status || local?.status,
      approvalStatus: remote?.approvalStatus || local?.approvalStatus,
      category: remote?.category || local?.category,
      responsible: remote?.responsible || local?.responsible,
      total: remote?.total ?? local?.total,
      subtotal: remote?.subtotal ?? local?.subtotal,
      totalNumber: remote?.totalNumber ?? local?.totalNumber,
      createdAt: remote?.createdAt || local?.createdAt,
      validUntil: remote?.validUntil || local?.validUntil,
      items: preferNonEmpty(local?.items, remote?.items) || [],
      clientId: preferNonEmpty(local?.clientId, remote?.clientId) || '',
      clientName: preferNonEmpty(local?.clientName, remote?.clientName) || '',
      clientCompany: preferNonEmpty(local?.clientCompany, remote?.clientCompany) || '',
      createdBy: preferNonEmpty(local?.createdBy, remote?.createdBy) || '',
      createdByEmail: preferNonEmpty(local?.createdByEmail, remote?.createdByEmail) || '',
      updatedBy: preferNonEmpty(local?.updatedBy, remote?.updatedBy) || '',
      updatedByEmail: preferNonEmpty(local?.updatedByEmail, remote?.updatedByEmail) || '',
      updatedAt: preferNonEmpty(local?.updatedAt, remote?.updatedAt) || '',
      source: remote?.source || local?.source || 'local',
      notes: preferNonEmpty(local?.notes, remote?.notes) || '',
      scope: preferNonEmpty(local?.scope, remote?.scope) || '',
      clientEmail: preferNonEmpty(local?.clientEmail, remote?.clientEmail) || '',
      clientPhone: preferNonEmpty(local?.clientPhone, remote?.clientPhone) || '',
      contactName: preferNonEmpty(local?.contactName, remote?.contactName) || '',
      contactPhone: preferNonEmpty(local?.contactPhone, remote?.contactPhone) || '',
      contactEmail: preferNonEmpty(local?.contactEmail, remote?.contactEmail) || '',
      deliveryTime: preferNonEmpty(local?.deliveryTime, remote?.deliveryTime) || '',
      paymentTerms: preferNonEmpty(local?.paymentTerms, remote?.paymentTerms) || '',
      discountValue: local?.discountValue ?? remote?.discountValue ?? 0,
      taxRate: local?.taxRate ?? remote?.taxRate ?? 0,
    };
  };

  const loadQuotes = async () => {
    const local = (getQuotes() || []).map((q) => ({ ...q, source: q?.source || 'local' }));
    let merged = local;
    if (hasQuoteSheetConfig) {
      setSyncInfo((prev) => ({ ...prev, status: 'loading', error: null }));
    } else {
      setSyncInfo((prev) => ({ ...prev, status: 'local', error: null }));
    }

    if (hasQuoteSheetConfig) {
      try {
        const history = await fetchQuoteHistory();
        const mapped = history.map((h, idx) => {
          const details = h.details || {};
          const sheetApproval = h.approval || '';
          const totalNumber = toNumber(details.total ?? details.subtotal ?? h.totalNumber ?? h.total);
          return {
            id: details.id || `po-${h.poNumber || idx}-${h.clientName || ''}`,
            poNumber: details.poNumber || h.poNumber,
            clientId: details.clientId || h.clientId || '',
            clientName: details.clientName || h.clientName || '',
            clientCompany: details.clientCompany || h.clientName || '',
            clientEmail: details.clientEmail || '',
            clientPhone: details.clientPhone || '',
            contactName: details.contactName || '',
            contactPhone: details.contactPhone || '',
            contactEmail: details.contactEmail || '',
            title: details.title || h.title || '',
            status: details.status || h.status || h.condition || 'Enviado',
            createdAt: details.createdAt || h.date || '',
            validUntil: details.validUntil || h.date || '',
            createdBy: details.createdBy || '',
            createdByEmail: details.createdByEmail || '',
            updatedBy: details.updatedBy || '',
            updatedByEmail: details.updatedByEmail || '',
            updatedAt: details.updatedAt || '',
            subtotal: details.subtotal ?? totalNumber,
            total: details.total ?? totalNumber,
            totalNumber: details.totalNumber ?? totalNumber,
            items: Array.isArray(details.items) ? details.items : [],
            notes: details.notes || h.notes || '',
            approvalStatus: sheetApproval || details.approvalStatus || '',
            category: details.category || h.category || '',
            responsible: details.responsible || h.responsible || '',
            deliveryTime: details.deliveryTime || '',
            paymentTerms: details.paymentTerms || '',
            discountValue: details.discountValue ?? 0,
            taxRate: details.taxRate ?? 0,
            scope: details.scope || '',
            source: details.source || 'sheet',
            totalRaw: details.totalRaw || h.total || '',
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
        setSyncInfo({ status: 'success', lastSync: new Date().toISOString(), error: null });
      } catch (error) {
        console.warn('[useQuotes] Falha ao carregar historico da planilha', error);
        setSyncInfo((prev) => ({ ...prev, status: 'error', error: 'Falha ao atualizar a planilha.' }));
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

  const editQuote = async (quoteOrId, updates) => {
    const baseQuote = typeof quoteOrId === 'object' && quoteOrId ? quoteOrId : null;
    const id = baseQuote ? baseQuote.id : quoteOrId;
    const updated = await updateQuote(id, updates, baseQuote);
    setQuotes(getQuotes());
    return updated;
  };

  const editApproval = async (quoteOrId, approvalStatus) => {
    const updated = await updateQuoteApproval(quoteOrId, approvalStatus);
    setQuotes(getQuotes());
    return updated;
  };

  const cloneQuote = (id) => {
    const clone = duplicateQuote(id);
    setQuotes(getQuotes());
    return clone;
  };

  const removeQuote = async (quoteOrId) => {
    const baseQuote = typeof quoteOrId === 'object' && quoteOrId ? quoteOrId : null;
    const id = baseQuote ? baseQuote.id : quoteOrId;
    const poNumber = baseQuote ? baseQuote.poNumber : undefined;
    setQuotes((prev) =>
      prev.filter(
        (q) =>
          q.id !== id && (!poNumber || q.poNumber?.toString() !== poNumber.toString()),
      ),
    );
    await deleteQuote(id, poNumber);
    await loadQuotes();
  };

  return { quotes, syncInfo, addQuote, editQuote, editApproval, cloneQuote, removeQuote, refreshQuotes: loadQuotes };
};
