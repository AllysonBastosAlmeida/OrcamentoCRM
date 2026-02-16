import axios from "axios";
import { acquireToken } from "../auth.js";

const siteId = import.meta.env.VITE_GRAPH_SITE_ID_ORCAMENTOS || import.meta.env.VITE_GRAPH_SITE_ID;
const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID_ORCAMENTOS || import.meta.env.VITE_GRAPH_DRIVE_ID;
const itemId = import.meta.env.VITE_GRAPH_ITEM_ORCAMENTOS;
const sheetName = import.meta.env.VITE_GRAPH_SHEET_ORCAMENTOS || "Processos_Orcamentos";
const tableName = import.meta.env.VITE_GRAPH_TABLE_ORCAMENTOS || "Process_Orcam";

const graphBase = "https://graph.microsoft.com/v1.0";
const columnEnd = "L"; // 12 colunas: A-L

const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

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
      if (rows?.length) return rows;
    } catch {
      // tenta proximo
    }
  }

  return [];
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

const buildRow = (quote, poNumber) => [
  quote.clientId || "",
  poNumber,
  formatDate(quote.createdAt || new Date().toISOString()),
  quote.clientCompany || quote.clientName || "",
  quote.title || "",
  quote.category || "",
  formatNumberSheet(quote.total ?? quote.subtotal ?? 0),
  quote.status || "",
  quote.status || "",
  quote.approvalStatus || "",
  quote.contactName || "",
  quote.notes || "",
];

export const appendQuoteRow = async (quote) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao gravando na planilha.");
    return null;
  }
  try {
    const rows = await fetchSheetRows();
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
    const encodedSheet = encodeURIComponent(sheetName);
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

export const updateQuoteRow = async (quote) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao atualizando na planilha.");
    return;
  }
  if (!quote?.poNumber) return;
  try {
    const rows = await fetchSheetRows();
    if (!rows.length) return;
    const { headerIndex, headers, dataRows } = findHeaderRow(rows);
    const poIdx = headerIndexByName(headers, "po");
    if (poIdx === -1) return;

    const rowIndex = dataRows.findIndex((row) => (row[poIdx] || "").toString() === quote.poNumber.toString());
    if (rowIndex === -1) {
      console.warn("[quoteSheet] PO nao encontrada para atualizar", { poNumber: quote.poNumber });
      return;
    }

    const targetRow = headerIndex + 2 + rowIndex;
    const rangeAddress = `A${targetRow}:${columnEnd}${targetRow}`;
    const encodedSheet = encodeURIComponent(sheetName);
    const urlPrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const urlFallback =
      siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
    const token = await acquireToken();

    const row = buildRow(quote, quote.poNumber);
    console.info("[quoteSheet] UPDATE row", { poNumber: quote.poNumber, rangeAddress, targetRow });

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

export const deleteQuoteRow = async (poNumber) => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao excluindo na planilha.");
    return;
  }
  if (!poNumber) return;
  try {
    console.info("[quoteSheet] delete start", { poNumber });
    const rows = await fetchSheetRows();
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
    const encodedSheet = encodeURIComponent(sheetName);
    const token = await acquireToken();

    const tableCandidates = Array.from(
      new Set([tableName, tableName?.normalize("NFD").replace(/\p{Diacritic}/gu, ""), "Process_Orcam", "Process_Orcam"].filter(Boolean)),
    );
    let removed = false;
    const doDelete = async (url) =>
      axios.delete(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

    for (const table of tableCandidates) {
      const encodedTable = encodeURIComponent(table);
      const urlPrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/tables/${encodedTable}/rows/${dataIdx}`;
      const urlFallback =
        siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/tables/${encodedTable}/rows/${dataIdx}`;
      try {
        await doDelete(urlPrimary);
        removed = true;
        break;
      } catch (err) {
        if (urlFallback) {
          try {
            console.warn("[quoteSheet] delete via drive falhou, tentando siteId", { table, status: err?.response?.status, data: err?.response?.data });
            await doDelete(urlFallback);
            removed = true;
            break;
          } catch (err2) {
            console.warn("[quoteSheet] delete via siteId falhou", { table, status: err2?.response?.status, data: err2?.response?.data });
          }
        } else {
          console.warn("[quoteSheet] delete via drive falhou", { table, status: err?.response?.status, data: err?.response?.data });
        }
      }
    }

    if (!removed) {
      const urlPrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
      const urlFallback =
        siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/range(address='${rangeAddress}')`;
      const emptyRow = new Array(12).fill("");

      const doPatch = async (url) =>
        axios.patch(
          url,
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
        await doPatch(urlPrimary);
      } catch (err) {
        if (urlFallback) {
          console.warn("[quoteSheet] clear via drive falhou, tentando siteId", { status: err?.response?.status, data: err?.response?.data });
          await doPatch(urlFallback);
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    console.warn("Falha ao excluir orcamento da planilha", error);
  }
};

export { hasQuoteSheetConfig };

export const fetchQuoteHistory = async () => {
  if (!hasQuoteSheetConfig) {
    console.warn("[quoteSheet] Config ausente, nao lendo historico da planilha.");
    return [];
  }
  try {
    const rows = await fetchSheetRows();
    if (!rows.length) return [];
    const { headers, dataRows } = findHeaderRow(rows);
    console.info("[quoteSheet] headers detectados", headers);
    console.info("[quoteSheet] primeira linha", dataRows?.[0]);

    const map = (row) => {
      const safe = (idx) => (idx >= 0 ? row[idx] || "" : "");
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

      const poNumber = safe(poIdx);
      const dateRaw = safe(dataIdx);
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
