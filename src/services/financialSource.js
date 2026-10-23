import axios from 'axios';
import * as XLSX from 'xlsx/xlsx.mjs';
import { acquireToken } from '../auth.js';
import evidence from '../data/financialEvidence.json';
import { extractFinancialQuotes, extractLegacyQuote, recoverFinancialDetails, linkFinancialInvoices, attachFinancialSummaries } from '../utils/financialExtraction.js';

// This path deliberately bypasses UI pagination, normalized hook statuses and quote persistence.
export async function loadFinancialSource() {
  const drive = import.meta.env.VITE_GRAPH_DRIVE_ID_ORCAMENTOS || import.meta.env.VITE_GRAPH_DRIVE_ID;
  const item = import.meta.env.VITE_GRAPH_ITEM_ORCAMENTOS;
  if (!drive || !item) throw new Error('Configure a fonte original dos orçamentos para exportar a base completa.');
  const token = await acquireToken();
  const getBytes = async (url) => {
    const metadata = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    const downloadUrl = metadata.data?.['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) throw new Error('Fonte sem URL de leitura disponível.');
    // Signed download URL is used only in memory; never exported or persisted.
    return (await axios.get(downloadUrl, { responseType: 'arraybuffer' })).data;
  };
  const mainSource = `https://graph.microsoft.com/v1.0/drives/${drive}/items/${item}`;
  const main = XLSX.read(await getBytes(mainSource), { type: 'array' });
  let quotes = extractFinancialQuotes(main, 'Orçamento Web.xlsx / Processos_Orçamentos');
  const sourceIssues = [];
  const originals = [];
  for (const original of evidence.originals) {
    try { originals.push(extractLegacyQuote(XLSX.read(await getBytes(original.source), { type: 'array' }), original.title)); }
    catch { sourceIssues.push(`Não foi possível conferir a fonte complementar ${original.title}. Custos não recuperados por essa fonte.`); }
  }
  const invoices = [];
  const seen = new Set();
  for (const invoice of evidence.invoices) {
    if (seen.has(invoice.number)) continue;
    seen.add(invoice.number);
    try {
      const bytes = await getBytes(invoice.source);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (hash !== invoice.sha256) throw new Error('Documento alterado');
      invoices.push(invoice);
    } catch {
      sourceIssues.push(`NF ${invoice.number}: documento indisponível ou alterado desde a conferência. Valor e emissão não utilizados.`);
    }
  }
  quotes = linkFinancialInvoices(recoverFinancialDetails(quotes, originals), invoices);
  const summaries = [];
  for (const summary of evidence.summaries || []) {
    try {
      const bytes = await getBytes(summary.source);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (hash !== summary.sha256) throw new Error('Documento alterado');
      summaries.push(summary);
    } catch { sourceIssues.push(`PO ${summary.poNumber}: PDF da composição indisponível ou alterado; resumo não utilizado.`); }
  }
  quotes = attachFinancialSummaries(quotes, summaries);
  return { quotes, sourceIssues, sourceLabel: `Leitura integral do SharePoint em ${new Date().toISOString()}; documentos complementares conferidos por SHA-256.` };
}
