import assert from 'node:assert/strict';
import { test } from 'node:test';
import XLSX from 'xlsx';
import { buildFinancialWorkbook, selectFinancialQuotes } from '../src/utils/financialReport.js';
import { extractFinancialQuotes, linkFinancialInvoices, recoverFinancialDetails, sourceDate } from '../src/utils/financialExtraction.js';

const options = { start:'2026-01-01', end:'2026-12-31', cutoff:'2026-10-16', client:'Yara' };
const sample = { id:'fixture-quote', poNumber:'206', clientCompany:'Yara CUB1', createdAt:'2026-02-01', approvalStatus:'Aprovado', subtotal:6020, taxRate:0, total:6020, items:[{id:'diaria-tecnico',name:'Diária',type:'servicos',quantity:28,price:215,unit:'dia'}] };

test('date parser rejects invalid dates and accepts Excel serials', () => {
  assert.equal(sourceDate('2026-02-30'),null);
  assert.equal(sourceDate('31/01/2026'),'2026-01-31');
  assert.equal(sourceDate(46069),'2026-02-16');
});
test('selection ignores pagination, deduplicates client/PO and excludes rejection even when concluded', () => {
  const q = {...sample,poNumber:'0206'};
  assert.equal(selectFinancialQuotes([sample,q],options).length,1);
  assert.equal(selectFinancialQuotes([sample,{...q,id:'other',clientCompany:'Yara CUB2'}],options).length,2);
  assert.equal(selectFinancialQuotes([{...sample,approvalStatus:'Reprovado',condition:'Concluído'}],options).length,0);
  assert.equal(selectFinancialQuotes([{...sample,createdAt:'2026-12-01'}],options).length,0);
});
test('source extraction preserves raw statuses, separates client ID, quote UUID, PO and NF', () => {
  const book=XLSX.utils.book_new();
  const headers=['ID','PO','Data','Cliente','Assunto','Categoria','Valor','Status','Condição','Aprovação','Responsavel','Observação','Column1','NF','Data_Criação','Prazo_Dias','Data_Pagamento','Situação'];
  const row=[1,'206',46069,'Yara CUB1','Projeto','',6020,'Enviado','Enviado','Aprovado','','',JSON.stringify({data:sample}),64,46069,30,46099,'Pago'];
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,row]),'Processos_Orçamentos');
  const q=extractFinancialQuotes(book)[0];
  assert.equal(q.id,sample.id);assert.equal(q.clientId,1);assert.equal(q.poNumber,'206');assert.equal(q.financialMetadata.invoiceNumber,64);
  assert.equal(q.status,'Enviado');assert.equal(q.original.approvalStatus,'Aprovado');assert.equal(q.financialMetadata.dueAt,'2026-03-18');
});
test('recovery refuses a legacy version whose total differs', () => {
  const q={...sample,items:[]};
  const candidate={poNumber:'206',clientCompany:'Yara CUB1',source:'fixture legacy',totals:{Total:{value:6000},Material:{value:0},'Mão de Obra':{value:6000},Imposto:{value:0}},items:sample.items};
  const recovered=recoverFinancialDetails([q],[candidate])[0];assert.equal(recovered.recovery,undefined);assert.ok(recovered.recoveryIssues.length);
});
test('NF is never treated as PO and conflicting invoice mapping cannot approve a proposal', () => {
  const input={...sample,approvalStatus:'Aguardando',financialMetadata:{invoiceNumber:64}};
  const [q]=linkFinancialInvoices([input],[{number:'64',poNumbers:['105','106'],isYara:true,amount:100,issuedAt:'2026-03-01'}]);
  assert.equal(q.poNumber,'206');assert.equal(q.invoices.length,0);assert.ok(q.invoiceIssues.length);assert.equal(selectFinancialQuotes([q],options).length,0);
  assert.equal(selectFinancialQuotes([{...input,financialMetadata:{invoiceNumber:'Criar NF'}}],options).length,0);
});
test('a document from another period stays out of current monthly invoicing', async () => {
  const q={...sample,invoices:[{number:'old',amount:6020,issuedAt:'2025-12-20',source:'fixture old invoice',isYara:true}]};
  const {book}=await buildFinancialWorkbook([q],options);
  assert.equal(book.getWorksheet('Faturamento e Recebimentos').getRow(2).getCell(6).value,6020);
  assert.equal(book.getWorksheet('Indicadores Mensais').getRow(2).getCell(4).value,'Não informado');
});
test('monthly dates separate approval, execution, invoice and receipt, shared invoice counted once', async () => {
  const invoice={number:'64',amount:12040,issuedAt:'2026-04-05',source:'fixture invoice',isYara:true};
  const q={...sample,approvedAt:'2026-02-10',completedAt:'2026-03-10',invoices:[invoice],receipts:[{amount:6020,receivedAt:'2026-05-10',source:'fixture receipt'}]};
  const q2={...q,id:'second',poNumber:'207',receipts:[]};
  const {book}=await buildFinancialWorkbook([q,q2],options);const sheet=book.getWorksheet('Indicadores Mensais');
  assert.equal(sheet.getRow(3).getCell(2).value,12040);assert.equal(sheet.getRow(4).getCell(3).value,12040);
  assert.equal(sheet.getRow(5).getCell(4).value,12040);assert.equal(sheet.getRow(6).getCell(5).value,6020);
  const fiscal=book.getWorksheet('Faturamento e Recebimentos');assert.equal(fiscal.getRows(2,fiscal.rowCount-1).filter(r=>r.getCell(6).value!=null).length,1);
});
test('daily internal estimate is 125 and sale is 215, with no inferred cash payment', async () => {
  const {book}=await buildFinancialWorkbook([{...sample,financialMetadata:{paymentStatus:'Pago',paymentDateRaw:'2026-03-01'}}],options);
  const s=book.getWorksheet('Serviços e Mão de Obra').getRow(2);assert.equal(s.getCell(10).value,215);assert.equal(s.getCell(11).value,125);assert.equal(s.getCell(12).value,6020);assert.equal(s.getCell(13).value,3500);assert.equal(s.getCell(18).value,null);
  const summary=book.getWorksheet('Resumo Geral').getRow(2);assert.equal(summary.getCell(28).value,null);assert.equal(summary.getCell(18).value,null);
});
test('commercial tax stays outside cost column and missing costs remain explicit', async () => {
  const {book}=await buildFinancialWorkbook([{...sample,total:6381.2,taxRate:6},{...sample,id:'missing',poNumber:'208',items:[]}],options);
  const rows=book.getWorksheet('Impostos e Despesas').getRows(2,3);
  const commercial=rows.find(r=>r.getCell(3).value==='Acréscimo comercial');assert.equal(commercial.getCell(7).value,null);assert.equal(commercial.getCell(10).value,361.2);
  assert.equal(book.getWorksheet('Resumo Geral').getRow(3).getCell(25).value,null);assert.equal(book.getWorksheet('Resumo Geral').getRow(3).getCell(27).value,null);
});
