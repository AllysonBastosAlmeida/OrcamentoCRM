import mockQuotes from '../data/mockQuotes.js';
import { appendQuoteRow, deleteQuoteRow, hasQuoteSheetConfig, updateQuoteRow } from './quoteSheet.js';

const STORAGE_KEY = 'crm-orcamentos:quotes';
let quotesCache = null;

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
  const quote = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
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
  return quote;
};

export const updateQuote = async (id, updates) => {
  let updatedQuote = null;
  const quotes = getQuotes().map((quote) => {
    if (quote.id !== id) return quote;
    const merged = { ...quote, ...updates };
    const { subtotal, total } = computeTotals(merged.items, merged.discountValue, merged.taxRate);
    updatedQuote = { ...merged, subtotal, total };
    return updatedQuote;
  });
  persist(quotes);

  if (hasQuoteSheetConfig && updatedQuote?.poNumber) {
    try {
      await updateQuoteRow(updatedQuote);
    } catch (error) {
      console.warn('Falha ao atualizar orçamento na planilha', error);
    }
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

export const deleteQuote = async (id) => {
  const quote = getQuotes().find((q) => q.id === id);
  const filtered = getQuotes().filter((q) => q.id !== id);
  persist(filtered);
  if (hasQuoteSheetConfig && quote?.poNumber) {
    try {
      console.info('[quotes] deleting PO in sheet', { poNumber: quote.poNumber, id: quote.id });
      await deleteQuoteRow(quote.poNumber);
    } catch (error) {
      console.warn('Falha ao remover orçamento da planilha', error);
    }
  }
  return filtered;
};

export const computeQuoteTotals = computeTotals;
