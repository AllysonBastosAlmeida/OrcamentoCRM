
import axios from 'axios';
import mockProducts from '../data/mockProducts.js';
import { acquireToken } from '../auth.js';

const siteId = import.meta.env.VITE_GRAPH_SITE_ID;
const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID;
const itemId = import.meta.env.VITE_GRAPH_ITEM_ID;
const sheetMateriais = import.meta.env.VITE_GRAPH_SHEET_MATERIAIS || 'Materiais';
// Nome da aba de serviços (fallback ASCII)
const sheetServicos = import.meta.env.VITE_GRAPH_SHEET_SERVICOS || 'Servicos';

const graphBase = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos

let productsCache = {
  data: null,
  timestamp: 0,
  sheet: sheetMateriais,
  source: 'unknown',
};

const hasSharePointConfig = Boolean(driveId && itemId);

const buildGraphHeaders = (token, forceRefresh = false) => {
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (forceRefresh) {
    headers['Cache-Control'] = 'no-cache, no-store, max-age=0, must-revalidate';
    headers.Pragma = 'no-cache';
    headers.Expires = '0';
    headers['If-Modified-Since'] = '0';
  }
  return headers;
};

const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const parseNumber = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const cleaned = value.toString().replace(/[^\d,-.]/g, '').replace(/\./g, '').replace(',', '.');
  const result = Number(cleaned);
  return Number.isNaN(result) ? 0 : result;
};

const mapRowToProduct = (headers, row) => {
  const product = {};
  headers.forEach((header, idx) => {
    const key = normalizeKey(header);
    product[key] = row[idx];
  });

  const price = parseNumber(product.valor ?? product.preco ?? product.price ?? product.total ?? 0);
  const quantity = parseNumber(product.quantidade ?? product.estoque ?? 0);
  const itemValue = product.item || product.id || product.sku || '';

  return {
    id: itemValue || crypto.randomUUID(),
    item: itemValue,
    name: product.descricao || product.nome || product.name || 'Produto',
    sku: product.sku || product.codigo || '',
    price,
    stock: quantity,
    unit: product.tipo || product.unidade || product.un || '',
    category: product.categoria || 'Geral',
    description: product.observacao || product.obs || product.descricao || '',
    updatedAt: product.atualizadoem || new Date().toISOString(),
  };
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalizedRow = rows[i].map((cell) => normalizeKey(cell));
    const hasDescricao = normalizedRow.some((c) => c?.includes('descri'));
    const hasItem = normalizedRow.some((c) => c === 'item');
    const hasValor = normalizedRow.some((c) => c === 'valor' || c === 'preco');
    if (hasDescricao && hasItem && hasValor) {
      return { headers: rows[i], dataRows: rows.slice(i + 1) };
    }
  }
  return { headers: rows[0] || [], dataRows: rows.slice(1) };
};

const fetchProductsFromGraph = async (sheetName, options = {}) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }
  const token = await acquireToken();
  const headers = buildGraphHeaders(token, options.forceRefresh);
  const doRequest = async (sheet) => {
    const encodedSheet = encodeURIComponent(sheet);
    const primary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;
    const fallback =
      siteId &&
      `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;

    const tryUrl = async (url) => {
      const response = await axios.get(url, {
        headers,
      });
      return { rows: response.data?.values || response.data?.value?.[0]?.values || [], url, sheet };
    };

    try {
      return await tryUrl(primary);
    } catch (err) {
      if (fallback) {
        return await tryUrl(fallback);
      }
      throw err;
    }
  };

  const candidates = Array.from(
    new Set(
      [
        sheetName,
        sheetName?.normalize('NFD').replace(/\p{Diacritic}/gu, ''),
        'Serviços',
        'Servicos',
      ].filter(Boolean),
    ),
  );

  let rows = [];
  let lastUrl = '';
  let lastSheet = candidates[0] || sheetName;
  let lastError;

  for (const candidate of candidates) {
    try {
      const res = await doRequest(candidate);
      rows = res.rows;
      lastUrl = res.url;
      lastSheet = res.sheet;
      if (rows.length) break;
    } catch (err) {
      lastError = err;
      lastUrl = err?.config?.url || lastUrl;
      lastSheet = candidate;
    }
  }

  if (!rows.length) {
    const status = lastError?.response?.status;
    console.warn('[api] Planilha vazia ou não encontrada para produtos', {
      sheet: lastSheet,
      tried: candidates,
      status,
      url: lastUrl,
    });
    if (lastError) throw lastError;
    return [];
  }

  const { headers: sheetHeaders, dataRows } = findHeaderRow(rows);

  return dataRows
    .filter((row) => row.some(Boolean))
    .map((row) => mapRowToProduct(sheetHeaders, row));
};

const buildSheetCandidates = (sheetName) => {
  const candidates = [sheetName, sheetName?.normalize('NFD').replace(/\p{Diacritic}/gu, '')].filter(Boolean);
  const norm = normalizeKey(sheetName) || '';
  if (norm.includes('servic')) {
    candidates.push('Servicos');
  }
  if (norm.includes('mater')) {
    candidates.push('Materiais');
  }
  return Array.from(new Set(candidates));
};

const findProductTable = async (baseUrl, token) => {
  const tableList = await axios.get(`${baseUrl}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tables = tableList.data?.value || [];
  for (const table of tables) {
    const tableId = encodeURIComponent(table.id || table.name);
    const columnsRes = await axios.get(`${baseUrl}/tables/${tableId}/columns`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const columns = columnsRes.data?.value || [];
    if (!columns.length) continue;
    const keys = columns.map((col) => normalizeKey(col.name));
    const required = ['item', 'descricao', 'tipo', 'valor', 'categoria'];
    const hasRequired = required.every((req) => keys.includes(req));
    if (!hasRequired) continue;
    return { tableId, columns };
  }
  return null;
};

const buildProductRow = ({ columns, description, unit, price, category, nextItem }) => {
  const safeDescription = (description || '').toString().trim();
  const safeUnit = (unit || '').toString().trim();
  const safeCategory = (category || '').toString().trim();
  const safePrice = parseNumber(price);
  const itemValue = typeof nextItem === 'number' ? nextItem : parseNumber(nextItem) || nextItem;

  return columns.map((col) => {
    const key = normalizeKey(col.name);
    if (key === 'item') return itemValue;
    if (key.startsWith('descri')) return safeDescription;
    if (key === 'tipo' || key === 'unidade' || key === 'un') return safeUnit;
    if (key === 'quantidade' || key === 'qtd') return '';
    if (key === 'valor' || key === 'preco') return safePrice;
    if (key === 'categoria') return safeCategory;
    if (key === 'total') return '';
    if (key.startsWith('observ')) return '';
    return '';
  });
};

const matchItemValue = (cell, target) => {
  if (cell === undefined || cell === null) return false;
  const cellText = cell.toString().trim();
  const targetText = target.toString().trim();
  if (!cellText || !targetText) return false;
  const cellNum = parseNumber(cellText);
  const targetNum = parseNumber(targetText);
  if (cellNum && targetNum) return cellNum === targetNum;
  return cellText === targetText;
};

const findProductRow = async (sheetBase, table, token, item) => {
  const columnKeys = table.columns.map((col) => normalizeKey(col.name));
  const itemIndex = columnKeys.indexOf('item');
  if (itemIndex < 0) return null;

  const rowsRes = await axios.get(`${sheetBase}/tables/${table.tableId}/rows`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const rows = rowsRes.data?.value || [];
  const rowIdx = rows.findIndex((row) => matchItemValue(row?.values?.[0]?.[itemIndex], item));
  if (rowIdx < 0) return null;
  const rowIndex = Number.isFinite(rows[rowIdx]?.index) ? rows[rowIdx].index : rowIdx;
  const rowId = rows[rowIdx]?.id;
  return { rowIndex, rowId, columns: table.columns };
};

export const addProductToSheet = async ({ sheet, description, unit, price, category }) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }
  const token = await acquireToken();
  const candidates = buildSheetCandidates(sheet || sheetMateriais);
  const basePrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const baseFallback =
    siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets`;

  const attemptAdd = async (baseUrl, sheetName) => {
    const encodedSheet = encodeURIComponent(sheetName);
    const sheetBase = `${baseUrl}/${encodedSheet}`;
    const table = await findProductTable(sheetBase, token);
    if (!table) return null;

    const columnKeys = table.columns.map((col) => normalizeKey(col.name));
    const itemIndex = columnKeys.indexOf('item');
    let maxItem = 0;
    if (itemIndex >= 0) {
      const rowsRes = await axios.get(`${sheetBase}/tables/${table.tableId}/rows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = rowsRes.data?.value || [];
      rows.forEach((row) => {
        const value = row?.values?.[0]?.[itemIndex];
        const num = parseNumber(value);
        if (num > maxItem) maxItem = num;
      });
    }
    const nextItem = maxItem + 1;
    const values = buildProductRow({
      columns: table.columns,
      description,
      unit,
      price,
      category,
      nextItem,
    });

    await axios.post(
      `${sheetBase}/tables/${table.tableId}/rows/add`,
      { values: [values] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return { sheet: sheetName, item: nextItem };
  };

  let lastError;
  for (const candidate of candidates) {
    try {
      const res = await attemptAdd(basePrimary, candidate);
      if (res) return res;
    } catch (err) {
      lastError = err;
    }
    if (baseFallback) {
      try {
        const res = await attemptAdd(baseFallback, candidate);
        if (res) return res;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error('Nao foi possivel localizar a tabela de produtos para adicionar a linha.');
};

export const updateProductInSheet = async ({ sheet, item, description, unit, price, category }) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }
  if (!item && item !== 0) {
    throw new Error('Item de referencia ausente para atualizar.');
  }
  const token = await acquireToken();
  const candidates = buildSheetCandidates(sheet || sheetMateriais);
  const basePrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const baseFallback =
    siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets`;

  const attemptUpdate = async (baseUrl, sheetName) => {
    const encodedSheet = encodeURIComponent(sheetName);
    const sheetBase = `${baseUrl}/${encodedSheet}`;
    const table = await findProductTable(sheetBase, token);
    if (!table) return null;
    const row = await findProductRow(sheetBase, table, token, item);
    if (!row) return null;
    const values = buildProductRow({
      columns: row.columns,
      description,
      unit,
      price,
      category,
      nextItem: item,
    });
    const payload = { values: [values], index: row.rowIndex };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    try {
      await axios.patch(`${sheetBase}/tables/${table.tableId}/rows/${row.rowIndex}`, payload, { headers });
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 400 && status !== 404) {
        throw err;
      }
      if (row.rowId && row.rowId !== row.rowIndex) {
        try {
          const encodedRowId = encodeURIComponent(row.rowId);
          await axios.patch(`${sheetBase}/tables/${table.tableId}/rows/${encodedRowId}`, payload, { headers });
          return { sheet: sheetName, item };
        } catch (innerErr) {
          const innerStatus = innerErr?.response?.status;
          if (innerStatus && innerStatus !== 400 && innerStatus !== 404) {
            throw innerErr;
          }
        }
      }
      const indexFuncUrl = `${sheetBase}/tables/${table.tableId}/rows/$/ItemAt(index=${row.rowIndex})`;
      await axios.patch(indexFuncUrl, payload, { headers });
    }
    return { sheet: sheetName, item };
  };

  let lastError;
  for (const candidate of candidates) {
    try {
      const res = await attemptUpdate(basePrimary, candidate);
      if (res) return res;
    } catch (err) {
      lastError = err;
    }
    if (baseFallback) {
      try {
        const res = await attemptUpdate(baseFallback, candidate);
        if (res) return res;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error('Nao foi possivel localizar o item para atualizar.');
};

export const deleteProductFromSheet = async ({ sheet, item }) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }
  if (!item && item !== 0) {
    throw new Error('Item de referencia ausente para excluir.');
  }
  const token = await acquireToken();
  const candidates = buildSheetCandidates(sheet || sheetMateriais);
  const basePrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const baseFallback =
    siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets`;

  const attemptDelete = async (baseUrl, sheetName) => {
    const encodedSheet = encodeURIComponent(sheetName);
    const sheetBase = `${baseUrl}/${encodedSheet}`;
    const table = await findProductTable(sheetBase, token);
    if (!table) return null;
    const row = await findProductRow(sheetBase, table, token, item);
    if (!row) return null;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      await axios.delete(`${sheetBase}/tables/${table.tableId}/rows/${row.rowIndex}`, { headers });
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 400 && status !== 404) {
        throw err;
      }
      if (row.rowId && row.rowId !== row.rowIndex) {
        try {
          const encodedRowId = encodeURIComponent(row.rowId);
          await axios.delete(`${sheetBase}/tables/${table.tableId}/rows/${encodedRowId}`, { headers });
          return { sheet: sheetName, item };
        } catch (innerErr) {
          const innerStatus = innerErr?.response?.status;
          if (innerStatus && innerStatus !== 400 && innerStatus !== 404) {
            throw innerErr;
          }
        }
      }
      const indexFuncUrl = `${sheetBase}/tables/${table.tableId}/rows/$/ItemAt(index=${row.rowIndex})`;
      await axios.delete(indexFuncUrl, { headers });
    }
    return { sheet: sheetName, item };
  };

  let lastError;
  for (const candidate of candidates) {
    try {
      const res = await attemptDelete(basePrimary, candidate);
      if (res) return res;
    } catch (err) {
      lastError = err;
    }
    if (baseFallback) {
      try {
        const res = await attemptDelete(baseFallback, candidate);
        if (res) return res;
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error('Nao foi possivel localizar o item para excluir.');
};

export const getProducts = async ({ forceRefresh = false, sheet = sheetMateriais, allowFallback = true } = {}) => {
  const now = Date.now();
  const cacheValid = productsCache.data && productsCache.sheet === sheet && now - productsCache.timestamp < CACHE_TTL;

  if (!forceRefresh && cacheValid) {
    return {
      items: productsCache.data,
      source: productsCache.source,
      fetchedAt: productsCache.timestamp,
      sheet,
    };
  }

  if (!hasSharePointConfig) {
    console.warn('SharePoint config ausente. Usando mockProducts.');
    productsCache = { data: mockProducts, timestamp: now, sheet, source: 'mock' };
    return { items: mockProducts, source: 'mock', fetchedAt: now, sheet };
  }

  try {
    const products = await fetchProductsFromGraph(sheet, { forceRefresh });
    productsCache = { data: products, timestamp: now, sheet, source: 'graph' };
    return { items: products, source: 'graph', fetchedAt: now, sheet };
  } catch (error) {
    console.error('Erro ao buscar produtos no Graph.', error);
    if (!allowFallback) {
      throw error;
    }
    productsCache = { data: mockProducts, timestamp: now, sheet, source: 'mock' };
    return { items: mockProducts, source: 'mock', fetchedAt: now, sheet };
  }
};

export const refreshProducts = async (sheet) => {
  productsCache = {
    data: null,
    timestamp: 0,
    sheet: sheet || sheetMateriais,
    source: 'unknown',
  };
  return getProducts({ forceRefresh: true, sheet, allowFallback: false });
};

export const getProductById = async (id) => {
  const products = (productsCache.data && productsCache.data.length ? productsCache.data : (await getProducts()).items) || [];
  return products.find((item) => item.id === id || item.sku === id);
};

export const graphConfig = {

  driveId,
  itemId,
  sheetMateriais,
  sheetServicos,
  hasSharePointConfig,
};
