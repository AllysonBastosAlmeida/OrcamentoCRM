import * as XLSX from 'xlsx/xlsx.mjs';
import { calculateQuoteProfitability } from './profitability.js';

export const normalizeFinancialText = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export const canonicalNumber = (value) => /^\d+$/.test(String(value ?? '').trim()) ? String(Number(value)) : String(value ?? '').trim();
export const financialNumber = (value) => {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number.isFinite(Number(s)) ? Number(s) : null;
};
export const sourceDate = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const text = String(value);
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : null;
};
export const quoteKey = (q) => `${normalizeFinancialText(q.clientCompany)}|${canonicalNumber(q.poNumber) || q.id}`;
const cents = (v) => Math.round(Number(v) * 100);
const parseDetails = (value) => {
  try { const parsed = JSON.parse(String(value).replace(/^'/, '')); return parsed.data || parsed; } catch { return {}; }
};

// Only the process sheet is authoritative for status; backup sheets never resurrect deleted quotes.
export function extractFinancialQuotes(workbook, source = 'Orçamento Web.xlsx') {
  const name = workbook.SheetNames.find((n) => normalizeFinancialText(n) === 'processos_orcamentos');
  if (!name) throw new Error('A fonte não contém Processos_Orçamentos. Exportação interrompida.');
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const head = rows.findIndex((r) => r.some((v) => normalizeFinancialText(v) === 'po') && r.some((v) => normalizeFinancialText(v) === 'cliente'));
  if (head < 0) throw new Error('Cabeçalhos financeiros não encontrados.');
  const headers = rows[head].map(normalizeFinancialText);
  const idx = (...keys) => headers.findIndex((h) => keys.includes(h));
  return rows.slice(head + 1).flatMap((r, offset) => {
    if (!r[idx('po')]) return [];
    const row = head + offset + 2;
    const get = (...keys) => r[idx(...keys)] ?? null;
    const detailIndex = idx('detalhes', 'dados', 'json', 'payload', 'column1');
    const detail = parseDetails(r[detailIndex < 0 ? 12 : detailIndex]);
    const tablePO = get('po');
    const cell = (...keys) => sheet[XLSX.utils.encode_cell({ r: row - 1, c: idx(...keys) })];
    const original = {
      source, sheet: name, row, quoteId: detail.id || null, clientId: get('id'),
      poNumber: tablePO, detailPO: detail.poNumber ?? null,
      date: get('data'), detailCreatedAt: detail.createdAt ?? null,
      total: get('valor'), detailTotal: detail.total ?? null,
      status: get('status'), condition: get('condicao'), approvalStatus: get('aprovacao'),
      detailStatus: detail.status ?? null, detailApproval: detail.approvalStatus ?? null,
      clientCompany: get('cliente'), detailCompany: detail.clientCompany ?? null,
    };
    const total = financialNumber(detail.total) ?? financialNumber(get('valor'));
    return [{ ...detail, id: detail.id || `fonte:${name}:${row}`, poNumber: tablePO,
      clientCompany: get('cliente') || detail.clientCompany || '', clientId: get('id'),
      title: get('assunto') || detail.title || '', createdAt: detail.createdAt || sourceDate(get('data')),
      total, totalNumber: total, items: Array.isArray(detail.items) ? detail.items : [],
      status: get('status'), condition: get('condicao'), approvalStatus: get('aprovacao'),
      notes: get('observacao') || detail.notes || '', original,
      financialMetadata: { invoiceNumber: get('nf'), paymentStatus: get('situacao'),
        creationDateRaw: get('data_criacao'), paymentDateRaw: get('data_pagamento'),
        paymentDateFormula: cell('data_pagamento')?.f || null, termDays: get('prazo_dias'),
        // A formula or an exact base + term match proves this is scheduled, never actual receipt.
        dueAt: cell('data_pagamento')?.f || (financialNumber(get('data_criacao')) != null && financialNumber(get('prazo_dias')) != null && financialNumber(get('data_pagamento')) === financialNumber(get('data_criacao')) + financialNumber(get('prazo_dias'))) ? sourceDate(get('data_pagamento')) : null,
      },
    }];
  });
}

// Extract cached source values only. External links, TODAY() and legacy formulas are never recalculated.
export function extractLegacyQuote(workbook, source) {
  const sheet = workbook.Sheets['Orçamento'];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const totals = {};
  rows.forEach((r, index) => {
    if (['Material', 'Mão de Obra', 'Imposto', 'Total'].includes(r[4])) totals[r[4]] = { value: financialNumber(r[5]), cell: `F${index + 1}`, formula: sheet[`F${index + 1}`]?.f || null };
  });
  const poNumber = sheet.G6?.v;
  const clientCompany = sheet.F1?.v;
  const items = [];
  for (let row = 14; row <= rows.length; row++) {
    const r = rows[row - 1];
    const type = normalizeFinancialText(r[6]);
    if (!['materiais', 'servicos'].includes(type) || !r[1] || !financialNumber(r[5])) continue;
    const billed = financialNumber(r[9]);
    items.push({ id: `legado:${row}`, name: r[1], quantity: financialNumber(r[5]), unit: r[4], type,
      price: billed == null ? null : billed / financialNumber(r[5]), billed,
      source: 'legacy', sourceCell: `Orçamento!J${row}`, sourceFormula: sheet[`J${row}`]?.f || null });
  }
  const costSheet = workbook.Sheets.Imposto_Diaria;
  for (const [row, id, category] of [[6, 'diaria-fusao', 'Fusão'], [7, 'diaria-tecnico', 'Diárias de técnicos'], [8, 'diaria-som', 'Diárias de som'], [9, 'acompanhamento', 'Acompanhamento do sócio']]) {
    const quantity = financialNumber(costSheet?.[`B${row}`]?.v);
    const billed = financialNumber(costSheet?.[`E${row}`]?.v);
    if (!quantity || billed == null) continue;
    items.push({ id, name: costSheet[`A${row}`].v, quantity, unit: 'diária', type: 'servicos',
      price: billed / quantity, billed, source: 'legacy', category,
      sourceCell: `Imposto_Diaria!E${row}`, sourceFormula: costSheet[`E${row}`].f || null });
  }
  return { poNumber, clientCompany, source, totals, items };
}

export function recoverFinancialDetails(quotes, candidates) {
  return quotes.map((q) => {
    if (q.items?.length) return q;
    const matches = candidates.filter((c) => c && canonicalNumber(c.poNumber) === canonicalNumber(q.poNumber) && normalizeFinancialText(c.clientCompany) === normalizeFinancialText(q.clientCompany));
    const valid = matches.filter((c) => c.totals.Total?.value != null && cents(c.totals.Total.value) === cents(q.total) && c.totals.Material?.value != null && c.totals['Mão de Obra']?.value != null && cents(c.totals.Material.value + c.totals['Mão de Obra'].value + c.totals.Imposto.value) === cents(q.total));
    if (valid.length !== 1) return { ...q, recoveryIssues: matches.map((c) => `Fonte ${c.source}: total ${c.totals.Total?.value ?? 'ausente'}; CRM ${q.total}. Versão sem composição conciliada; custos não preenchidos.`) };
    const recovery = valid[0];
    const sum = recovery.items.reduce((s, i) => s + (i.billed ?? 0), 0);
    if (Math.abs(cents(sum) - cents(recovery.totals.Material.value + recovery.totals['Mão de Obra'].value)) > 1) return { ...q, recoveryIssues: [`${recovery.source}: soma dos itens não concilia com a composição original.`] };
    return { ...q, recovery };
  });
}

// Invoice numbers remain distinct from PO. Multiple POs may relate to a single document.
export function linkFinancialInvoices(quotes, invoices) {
  const byNumber = new Map();
  invoices.forEach((invoice) => {
    const key = canonicalNumber(invoice.number);
    if (!byNumber.has(key)) byNumber.set(key, invoice);
  });
  return quotes.map((q) => {
    const number = canonicalNumber(q.financialMetadata?.invoiceNumber);
    const registered = byNumber.get(number);
    const matched = [...byNumber.values()].filter((i) => i.poNumbers?.includes(canonicalNumber(q.poNumber)) || (!i.poNumbers && number && canonicalNumber(i.number) === number));
    const issues = matched.filter((i) => !i.isYara).map((i) => `NF ${i.number} cadastrada pertence a outro tomador; não comprova faturamento Yara.`);
    if (registered?.poNumbers && !registered.poNumbers.includes(canonicalNumber(q.poNumber))) issues.push(`NF ${number} cadastrada vincula-se aos POs ${registered.poNumbers.join(', ')} na conferência documental, e não ao PO ${q.poNumber}.`);
    return { ...q, invoices: matched.filter((i) => i.isYara), invoiceIssues: issues };
  });
}

export function financialAnalysis(q) {
  const items = q.items?.length ? q.items : q.recovery?.items || [];
  const a = calculateQuoteProfitability({ ...q, items });
  const recovered = !q.items?.length && Boolean(q.recovery);
  const missingMaterial = items.some((i) => i.type === 'materiais' && financialNumber(i.price) == null);
  const complete = a.ready && !missingMaterial;
  return { ...a, items, recovered, complete,
    materialCost: missingMaterial ? null : a.materialCost,
    estimatedCost: complete ? a.estimatedCost : null,
    estimatedProfit: complete ? a.estimatedProfit : null,
    estimatedMarginPct: complete ? a.estimatedMarginPct : null,
    quality: recovered ? complete ? 'Recuperado; estimativa pelas regras do CRM' : 'Recuperação parcial; preços de materiais ausentes' : complete ? 'Estimativa do CRM; não é desembolso' : 'Ausente: itens e custos sem composição conciliada',
  };
}

export function attachFinancialSummaries(quotes, summaries) {
  return quotes.map((q) => {
    const matching = summaries.find((s) => canonicalNumber(s.poNumber) === canonicalNumber(q.poNumber) && normalizeFinancialText(s.clientCompany) === normalizeFinancialText(q.clientCompany) && cents(s.total) === cents(q.total));
    return matching ? { ...q, financialSummary: matching } : q;
  });
}
