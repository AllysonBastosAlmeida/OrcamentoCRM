import mockQuotes from '../data/mockQuotes.js';
import {
  appendQuoteRow,
  deleteQuoteRow,
  hasQuoteSheetConfig,
  updateQuoteApprovalStatus,
  updateQuoteRow,
} from './quoteSheet.js';
import { getCurrentUser } from '../utils/userSession.js';
import { appendAuditEntry } from '../utils/audit.js';

const STORAGE_KEY = 'crm-orcamentos:quotes';
let quotesCache = null;

const formatAuditCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const getUserMeta = () => {
  const user = getCurrentUser();
  return {
    name: user?.name || '',
    email: user?.email || '',
  };
};

const persist = (quotes) => {
  quotesCache = quotes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
};

const computeTotals = (items = [], discountValue = 0, taxRate = 0) => {
  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalBeforeTax = subtotal - Number(discountValue || 0);
  const total = totalBeforeTax * (1 + Number(taxRate || 0) / 100);
  return { subtotal, total };
};

const quoteClientLabel = (quote) => quote?.clientCompany || quote?.clientName || '';

const quoteItemCount = (quote) => (Array.isArray(quote?.items) ? quote.items.length : 0);

const pushChangeDetail = (details, condition, label, before, after) => {
  if (!condition) return;
  details.push(`${label}: ${before || '--'} -> ${after || '--'}`);
};

const buildCreateAudit = (quote) => ({
  summary: `Orcamento criado com ${quoteItemCount(quote)} item(ns) e total ${formatAuditCurrency(quote?.total)}.`,
  details: [
    quoteClientLabel(quote) ? `Cliente: ${quoteClientLabel(quote)}` : '',
    quote?.title ? `Projeto: ${quote.title}` : '',
    `Status: ${quote?.status || 'Rascunho'}`,
    `Total: ${formatAuditCurrency(quote?.total)}`,
  ].filter(Boolean),
});

const buildDeleteAudit = (quote) => ({
  summary: `Orcamento removido${quote?.title ? `: ${quote.title}` : ''}.`,
  details: [
    quoteClientLabel(quote) ? `Cliente: ${quoteClientLabel(quote)}` : '',
    quoteItemCount(quote) ? `Itens removidos: ${quoteItemCount(quote)}` : '',
    `Total final: ${formatAuditCurrency(quote?.total)}`,
  ].filter(Boolean),
});

const buildUpdateAudit = (previousQuote, nextQuote) => {
  const details = [];
  const previousClient = quoteClientLabel(previousQuote);
  const nextClient = quoteClientLabel(nextQuote);
  const previousTotal = Number(previousQuote?.total || 0);
  const nextTotal = Number(nextQuote?.total || 0);
  const previousItems = quoteItemCount(previousQuote);
  const nextItems = quoteItemCount(nextQuote);

  pushChangeDetail(details, (previousQuote?.title || '') !== (nextQuote?.title || ''), 'Projeto', previousQuote?.title, nextQuote?.title);
  pushChangeDetail(details, previousClient !== nextClient, 'Cliente', previousClient, nextClient);
  pushChangeDetail(details, (previousQuote?.category || '') !== (nextQuote?.category || ''), 'Categoria', previousQuote?.category, nextQuote?.category);
  pushChangeDetail(details, (previousQuote?.status || '') !== (nextQuote?.status || ''), 'Status', previousQuote?.status, nextQuote?.status);
  pushChangeDetail(details, (previousQuote?.approvalStatus || '') !== (nextQuote?.approvalStatus || ''), 'Aprovacao', previousQuote?.approvalStatus, nextQuote?.approvalStatus);
  pushChangeDetail(details, (previousQuote?.validUntil || '') !== (nextQuote?.validUntil || ''), 'Validade', previousQuote?.validUntil, nextQuote?.validUntil);
  if (previousItems !== nextItems) {
    details.push(`Itens: ${previousItems} -> ${nextItems}`);
  }
  if (Math.abs(previousTotal - nextTotal) >= 0.01) {
    details.push(`Total: ${formatAuditCurrency(previousTotal)} -> ${formatAuditCurrency(nextTotal)}`);
  }

  return {
    summary:
      details.length > 0
        ? `${details.length} ajuste(s) registrado(s) no orcamento.`
        : 'Dados gerais atualizados sem alteracoes estruturais detectadas.',
    details: details.slice(0, 6),
  };
};

const buildApprovalAudit = (previousQuote, nextQuote) => ({
  summary: `Aprovacao alterada para ${nextQuote?.approvalStatus || '--'}.`,
  details: [
    `De: ${previousQuote?.approvalStatus || '--'}`,
    `Para: ${nextQuote?.approvalStatus || '--'}`,
    quoteClientLabel(nextQuote) ? `Cliente: ${quoteClientLabel(nextQuote)}` : '',
    `Total: ${formatAuditCurrency(nextQuote?.total)}`,
  ].filter(Boolean),
});

export const getQuotes = () => {
  if (quotesCache) return quotesCache;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      quotesCache = JSON.parse(stored);
      return quotesCache;
    }
  } catch (error) {
    console.warn('Falha ao ler orçamentos, usando mocks.', error);
  }

  quotesCache = mockQuotes;
  return quotesCache;
};

export const createQuote = async (payload) => {
  const { subtotal, total } = computeTotals(payload.items, payload.discountValue, payload.taxRate);
  const user = getUserMeta();
  const now = new Date().toISOString();
  const quote = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdBy: user.name,
    createdByEmail: user.email,
    updatedBy: user.name,
    updatedByEmail: user.email,
    approvalStatus: payload.approvalStatus || 'Aguardando',
    source: 'local',
    subtotal,
    total,
  };

  if (hasQuoteSheetConfig) {
    try {
      const poNumber = await appendQuoteRow(quote);
      if (poNumber) quote.poNumber = poNumber;
    } catch (error) {
      console.warn('Falha ao salvar PO na planilha', error);
    }
  }

  const updated = [quote, ...getQuotes()];
  persist(updated);
  const audit = buildCreateAudit(quote);
  appendAuditEntry({
    action: 'create',
    poNumber: quote.poNumber,
    title: quote.title,
    clientCompany: quoteClientLabel(quote),
    userName: user.name,
    userEmail: user.email,
    source: quote.source,
    summary: audit.summary,
    details: audit.details,
  });
  return quote;
};

export const updateQuote = async (id, updates, fallbackQuote) => {
  let updatedQuote = null;
  let previousQuote = null;
  let previousPo = null;
  const user = getUserMeta();
  const now = new Date().toISOString();

  const applyUpdate = (quote) => {
    previousPo = quote?.poNumber || null;
    const nextPo =
      updates?.poNumber === undefined || updates?.poNumber === null || updates?.poNumber === ''
        ? quote?.poNumber
        : updates.poNumber;
    const merged = {
      ...quote,
      ...updates,
      poNumber: nextPo,
      createdBy: quote?.createdBy || user.name,
      createdByEmail: quote?.createdByEmail || user.email,
      updatedBy: user.name || quote?.updatedBy || '',
      updatedByEmail: user.email || quote?.updatedByEmail || '',
      updatedAt: now,
      source: quote?.source || updates?.source || 'local',
    };
    const { subtotal, total } = computeTotals(merged.items, merged.discountValue, merged.taxRate);
    return { ...merged, subtotal, total };
  };

  const quotes = getQuotes().map((quote) => {
    if (quote.id !== id) return quote;
    previousQuote = { ...quote };
    updatedQuote = applyUpdate(quote);
    return updatedQuote;
  });

  if (!updatedQuote) {
    const targetPo = updates?.poNumber || fallbackQuote?.poNumber;
    if (targetPo) {
      const matchIndex = quotes.findIndex((q) => q.poNumber && q.poNumber.toString() === targetPo.toString());
      if (matchIndex >= 0) {
        previousQuote = { ...quotes[matchIndex] };
        updatedQuote = applyUpdate(quotes[matchIndex]);
        quotes[matchIndex] = updatedQuote;
      } else {
        const base = fallbackQuote || { id, poNumber: targetPo };
        const seed = { ...base, id: base.id || id || crypto.randomUUID(), poNumber: targetPo };
        previousQuote = { ...seed };
        updatedQuote = applyUpdate(seed);
        quotes.unshift(updatedQuote);
      }
    } else if (fallbackQuote) {
      const seed = { ...fallbackQuote, id: fallbackQuote.id || id || crypto.randomUUID() };
      previousQuote = { ...seed };
      updatedQuote = applyUpdate(seed);
      quotes.unshift(updatedQuote);
    }
  }

  persist(quotes);

  if (hasQuoteSheetConfig && (updatedQuote?.poNumber || previousPo)) {
    try {
      await updateQuoteRow(updatedQuote, previousPo);
    } catch (error) {
      console.warn('Falha ao atualizar or??amento na planilha', error);
    }
  }

  if (updatedQuote) {
    const audit = buildUpdateAudit(previousQuote, updatedQuote);
    appendAuditEntry({
      action: 'update',
      poNumber: updatedQuote.poNumber,
      title: updatedQuote.title,
      clientCompany: quoteClientLabel(updatedQuote),
      userName: user.name,
      userEmail: user.email,
      source: updatedQuote.source,
      summary: audit.summary,
      details: audit.details,
    });
  }

  return updatedQuote;
};

export const updateQuoteApproval = async (quoteOrId, approvalStatus) => {
  const user = getUserMeta();
  const now = new Date().toISOString();
  const baseQuote = typeof quoteOrId === 'object' && quoteOrId ? quoteOrId : null;
  const id = baseQuote ? baseQuote.id : quoteOrId;
  const targetPo = baseQuote?.poNumber;
  let updatedQuote = null;
  let previousQuote = null;

  const quotes = getQuotes().map((quote) => {
    const matches =
      (id && quote.id === id) || (targetPo && quote.poNumber?.toString() === targetPo.toString());
    if (!matches) return quote;
    previousQuote = { ...quote };
    updatedQuote = {
      ...quote,
      approvalStatus,
      updatedBy: user.name || quote.updatedBy || '',
      updatedByEmail: user.email || quote.updatedByEmail || '',
      updatedAt: now,
    };
    return updatedQuote;
  });

  if (!updatedQuote && baseQuote) {
    previousQuote = { ...baseQuote };
    updatedQuote = {
      ...baseQuote,
      approvalStatus,
      updatedBy: user.name || baseQuote.updatedBy || '',
      updatedByEmail: user.email || baseQuote.updatedByEmail || '',
      updatedAt: now,
    };
    quotes.unshift(updatedQuote);
  }

  persist(quotes);

  if (hasQuoteSheetConfig) {
    const poNumber = updatedQuote?.poNumber || targetPo;
    if (poNumber) {
      try {
        await updateQuoteApprovalStatus(poNumber, approvalStatus);
      } catch (error) {
        console.warn('Falha ao atualizar aprovacao na planilha', error);
      }
    }
  }

  if (updatedQuote) {
    const audit = buildApprovalAudit(previousQuote, updatedQuote);
    appendAuditEntry({
      action: 'approval',
      poNumber: updatedQuote.poNumber,
      title: updatedQuote.title,
      clientCompany: quoteClientLabel(updatedQuote),
      userName: user.name,
      userEmail: user.email,
      source: updatedQuote.source,
      summary: audit.summary,
      details: audit.details,
    });
  }

  return updatedQuote;
};

export const duplicateQuote = (id) => {
  const original = getQuotes().find((quote) => quote.id === id);
  if (!original) return null;

  const clone = {
    ...original,
    id: crypto.randomUUID(),
    title: `${original.title} (cópia)`,
    status: 'Rascunho',
    createdAt: new Date().toISOString(),
    validUntil: original.validUntil,
  };

  const updated = [clone, ...getQuotes()];
  persist(updated);
  return clone;
};

export const deleteQuote = async (id, poNumber) => {
  const quotes = getQuotes();
  const quote =
    quotes.find((q) => q.id === id) ||
    (poNumber ? quotes.find((q) => q.poNumber?.toString() === poNumber.toString()) : null);
  const targetPo = poNumber || quote?.poNumber;
  const filtered = quotes.filter(
    (q) => q.id !== id && (!targetPo || q.poNumber?.toString() !== targetPo.toString()),
  );
  persist(filtered);
  if (hasQuoteSheetConfig && targetPo) {
    try {
      console.info('[quotes] deleting PO in sheet', { poNumber: targetPo, id });
      await deleteQuoteRow(targetPo);
    } catch (error) {
      console.warn('Falha ao remover or??amento da planilha', error);
    }
  }
  const user = getUserMeta();
  const audit = buildDeleteAudit(quote);
  appendAuditEntry({
    action: 'delete',
    poNumber: targetPo,
    title: quote?.title,
    clientCompany: quoteClientLabel(quote),
    userName: user.name,
    userEmail: user.email,
    source: quote?.source,
    summary: audit.summary,
    details: audit.details,
  });
  return filtered;
};

export const computeQuoteTotals = computeTotals;
