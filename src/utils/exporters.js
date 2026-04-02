import { formatCurrency, formatDate } from './formatters.js';

let xlsxPromise;
let pdfDepsPromise;

const loadXlsx = async () => {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx');
  }
  return xlsxPromise;
};

const loadPdfDeps = async () => {
  if (!pdfDepsPromise) {
    pdfDepsPromise = Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]).then(([jspdfModule, autoTableModule]) => ({
      jsPDF: jspdfModule.default,
      autoTable: autoTableModule.default,
    }));
  }

  return pdfDepsPromise;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  const cleaned = value
    .toString()
    .replace(/[^0-9,.\-]/g, '');

  if (!cleaned) return 0;

  if (cleaned.includes('.') && cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalSeparator = Math.max(lastDot, lastComma);

  if (decimalSeparator === -1) {
    const parsed = Number(cleaned.replace(/[.,]/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const integerPart = cleaned.slice(0, decimalSeparator).replace(/[.,]/g, '');
  const decimalPart = cleaned.slice(decimalSeparator + 1);
  const parsed = Number(`${integerPart}.${decimalPart}`);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const safeFilenamePart = (value) =>
  (value || '')
    .toString()
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');

const isLaborItem = (item) =>
  ['diaria-tecnico', 'diaria-fusao', 'acompanhamento'].includes(item.id) ||
  ['DIARIA-TEC', 'DIARIA-FUSAO', 'ACOMPANHAMENTO'].includes(item.sku);

const buildQuoteTotals = (quote) => {
  const materialsTotal = (quote.items || [])
    .filter((item) => item.type === 'materiais')
    .reduce((acc, item) => acc + item.price * item.quantity, 0);

  const servicesTotal = (quote.items || [])
    .filter((item) => item.type === 'servicos')
    .reduce((acc, item) => acc + item.price * item.quantity, 0);

  const hasItems = (quote.items || []).length > 0;
  const subtotal = hasItems ? materialsTotal + servicesTotal : toNumber(quote.subtotal ?? quote.total ?? 0);
  const taxRate = toNumber(quote.taxRate || 0);
  const discount = toNumber(quote.discountValue || 0);
  const taxValue = subtotal * (taxRate / 100);
  const computedTotal = (subtotal - discount) * (1 + taxRate / 100);
  const grandTotal = hasItems ? computedTotal : toNumber(quote.total ?? 0) || computedTotal;

  return {
    discount,
    grandTotal,
    hasItems,
    materialsTotal,
    servicesTotal,
    subtotal,
    taxRate,
    taxValue,
  };
};

const applyPdfWatermark = (doc, brand, title, mutedColor) => {
  const totalPages = doc.getNumberOfPages();
  const currentPage = doc.getCurrentPageInfo?.().pageNumber || totalPages;

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(42);
    doc.setTextColor(140, 147, 160);
    doc.text('CONFIDENCIAL', width / 2, height / 2, {
      align: 'center',
      angle: 28,
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...mutedColor);
    doc.text(`${brand} | ${title}`, width / 2, height - 10, { align: 'center' });
  }

  doc.setPage(currentPage);
};

const drawPdfCoverPage = (doc, quote, brand, title, today, logoData, palette, grandTotal) => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 18;
  const clientName = quote.clientCompany || quote.clientName || 'Cliente nao informado';
  const scopeLines = doc.splitTextToSize(
    quote.scope?.trim() || 'Documento gerado automaticamente pelo CRM para apresentar a proposta comercial.',
    width - margin * 2 - 36,
  );

  doc.setFillColor(10, 12, 18);
  doc.rect(0, 0, width, height, 'F');

  doc.setFillColor(...palette.primary);
  doc.rect(0, 0, width, 58, 'F');

  doc.setFillColor(...palette.accent);
  doc.rect(0, height - 18, width, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Clever Connection', margin, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(brand, margin, 31);

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', width - margin - 28, 12, 28, 18);
    } catch (error) {
      console.warn('Falha ao carregar logo para a capa do PDF', error);
    }
  }

  doc.setDrawColor(...palette.border);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, 76, width - margin * 2, height - 118, 6, 6, 'FD');

  doc.setTextColor(...palette.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(title, margin + 10, 102);

  doc.setFontSize(14);
  doc.setTextColor(...palette.muted);
  doc.text('Documento comercial', margin + 10, 114);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(quote.title || 'Projeto nao informado', margin + 10, 142, {
    maxWidth: width - margin * 2 - 20,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...palette.muted);
  doc.text(`Cliente: ${clientName}`, margin + 10, 158, {
    maxWidth: width - margin * 2 - 20,
  });
  doc.text(`Emitido em: ${today}`, margin + 10, 170);
  doc.text(`Validade: ${formatDate(quote.validUntil)}`, margin + 10, 182);
  doc.text(`PO: ${quote.poNumber || '--'}`, margin + 10, 194);

  doc.setFillColor(...palette.primary);
  doc.roundedRect(margin + 10, 214, width - margin * 2 - 20, 28, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Resumo financeiro', margin + 18, 225);
  doc.setFontSize(18);
  doc.text(formatCurrency(grandTotal), margin + 18, 237);

  doc.setDrawColor(...palette.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 10, 258, width - margin * 2 - 20, 44, 4, 4, 'FD');
  doc.setTextColor(...palette.primary);
  doc.setFontSize(10);
  doc.text('Escopo', margin + 18, 270);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 24, 39);
  doc.text(scopeLines.slice(0, 3), margin + 18, 282);
};

export const exportQuotesToCSV = (quotes) => {
  const headers = ['Cliente', 'Titulo', 'Valor', 'Status', 'Validade', 'Criado em'];
  const rows = quotes.map((quote) => [
    quote.clientCompany || quote.clientName,
    quote.title,
    quote.total,
    quote.status,
    formatDate(quote.validUntil),
    formatDate(quote.createdAt),
  ]);

  const csv = [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'orcamentos.csv');
};

export const exportQuotesToExcel = async (quotes) => {
  const XLSX = await loadXlsx();
  const rows = quotes.map((quote) => ({
    Cliente: quote.clientCompany || quote.clientName,
    Titulo: quote.title,
    Valor: quote.total,
    Status: quote.status,
    Validade: formatDate(quote.validUntil),
    Criado: formatDate(quote.createdAt),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Orcamentos');

  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  downloadBlob(blob, 'orcamentos.xlsx');
};

export const exportQuoteToPDF = async (quote, options = {}) => {
  const { download = true } = options;
  const { jsPDF, autoTable } = await loadPdfDeps();
  const doc = new jsPDF();
  const title = 'Orcamento';
  const brand = import.meta.env?.VITE_APP_TITLE || 'CRM Orcamentos';
  const today = new Date().toLocaleDateString('pt-BR');
  const logoData = import.meta.env?.VITE_PDF_LOGO_DATA;
  const filename = `${safeFilenamePart(quote.title || 'Orcamento')} - ${safeFilenamePart(quote.clientCompany || 'cliente')}.pdf`;
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const palette = {
    primary: [24, 39, 73],
    primaryLight: [37, 99, 235],
    accent: [16, 185, 129],
    muted: [99, 115, 129],
    surface: [246, 248, 252],
    border: [226, 232, 240],
  };
  const {
    discount,
    grandTotal,
    materialsTotal,
    servicesTotal,
    subtotal,
    taxValue,
  } = buildQuoteTotals(quote);

  drawPdfCoverPage(doc, quote, brand, title, today, logoData, palette, grandTotal);
  doc.addPage();

  doc.setFillColor(...palette.primary);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Clever Connection | Orcamento', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Emitido em: ${today}`, pageWidth - margin, 12, { align: 'right' });
  doc.setFontSize(11);
  doc.text(`Projeto: ${quote.title || 'Documento do cliente'}`, margin, 24);
  doc.setFontSize(10);
  doc.text(`PO: ${quote.poNumber || '--'}`, margin, 30);

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pageWidth - margin - 22, 6, 22, 14);
    } catch (error) {
      console.warn('Falha ao carregar logo para PDF', error);
    }
  }

  const summaryCard = (x, y, width, label, value, bgColor) => {
    doc.setFillColor(...bgColor);
    doc.roundedRect(x, y, width, 28, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, x + 6, y + 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(value, x + 6, y + 19);
  };

  const cardsY = 58;
  const cardWidth = (contentWidth - 12) / 3;
  summaryCard(margin, cardsY, cardWidth, 'Total Materiais', formatCurrency(materialsTotal), palette.primaryLight);
  summaryCard(margin + cardWidth + 6, cardsY, cardWidth, 'Total Servicos', formatCurrency(servicesTotal), palette.primary);
  summaryCard(margin + (cardWidth + 6) * 2, cardsY, cardWidth, 'Total Geral', formatCurrency(grandTotal), palette.accent);

  doc.setTextColor(...palette.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Itens do orcamento', margin, cardsY + 40);

  autoTable(doc, {
    startY: cardsY + 46,
    margin: { left: margin, right: margin },
    head: [['Item', 'Categoria', 'SKU', 'Tipo', 'Quantidade']],
    body: (quote.items || [])
      .filter((item) => !isLaborItem(item))
      .map((item) => [
        item.name || '--',
        item.type === 'materiais' ? 'Material' : item.type === 'servicos' ? 'Servico' : '--',
        item.sku || '--',
        item.unit || '--',
        item.quantity,
      ]),
    styles: {
      fontSize: 8,
      cellPadding: 2,
      valign: 'middle',
      halign: 'left',
    },
    headStyles: {
      fillColor: palette.primaryLight,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.44 },
      1: { cellWidth: contentWidth * 0.2 },
      2: { cellWidth: contentWidth * 0.14 },
      3: { cellWidth: contentWidth * 0.1 },
      4: { cellWidth: contentWidth * 0.12, halign: 'right' },
    },
    didDrawPage: () => {
      doc.setDrawColor(...palette.border);
    },
  });

  let finalY = doc.lastAutoTable?.finalY || cardsY + 46;
  const summaryEntries = [
    { label: 'Materiais', value: formatCurrency(materialsTotal), color: [17, 24, 39] },
    { label: 'Servicos (mao de obra)', value: formatCurrency(servicesTotal), color: [17, 24, 39] },
    { label: 'Subtotal', value: formatCurrency(subtotal), color: [17, 24, 39] },
    { label: 'Impostos', value: formatCurrency(taxValue), color: [17, 24, 39] },
  ];

  if (discount > 0) {
    summaryEntries.push({ label: 'Desconto', value: formatCurrency(discount), color: [17, 24, 39] });
  }

  summaryEntries.push({ label: 'Total Geral', value: formatCurrency(grandTotal), color: palette.accent });

  const lineHeight = 5;
  const summaryBoxHeight = 10 + summaryEntries.length * lineHeight;
  const bottomMargin = 24;
  const clientBoxHeight = 44;
  const contactCardBg = [232, 238, 250];
  const scopeText = quote.scope?.trim() ? doc.splitTextToSize(quote.scope, contentWidth - 12) : null;
  const scopeBoxHeight = scopeText ? Math.max(18, scopeText.length * 5 + 10) : 0;
  const notesText = quote.notes?.trim() ? doc.splitTextToSize(quote.notes, contentWidth - 8) : null;
  const notesBoxHeight = notesText ? Math.max(24, notesText.length * 5 + 10) : 0;

  const summaryBlockHeight = 8 + (summaryBoxHeight + 10);
  if (finalY + summaryBlockHeight > pageHeight - bottomMargin) {
    doc.addPage();
    finalY = margin;
  }

  const summaryBoxY = finalY + 8;
  doc.setDrawColor(...palette.border);
  doc.setFillColor(210, 218, 235);
  doc.roundedRect(margin, summaryBoxY, contentWidth, summaryBoxHeight + 10, 2.5, 2.5, 'FD');

  doc.setTextColor(...palette.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Resumo financeiro', margin + 8, summaryBoxY + 7);

  let summaryY = summaryBoxY + 14;
  summaryEntries.forEach((entry) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...palette.muted);
    doc.setFontSize(entry.label === 'Total Geral' ? 9 : 8.5);
    doc.text(entry.label, margin + 8, summaryY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...entry.color);
    doc.setFontSize(entry.label === 'Total Geral' ? 10 : 9);
    doc.text(entry.value, pageWidth - margin - 8, summaryY, { align: 'right' });
    summaryY += lineHeight;
  });

  finalY = summaryBoxY + summaryBoxHeight + 14;
  const remainingHeight = 8 + (clientBoxHeight + 12) + (scopeBoxHeight ? scopeBoxHeight + 8 : 0) + (notesBoxHeight ? notesBoxHeight + 18 : 0);

  if (finalY + remainingHeight > pageHeight - bottomMargin) {
    doc.addPage();
    finalY = margin;
  }

  doc.setTextColor(...palette.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Contato Cliente', margin, finalY + 8);

  const clientBoxY = finalY + 10;
  const boxGap = 8;
  const halfWidth = (contentWidth - boxGap) / 2;
  doc.setDrawColor(...palette.border);
  doc.setFillColor(...contactCardBg);
  doc.roundedRect(margin, clientBoxY, halfWidth, clientBoxHeight, 2.5, 2.5, 'FD');

  const clientLeftX = margin + 6;
  const clientRightX = margin + halfWidth - 2;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(quote.clientCompany || 'Empresa nao informada', clientLeftX, clientBoxY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(quote.clientName || 'Cliente nao informado', clientLeftX, clientBoxY + 14);
  doc.setTextColor(...palette.muted);
  doc.text(quote.clientEmail || 'E-mail nao informado', clientLeftX, clientBoxY + 21);
  doc.text(quote.clientPhone || 'Telefone nao informado', clientLeftX, clientBoxY + 27);
  doc.text(`Validade: ${formatDate(quote.validUntil)}`, clientRightX, clientBoxY + 8, { align: 'right' });

  const contactBoxX = margin + halfWidth + boxGap;
  doc.setTextColor(...palette.muted);
  doc.setFontSize(9);
  doc.text('Contato Clever', contactBoxX, finalY + 8);
  doc.setFillColor(...contactCardBg);
  doc.roundedRect(contactBoxX, clientBoxY, halfWidth, clientBoxHeight, 2.5, 2.5, 'FD');

  const contactLeftX = contactBoxX + 6;
  const contactValueX = contactLeftX + 16;
  const contactMaxWidth = halfWidth - 44;
  const contactY = clientBoxY + 8;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(quote.contactName || '--', contactLeftX, contactY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...palette.muted);
  doc.text('Telefone:', contactLeftX, contactY + 10);
  doc.setTextColor(17, 24, 39);
  doc.text(quote.contactPhone || '--', contactValueX, contactY + 10, { maxWidth: contactMaxWidth });
  doc.setTextColor(...palette.muted);
  doc.text('E-mail:', contactLeftX, contactY + 18);
  doc.setTextColor(17, 24, 39);
  doc.text(quote.contactEmail || '--', contactValueX, contactY + 18, { maxWidth: contactMaxWidth });

  let scopeBottom = clientBoxY + clientBoxHeight;
  if (scopeText) {
    const scopeBoxY = clientBoxY + clientBoxHeight + 6;
    doc.setDrawColor(...palette.border);
    doc.setFillColor(...palette.surface);
    doc.roundedRect(margin, scopeBoxY, contentWidth, scopeBoxHeight, 2.5, 2.5, 'FD');
    doc.setTextColor(...palette.muted);
    doc.setFontSize(9);
    doc.text('Escopo:', margin + 3, scopeBoxY + 4);
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(10);
    doc.text(scopeText, margin + 3, scopeBoxY + 9, { maxWidth: contentWidth - 12 });
    scopeBottom = scopeBoxY + scopeBoxHeight;
  }

  finalY = scopeBottom;
  if (notesText) {
    const notesY = finalY + 14;
    doc.setTextColor(...palette.muted);
    doc.setFontSize(9);
    doc.text('Observacoes', margin, notesY);
    doc.setDrawColor(...palette.border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, notesY + 4, contentWidth, notesBoxHeight, 2.5, 2.5, 'FD');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(10);
    doc.text(notesText, margin + 4, notesY + 12, { maxWidth: contentWidth - 8 });
  }

  doc.addPage();
  const pageWidth2 = doc.internal.pageSize.getWidth();
  const margin2 = margin;
  const contentWidth2 = pageWidth2 - margin2 * 2;
  let y = margin2 + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...palette.primary);
  doc.text('Informacoes complementares', margin2, y);
  y += 10;

  const section = (heading, text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...palette.primary);
    doc.text(heading, margin2, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    const lines = doc.splitTextToSize(text, contentWidth2);
    y += 6;
    doc.text(lines, margin2, y);
    y += lines.length * 5 + 6;
  };

  const delivery = quote.deliveryTime ? `${quote.deliveryTime} dias` : 'Prazo de entrega sera confirmado na aprovacao.';
  const payment = quote.paymentTerms ? `${quote.paymentTerms} dias` : 'Pagamento conforme negociacao comercial.';
  section('Sumario executivo', `Prazo de entrega: ${delivery}`);
  section('Condicoes comerciais', `Pagamento: ${payment}`);
  section('Garantia e suporte', 'Garantia padrao de 60 dias para itens e servicos fornecidos. Suporte por e-mail e telefone em horario comercial.');
  section('Alteracoes de escopo', 'Solicitacoes que alterem o escopo original serao avaliadas e orcadas separadamente, sempre com aprovacao formal do cliente.');

  doc.setFontSize(10);
  doc.setTextColor(...palette.muted);
  doc.text('Dados da Clever Connection e bancarios', margin2, y);
  y += 6;

  const infoCardHeight = 68;
  const infoHeaderHeight = 12;
  const infoInnerPad = 8;
  const bodyBoxRadius = 2;
  const colGap = 10;
  const colWidth = (contentWidth2 - colGap - infoInnerPad * 2) / 2;
  const leftX = margin2 + infoInnerPad;
  const rightX = leftX + colWidth + colGap;
  const bodyBoxY = y + infoHeaderHeight + 2;
  const bodyBoxHeight = infoCardHeight - infoHeaderHeight - 6;
  const labelOffset = 24;

  doc.setDrawColor(...palette.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin2, y, contentWidth2, infoCardHeight, 3, 3, 'FD');
  doc.setFillColor(...palette.primary);
  doc.roundedRect(margin2, y, contentWidth2, infoHeaderHeight, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Clever Connection', margin2 + 6, y + 8);
  doc.setFontSize(8);
  doc.text('Dados bancarios', pageWidth2 - margin2 - 6, y + 8, { align: 'right' });

  doc.setFillColor(232, 238, 250);
  doc.roundedRect(leftX - 2, bodyBoxY, colWidth + 4, bodyBoxHeight, bodyBoxRadius, bodyBoxRadius, 'F');
  doc.roundedRect(rightX - 2, bodyBoxY, colWidth + 4, bodyBoxHeight, bodyBoxRadius, bodyBoxRadius, 'F');

  doc.setFontSize(8);
  doc.setTextColor(...palette.primary);
  doc.text('Dados da empresa', leftX, bodyBoxY + 8);
  doc.text('Dados bancarios', rightX, bodyBoxY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let lineY = bodyBoxY + 16;
  [
    ['CNPJ:', '35.510.979/0001-22'],
    ['Endereco:', 'Rua Clotilde Galea, 170 - Vila Osasco, Sao Paulo'],
    ['Telefone:', '11 4709-9523'],
    ['Email:', 'contato@cleverconnection.com.br'],
  ].forEach(([label, value]) => {
    doc.setTextColor(...palette.muted);
    doc.text(label, leftX, lineY, { maxWidth: colWidth - labelOffset });
    doc.setTextColor(17, 24, 39);
    doc.text(value, leftX + labelOffset, lineY, { maxWidth: colWidth - labelOffset });
    lineY += 6;
  });

  lineY = bodyBoxY + 16;
  [
    ['Banco:', '077 - Inter'],
    ['Agencia:', '39885873'],
    ['Conta:', '0001'],
    ['Site:', 'www.cleverconnection.com.br'],
  ].forEach(([label, value]) => {
    doc.setTextColor(...palette.muted);
    doc.text(label, rightX, lineY, { maxWidth: colWidth - labelOffset });
    doc.setTextColor(17, 24, 39);
    doc.text(value, rightX + labelOffset, lineY, { maxWidth: colWidth - labelOffset });
    lineY += 6;
  });

  applyPdfWatermark(doc, brand, title, palette.muted);
  const blob = doc.output('blob');

  if (download) {
    downloadBlob(blob, filename);
  }

  return { blob, filename };
};
