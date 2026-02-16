
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

  return {
    id: product.item || product.id || product.sku || crypto.randomUUID(),
    name: product.descricao || product.nome || product.name || 'Produto',
    sku: product.sku || product.codigo || '',
    price,
    stock: quantity,
    unit: product.unidade || product.un || '',
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
