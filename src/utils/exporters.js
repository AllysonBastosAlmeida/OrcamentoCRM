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
      import('pdf-lib'),
    ]).then(([jspdfModule, autoTableModule, pdfLibModule]) => ({
      jsPDF: jspdfModule.default,
      autoTable: autoTableModule.default,
      PDFDocument: pdfLibModule.PDFDocument,
      StandardFonts: pdfLibModule.StandardFonts,
      degrees: pdfLibModule.degrees,
      rgb: pdfLibModule.rgb,
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
  const str = value.toString();
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

export const exportQuotesToCSV = (quotes) => {
  const headers = ['Cliente', 'Título', 'Valor', 'Status', 'Validade', 'Criado em'];
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
    Título: quote.title,
    Valor: quote.total,
    Status: quote.status,
    Validade: formatDate(quote.validUntil),
    Criado: formatDate(quote.createdAt),
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Orçamentos');
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  downloadBlob(blob, 'orcamentos.xlsx');
};

export const exportQuoteToPDF = async (quote, options = {}) => {
  const { download = true } = options;
  const { jsPDF, autoTable, PDFDocument, StandardFonts, degrees, rgb } = await loadPdfDeps();
  const doc = new jsPDF();
  const title = 'Orçamento';
  const brand = import.meta.env?.VITE_APP_TITLE || 'CRM Orçamentos';
  const today = new Date().toLocaleDateString('pt-BR');
  const logoData = import.meta.env?.VITE_PDF_LOGO_DATA; // base64 opcional (PNG/JPEG)
  const safe = (value) =>
    (value || '')
      .toString()
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ');
  const filename = `${safe(quote.title || 'Orcamento')} - ${safe(quote.clientCompany || 'cliente')}.pdf`;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const palette = {
    primary: [24, 39, 73],
    primaryLight: [37, 99, 235],
    accent: [16, 185, 129],
    muted: [99, 115, 129],
    surface: [246, 248, 252],
    border: [226, 232, 240],
  };

  const drawLabelValue = (x, y, label, value, valueColor = [17, 24, 39]) => {
    doc.setFontSize(9);
    doc.setTextColor(...palette.muted);
    doc.text(label, x, y);
    doc.setTextColor(...valueColor);
    doc.setFontSize(11);
    doc.text(value, x, y + 4.5);
  };

  const summaryCard = (x, y, width, titleText, valueText, bgColor) => {
    doc.setFillColor(...bgColor);
    doc.roundedRect(x, y, width, 28, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(titleText, x + 6, y + 9);
    doc.setFontSize(13);
    doc.text(valueText, x + 6, y + 19);
  };

  const isLaborItem = (item) =>
    ['diaria-tecnico', 'diaria-fusao', 'acompanhamento'].includes(item.id) ||
    ['DIARIA-TEC', 'DIARIA-FUSAO', 'ACOMPANHAMENTO'].includes(item.sku);

  const materialsTotal = (quote.items || [])
    .filter((i) => i.type === 'materiais')
    .reduce((acc, item) => acc + item.price * item.quantity, 0);
  const servicesTotal = (quote.items || [])
    .filter((i) => i.type === 'servicos')
    .reduce((acc, item) => acc + item.price * item.quantity, 0);
  const hasItems = (quote.items || []).length > 0;
  const subtotal = hasItems ? materialsTotal + servicesTotal : toNumber(quote.subtotal ?? quote.total ?? 0);
  const taxRate = toNumber(quote.taxRate || 0);
  const discount = toNumber(quote.discountValue || 0);
  const taxValue = subtotal * (taxRate / 100);
  const computedTotal = (subtotal - discount) * (1 + taxRate / 100);
  const grandTotal = hasItems ? computedTotal : toNumber(quote.total ?? 0) || computedTotal;

  doc.setFillColor(...palette.primary);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('Clever Connection | Orçamento', margin, 12);
  doc.setFontSize(10);
  doc.text(`Emitido em: ${today}`, pageWidth - margin, 12, { align: 'right' });
  doc.setFontSize(11);
  doc.text(`Projeto: ${quote.title || 'Documento do cliente'}`, margin, 24);
  doc.setFontSize(10);
  doc.text(`PO: ${quote.poNumber || '--'}`, margin, 30);

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', pageWidth - margin - 22, 6, 22, 14);
    } catch (err) {
      console.warn('Falha ao carregar logo para PDF', err);
    }
  }

  const cardsY = 58;
  const cardWidth = (contentWidth - 12) / 3;
  summaryCard(margin, cardsY, cardWidth, 'Total Materiais', formatCurrency(materialsTotal), palette.primaryLight);
  summaryCard(margin + cardWidth + 6, cardsY, cardWidth, 'Total Serviços', formatCurrency(servicesTotal), palette.primary);
  summaryCard(margin + (cardWidth + 6) * 2, cardsY, cardWidth, 'Total Geral', formatCurrency(grandTotal), palette.accent);

  doc.setTextColor(...palette.muted);
  doc.setFontSize(9);
  doc.text('Itens do orçamento', margin, cardsY + 40);

  autoTable(doc, {
    startY: cardsY + 46,
    margin: { left: margin, right: margin },
    head: [['Item', 'Categoria', 'SKU', 'Tipo', 'Quantidade']],
    body: (quote.items || [])
      .filter((item) => !isLaborItem(item))
      .map((item) => [
        item.name || '--',
        item.type === 'materiais' ? 'Material' : item.type === 'servicos' ? 'Serviço' : '--',
        item.sku || '--',
        item.unit || '--',
        item.quantity,
      ]),
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', halign: 'left' },
    headStyles: { fillColor: palette.primaryLight, textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'left' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.44 },
      1: { cellWidth: contentWidth * 0.2 },
      2: { cellWidth: contentWidth * 0.14 },
      3: { cellWidth: contentWidth * 0.1 },
      4: { halign: 'right', cellWidth: contentWidth * 0.12 },
    },
    didDrawPage: () => {
      doc.setDrawColor(...palette.border);
    },
  });

  let finalY = doc.lastAutoTable?.finalY || cardsY + 46;
  const summaryEntries = [
    { label: 'Materiais', value: formatCurrency(materialsTotal), color: [17, 24, 39] },
    { label: 'Serviços (Mão de obra)', value: formatCurrency(servicesTotal), color: [17, 24, 39] },
    { label: 'Subtotal', value: formatCurrency(subtotal), color: [17, 24, 39] },
    { label: 'Impostos', value: formatCurrency(taxValue), color: [17, 24, 39] },
  ];
  if (discount > 0) {
    summaryEntries.push({ label: 'Desconto', value: formatCurrency(discount), color: [17, 24, 39] });
  }
  summaryEntries.push({ label: 'Total Geral', value: formatCurrency(grandTotal), color: palette.accent });

  const lineHeight = 5;
  const summaryBoxHeight = 10 + summaryEntries.length * lineHeight;

  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 24;
  const clientBoxH = 44;
  const contactCardBg = [232, 238, 250]; // fundo levemente mais escuro para os cards de contato

  const scopeText = quote.scope && quote.scope.trim().length ? doc.splitTextToSize(quote.scope, contentWidth - 12) : null;
  const scopeBoxHeight = scopeText ? Math.max(18, scopeText.length * 5 + 10) : 0;

  const notesText = quote.notes && quote.notes.trim().length ? doc.splitTextToSize(quote.notes, contentWidth - 8) : null;
  const notesBoxHeight = notesText ? Math.max(24, notesText.length * 5 + 10) : 0;

  // 1) Garantir que o card de resumo grude na tabela; so ele decide a quebra agora
  const summaryBlockHeight = 8 + (summaryBoxHeight + 10); // espaco antes + card
  if (finalY + summaryBlockHeight > pageHeight - bottomMargin) {
    doc.addPage();
    finalY = margin;
  }

  // Card de resumo logo apos a tabela
  const summaryBoxY = finalY + 8;

  doc.setDrawColor(...palette.border);
  doc.setFillColor(210, 218, 235); // fundo mais escuro para o resumo
  doc.roundedRect(margin, summaryBoxY, contentWidth, summaryBoxHeight + 10, 2.5, 2.5, 'FD');

  // Titulo dentro do card
  doc.setTextColor(...palette.muted);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Resumo financeiro', margin + 8, summaryBoxY + 7);
  doc.setFont(undefined, 'normal');

  let summaryY = summaryBoxY + 14;
  summaryEntries.forEach((entry) => {
    doc.setTextColor(...palette.muted);
    doc.setFontSize(entry.label === 'Total Geral' ? 9 : 8.5);
    doc.text(entry.label, margin + 8, summaryY);
    doc.setTextColor(...entry.color);
    doc.setFontSize(entry.label === 'Total Geral' ? 10 : 9);
    doc.text(entry.value, pageWidth - margin - 8, summaryY, { align: 'right' });
    summaryY += lineHeight;
  });

  finalY = summaryBoxY + summaryBoxHeight + 10 + 4;

  // 2) Agora calcula se blocos seguintes cabem; se nao, quebra pagina para eles (sem mover resumo)
  const remainingHeight =
    8 + // antes dos cards de contato
    (clientBoxH + 12) + // bloco cliente/contato
    (scopeBoxHeight ? scopeBoxHeight + 8 : 0) +
    (notesBoxHeight ? notesBoxHeight + 18 : 0);

  if (finalY + remainingHeight > pageHeight - bottomMargin) {
    doc.addPage();
    finalY = margin;
  }

  // Após resumo financeiro: blocos de cliente/contato/escopo
  doc.setTextColor(...palette.muted);
  doc.setFontSize(9);
  doc.text('Contato Cliente', margin, finalY + 8);
  doc.setDrawColor(...palette.border);
  doc.setFillColor(...contactCardBg);
  const clientBoxY = finalY + 10;
  const boxGap = 8;
  const halfWidth = (contentWidth - boxGap) / 2;

  // Card: Contato do cliente
  doc.roundedRect(margin, clientBoxY, halfWidth, clientBoxH, 2.5, 2.5, 'FD');
  const clientLeftX = margin + 6;
  const clientRightX = margin + halfWidth - 2;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(quote.clientCompany || 'Empresa não informada', clientLeftX, clientBoxY + 8);
  doc.setFontSize(8);
  doc.text(quote.clientName || 'Cliente não informado', clientLeftX, clientBoxY + 14);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...palette.muted);
  doc.setFontSize(8);
  doc.text(quote.clientEmail || 'E-mail não informada', clientLeftX, clientBoxY + 21);
  doc.text(quote.clientPhone || 'Telefone não informado', clientLeftX, clientBoxY + 27);
  doc.text(`Validade: ${formatDate(quote.validUntil)}`, clientRightX, clientBoxY + 8, { align: 'right' });

  // Card: Contato Clever (lado a lado)
  const contactBoxX = margin + halfWidth + boxGap;
  doc.setTextColor(...palette.muted);
  doc.setFontSize(9);
  doc.text('Contato Clever', contactBoxX, finalY + 8);

  doc.setFillColor(...contactCardBg);
  doc.roundedRect(contactBoxX, clientBoxY, halfWidth, clientBoxH, 2.5, 2.5, 'FD');
  const contactLeftX = contactBoxX + 6;
  const contactLabelX = contactLeftX;
  const contactValueX = contactLabelX + 16;
  const contactMaxWidth = halfWidth - 44; // margem interna para não estourar o card
  const contactY = clientBoxY + 8;
  doc.setTextColor(17, 24, 39);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text(quote.contactName || '--', contactLeftX, contactY);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...palette.muted);
  doc.text('Telefone:', contactLabelX, contactY + 10);
  doc.setTextColor(17, 24, 39);
  doc.text(quote.contactPhone || '--', contactValueX, contactY + 10, { maxWidth: contactMaxWidth });
  doc.setTextColor(...palette.muted);
  doc.text('E-mail', contactLabelX, contactY + 18);
  doc.setTextColor(17, 24, 39);
  doc.text(quote.contactEmail || '--', contactValueX, contactY + 18);

  let scopeBottom = clientBoxY + clientBoxH;
  if (scopeText) {
    const scopeBoxY = clientBoxY + clientBoxH + 6;
    const scopeWidth = contentWidth;
    doc.setDrawColor(...palette.border);
    doc.setFillColor(...palette.surface);
    doc.roundedRect(margin, scopeBoxY, scopeWidth, scopeBoxHeight, 2.5, 2.5, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(...palette.muted);
    doc.text('Escopo:', margin + 3, scopeBoxY + 4);
    doc.setTextColor(17, 24, 39);
    doc.text(scopeText, margin + 3, scopeBoxY + 9, { maxWidth: scopeWidth - 12 });
    scopeBottom = scopeBoxY + scopeBoxHeight;
  }

  finalY = scopeBottom;

  if (notesText) {
    doc.setFontSize(9);
    doc.setTextColor(...palette.muted);
    const notesY = finalY + 14;
    doc.text('Observações', margin, notesY);
    doc.setDrawColor(...palette.border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, notesY + 4, contentWidth, notesBoxHeight, 2.5, 2.5, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(notesText, margin + 4, notesY + 12);
    finalY = notesY + 4 + notesBoxHeight;
  }

  // Página 2: informações fixas e texto institucional
  doc.addPage();
  const pageWidth2 = doc.internal.pageSize.getWidth();
  const margin2 = margin;
  const contentWidth2 = pageWidth2 - margin2 * 2;
  let y = margin2 + 6;

  doc.setFontSize(14);
  doc.setTextColor(...palette.primary);
  doc.text('Informações complementares', margin2, y);
  y += 10;

  const section = (title, text) => {
    doc.setFontSize(10);
    doc.setTextColor(...palette.primary);
    doc.text(title, margin2, y);
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    const splitted = doc.splitTextToSize(text, contentWidth2);
    y += 6;
    doc.text(splitted, margin2, y);
    y += splitted.length * 5 + 6;
  };

  const delivery = quote.deliveryTime ? `${quote.deliveryTime} dias` : 'Prazo de entrega será confirmado na aprovação.';
  const payment = quote.paymentTerms ? `${quote.paymentTerms} dias` : 'Pagamento conforme negociação (ex.: 30 dias).';
  section('Sumário executivo', `Prazo de entrega: ${delivery}`);
  section('Condições comerciais', `Pagamento: ${payment}`);
  section('Garantia e suporte', 'Garantia padrão de 60 dias para os itens e serviços fornecidos. Suporte via e-mail/telefone em horário comercial, com resposta em até 1 dia útil.');
  section(
    'Alterações de escopo',
    'Solicitações que alterem o escopo original serão avaliadas e orçadas separadamente. A execução de mudanças depende de aprovação formal do cliente.',
  );

  doc.setFontSize(10);
  doc.setTextColor(...palette.muted);
  doc.text('Dados da Clever Connection e bancários', margin2, y);
  y += 6;

  const infoCardHeight = 68;
  const infoHeaderH = 12;
  const infoInnerPad = 8;
  const bodyBoxRadius = 2;
  const colGap = 10;
  const colWidthData = (contentWidth2 - colGap - infoInnerPad * 2) / 2;
  const leftXData = margin2 + infoInnerPad;
  const rightXData = leftXData + colWidthData + colGap;
  const bodyBoxY = y + infoHeaderH + 2;
  const bodyBoxH = infoCardHeight - infoHeaderH - 6;
  const labelOffsetData = 24;
  const rowGapData = 6;

  doc.setDrawColor(...palette.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin2, y, contentWidth2, infoCardHeight, 3, 3, 'FD');

  // Faixa superior destacada
  doc.setFillColor(...palette.primary);
  doc.roundedRect(margin2, y, contentWidth2, infoHeaderH, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Clever Connection', margin2 + 6, y + 8);
  doc.setFontSize(8);
  doc.text('Dados bancários', pageWidth2 - margin2 - 6, y + 8, { align: 'right' });

  // Blocos laterais com fundo sutil
  doc.setFillColor(...contactCardBg);
  doc.roundedRect(leftXData - 2, bodyBoxY, colWidthData + 4, bodyBoxH, bodyBoxRadius, bodyBoxRadius, 'F');
  doc.roundedRect(rightXData - 2, bodyBoxY, colWidthData + 4, bodyBoxH, bodyBoxRadius, bodyBoxRadius, 'F');

  doc.setFont(undefined, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...palette.primary);
  doc.text('Dados da empresa', leftXData, bodyBoxY + 8);
  doc.text('Dados bancários', rightXData, bodyBoxY + 8);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  let lineYData = bodyBoxY + 16;
  [
    ['CNPJ:', '35.510.979/0001-22'],
    ['Endereço:', 'Rua Rua Clotilde Galea, 170 - Vila Osasco, São Paulo'],
    ['Telefone:', '11 4709-9523'],
    ['Email:', 'contato@cleverconnection.com.br | www.cleverconnection.com.br'],
  ].forEach(([label, value]) => {
    doc.setTextColor(...palette.muted);
    doc.text(label, leftXData, lineYData, { maxWidth: colWidthData - labelOffsetData });
    doc.setTextColor(17, 24, 39);
    doc.text(value, leftXData + labelOffsetData, lineYData, { maxWidth: colWidthData - labelOffsetData });
    lineYData += rowGapData;
  });

  lineYData = bodyBoxY + 16;
  [
    ['Banco:', '077 - Inter'],
    ['Agência:', '39885873'],
    ['Conta:', '0001'],
    ['Site:', 'www.cleverconnection.com.br'],
  ].forEach(([label, value]) => {
    doc.setTextColor(...palette.muted);
    doc.text(label, rightXData, lineYData, { maxWidth: colWidthData - labelOffsetData });
    doc.setTextColor(17, 24, 39);
    doc.text(value, rightXData + labelOffsetData, lineYData, { maxWidth: colWidthData - labelOffsetData });
    lineYData += rowGapData;
  });

  y += infoCardHeight + 6;

  const applyWatermark = async (pdfDoc) => {
    const text = 'Documento Confidencial';
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 20;
    pdfDoc.getPages().forEach((page) => {
      const { width } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const x = (width - textWidth) / 2;
      const yPos = 16;
      page.drawText(text, {
        x,
        y: yPos,
        size: fontSize,
        font,
        color: rgb(0.85, 0.1, 0.1),
        opacity: 0.22,
        rotate: degrees(0),
      });
    });
  };

  try {
    const pdfBytes = doc.output('arraybuffer');
    const generatedPdf = await PDFDocument.load(pdfBytes);
    await applyWatermark(generatedPdf);

    const baseUrl = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
    const coverUrl = encodeURI(`${baseUrl}/Capa Orçamento.pdf`);
    const coverResponse = await fetch(coverUrl);

    if (!coverResponse.ok) {
      throw new Error(`Falha ao carregar capa (${coverResponse.status})`);
    }

    const coverBytes = await coverResponse.arrayBuffer();

    const mergedPdf = await PDFDocument.create();
    const coverPdf = await PDFDocument.load(coverBytes);
    const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
    coverPages.forEach((page) => mergedPdf.addPage(page));

    const generatedPages = await mergedPdf.copyPages(generatedPdf, generatedPdf.getPageIndices());
    generatedPages.forEach((page) => mergedPdf.addPage(page));

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    if (download) {
      downloadBlob(blob, filename);
    }
    return { blob, filename };
  } catch (error) {
    console.warn('Falha ao anexar capa do PDF, salvando sem capa', error);
    const pdfBytes = doc.output('arraybuffer');
    const generatedPdf = await PDFDocument.load(pdfBytes);
    await applyWatermark(generatedPdf);
    const finalBytes = await generatedPdf.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    if (download) {
      downloadBlob(blob, filename);
    }
    return { blob, filename };
  }
};
