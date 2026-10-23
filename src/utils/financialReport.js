import ExcelJS from 'exceljs';
import { financialAnalysis, sourceDate, quoteKey } from './financialExtraction.js';
import { completeFinancialWorkbook } from './financialReportReconciliation.js';

const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export const reportDate = sourceDate;
export const financialState = (q) => {
  const values = [q.approvalStatus, q.status, q.condition, q.financialMetadata?.paymentStatus].map(norm);
  if (values.some((s) => /reprov|cancel|nao aprovado/.test(s))) return null;
  if (q.invoices?.some((i) => i.isYara !== false)) return 'Faturado';
  if (values.some((s) => /faturado|nf emitida/.test(s))) return 'Faturado';
  if (values.some((s) => /conclu|executado/.test(s))) return 'Concluído';
  if (values.some((s) => /em execu/.test(s))) return 'Em execução';
  if (values.some((s) => s === 'aprovado')) return 'Aprovado';
  const invoiceNumber = norm(q.financialMetadata?.invoiceNumber);
  if (invoiceNumber && !['-', 'criar nf', 'nao informado', 'pendente'].includes(invoiceNumber) && !q.invoiceIssues?.length) return 'Faturado';
  if (values.some((s) => /^(pago|recebido)$/.test(s)) && !q.invoiceIssues?.length) return 'Pago';
  return null;
};
export const selectFinancialQuotes = (quotes, options) => {
  const { start, end, cutoff, client = 'Yara', states } = options;
  if (!reportDate(start) || !reportDate(end) || !reportDate(cutoff) || start > end) throw new Error('Informe um período e uma data de corte válidos.');
  const seen = new Set();
  return quotes.filter((q) => {
    const dates = [q.createdAt, q.original?.date, q.approvedAt, q.completedAt, ...(q.invoices || []).map((i) => i.issuedAt), ...(q.receipts || []).filter((r) => r.source).map((r) => r.receivedAt)].map(reportDate);
    const state = financialState(q);
    const key = quoteKey(q);
    if (!q.id || seen.has(key) || !dates.some((d) => d && d >= start && d <= end && d <= cutoff) || !state || (states && !states.includes(state))) return false;
    if (!norm([q.clientCompany, q.clientName, q.clientId].join(' ')).includes(norm(client))) return false;
    seen.add(key);
    return true;
  });
};

// Explicit allowlists keep contacts, user identities and access information out of the audit base.
const quoteFields = ['id', 'poNumber', 'clientId', 'clientCompany', 'title', 'createdAt', 'approvalStatus', 'status', 'condition', 'subtotal', 'total', 'totalNumber', 'discountValue', 'taxRate', 'category'];
const itemFields = ['id', 'sku', 'type', 'name', 'quantity', 'unit', 'price', 'realCost', 'source'];
const category = (i) => {
  const id = norm(i.id || i.sku);
  if (['diaria-tecnico', 'diaria-tec', 'diaria-fusao'].includes(id)) return 'Diárias de técnicos de infraestrutura';
  if (id === 'acompanhamento') return 'Acompanhamento ou visitas técnicas do sócio';
  return 'Não informado';
};

export async function buildFinancialWorkbook(quotes, options) {
  const selected = selectFinancialQuotes(quotes, options);
  const book = new ExcelJS.Workbook();
  const add = (name, headers) => {
    const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    headers.forEach((h, i) => {
      sheet.getColumn(i + 1).width = Math.min(48, Math.max(18, h.length + 2));
      if (/^(Valor|Custo|Resultado|Impostos|Saldo|Diferença|Demais)/.test(h)) sheet.getColumn(i + 1).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (/Margem|Percentual/.test(h)) sheet.getColumn(i + 1).numFmt = '0.00%';
      if (/^Data/.test(h)) sheet.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
    });
    return sheet;
  };
  const summary = add('Resumo Geral', ['ID', 'PO', 'Cliente', 'Unidade', 'Projeto', 'Descrição', 'Data de criação', 'Data de aprovação', 'Data de início', 'Data de conclusão', 'Status comercial', 'Status de execução', 'Status de faturamento', 'Status de pagamento', 'Número da NF', 'Data de emissão da NF', 'Data de vencimento', 'Data de recebimento', 'Valor total de venda', 'Custo de materiais', 'Custo de serviços e mão de obra', 'Custo de equipamentos e terceiros', 'Custo de despesas operacionais', 'Impostos estimados', 'Custo total orçado', 'Resultado estimado', 'Margem do sistema', 'Valor recebido', 'Saldo a receber']);
  const materials = add('Materiais Detalhados', ['ID', 'PO', 'ID item', 'Descrição', 'Quantidade', 'Unidade', 'Custo unitário original', 'Custo unitário estimado utilizado', 'Percentual de acréscimo', 'Valor unitário de venda', 'Custo total estimado', 'Valor total de venda', 'Diferença', 'Origem do custo']);
  // Excel limits worksheet names to 31 characters.
  const services = add('Serviços e Mão de Obra', ['ID', 'PO', 'ID item', 'Descrição', 'Quantidade', 'Unidade', 'Número de técnicos', 'Dias', 'Total de diárias', 'Valor unitário de venda', 'Custo unitário estimado', 'Valor total cobrado', 'Custo total estimado', 'Diferença', 'Categoria', 'Origem do custo']);
  add('Impostos e Despesas', ['ID', 'PO', 'Tipo', 'Descrição', 'Base de cálculo', 'Percentual aplicado', 'Valor estimado', 'Valor efetivamente pago', 'Classificação']);
  add('Faturamento e Recebimentos', ['ID', 'PO', 'Cliente', 'Número da NF', 'Data de emissão', 'Valor da NF', 'Data prevista de pagamento', 'Data de recebimento', 'Valor recebido', 'Valor pendente', 'Status do pagamento']);
  add('Pendências e Execução', ['ID', 'PO', 'Cliente', 'Projeto', 'Situação', 'Valor do contrato', 'Custo estimado', 'Margem estimada', 'Data de conclusão', 'Observações']);
  add('Indicadores Mensais', ['Mês', 'Valor aprovado', 'Valor concluído', 'Valor de NF emitida', 'Valor recebido', 'Valor pendente de faturamento', 'Valor pendente de recebimento', 'Custo de materiais', 'Custo de mão de obra', 'Demais custos e impostos', 'Resultado estimado', 'Margem estimada']);
  const raw = add('Base de Dados Completa', ['Entidade', 'ID orçamento', 'PO', 'Índice item', 'Campo', 'Valor']);
  add('Dicionário e Validações', ['Tipo', 'ID ou campo', 'Descrição']);
  for (const q of selected) {
    const a = financialAnalysis(q);
    const state = financialState(q);
    const metadata = q.financialMetadata || {};
    const executionText = norm([q.condition, q.status].join(' '));
    const execution = /conclu|executado/.test(executionText) ? 'Concluído' : /em execu/.test(executionText) ? 'Em execução' : 'Não informado';
    summary.addRow([q.id, q.poNumber, q.clientCompany || q.clientName, q.clientCompany, q.title, q.scope, reportDate(q.createdAt) ? new Date(`${reportDate(q.createdAt)}T00:00:00Z`) : null, null, null, null, q.approvalStatus || q.status, execution, state === 'Faturado' ? state : 'Não informado', state === 'Pago' ? state : 'Não informado', null, null, null, null, a.revenue, a.materialCost, a.serviceCost, null, null, a.actualTaxCost, a.estimatedCost, a.estimatedProfit, a.ready ? a.estimatedMarginPct / 100 : null, null, null]);
    summary.getRow(summary.rowCount).getCell(15).value = metadata.invoiceNumber || null;
    if (metadata.invoiceNumber) summary.getRow(summary.rowCount).getCell(13).value = 'NF informada';
    if (metadata.paymentStatus) summary.getRow(summary.rowCount).getCell(14).value = metadata.paymentStatus;
    ['invoiceNumber', 'paymentStatus', 'creationDateRaw', 'paymentDateRaw'].forEach((field) => { const value = metadata[field]; if (value !== '' && value != null) raw.addRow(['metadado financeiro', q.id, q.poNumber, null, field, value]); });
    let mi = 0, si = 0;
    a.items.forEach((item, index) => {
      const d = item.type === 'materiais' ? a.materialDetails?.[mi++] : item.type === 'servicos' ? a.serviceDetails?.[si++] : null;
      if (d && item.type === 'materiais') materials.addRow([q.id, q.poNumber, item.id, item.name, item.quantity, item.unit, null, item.quantity ? d.realCost / item.quantity : null, item.realCost != null && Number(item.realCost) > 0 ? Number(item.price) / Number(item.realCost) - 1 : null, item.price, d.realCost, d.billed, d.difference, d.note]);
      if (d && item.type === 'servicos') services.addRow([q.id, q.poNumber, item.id, item.name, item.quantity, item.unit, null, null, category(item).startsWith('Diárias') ? item.quantity : null, item.price, item.quantity ? d.realCost / item.quantity : null, d.billed, d.realCost, d.difference, category(item), d.note]);
      itemFields.forEach((f) => { if (item[f] != null) raw.addRow(['item', q.id, q.poNumber, index, f, item[f]]); });
    });
    quoteFields.forEach((f) => { if (q[f] != null) raw.addRow(['orçamento', q.id, q.poNumber, null, f, q[f]]); });
  }
  const report = completeFinancialWorkbook(book, quotes, selected, options);
  const personalValues = selected.flatMap((q) => ['clientEmail', 'clientPhone', 'contactName', 'contactPhone', 'contactEmail', 'createdBy', 'createdByEmail', 'updatedBy', 'updatedByEmail'].map((f) => q[f])).filter((v) => typeof v === 'string' && v.length > 3);
  book.worksheets.forEach((s) => {
    s.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, s.rowCount), column: s.columnCount } };
    s.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value !== 'string') return;
      let value = cell.value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[contato removido]').replace(/(?:\+55\s*)?\(?\d{2}\)?\s*\d{4,5}[-\s]\d{4}\b/g, '[telefone removido]');
      personalValues.forEach((personal) => { value = value.split(personal).join('[dado pessoal removido]'); });
      cell.value = value;
    }));
  });
  return { book, selected, ...report };
}

export async function downloadFinancialReport(quotes, options) {
  const { book, selected } = await buildFinancialWorkbook(quotes, options);
  if (!selected.length) throw new Error('Nenhum orçamento atende aos filtros financeiros. Confira o período, o cliente e os filtros da tela.');
  const blob = new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const period = options.start.slice(0, 4) === options.end.slice(0, 4) ? options.start.slice(0, 4) : `${options.start}_${options.end}`;
  a.download = `Relatorio_Financeiro_${(options.client || 'Todos').replace(/[^\p{L}\p{N}_-]/gu, '_')}_${period}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return selected.length;
}
