import { financialAnalysis, sourceDate, financialNumber as num, canonicalNumber, normalizeFinancialText as norm, quoteKey } from './financialExtraction.js';

const money = (v) => v == null ? null : Number(Number(v).toFixed(2));
const sum = (values) => money(values.reduce((s, v) => s + (num(v) || 0), 0));
const date = (v) => sourceDate(v) ? new Date(`${sourceDate(v)}T00:00:00Z`) : null;
const inPeriod = (d, o) => sourceDate(d) && sourceDate(d) >= o.start && sourceDate(d) <= o.end && sourceDate(d) <= o.cutoff;

export function completeFinancialWorkbook(book, quotes, selected, options) {
  const add = (name, headers) => {
    const existing = book.getWorksheet(name);
    const order = existing?.orderNo;
    if (existing) book.removeWorksheet(existing.id);
    const s = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    if (order != null) s.orderNo = order;
    s.getRow(1).values = headers;
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    headers.forEach((h, i) => {
      const col = s.getColumn(i + 1); col.width = Math.min(55, Math.max(18, h.length + 2));
      if (/^(Valor|Custo|Resultado|Impostos|Saldo|Diferença|Demais|Receita|Acréscimo|Venda|Base de cálculo)/.test(h)) col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (/Margem|Percentual/.test(h)) col.numFmt = '0.00%';
      if (/^Data/.test(h)) col.numFmt = 'dd/mm/yyyy';
    });
    return s;
  };
  const summary = book.getWorksheet('Resumo Geral');
  summary.getRow(1).values = [...summary.getRow(1).values.slice(1), 'Cobertura dos custos', 'Status original', 'Valor original da tabela', 'Valor original do JSON', 'Data original da tabela', 'ID original do orçamento', 'ID cliente', 'NF comprovada', 'Fonte'];
  summary.getRow(1).getCell(11).value = 'Aprovação original';
  summary.getRow(1).getCell(12).value = 'Condição original';
  summary.getRow(1).getCell(14).value = 'Situação de pagamento cadastral';
  for (let column = 30; column <= 38; column++) summary.getColumn(column).width = column === 30 || column === 38 ? 50 : 24;
  summary.getColumn(34).numFmt = 'dd/mm/yyyy';
  for (const column of [32,33]) summary.getColumn(column).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const reconciliation = add('Conciliação', ['ID', 'PO', 'Cliente', 'Valor de venda', 'Valor materiais na venda', 'Valor serviços na venda', 'Custo materiais estimado', 'Custo diárias técnicas estimado', 'Receita diárias técnicas', 'Quantidade diárias técnicas', 'Custo outras diárias estimado', 'Custo acompanhamento estimado', 'Custo demais serviços estimado', 'Custo total serviços estimado', 'Impostos estimados como custo', 'Custo total estimado', 'Resultado estimado', 'Margem estimada', 'Acréscimo comercial embutido', 'Valor itens com desconto e acréscimo', 'Diferença venda e composição', 'Cobertura', 'Dados ausentes ou divergentes', 'Fonte da composição']);
  const issues = add('Inconsistências', ['ID', 'PO', 'Campo', 'Informação ausente, divergente ou não comprovada', 'Fonte']);
  const issue = (q, field, message, source) => issues.addRow([q?.id || null, q?.poNumber || null, field, message, source || q?.original?.source || 'Fonte do orçamento']);
  const expenses = add('Impostos e Despesas', ['ID', 'PO', 'Tipo', 'Descrição', 'Base de cálculo', 'Percentual aplicado', 'Valor estimado como custo', 'Valor efetivamente pago', 'Classificação', 'Acréscimo comercial na venda', 'Tratamento', 'Origem']);
  const fiscal = add('Faturamento e Recebimentos', ['IDs orçamento vinculados', 'POs vinculados', 'Cliente', 'NF', 'Data emissão comprovada', 'Valor NF comprovado', 'Data prevista pagamento', 'Data efetiva recebimento', 'Valor recebido comprovado', 'Valor pendente comprovado', 'Status cadastral', 'Fonte verificável', 'Conciliação e limitações']);
  const monthly = add('Indicadores Mensais', ['Mês', 'Valor aprovado por aprovação', 'Valor concluído por conclusão', 'Valor NF por emissão comprovada', 'Valor recebido por data efetiva', 'Valor pendente faturamento por conclusão', 'Valor pendente recebimento por emissão', 'Custo materiais por criação', 'Custo mão de obra por criação', 'Demais custos e impostos por criação', 'Resultado estimado por criação', 'Margem da composição completa', 'Valor propostas elegíveis por criação', 'Quantidade propostas criadas', 'Quantidade composições completas', 'Valor propostas com custos incompletos', 'Quantidade NF comprovadas', 'Cobertura e limitações']);
  const dict = add('Dicionário e Validações', ['Tipo', 'Campo ou aba', 'Descrição']);
  const raw = book.getWorksheet('Base de Dados Completa');
  const pending = add('Pendências e Execução', book.getWorksheet('Pendências e Execução').getRow(1).values.slice(1));
  const analyses = new Map(); const docs = new Map();
  const detailRows = { materials: 2, services: 2 };
  for (const [index, q] of selected.entries()) {
    const a = financialAnalysis(q); analyses.set(q, a);
    const fm = q.financialMetadata || {};
    const invoices = (q.invoices || []).filter((i) => i.isYara !== false && sourceDate(i.issuedAt) && sourceDate(i.issuedAt) <= options.cutoff);
    invoices.forEach((i) => { const key = canonicalNumber(i.number); if (!docs.has(key)) docs.set(key, { ...i, quotes: [] }); docs.get(key).quotes.push(q); });
    const receipts = (q.receipts || []).filter((r) => r.source && num(r.amount) != null && sourceDate(r.receivedAt) && sourceDate(r.receivedAt) <= options.cutoff);
    const row = summary.getRow(index + 2);
    for (const [col, value] of [[7,date(q.createdAt)],[8,date(q.approvedAt)],[9,date(q.startedAt)],[10,date(q.completedAt)],[11,q.approvalStatus],[12,q.condition],[13,invoices.length ? 'NF comprovada por documento' : 'Não comprovado'],[14,fm.paymentStatus || null],[16,invoices.length === 1 ? date(invoices[0].issuedAt) : null],[17,date(fm.dueAt)],[18,receipts.length === 1 ? date(receipts[0].receivedAt) : null],[20,a.materialCost],[21,a.serviceCost],[24,a.actualTaxCost],[25,a.estimatedCost],[26,a.estimatedProfit],[27,a.complete ? a.estimatedMarginPct / 100 : null],[28,receipts.length ? sum(receipts.map((r) => r.amount)) : null],[29,null],[30,a.quality],[31,q.status],[32,num(q.original?.total)],[33,num(q.original?.detailTotal)],[34,date(q.original?.date)],[35,q.original?.quoteId || null],[36,q.clientId],[37,invoices.map((i) => i.number).join(', ') || null],[38,q.original?.source || options.sourceLabel]]) row.getCell(col).value = value ?? null;
    const missing = [];
    if (!a.complete) missing.push('Custos totais, resultado e margem indisponíveis; composição ausente ou parcial');
    if (!sourceDate(q.approvedAt)) missing.push('Data de aprovação ausente');
    if (!sourceDate(q.completedAt)) missing.push('Data de conclusão ausente');
    if (!receipts.length) missing.push('Recebimento sem fonte, valor e data efetivos');
    if (!invoices.length) missing.push('Sem documento fiscal conciliado');
    missing.forEach((message) => issue(q, 'Ausência', message));
    if (q.original && !q.original.quoteId) issue(q, 'ID', 'UUID original não salvo. ID técnico da linha usado no relatório. ID da coluna da tabela identifica o cliente.');
    if (q.original?.detailPO != null && canonicalNumber(q.original.detailPO) !== canonicalNumber(q.poNumber)) issue(q, 'PO', `PO tabela ${q.poNumber}; PO JSON ${q.original.detailPO}. Mantido PO da tabela, nunca NF.`);
    if (num(q.original?.total) != null && num(q.original?.detailTotal) != null && money(q.original.total) !== money(q.original.detailTotal)) issue(q, 'Venda', `Tabela ${q.original.total}; JSON ${q.original.detailTotal}. Ambos preservados. Rentabilidade usa JSON como a interface.`);
    if (sourceDate(q.original?.date) && sourceDate(q.createdAt) !== sourceDate(q.original.date)) issue(q, 'Criação', `Tabela ${sourceDate(q.original.date)}; JSON ${sourceDate(q.createdAt)}. Datas originais preservadas.`);
    if (/rascunho/.test(norm([q.status,q.condition].join(' ')))) issue(q, 'Status conflitante', 'Rascunho com aprovação explícita ou NF; incluído pela evidência, mantendo status original.');
    if (norm(fm.paymentStatus) === 'pago' && !receipts.length) issue(q, 'Pago sem comprovação', 'Status Pago não prova recebimento. Nenhum valor recebido contabilizado a partir desse status.');
    if (fm.paymentDateRaw) issue(q, 'Data_Pagamento', fm.dueAt ? 'Previsão: data-base + prazo; não é recebimento.' : 'Significado não comprovado; preservado somente como dado bruto.');
    if (!fm.invoiceNumber && invoices.length) issue(q, 'NF ausente no cadastro', `Documento conciliado encontrado: NF ${invoices.map((i) => i.number).join(', ')}. Fonte não alterada.`);
    if (fm.invoiceNumber && invoices.length && !invoices.some((i) => canonicalNumber(i.number) === canonicalNumber(fm.invoiceNumber))) issue(q, 'Vínculo NF divergente', `Cadastro NF ${fm.invoiceNumber}; documentos conciliados ${invoices.map((i) => i.number).join(', ')}.`);
    [...(q.recoveryIssues || []), ...(q.invoiceIssues || []), ...(a.gaps || [])].forEach((message) => issue(q, 'Composição ou fonte', message));
    if (q.financialSummary) {
      issue(q, 'Composição parcial do PDF', q.financialSummary.limitation, q.financialSummary.source);
      ['materialRevenue','serviceRevenue','subtotal','commercialTax','total'].forEach((f) => raw.addRow(['resumo de venda do PDF',q.id,q.poNumber,null,f,q.financialSummary[f],q.financialSummary.source]));
    }
    if (a.recovered) issue(q, 'Recuperação', `Composição extraída de ${q.recovery.source}; somente relatório, sem gravação no orçamento. Custos pelas premissas do CRM.`, q.recovery.source);
    const components = { tech:0,techSale:0,techQty:0,other:0,partner:0,rest:0 }; let si = 0;
    a.items.forEach((item) => {
      const hasPrice = num(item.price) != null;
      const s = item.type === 'materiais' ? book.getWorksheet('Materiais Detalhados').getRow(detailRows.materials++) : item.type === 'servicos' ? book.getWorksheet('Serviços e Mão de Obra').getRow(detailRows.services++) : null;
      if (s) {
        if (!hasPrice) {
          s.getCell(10).value = null; s.getCell(12).value = null; s.getCell(13).value = item.type === 'materiais' ? null : s.getCell(13).value;
          s.getCell(14).value = item.type === 'materiais' ? s.getCell(14).value : null;
          if (item.type === 'materiais') { s.getCell(8).value = null; s.getCell(11).value = null; }
          issue(q, 'Preço ausente', `Item ${item.name}: preço vazio no arquivo original; não convertido para zero no detalhamento.`, item.sourceCell);
        }
        if (item.type === 'materiais') s.getCell(15).value = item.sourceCell ? `${q.recovery.source}: ${item.sourceCell}` : 'quote.items';
        if (item.type === 'servicos') {
          const d = a.serviceDetails[si++]; const id = norm(item.id || item.sku);
          const group = ['diaria-tecnico','diaria-tec'].includes(id) ? 'tech' : ['diaria-fusao','diaria-som'].includes(id) ? 'other' : id === 'acompanhamento' ? 'partner' : 'rest';
          components[group] += d.realCost;
          if (group === 'tech') { components.techSale += d.billed; components.techQty += Number(item.quantity); }
          s.getCell(15).value = { tech:'Diárias de técnicos',other:'Outras diárias',partner:'Acompanhamento do sócio',rest:'Outros serviços; classificação não comprovada' }[group];
          s.getCell(16).value = `${d.note}; formação de preço, não desembolso efetivo`;
          s.getCell(17).value = item.sourceCell ? `${q.recovery.source}: ${item.sourceCell}` : 'quote.items';
          s.getCell(18).value = null;
        }
      }
      if (item.sourceCell) raw.addRow(['item recuperado',q.id,q.poNumber,null,item.sourceCell,item.billed,q.recovery.source]);
      if (item.sourceFormula) raw.addRow(['fórmula original recuperada',q.id,q.poNumber,null,item.sourceCell,item.sourceFormula,q.recovery.source]);
      if (item.type === 'materiais' && /instala|configura/.test(norm(item.name))) issue(q, 'Categoria original', `${item.name} classificado como material na fonte. Classificação preservada.`);
    });
    const totals = q.recovery?.totals;
    const base = totals ? totals.Material.value + totals['Mão de Obra'].value : q.financialSummary?.subtotal ?? (num(q.subtotal) != null ? num(q.subtotal) - (num(q.discountValue) || 0) : null);
    const commercial = totals ? totals.Imposto.value : q.financialSummary?.commercialTax ?? (base != null && num(q.taxRate) != null ? money(base * num(q.taxRate) / 100) : null);
    if (a.actualTaxCost != null) expenses.addRow([q.id,q.poNumber,'Custo estimado','Premissa da rentabilidade; sem comprovação de pagamento',a.revenue,0.02,a.actualTaxCost,null,'imposto',null,'Integra custo uma única vez','calculateQuoteProfitability']);
    if (commercial != null) expenses.addRow([q.id,q.poNumber,'Acréscimo comercial','Já embutido na venda',base,base ? commercial / base : null,null,null,'composição da venda',money(commercial),'Não somar aos custos',q.recovery?.source || q.financialSummary?.source || 'subtotal/discountValue/taxRate']);
    const itemSum = sum(a.items.filter((i) => num(i.price) != null).map((i) => num(i.price) * num(i.quantity)));
    const expected = a.items.length && commercial != null ? money(itemSum - (num(q.discountValue) || 0) + commercial) : null;
    const diff = expected == null ? null : money(a.revenue - expected);
    if (diff != null && Math.abs(diff) > 0.01) issue(q, 'Composição versus venda', `Venda ${a.revenue}; itens/desconto/acréscimo ${expected}; diferença ${diff}. Sem ajuste da fonte.`);
    reconciliation.addRow([q.id,q.poNumber,q.clientCompany,a.revenue,totals?.Material.value ?? q.financialSummary?.materialRevenue ?? a.materialRevenue,totals?.['Mão de Obra'].value ?? q.financialSummary?.serviceRevenue ?? a.serviceRevenue,a.materialCost,a.ready ? money(components.tech) : null,a.ready ? money(components.techSale) : null,a.ready ? components.techQty : null,a.ready ? money(components.other) : null,a.ready ? money(components.partner) : null,a.ready ? money(components.rest) : null,a.serviceCost,a.actualTaxCost,a.estimatedCost,a.estimatedProfit,a.complete ? a.estimatedMarginPct / 100 : null,money(commercial),expected,diff,a.quality,missing.join('; '),q.recovery?.source || q.financialSummary?.source || 'quote.items']);
    if (!invoices.length || !fm.invoiceNumber) pending.addRow([q.id,q.poNumber,q.clientCompany,q.title,invoices.length ? 'NF comprovada; cadastro não atualizado' : /conclu|executado/.test(norm(q.condition)) ? 'Concluído; faturamento não comprovado' : /em execu/.test(norm(q.condition)) ? 'Em execução' : 'Aprovação não comprova início; situação desconhecida',a.revenue,a.estimatedCost,a.complete ? a.estimatedMarginPct / 100 : null,date(q.completedAt),q.notes]);
    Object.entries(q.original || {}).forEach(([f,v]) => { if (v != null) raw.addRow(['orçamento original',q.id,q.poNumber,null,f,v,'Tabela/JSON originais']); });
    ['paymentDateFormula','termDays','dueAt'].forEach((f) => { if (fm[f] != null) raw.addRow(['financeiro cadastral',q.id,q.poNumber,null,f,fm[f],'Processos_Orçamentos']); });
    receipts.forEach((r) => fiscal.addRow([q.id,q.poNumber,q.clientCompany,r.invoiceNumber || null,null,null,null,date(r.receivedAt),num(r.amount),null,'Recebimento com fonte',r.source,'Não repete valor da NF']));
  }
  for (const d of docs.values()) {
    const contracts = sum(d.quotes.map((q) => analyses.get(q).revenue)); const delta = money(d.amount - contracts);
    const due = [...new Set(d.quotes.map((q) => sourceDate(q.financialMetadata?.dueAt)).filter(Boolean))];
    fiscal.addRow([d.quotes.map((q) => q.id).join(' | '),d.quotes.map((q) => q.poNumber).join(' | '),[...new Set(d.quotes.map((q) => q.clientCompany))].join(' | '),d.number,date(d.issuedAt),d.amount,due.length === 1 ? date(due[0]) : null,null,null,null,d.quotes.map((q) => q.financialMetadata?.paymentStatus || 'Não informado').join(' | '),d.source,`${d.linkBasis || 'Vínculo explícito'}; NF contada uma vez; diferença NF − contratos selecionados ${delta}; sem rateio ou saldo inventado`]);
    if (Math.abs(delta) > 0.01) d.quotes.forEach((q) => issue(q,'NF versus contratos',`NF ${d.number}: ${d.amount}; contratos selecionados ${contracts}; diferença ${delta}. Sem rateio.`,d.source));
    ['number','issuedAt','amount','sha256'].forEach((f) => raw.addRow(['documento fiscal',d.quotes.map((q) => q.id).join(' | '),d.quotes.map((q) => q.poNumber).join(' | '),null,f,d[f],d.source]));
  }
  selected.filter((q) => !q.invoices?.length && (q.financialMetadata?.invoiceNumber || q.financialMetadata?.paymentStatus)).forEach((q) => fiscal.addRow([q.id,q.poNumber,q.clientCompany,q.financialMetadata.invoiceNumber,null,null,date(q.financialMetadata.dueAt),null,null,null,q.financialMetadata.paymentStatus,'Processos_Orçamentos','Cadastro sem documento fiscal conciliado; valores não contabilizados']));
  for (let year = Number(options.start.slice(0,4)); year <= Number(options.end.slice(0,4)); year++) for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2,'0')}`;
    const atMonth = (d) => inPeriod(d,options) && sourceDate(d).slice(0,7) === key;
    const created = selected.filter((q) => atMonth(q.createdAt));
    const complete = created.filter((q) => analyses.get(q).complete);
    const approved = selected.filter((q) => atMonth(q.approvedAt)); const completed = selected.filter((q) => atMonth(q.completedAt));
    const monthlyDocs = [...docs.values()].filter((d) => atMonth(d.issuedAt));
    const receipts = selected.flatMap((q) => q.receipts || []).filter((r) => r.source && num(r.amount) != null && atMonth(r.receivedAt));
    const available = (v) => v.some((x) => x != null) ? sum(v) : 'Não informado';
    const revenue = sum(complete.map((q) => analyses.get(q).revenue)); const result = complete.length ? sum(complete.map((q) => analyses.get(q).estimatedProfit)) : null;
    monthly.addRow([key,approved.length ? sum(approved.map((q) => analyses.get(q).revenue)) : 'Não informado',completed.length ? sum(completed.map((q) => analyses.get(q).revenue)) : 'Não informado',monthlyDocs.length ? sum(monthlyDocs.map((d) => d.amount)) : 'Não informado',receipts.length ? sum(receipts.map((r) => r.amount)) : 'Não informado','Não informado','Não informado',available(created.map((q) => analyses.get(q).materialCost)),available(created.map((q) => analyses.get(q).serviceCost)),available(created.map((q) => analyses.get(q).actualTaxCost)),result,result != null && revenue ? result / revenue : null,sum(created.map((q) => analyses.get(q).revenue)),created.length,complete.length,sum(created.filter((q) => !analyses.get(q).complete).map((q) => analyses.get(q).revenue)),monthlyDocs.length,'Custos/resultado por criação = formação de preço, não receita realizada. NF somente por emissão comprovada. Não informado não é zero; faltam datas de aprovação/conclusão e comprovantes de recebimento.']);
  }
  const keys = new Set(selected.map(quoteKey)); const seen = new Set();
  quotes.filter((q) => norm(q.clientCompany).includes(norm(options.client ?? 'Yara'))).forEach((q) => {
    if (seen.has(quoteKey(q))) issue(q,'Duplicidade na fonte','Mesmo cliente/PO repetido; somente primeira ocorrência somada. Revisar IDs/versões.'); seen.add(quoteKey(q));
    if (!keys.has(quoteKey(q))) {
      issue(q,'Não selecionado',`Não atende período/evidência ou situação permitida. Status ${q.status || ''}; aprovação ${q.approvalStatus || ''}; data ${sourceDate(q.createdAt) || 'ausente'}.`);
      (q.invoiceIssues || []).forEach((m) => issue(q,'Vínculo NF divergente',m));
    }
  });
  (options.sourceIssues || []).forEach((m) => issue(null,'Fonte complementar',m,options.sourceLabel));
  const rules = [
    ['Origem','Fonte integral',options.sourceLabel || 'Extrator completo; nenhuma paginação/filtro da tela'],
    ['Filtro','Opções',JSON.stringify({start:options.start,end:options.end,cutoff:options.cutoff,client:options.client,states:options.states})],
    ['Filtro','Elegibilidade','Criação ou evento comprovado no período; aprovação explícita, execução ou faturamento. Reprovados/cancelados excluídos. Rascunho contraditório com aprovação/NF é sinalizado. Status e datas originais preservados, sem normalização da interface.'],
    ['Identificação','ID/PO/NF','ID JSON é do orçamento; ID da tabela identifica cliente. UUID ausente recebe ID técnico da linha. PO interno não é NF nem pedido de compra Yara. NF compartilhada é contada uma vez, com lista de POs.'],
    ['Origem','Resumo e itens','JSON items quando disponível. Ausência: valores cacheados dos originais Orçamento!J (total da linha) e Imposto_Diaria!E, somente após conciliar PO, cliente e composição/total. Fórmulas antigas e vínculos externos não são recalculados.'],
    ['Fórmula','Rentabilidade','calculateQuoteProfitability existente preservada. Venda total ?? totalNumber; material realCost × quantidade ou venda / 1,30. Diária técnica custo interno 125; fusão 300; acompanhamento 90. Receita usa preço salvo (normalmente 215 por diária técnica). Custos estimados não são pagamentos.'],
    ['Fórmula','Resultado e margem','Imposto estimado = venda × 2%; custo = materiais + serviços + imposto; lucro = venda − custo; margem = lucro / venda. Markup = venda / custo − 1. Arredondamentos existentes do CRM preservados. Custos/margem ausentes nunca preenchidos com zero.'],
    ['Limitação','Custos de serviços','Serviços sem custo adicional e manuais sem realCost seguem a regra de custo zero do CRM. Isto não comprova custo real zero. Custos totais/resultados/margens ficam vazios quando a composição é incompleta.'],
    ['Limitação','Cobertura dos somatórios','Colunas de materiais/serviços/impostos somam componentes conhecidos, inclusive de composições parciais. Custo total, resultado e margem consolidada incluem somente composições completas. Não somar componentes parciais e apresentar o resultado como custo total de todos os contratos.'],
    ['Tratamento','Impostos e Despesas','Coluna Valor estimado como custo contém 2% da rentabilidade. Coluna Acréscimo comercial na venda contém imposto comercial já embutido na receita (subtotal − desconto) × taxRate ou valor salvo no legado. Não somar as duas colunas como despesas.'],
    ['Origem','Indicadores Mensais','Faturamento pela emissão real do PDF e valor documental, uma vez por NF. Recebimento só com fonte verificável, valor e data efetivos. Aprovação/conclusão só por suas datas explícitas. Custos e resultado de propostas por criação estão nomeados como formação de preço; não são execução/faturamento.'],
    ['Limitação','Datas e recebimentos','Data_Pagamento = data-base + prazo é previsão. Data_Criação financeira não usada como emissão sem documento. Status Pago não comprova recebimento. Sem dados, Não informado em vez de zero. Pendências históricas não reconstruíveis não são inventadas.'],
    ['Origem','Base e privacidade','Campos financeiros permitidos de tabela, JSON, itens e documentos com suas origens. Sem contatos, funcionários, CPF, credenciais ou dados bancários. Textos livres recebem remoção de contatos conhecidos.'],
    ['Limitação','Corte','Corte limita datas de criação/eventos. Status atual não reconstrói situação histórica em cortes passados.'],
    ['Validação','Contagens',`${quotes.length} registros na fonte; ${selected.length} selecionados; ${selected.filter((q) => !analyses.get(q).complete).length} com composição incompleta; ${docs.size} NFs comprovadas únicas.`],
  ]; rules.forEach((r) => dict.addRow(r));
  const totalColumn = (sheet, col) => {
    const values = []; sheet.eachRow((r,i) => { if (i > 1 && typeof r.getCell(col).value === 'number') values.push(r.getCell(col).value); });
    return sum(values);
  };
  for (const [label, leftSheet, leftColumn, rightSheet, rightColumn] of [
    ['Venda', summary,19,reconciliation,4],
    ['Imposto estimado como custo', summary,24,expenses,7],
    ['Acréscimo comercial na venda',reconciliation,19,expenses,10],
    ['Resultado da composição completa',summary,26,reconciliation,17],
  ]) {
    const left = totalColumn(leftSheet,leftColumn); const right = totalColumn(rightSheet,rightColumn);
    if (left !== right) throw new Error(`Conciliação inválida: ${label}. Exportação interrompida.`);
    dict.addRow(['Total conferido',label,`${leftSheet.name}: ${left.toFixed(2)}; ${rightSheet.name}: ${right.toFixed(2)}. Conferido sem duplicação.`]);
  }
  const invoicePeriodTotal = sum([...docs.values()].filter((d) => inPeriod(d.issuedAt,options)).map((d) => d.amount));
  const invoiceMonthlyTotal = totalColumn(monthly,4);
  if (invoicePeriodTotal !== invoiceMonthlyTotal) throw new Error('Conciliação inválida: faturamento por emissão no período.');
  dict.addRow(['Total conferido','Faturamento no período',`Documentos pela emissão: ${invoicePeriodTotal.toFixed(2)}; meses: ${invoiceMonthlyTotal.toFixed(2)}. Documentos de outros períodos não são transferidos para o mês de criação.`]);
  book.getWorksheet('Materiais Detalhados').getRow(1).getCell(15).value = 'Fonte do item';
  book.getWorksheet('Materiais Detalhados').getColumn(15).width = 50;
  book.getWorksheet('Serviços e Mão de Obra').getRow(1).getCell(17).value = 'Fonte do item';
  book.getWorksheet('Serviços e Mão de Obra').getRow(1).getCell(18).value = 'Desembolso efetivo comprovado';
  book.getWorksheet('Serviços e Mão de Obra').getColumn(17).width = 50;
  book.getWorksheet('Serviços e Mão de Obra').getColumn(18).width = 30;
  return { analyses, fiscalDocs: docs };
}
