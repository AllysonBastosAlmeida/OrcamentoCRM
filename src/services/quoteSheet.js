import axios from "axios";
import { acquireToken } from "../auth.js";

const siteId = import.meta.env.VITE_GRAPH_SITE_ID_ORCAMENTOS || import.meta.env.VITE_GRAPH_SITE_ID;
const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID_ORCAMENTOS || import.meta.env.VITE_GRAPH_DRIVE_ID;
const itemId = import.meta.env.VITE_GRAPH_ITEM_ORCAMENTOS;
const sheetName = import.meta.env.VITE_GRAPH_SHEET_ORCAMENTOS || "Processos_Orcamentos";

const graphBase = "https://graph.microsoft.com/v1.0";
const columnEnd = "M"; // 13 colunas: A-M (inclui coluna de detalhes)
const columnCount = 13;
const auditSheetName = import.meta.env.VITE_GRAPH_SHEET_AUDIT || "Historico_Orcamentos";
const auditColumnEnd = "H";
const AUDIT_HEADERS = ["Data", "Acao", "PO", "Cliente", "Titulo", "Usuario", "Email", "Origem"];

const DETAIL_HEADER_KEYS = ["detalhes", "detalhe", "dados", "json", "payload"];
const DETAILS_VERSION = 1;

const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const AUDIT_HEADER_KEYS = AUDIT_HEADERS.map((h) => normalizeKey(h));

const parseNumber = (val) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const str = val.toString();
  const cleaned = str.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return 0;

  if (cleaned.includes(".") && cleaned.includes(",")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isNaN(num) ? 0 : num;
  }

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let decimalSep = -1;
  if (lastDot > lastComma) decimalSep = lastDot;
  if (lastComma > lastDot) decimalSep = lastComma;

  if (decimalSep === -1) {
    const num = Number(cleaned.replace(/[.,]/g, ""));
    return Number.isNaN(num) ? 0 : num;
  }

  const intPart = cleaned.slice(0, decimalSep).replace(/[.,]/g, "");
  const decPart = cleaned.slice(decimalSep + 1);
  const num = Number(`${intPart}.${decPart}`);
  return Number.isNaN(num) ? 0 : num;
};

const parseExcelDate = (val) => {
  if (val === undefined || val === null || val === "") return "";
  if (typeof val === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + val * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      if (day && month && year) {
        const iso = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
        return iso;
      }
    }
  }
  return val;
};

const formatNumberSheet = (val) => {
  const num = Number(val || 0);
  if (Number.isNaN(num)) return "";
  return num.toFixed(2);
};

const sanitizeQuoteDetails = (quote) => ({
  id: quote?.id || "",
  poNumber: quote?.poNumber || "",
  title: quote?.title || "",
  clientId: quote?.clientId || "",
  clientName: quote?.clientName || "",
  clientCompany: quote?.clientCompany || "",
  clientEmail: quote?.clientEmail || "",
  clientPhone: quote?.clientPhone || "",
  contactName: quote?.contactName || "",
  contactPhone: quote?.contactPhone || "",
  contactEmail: quote?.contactEmail || "",
  status: quote?.status || "",
  validUntil: quote?.validUntil || "",
  deliveryTime: quote?.deliveryTime || "",
  paymentTerms: quote?.paymentTerms || "",
  category: quote?.category || "",
  discountValue: quote?.discountValue ?? 0,
  taxRate: quote?.taxRate ?? 0,
  showItemValues: quote?.showItemValues === true,
  items: Array.isArray(quote?.items) ? quote.items : [],
  notes: quote?.notes || "",
  scope: quote?.scope || "",
  createdAt: quote?.createdAt || "",
  subtotal: quote?.subtotal ?? null,
  total: quote?.total ?? null,
  approvalStatus: quote?.approvalStatus || "",
  responsible: quote?.responsible || "",
  createdBy: quote?.createdBy || "",
  createdByEmail: quote?.createdByEmail || "",
  updatedBy: quote?.updatedBy || "",
  updatedByEmail: quote?.updatedByEmail || "",
  updatedAt: quote?.updatedAt || "",
  source: quote?.source || "",
});

const serializeQuoteDetails = (quote) => {
  try {
    const data = sanitizeQuoteDetails(quote);
    return JSON.stringify({ v: DETAILS_VERSION, data });
  } catch (error) {
    console.warn("[quoteSheet] falha ao serializar detalhes do orcamento", error);
    return "";
  }
};

const parseQuoteDetails = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === "object") {
      if (parsed.data && typeof parsed.data === "object") return parsed.data;
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return null;
};

const hasQuoteSheetConfig = Boolean(driveId && itemId);
if (!hasQuoteSheetConfig) {
  console.warn("[quoteSheet] Config ausente: defina VITE_GRAPH_DRIVE_ID e VITE_GRAPH_ITEM_ORCAMENTOS.");
}

const ensureConfig = () => {
  if (!hasQuoteSheetConfig) {
    throw new Error("Configuracao do Excel de Orcamentos ausente (driveId/itemId especifico para Orcamentos).");
  }
};

const fetchSheetRows = async () => {
  ensureConfig();
  const token = await acquireToken();
  const sheetCandidates = Array.from(
    new Set(
      [
        sheetName,
        sheetName?.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
        "Processos_Orçamentos",
        "Processos_Orcamentos",
        "Processos_Orcaments",
      ].filter(Boolean)
    )
  );

  const tryUrl = async (sheet) => {
    const encodedSheet = encodeURIComponent(sheet);
    const primary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;
    const fallback =
      siteId &&
      `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;

    const doReq = async (url) => {
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      return response.data?.values || response.data?.value?.[0]?.values || [];
    };

    try {
      console.info("[quoteSheet] GET usedRange", { sheet, url: primary });
      return await doReq(primary);
    } catch (err) {
      if (fallback) {
        console.warn("[quoteSheet] drive endpoint falhou, tentando siteId", { status: err?.response?.status });
        return await doReq(fallback);
      }
      throw err;
    }
  };

  for (const sheet of sheetCandidates) {
    try {
      const rows = await tryUrl(sheet);
      if (rows?.length) return { rows, sheet };
    } catch {
      // tenta proximo
    }
  }

  return { rows: [], sheet: sheetName };
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map((cell) => normalizeKey(cell));
    if (normalized.includes("po") && normalized.includes("cliente")) {
      return { headerIndex: i, headers: rows[i], dataRows: rows.slice(i + 1) };
    }
  }
  return { headerIndex: 0, headers: rows[0] || [], dataRows: rows.slice(1) };
};

const headerIndexByName = (headers, name) => headers.findIndex((h) => normalizeKey(h) === name);
const headerIndexByMatch = (headers, keys) => {
  const normalized = headers.map((h) => normalizeKey(h));
  const direct = normalized.findIndex((h) => keys.includes(h));
  if (direct !== -1) return direct;
  return normalized.findIndex((h) => keys.some((key) => h.includes(key)));
};

const resolveInvoiceTriggerColumnIndex = (headers) => {
  const matched = headerIndexByMatch(headers, [
    "data_criacao",
    "data criacao",
    "data_criacao_nf",
    "criar nf",
  ]);
  if (matched !== -1) return matched;
  return 14;
};

const getNextPoNumber = (headers, dataRows) => {
  const poIdx = headerIndexByName(headers, "po");
  if (poIdx === -1) return "1";
  const clienteIdx = headerIndexByName(headers, "cliente");
  const assuntoIdx = headerIndexByName(headers, "assunto");
  const statusIdx = headerIndexByName(headers, "status");

  const isRowRelevant = (row) => {
    const hasCliente = clienteIdx >= 0 && row[clienteIdx];
    const hasAssunto = assuntoIdx >= 0 && row[assuntoIdx];
    const hasStatus = statusIdx >= 0 && row[statusIdx];
    return hasCliente || hasAssunto || hasStatus;
  };

  let maxPo = 0;
  dataRows.forEach((row) => {
    if (!isRowRelevant(row)) return;
    const val = parseNumber(row[poIdx]);
    if (val > maxPo) maxPo = val;
  });
  const next = maxPo + 1;
  return next.toString().padStart(2, "0");
};

const formatDate = (dateIso) => {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toISOString().slice(0, 10);
};

const columnIndexToLetter = (index) => {
  if (!Number.isFinite(index) || index < 0) return "";
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

const buildRow = (quote, poNumber) => {
  const details = serializeQuoteDetails({ ...quote, poNumber });
  return [
    quote.clientId || "",
    poNumber,
    formatDate(quote.createdAt || new Date().toISOString()),
    quote.clientCompany || quote.clientName || "",
    quote.title || "",
    quote.category || "",
    formatNumberSheet(quote.total ?? quote.subtotal ?? 0),
    quote.status || "",
    quote.status || "",
    quote.approvalStatus || "Aguardando",
    quote.contactName || "",
    quote.notes || "",
    details,
  ];
};

export const appendQuoteRow = async (quote) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao gravando na planilha.");
    return null;
  }
  try {
    const { rows, sheet } = await fetchSheetRows();
    if (!rows.length) throw new Error("Planilha vazia ou inacessivel");
    const { headerIndex, headers, dataRows } = findHeaderRow(rows);

    const poNumber = getNextPoNumber(headers, dataRows);
    const row = buildRow(quote, poNumber);

    const lastFilledIndex = (() => {
      for (let i = dataRows.length - 1; i >= 0; i -= 1) {
        if (dataRows[i]?.some((cell) => cell !== undefined && cell !== null && cell !== "")) return i;
      }
      return -1;
    })();
    const targetRow = headerIndex + 2 + lastFilledIndex + 1;
    const rangeAddress = `A${targetRow}:${columnEnd}${targetRow}`;
    const encodedSheet = encodeURIComponent(sheet || sheetName);
    const urlPrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const urlFallback =
      siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const token = await acquireToken();

    console.info("[quoteSheet] PATCH append row", { rangeAddress, targetRow, poNumber, row });

    const doPatch = async (url) =>
      axios.patch(
        url,
        { values: [row] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

    try {
      await doPatch(urlPrimary);
    } catch (err) {
      if (urlFallback) {
        console.warn("[quoteSheet] add via drive falhou, tentando siteId", { status: err?.response?.status, data: err?.response?.data });
        await doPatch(urlFallback);
      } else {
        throw err;
      }
    }

    return poNumber;
  } catch (error) {
    console.warn("Falha ao gravar orcamento na planilha", error);
    return null;
  }
};

export const updateQuoteRow = async (quote, previousPo) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao atualizando na planilha.");
    return;
  }
  const targetPo = previousPo ?? quote?.poNumber;
  if (!targetPo) return;
  try {
    const { rows, sheet } = await fetchSheetRows();
    if (!rows.length) return;
    const { headerIndex, headers, dataRows } = findHeaderRow(rows);
    const poIdx = headerIndexByName(headers, "po");
    if (poIdx === -1) return;

    const matchPo = (value, target) => {
      if (value === undefined || value === null) return false;
      const text = value.toString().trim();
      if (!text) return false;
      const numVal = parseNumber(text);
      const numTarget = parseNumber(target);
      if (numVal && numTarget) return numVal === numTarget;
      return text === target.toString();
    };

    const findRowIndex = (target) => dataRows.findIndex((row) => matchPo(row[poIdx], target));

    let rowIndex = findRowIndex(targetPo);
    if (rowIndex === -1 && previousPo && quote?.poNumber && previousPo.toString() !== quote.poNumber.toString()) {
      rowIndex = findRowIndex(quote.poNumber);
    }
    if (rowIndex === -1) {
      console.warn("[quoteSheet] PO nao encontrada para atualizar", { poNumber: targetPo, updatedPo: quote?.poNumber || "" });
      return;
    }

    const targetRow = headerIndex + 2 + rowIndex;
    const rangeAddress = `A${targetRow}:${columnEnd}${targetRow}`;
    const encodedSheet = encodeURIComponent(sheet || sheetName);
    const urlPrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const urlFallback =
      siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const token = await acquireToken();

    const effectivePo = quote?.poNumber || targetPo;
    const row = buildRow({ ...quote, poNumber: effectivePo }, effectivePo);
    console.info("[quoteSheet] UPDATE row", { poNumber: effectivePo, previousPo: targetPo, rangeAddress, targetRow });

    const doPatch = async (url) =>
      axios.patch(
        url,
        { values: [row] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

    try {
      await doPatch(urlPrimary);
    } catch (err) {
      if (urlFallback) {
        console.warn("[quoteSheet] update via drive falhou, tentando siteId", { status: err?.response?.status });
        await doPatch(urlFallback);
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.warn("Falha ao atualizar orcamento na planilha", error);
  }
};

export const updateQuoteApprovalStatus = async (poNumber, approvalStatus) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao atualizando aprovacao na planilha.");
    return;
  }
  if (!poNumber) return;
  try {
    const { rows, sheet } = await fetchSheetRows();
    if (!rows.length) return;
    const { headerIndex, headers, dataRows } = findHeaderRow(rows);
    const poIdx = headerIndexByName(headers, "po");
    const approvalIdx = headerIndexByName(headers, "aprovacao");
    const invoiceTriggerIdx = resolveInvoiceTriggerColumnIndex(headers);
    if (poIdx === -1 || approvalIdx === -1) return;

    const matchPo = (value, target) => {
      if (value === undefined || value === null) return false;
      const text = value.toString().trim();
      if (!text) return false;
      const numVal = parseNumber(text);
      const numTarget = parseNumber(target);
      if (numVal && numTarget) return numVal === numTarget;
      return text === target.toString();
    };

    const rowIndex = dataRows.findIndex((row) => matchPo(row[poIdx], poNumber));
    if (rowIndex === -1) {
      console.warn("[quoteSheet] PO nao encontrada para atualizar aprovacao", { poNumber });
      return;
    }

    const targetRow = headerIndex + 2 + rowIndex;
    const encodedSheet = encodeURIComponent(sheet || sheetName);
    const token = await acquireToken();
    const canUseFallback = Boolean(siteId);
    const normalizedApproval = normalizeKey(approvalStatus);
    const invoiceTriggerValue = normalizedApproval === "aprovado" ? "Criar NF" : "";

    const updates = [
      { columnIndex: approvalIdx, value: approvalStatus || "" },
      { columnIndex: invoiceTriggerIdx, value: invoiceTriggerValue },
    ].filter((entry, index, array) => entry.columnIndex >= 0 && array.findIndex((item) => item.columnIndex === entry.columnIndex) === index);

    const doPatch = async (columnIndex, value, useFallback = false) => {
      const columnLetter = columnIndexToLetter(columnIndex);
      if (!columnLetter) return;
      const rangeAddress = `${columnLetter}${targetRow}`;
      const url = useFallback
        ? `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`
        : `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
      await axios.patch(
        url,
        { values: [[value]] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
    };

    try {
      for (const update of updates) {
        // eslint-disable-next-line no-await-in-loop
        await doPatch(update.columnIndex, update.value);
      }
    } catch (err) {
      if (canUseFallback) {
        for (const update of updates) {
          // eslint-disable-next-line no-await-in-loop
          await doPatch(update.columnIndex, update.value, true);
        }
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.warn("Falha ao atualizar aprovacao na planilha", error);
  }
};

export const deleteQuoteRow = async (poNumber) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao excluindo na planilha.");
    return;
  }
  if (!poNumber) return;
  try {
    console.info("[quoteSheet] delete start", { poNumber });
    const { rows, sheet } = await fetchSheetRows();
    if (!rows.length) return;
    const { headerIndex, headers, dataRows } = findHeaderRow(rows);
    const poIdx = headerIndexByName(headers, "po");
    if (poIdx === -1) return;

    const dataIdx = dataRows.findIndex((row) => (row[poIdx] || "").toString() === poNumber.toString());
    if (dataIdx === -1) {
      console.warn("[quoteSheet] PO nao encontrada para excluir", { poNumber });
      return;
    }

    const targetRow = headerIndex + 2 + dataIdx;
    const rangeAddress = `A${targetRow}:${columnEnd}${targetRow}`;
    const encodedSheet = encodeURIComponent(sheet || sheetName);
    const token = await acquireToken();

    const urlBasePrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;
    const urlBaseFallback = siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;

    const matchPo = (value) => {
      if (value === undefined || value === null) return false;
      const text = value.toString().trim();
      if (!text) return false;
      const numVal = parseNumber(text);
      const numTarget = parseNumber(poNumber);
      if (numVal && numTarget) return numVal === numTarget;
      return text === poNumber.toString();
    };

    const deleteFromTable = async (baseUrl) => {
      const tableList = await axios.get(`${baseUrl}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tables = tableList.data?.value || [];
      if (!tables.length) return { removed: false, hasTable: false };
      for (const table of tables) {
        const tableId = encodeURIComponent(table.id || table.name);
        const columnsRes = await axios.get(`${baseUrl}/tables/${tableId}/columns`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const columns = columnsRes.data?.value || [];
        const poColumnIndex = columns.findIndex((col) => normalizeKey(col.name) === "po");
        if (poColumnIndex === -1) continue;

        const rowsRes = await axios.get(`${baseUrl}/tables/${tableId}/rows`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = rowsRes.data?.value || [];
        const rowHit = rows.find((row) => matchPo(row?.values?.[0]?.[poColumnIndex]));
        if (!rowHit) continue;
        const rowIndex = Number.isFinite(rowHit.index) ? rowHit.index : rows.indexOf(rowHit);
        if (rowIndex === -1) continue;
        await axios.delete(`${baseUrl}/tables/${tableId}/rows/${rowIndex}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { removed: true, hasTable: true };
      }
      return { removed: false, hasTable: true };
    };

    let removed = false;
    let hasTable = false;
    try {
      const res = await deleteFromTable(urlBasePrimary);
      removed = res.removed;
      hasTable = res.hasTable;
    } catch (err) {
      console.warn("[quoteSheet] delete via table falhou", { status: err?.response?.status, data: err?.response?.data });
    }
    if (!removed && urlBaseFallback) {
      try {
        const res = await deleteFromTable(urlBaseFallback);
        removed = res.removed;
        hasTable = hasTable || res.hasTable;
      } catch (err) {
        console.warn("[quoteSheet] delete via table (siteId) falhou", { status: err?.response?.status, data: err?.response?.data });
      }
    }
    if (removed) return;

    const doDeleteRange = async (baseUrl) =>
      axios.post(
        `${baseUrl}/range(address='${rangeAddress}')/delete`,
        { shift: "Up" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

    if (!hasTable) {
      try {
        await doDeleteRange(urlBasePrimary);
        return;
      } catch (err) {
        if (urlBaseFallback) {
          try {
            console.warn("[quoteSheet] delete via drive falhou, tentando siteId", { status: err?.response?.status, data: err?.response?.data });
            await doDeleteRange(urlBaseFallback);
            return;
          } catch (err2) {
            console.warn("[quoteSheet] delete via siteId falhou", { status: err2?.response?.status, data: err2?.response?.data });
          }
        } else {
          console.warn("[quoteSheet] delete via drive falhou", { status: err?.response?.status, data: err?.response?.data });
        }
      }
    }

    const emptyRow = new Array(columnCount).fill("");
    const doPatch = async (baseUrl) =>
      axios.patch(
        `${baseUrl}/range(address='${rangeAddress}')`,
        { values: [emptyRow] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

    console.info("[quoteSheet] PATCH clear row (fallback)", { poNumber, rangeAddress, targetRow });

    try {
      await doPatch(urlBasePrimary);
    } catch (err) {
      if (urlBaseFallback) {
        console.warn("[quoteSheet] clear via drive falhou, tentando siteId", { status: err?.response?.status, data: err?.response?.data });
        await doPatch(urlBaseFallback);
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.warn("Falha ao excluir orcamento da planilha", error);
  }
};

export { hasQuoteSheetConfig };

const getWorkbookBaseUrl = (useSite) =>
  useSite && siteId
    ? `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook`
    : `${graphBase}/drives/${driveId}/items/${itemId}/workbook`;

const getWorksheetUrl = (sheet, useSite) => `${getWorkbookBaseUrl(useSite)}/worksheets/${encodeURIComponent(sheet)}`;

const getRangeUrl = (sheet, range, useSite) =>
  `${getWorksheetUrl(sheet, useSite)}/range(address='${range}')`;

const ensureAuditSheet = async () => {
  if (!hasQuoteSheetConfig) return { useSite: false };
  const token = await acquireToken();
  const headers = { Authorization: `Bearer ${token}` };

  const tryEnsure = async (useSite) => {
    const worksheetUrl = getWorksheetUrl(auditSheetName, useSite);
    const workbookUrl = getWorkbookBaseUrl(useSite);
    try {
      await axios.get(worksheetUrl, { headers });
    } catch (err) {
      if (err?.response?.status === 404) {
        await axios.post(
          `${workbookUrl}/worksheets/add`,
          { name: auditSheetName },
          { headers: { ...headers, "Content-Type": "application/json" } },
        );
      } else {
        throw err;
      }
    }

    const used = await axios.get(`${worksheetUrl}/usedRange(valuesOnly=true)`, { headers });
    const values = used.data?.values || used.data?.value?.[0]?.values || [];
    const headerRow = values?.[0] || [];
    const normalized = headerRow.map((cell) => normalizeKey(cell));
    const hasHeaders = AUDIT_HEADER_KEYS.every((key) => normalized.includes(key));
    if (!hasHeaders) {
      const headerRange = `A1:${auditColumnEnd}1`;
      await axios.patch(
        getRangeUrl(auditSheetName, headerRange, useSite),
        { values: [AUDIT_HEADERS] },
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    }
    return { useSite };
  };

  try {
    return await tryEnsure(false);
  } catch (err) {
    if (siteId) {
      return await tryEnsure(true);
    }
    throw err;
  }
};

export const appendAuditEntryToSheet = async (entry) => {
  if (!hasQuoteSheetConfig) return;
  try {
    const { useSite } = await ensureAuditSheet();
    const token = await acquireToken();
    const headers = { Authorization: `Bearer ${token}` };
    const worksheetUrl = getWorksheetUrl(auditSheetName, useSite);
    const used = await axios.get(`${worksheetUrl}/usedRange(valuesOnly=true)`, { headers });
    const values = used.data?.values || used.data?.value?.[0]?.values || [];
    const dataRows = values.length > 1 ? values.slice(1) : [];
    const lastFilledIndex = (() => {
      for (let i = dataRows.length - 1; i >= 0; i -= 1) {
        if (dataRows[i]?.some((cell) => cell !== undefined && cell !== null && cell !== "")) return i;
      }
      return -1;
    })();
    const targetRow = 2 + lastFilledIndex + 1;
    const rangeAddress = `A${targetRow}:${auditColumnEnd}${targetRow}`;
    const row = [
      entry.timestamp || new Date().toISOString(),
      entry.action || "update",
      entry.poNumber || "",
      entry.clientCompany || "",
      entry.title || "",
      entry.userName || "",
      entry.userEmail || "",
      entry.source || "",
    ];
    await axios.patch(
      getRangeUrl(auditSheetName, rangeAddress, useSite),
      { values: [row] },
      { headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.warn("[auditSheet] Falha ao registrar historico", error);
  }
};

export const fetchAuditLogFromSheet = async () => {
  if (!hasQuoteSheetConfig) return [];
  try {
    const { useSite } = await ensureAuditSheet();
    const token = await acquireToken();
    const headers = { Authorization: `Bearer ${token}` };
    const worksheetUrl = getWorksheetUrl(auditSheetName, useSite);
    const used = await axios.get(`${worksheetUrl}/usedRange(valuesOnly=true)`, { headers });
    const values = used.data?.values || used.data?.value?.[0]?.values || [];
    if (!values.length) return [];
    const headersRow = values[0] || [];
    const dataRows = values.slice(1);
    const idx = (key) => headersRow.findIndex((cell) => normalizeKey(cell) === key);
    const dateIdx = idx("data");
    const actionIdx = idx("acao");
    const poIdx = idx("po");
    const clientIdx = idx("cliente");
    const titleIdx = idx("titulo");
    const userIdx = idx("usuario");
    const emailIdx = idx("email");
    const sourceIdx = idx("origem");

    const log = dataRows
      .filter((row) => row.some(Boolean))
      .map((row) => ({
        id: crypto.randomUUID(),
        action: actionIdx >= 0 ? row[actionIdx] || "" : "",
        poNumber: poIdx >= 0 ? row[poIdx] || "" : "",
        title: titleIdx >= 0 ? row[titleIdx] || "" : "",
        clientCompany: clientIdx >= 0 ? row[clientIdx] || "" : "",
        userName: userIdx >= 0 ? row[userIdx] || "" : "",
        userEmail: emailIdx >= 0 ? row[emailIdx] || "" : "",
        timestamp: dateIdx >= 0 ? row[dateIdx] || "" : "",
        source: sourceIdx >= 0 ? row[sourceIdx] || "" : "",
      }));

    log.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    return log;
  } catch (error) {
    console.warn("[auditSheet] Falha ao ler historico", error);
    return [];
  }
};

export const fetchQuoteHistory = async () => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao lendo historico da planilha.");
    return [];
  }
  try {
    const { rows } = await fetchSheetRows();
    if (!rows.length) return [];
    const { headers, dataRows } = findHeaderRow(rows);

    const idIdx = headerIndexByName(headers, "id");
    const poIdx = headerIndexByName(headers, "po");
    const dataIdx = headerIndexByName(headers, "data");
    const clienteIdx = headerIndexByName(headers, "cliente");
    const assuntoIdx = headerIndexByName(headers, "assunto");
    const categoriaIdx = headerIndexByName(headers, "categoria");
    const valorIdx = headerIndexByName(headers, "valor");
    const statusIdx = headerIndexByName(headers, "status");
    const condicaoIdx = headerIndexByName(headers, "condicao");
    const aprovacaoIdx = headerIndexByName(headers, "aprovacao");
    const respIdx = headerIndexByName(headers, "responsavel");
    const obsIdx = headerIndexByName(headers, "observacao");
    const detailsIdx = headerIndexByMatch(headers, DETAIL_HEADER_KEYS);

    const map = (row) => {
      const safe = (idx) => (idx >= 0 ? row[idx] || "" : "");

      const poNumber = safe(poIdx);
      const dateRaw = safe(dataIdx);
      const detailsCell = detailsIdx >= 0 ? safe(detailsIdx) : row?.[12];
      const details = parseQuoteDetails(detailsCell);
      return {
        id: poNumber || crypto.randomUUID(),
        poNumber,
        clientId: safe(idIdx),
        date: parseExcelDate(dateRaw),
        clientName: safe(clienteIdx),
        title: safe(assuntoIdx),
        category: safe(categoriaIdx),
        total: safe(valorIdx),
        totalNumber: parseNumber(safe(valorIdx)),
        status: safe(statusIdx),
        condition: safe(condicaoIdx),
        approval: safe(aprovacaoIdx),
        responsible: safe(respIdx),
        notes: safe(obsIdx),
        details,
      };
    };

    const history = dataRows.filter((row) => row.some(Boolean)).map(map);
    history.sort((a, b) => parseNumber(b.poNumber) - parseNumber(a.poNumber));
    return history;
  } catch (error) {
    console.warn("Falha ao ler historico de orcamentos na planilha", error);
    return [];
  }
};
