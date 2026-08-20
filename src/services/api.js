import axios from 'axios';
import mockProducts from '../data/mockProducts.js';
import { acquireToken } from '../auth.js';

const siteId = import.meta.env.VITE_GRAPH_SITE_ID;
const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID;
const itemId = import.meta.env.VITE_GRAPH_ITEM_ID;
const sheetMateriais = import.meta.env.VITE_GRAPH_SHEET_MATERIAIS || 'Materiais';
const sheetServicos = import.meta.env.VITE_GRAPH_SHEET_SERVICOS || 'Servicos';
const sheetServiceReferences = import.meta.env.VITE_GRAPH_SHEET_REFERENCIAS || 'ReferenciasServicos';

const graphBase = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL = 1000 * 60 * 5;
const PRODUCT_SERVICE_REFERENCE_STORAGE_KEY = 'crm-orcamentos:product-service-references';
const SERVICE_REFERENCE_HEADERS = [
  'Material Item',
  'Material Descricao',
  'Categoria',
  'Referencia de Servico',
  'Servico Item',
  'Origem',
  'Atualizado Em',
];

let productsCache = {
  data: null,
  timestamp: 0,
  sheet: sheetMateriais,
  source: 'unknown',
};

const hasSharePointConfig = Boolean(driveId && itemId);

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

const buildReferenceStorageKey = (sheetName, itemValue) => {
  const sheetKey = normalizeKey(sheetName || 'materiais');
  const itemKey = normalizeKey(itemValue || '');
  return `${sheetKey}::${itemKey}`;
};

const readProductServiceReferenceMap = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PRODUCT_SERVICE_REFERENCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[api] Falha ao ler referencias de servico locais', error);
    return {};
  }
};

const writeProductServiceReferenceMap = (map) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRODUCT_SERVICE_REFERENCE_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn('[api] Falha ao salvar referencias de servico locais', error);
  }
};

const getLocalProductServiceReference = (sheetName, itemValue) => {
  if (!itemValue && itemValue !== 0) return '';
  const map = readProductServiceReferenceMap();
  return map[buildReferenceStorageKey(sheetName, itemValue)] || '';
};

export const getResolvedProductServiceReference = (product, sheetName = sheetMateriais) => {
  if (!product) return '';
  const itemValue = product.item || product.id || product.sku || '';
  const localServiceReference = getLocalProductServiceReference(sheetName, itemValue);
  const inlineServiceReference =
    product.serviceReference ||
    product.referenciadeservico ||
    product.referenciaservico ||
    product.refservico ||
    product.servicorelacionado ||
    '';

  return (localServiceReference || inlineServiceReference || '').toString().trim();
};

const setLocalProductServiceReference = (sheetName, itemValue, serviceReference) => {
  if (!itemValue && itemValue !== 0) return;
  const map = readProductServiceReferenceMap();
  const key = buildReferenceStorageKey(sheetName, itemValue);
  const normalizedValue = (serviceReference || '').toString().trim();
  if (normalizedValue) {
    map[key] = normalizedValue;
  } else {
    delete map[key];
  }
  writeProductServiceReferenceMap(map);
};

const clearLocalProductServiceReference = (sheetName, itemValue) => {
  if (!itemValue && itemValue !== 0) return;
  const map = readProductServiceReferenceMap();
  delete map[buildReferenceStorageKey(sheetName, itemValue)];
  writeProductServiceReferenceMap(map);
};

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

const buildWorkbookItemBaseCandidates = () =>
  [
    `${graphBase}/drives/${driveId}/items/${itemId}`,
    siteId ? `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}` : null,
  ].filter(Boolean);

const buildWorksheetCollectionCandidates = () => buildWorkbookItemBaseCandidates().map((base) => `${base}/workbook/worksheets`);

const graphGet = async (url, token, forceRefresh = false) =>
  axios.get(url, {
    headers: buildGraphHeaders(token, forceRefresh),
  });

const graphPost = async (url, token, body) =>
  axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

const graphPatch = async (url, token, body) =>
  axios.patch(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

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

const shouldUseServiceReferenceSheet = (sheetName) => (normalizeKey(sheetName) || '').includes('mater');

const fetchWorksheetRows = async (sheetName, token, options = {}) => {
  const collectionBases = options.collectionBases || buildWorksheetCollectionCandidates();
  const candidates = options.candidates || buildSheetCandidates(sheetName);
  let lastError = null;

  for (const collectionBase of collectionBases) {
    for (const candidate of candidates) {
      const encodedSheet = encodeURIComponent(candidate);
      const sheetBase = `${collectionBase}/${encodedSheet}`;
      try {
        const response = await graphGet(`${sheetBase}/usedRange(valuesOnly=true)`, token, options.forceRefresh);
        return {
          rows: response.data?.values || response.data?.value?.[0]?.values || [],
          sheet: candidate,
          sheetBase,
          missing: false,
        };
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (options.allowMissing) {
    const fallbackCollectionBase = collectionBases[0];
    return {
      rows: [],
      sheet: sheetName,
      sheetBase: fallbackCollectionBase ? `${fallbackCollectionBase}/${encodeURIComponent(sheetName)}` : '',
      missing: true,
    };
  }

  if (lastError) throw lastError;
  throw new Error(`Nao foi possivel localizar a aba ${sheetName}.`);
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalizedRow = rows[i].map((cell) => normalizeKey(cell));
    const hasDescricao = normalizedRow.some((cell) => cell?.includes('descri'));
    const hasItem = normalizedRow.some((cell) => cell === 'item');
    const hasValor = normalizedRow.some((cell) => cell === 'valor' || cell === 'preco');
    if (hasDescricao && hasItem && hasValor) {
      return { headers: rows[i], dataRows: rows.slice(i + 1), headerRowIndex: i };
    }
  }
  return { headers: rows[0] || [], dataRows: rows.slice(1), headerRowIndex: 0 };
};

const rowHasAnyValue = (row = []) =>
  row.some((cell) => cell !== undefined && cell !== null && cell.toString().trim() !== '');

const getLastNonEmptyRowNumber = (rows = []) => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rowHasAnyValue(rows[index])) {
      return index + 1;
    }
  }
  return 1;
};

const getColumnLetter = (columnIndex) => {
  let current = columnIndex + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

const findWorksheetProductRow = (rows, headerRowIndex, item) => {
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    if (matchItemValue(rows[index]?.[0], item)) {
      return {
        rowIndex: index,
        rowNumber: index + 1,
        rowValues: rows[index],
      };
    }
  }
  return null;
};

const isServiceReferenceHeaderRow = (row = []) =>
  SERVICE_REFERENCE_HEADERS.every((header, idx) => normalizeKey(row[idx]) === normalizeKey(header));

const buildServiceReferenceMap = (rows = []) => {
  const hasHeader = isServiceReferenceHeaderRow(rows[0] || []);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const map = new Map();

  dataRows.forEach((row, index) => {
    const itemValue = row[0];
    const itemKey = normalizeKey(itemValue);
    if (!itemKey) return;
    map.set(itemKey, {
      materialItem: itemValue,
      materialDescription: row[1] || '',
      category: row[2] || '',
      serviceReference: (row[3] || '').toString().trim(),
      serviceItem: row[4] || '',
      origin: row[5] || '',
      updatedAt: row[6] || '',
      rowNumber: (hasHeader ? 2 : 1) + index,
    });
  });

  return map;
};

const ensureReferenceSheetHeader = async (sheetBase, token, rows = []) => {
  if (isServiceReferenceHeaderRow(rows[0] || [])) return;
  await graphPatch(`${sheetBase}/range(address='A1:G1')`, token, {
    values: [SERVICE_REFERENCE_HEADERS],
  });
};

const ensureServiceReferenceSheet = async (token) => {
  const collectionBases = buildWorksheetCollectionCandidates();
  let lastError = null;

  for (const collectionBase of collectionBases) {
    const currentState = await fetchWorksheetRows(sheetServiceReferences, token, {
      allowMissing: true,
      candidates: [sheetServiceReferences],
      collectionBases: [collectionBase],
    });

    if (!currentState.missing) {
      await ensureReferenceSheetHeader(currentState.sheetBase, token, currentState.rows);
      const refreshedState = await fetchWorksheetRows(sheetServiceReferences, token, {
        candidates: [sheetServiceReferences],
        collectionBases: [collectionBase],
      });
      return refreshedState;
    }

    try {
      await graphPost(`${collectionBase}/add`, token, { name: sheetServiceReferences });
      const sheetBase = `${collectionBase}/${encodeURIComponent(sheetServiceReferences)}`;
      await graphPatch(`${sheetBase}/range(address='A1:G1')`, token, {
        values: [SERVICE_REFERENCE_HEADERS],
      });
      return {
        rows: [SERVICE_REFERENCE_HEADERS],
        sheet: sheetServiceReferences,
        sheetBase,
        missing: false,
      };
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status === 400 || status === 409) {
        const recoveredState = await fetchWorksheetRows(sheetServiceReferences, token, {
          allowMissing: true,
          candidates: [sheetServiceReferences],
          collectionBases: [collectionBase],
        });
        if (!recoveredState.missing) {
          await ensureReferenceSheetHeader(recoveredState.sheetBase, token, recoveredState.rows);
          return recoveredState;
        }
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error('Nao foi possivel preparar a aba de referencias de servico.');
};

const fetchServiceReferenceMap = async (token, options = {}) => {
  try {
    const state = await fetchWorksheetRows(sheetServiceReferences, token, {
      allowMissing: true,
      candidates: [sheetServiceReferences],
      forceRefresh: options.forceRefresh,
    });
    if (state.missing) {
      return new Map();
    }
    return buildServiceReferenceMap(state.rows);
  } catch (error) {
    console.warn('[api] Falha ao ler aba de referencias de servico', error);
    return new Map();
  }
};

const buildServiceReferenceRow = ({
  item,
  description,
  category,
  serviceReference,
  serviceItem = '',
  origin = '',
  updatedAt = '',
}) => [
  item,
  (description || '').toString().trim(),
  (category || '').toString().trim(),
  (serviceReference || '').toString().trim(),
  (serviceItem || '').toString().trim(),
  origin || ((serviceReference || '').toString().trim() ? 'Atualizado pelo app' : 'Sem referencia'),
  updatedAt || new Date().toISOString(),
];

const upsertServiceReferenceRow = async ({ item, description, category, serviceReference, sheetName }) => {
  if (!shouldUseServiceReferenceSheet(sheetName)) return null;
  const token = await acquireToken();
  const sheetState = await ensureServiceReferenceSheet(token);
  const referenceMap = buildServiceReferenceMap(sheetState.rows);
  const existing = referenceMap.get(normalizeKey(item));
  const targetRowNumber = existing?.rowNumber || Math.max(sheetState.rows.length + 1, 2);
  const safeReference = (serviceReference || '').toString().trim();
  const rowValues = buildServiceReferenceRow({
    item,
    description: description || existing?.materialDescription || '',
    category: category || existing?.category || '',
    serviceReference: safeReference,
    serviceItem: safeReference === existing?.serviceReference ? existing?.serviceItem || '' : '',
  });

  await graphPatch(`${sheetState.sheetBase}/range(address='A${targetRowNumber}:G${targetRowNumber}')`, token, {
    values: [rowValues],
  });
  setLocalProductServiceReference(sheetName, item, safeReference);
  return { item, serviceReference: safeReference };
};

const clearServiceReferenceRow = async ({ item, sheetName }) => {
  if (!shouldUseServiceReferenceSheet(sheetName)) return null;
  const token = await acquireToken();
  const sheetState = await fetchWorksheetRows(sheetServiceReferences, token, {
    allowMissing: true,
    candidates: [sheetServiceReferences],
  });

  if (sheetState.missing) {
    clearLocalProductServiceReference(sheetName, item);
    return null;
  }

  const referenceMap = buildServiceReferenceMap(sheetState.rows);
  const existing = referenceMap.get(normalizeKey(item));
  if (!existing?.rowNumber) {
    clearLocalProductServiceReference(sheetName, item);
    return null;
  }

  await graphPatch(`${sheetState.sheetBase}/range(address='A${existing.rowNumber}:G${existing.rowNumber}')`, token, {
    values: [['', '', '', '', '', '', '']],
  });
  clearLocalProductServiceReference(sheetName, item);
  return { item };
};

const mapRowToProduct = (headers, row, sheetName, referenceEntry = null) => {
  const product = {};
  headers.forEach((header, idx) => {
    const key = normalizeKey(header);
    product[key] = row[idx];
  });

  const price = parseNumber(product.valor ?? product.preco ?? product.price ?? product.total ?? 0);
  const quantity = parseNumber(product.quantidade ?? product.estoque ?? 0);
  const itemValue = product.item || product.id || product.sku || '';
  const inlineServiceReference =
    product.referenciadeservico ||
    product.referenciaservico ||
    product.refservico ||
    product.servicorelacionado ||
    '';
  const sheetServiceReference = referenceEntry?.serviceReference || '';
  const localServiceReference = getLocalProductServiceReference(sheetName, itemValue);

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
    serviceReference: sheetServiceReference || inlineServiceReference || localServiceReference || '',
    scopeTemplate: product.modelodeescopo || product.modeloescopo || product.escopopadrao || '',
    updatedAt: product.atualizadoem || referenceEntry?.updatedAt || new Date().toISOString(),
  };
};

const fetchProductsFromGraph = async (sheetName, options = {}) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }

  const token = await acquireToken();
  const worksheetState = await fetchWorksheetRows(sheetName, token, {
    forceRefresh: options.forceRefresh,
  });
  let headerState = findHeaderRow(worksheetState.rows);
  const isServicesSheet = normalizeKey(worksheetState.sheet || sheetName) === normalizeKey(sheetServicos);
  const hasScopeTemplateColumn = headerState.headers.some((header) => {
    const key = normalizeKey(header);
    return key === 'modelodeescopo' || key === 'modeloescopo' || key === 'escopopadrao';
  });

  if (isServicesSheet && !hasScopeTemplateColumn) {
    const newColumnIndex = headerState.headers.length;
    const newColumnLetter = getColumnLetter(newColumnIndex);
    const headerRowNumber = headerState.headerRowIndex + 1;
    await graphPatch(
      `${worksheetState.sheetBase}/range(address='${newColumnLetter}${headerRowNumber}:${newColumnLetter}${headerRowNumber}')`,
      token,
      { values: [['Modelo de Escopo']] },
    );
    worksheetState.rows[headerState.headerRowIndex] = [...headerState.headers, 'Modelo de Escopo'];
    headerState = findHeaderRow(worksheetState.rows);
  }

  const { headers: sheetHeaders, dataRows } = headerState;
  const serviceReferenceMap = shouldUseServiceReferenceSheet(sheetName)
    ? await fetchServiceReferenceMap(token, options)
    : new Map();

  return dataRows
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const rowObject = {};
      sheetHeaders.forEach((header, idx) => {
        rowObject[normalizeKey(header)] = row[idx];
      });
      const itemValue = rowObject.item || rowObject.id || rowObject.sku || '';
      return mapRowToProduct(sheetHeaders, row, sheetName, serviceReferenceMap.get(normalizeKey(itemValue)) || null);
    });
};

const buildProductRow = ({ columns, headers, description, unit, price, category, serviceReference, scopeTemplate, nextItem }) => {
  const safeDescription = (description || '').toString().trim();
  const safeUnit = (unit || '').toString().trim();
  const safeCategory = (category || '').toString().trim();
  const safeServiceReference = (serviceReference || '').toString().trim();
  const safeScopeTemplate = (scopeTemplate || '').toString().trim();
  const safePrice = parseNumber(price);
  const itemValue = typeof nextItem === 'number' ? nextItem : parseNumber(nextItem) || nextItem;
  const columnNames = Array.isArray(columns) && columns.length ? columns.map((col) => col.name) : headers || [];

  return columnNames.map((columnName) => {
    const key = normalizeKey(columnName);
    if (key === 'item') return itemValue;
    if (key.startsWith('descri')) return safeDescription;
    if (key === 'tipo' || key === 'unidade' || key === 'un') return safeUnit;
    if (key === 'quantidade' || key === 'qtd') return '';
    if (key === 'valor' || key === 'preco') return safePrice;
    if (key === 'categoria') return safeCategory;
    if (key === 'referenciadeservico' || key === 'referenciaservico' || key === 'refservico' || key === 'servicorelacionado') {
      return safeServiceReference;
    }
    if (key === 'modelodeescopo' || key === 'modeloescopo' || key === 'escopopadrao') return safeScopeTemplate;
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

export const addProductToSheet = async ({ sheet, description, unit, price, category, serviceReference, scopeTemplate }) => {
  if (!hasSharePointConfig) {
    throw new Error('Config do Excel de produtos ausente');
  }
  const token = await acquireToken();
  const candidates = buildSheetCandidates(sheet || sheetMateriais);
  const basePrimary = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const baseFallback =
    siteId && `${graphBase}/sites/${siteId}/drives/${driveId}/items/${itemId}/workbook/worksheets`;

  const attemptAdd = async (baseUrl, sheetName) => {
    const worksheetState = await fetchWorksheetRows(sheetName, token, {
      candidates: [sheetName],
      collectionBases: [baseUrl],
    });
    const { headers: sheetHeaders, dataRows, headerRowIndex } = findHeaderRow(worksheetState.rows);
    const itemIndex = sheetHeaders.findIndex((header) => normalizeKey(header) === 'item');
    if (itemIndex < 0) return null;

    let maxItem = 0;
    dataRows.forEach((row) => {
      const num = parseNumber(row?.[itemIndex]);
      if (num > maxItem) maxItem = num;
    });
    const nextItem = maxItem + 1;
    const values = buildProductRow({
      headers: sheetHeaders,
      description,
      unit,
      price,
      category,
      serviceReference,
      scopeTemplate,
      nextItem,
    });
    const rowNumber = Math.max(getLastNonEmptyRowNumber(worksheetState.rows) + 1, headerRowIndex + 2);
    const lastColumn = getColumnLetter(Math.max(sheetHeaders.length - 1, 0));
    await graphPatch(`${worksheetState.sheetBase}/range(address='A${rowNumber}:${lastColumn}${rowNumber}')`, token, {
      values: [values],
    });

    await upsertServiceReferenceRow({
      item: nextItem,
      description,
      category,
      serviceReference,
      sheetName,
    });
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

export const updateProductInSheet = async ({ sheet, item, description, unit, price, category, serviceReference, scopeTemplate }) => {
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
    const worksheetState = await fetchWorksheetRows(sheetName, token, {
      candidates: [sheetName],
      collectionBases: [baseUrl],
    });
    const { headers: sheetHeaders, headerRowIndex } = findHeaderRow(worksheetState.rows);
    const row = findWorksheetProductRow(worksheetState.rows, headerRowIndex, item);
    if (!row) return null;
    const values = buildProductRow({
      headers: sheetHeaders,
      description,
      unit,
      price,
      category,
      serviceReference,
      scopeTemplate,
      nextItem: item,
    });
    const lastColumn = getColumnLetter(Math.max(sheetHeaders.length - 1, 0));
    await graphPatch(`${worksheetState.sheetBase}/range(address='A${row.rowNumber}:${lastColumn}${row.rowNumber}')`, token, {
      values: [values],
    });
    await upsertServiceReferenceRow({
      item,
      description,
      category,
      serviceReference,
      sheetName,
    });
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
    const worksheetState = await fetchWorksheetRows(sheetName, token, {
      candidates: [sheetName],
      collectionBases: [baseUrl],
    });
    const { headers: sheetHeaders, headerRowIndex } = findHeaderRow(worksheetState.rows);
    const row = findWorksheetProductRow(worksheetState.rows, headerRowIndex, item);
    if (!row) return null;
    const lastColumn = getColumnLetter(Math.max(sheetHeaders.length - 1, 0));
    const blankValues = [sheetHeaders.map(() => '')];
    await graphPatch(`${worksheetState.sheetBase}/range(address='A${row.rowNumber}:${lastColumn}${row.rowNumber}')`, token, {
      values: blankValues,
    });
    await clearServiceReferenceRow({ item, sheetName });
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
  siteId,
  driveId,
  itemId,
  sheetMateriais,
  sheetServicos,
  sheetServiceReferences,
  hasSharePointConfig,
};
