import axios from 'axios';
import { acquireToken } from '../auth.js';

// IDs da planilha "Orcamento Web.xlsx" enviados pelo usuario; usamos fallbacks especificos para clientes
const siteId = import.meta.env.VITE_GRAPH_SITE_ID_CLIENTES || '3f31c6b1-8a58-4f1e-b65e-7e6455584500';
const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID_CLIENTES || 'b!scYxP1iKHk-2Xn5kVVhFAGdG9X8BFZBGvt5w-aBi12Mo0YszQX9hSakmug3Ij2Qf';
const itemId = import.meta.env.VITE_GRAPH_ITEM_CLIENTES || '01FWWAKIQQT5LZBQ5UGNBILG4UQ6VQGUJ3';
const sheetName = import.meta.env.VITE_GRAPH_SHEET_CLIENTES || 'Clientes';

const graphBase = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos

let cache = { data: null, timestamp: 0 };
const LOCAL_KEY = 'clients_local_overrides_v1';

const saveLocalOverrides = (overrides) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.warn('[clients] Falha ao salvar overrides locais', error);
  }
};

const normalizeId = (client) => (client?.id || client?.company || client?.email || client?.name || '').toString();
const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
const isPlaceholder = (value) => {
  const key = normalizeKey(value);
  return !key || key === 'clientes' || key === 'empresa nao informada' || key === '--';
};
const isMeaningful = (client) => {
  if (!client) return false;
  const fields = [client.company, client.name, client.responsavel, client.email, client.phone, client.local, client.notes];
  return fields.some((v) => {
    const text = v ?? '';
    return text.toString().trim().length > 0 && !isPlaceholder(text);
  });
};

const sanitizeOverrides = (overrides) => {
  const result = { upserts: [], deletions: [] };
  const seen = new Set();

  (overrides.upserts || []).forEach((c) => {
    const id = normalizeId(c);
    if (!id) return;
    if (!isMeaningful(c)) return;
    if (seen.has(id)) return;
    seen.add(id);
    result.upserts.push({ ...c, id });
  });

  result.deletions = Array.from(new Set((overrides.deletions || []).filter(Boolean).map((d) => d.toString())));
  return result;
};

const loadLocalOverrides = () => {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    if (!stored) return { upserts: [], deletions: [] };
    const parsed = JSON.parse(stored);
    const sanitized = sanitizeOverrides(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      saveLocalOverrides(sanitized);
    }
    return sanitized;
  } catch (error) {
    console.warn('[clients] Falha ao ler overrides locais', error);
    return { upserts: [], deletions: [] };
  }
};

const applyOverrides = (remoteClients, overrides) => {
  const merged = new Map();
  remoteClients.forEach((c) => {
    const id = normalizeId(c);
    if (id) merged.set(id, c);
  });

  (overrides.deletions || []).forEach((id) => merged.delete(id));

  (overrides.upserts || []).forEach((c) => {
    const id = normalizeId(c) || crypto.randomUUID();
    merged.set(id, { ...c, id });
  });

  return Array.from(merged.values());
};

const parsePhone = (val) => (val ? val.toString().trim() : '');
const headerIndexByName = (headers, name) => headers.findIndex((h) => normalizeKey(h) === normalizeKey(name));
const colLetter = (n) => {
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
};

const mapRowToClient = (headers, row) => {
  const entry = {};
  headers.forEach((h, idx) => {
    const key = normalizeKey(h);
    entry[key] = row[idx];
  });

  const company = entry.empresa || entry.nome || entry.cliente || '';
  const responsavel = entry.responsavel || entry.nome || entry.cliente || entry.contato || entry.resp || '';

  return {
    id: entry.id || entry.codigo || company || crypto.randomUUID(),
    name: entry.nome || entry.cliente || entry.razao || responsavel || 'Clientes',
    responsavel,
    email: entry.email || entry['e-mail'] || entry.contato || '',
    phone: parsePhone(entry.telefone || entry['telefone contato'] || entry.fone || entry.celular || entry.contato),
    company,
    endereco: entry.endereco || '',
    local: entry.local || entry.loc || '',
    notes: entry.observacao || entry.obs || '',
  };
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map((cell) => normalizeKey(cell));
    const hasName = normalized.some((c) => c?.includes('nome') || c === 'cliente' || c === 'empresa');
    if (hasName) return { headers: rows[i], dataRows: rows.slice(i + 1), index: i };
  }
  return { headers: rows[0] || [], dataRows: rows.slice(1), index: 0 };
};

const fetchClientsFromGraph = async () => {
  if (!driveId || !itemId) {
    throw new Error('Config do Excel de clientes ausente');
  }
  const token = await acquireToken();
  const encodedSheet = encodeURIComponent(sheetName);
  const url = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;

  console.info('[clientes] GET usedRange', { sheet: sheetName, url, siteId, driveId, itemId });

  let rows = [];
  try {
    const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    rows = response.data?.values || response.data?.value?.[0]?.values || [];
  } catch (error) {
    console.error('[clientes] Erro ao buscar clientes no Graph', {
      sheet: sheetName,
      message: error?.message,
      status: error?.response?.status,
      url,
    });
    throw error;
  }
  if (!rows.length) {
    console.warn('[clientes] Planilha vazia ou nao encontrada', { sheet: sheetName });
    return [];
  }

  const { headers, dataRows, index } = findHeaderRow(rows);
  console.info('[clientes] Cabecalho detectado', { sheet: sheetName, headerRow: index + 1, headers });

  const clients = dataRows.filter((row) => row.some(Boolean)).map((row) => mapRowToClient(headers, row));
  console.info('[clientes] Total carregado da planilha', { count: clients.length, sheet: sheetName });
  console.table(
    clients.map((c, idx) => ({
      linhaPlanilha: index + 1 + idx + 1,
      empresa: c.company,
      responsavel: c.responsavel || c.name,
      email: c.email,
      telefone: c.phone,
      id: c.id,
    })),
  );
  return clients;
};

export const getClients = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  const cacheValid = cache.data && now - cache.timestamp < CACHE_TTL;
  if (!forceRefresh && cacheValid) return cache.data;

  const remote = await fetchClientsFromGraph();
  const overrides = loadLocalOverrides();
  const merged = applyOverrides(remote, overrides);
  cache = { data: merged, timestamp: now };
  return merged;
};

export const refreshClients = async () => getClients({ forceRefresh: true });

export const upsertClient = async (client) => {
  const overrides = loadLocalOverrides();
  let mergedRemote = applyOverrides(await fetchClientsFromGraph(), overrides);

  try {
    const token = await acquireToken();
    const encodedSheet = encodeURIComponent(sheetName);
    const urlBase = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;
    const findCol = (headers, candidates) => {
      for (const c of candidates) {
        const idx = headerIndexByName(headers, c);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const headerIdx = (headers) => ({
      id: findCol(headers, ['id']),
      empresa: findCol(headers, ['empresa']),
      endereco: findCol(headers, ['endereco']),
      local: findCol(headers, ['local']),
      responsavel: findCol(headers, ['responsavel']),
      telefone: findCol(headers, ['telefone', 'telefone contato']),
      email: findCol(headers, ['email', 'e-mail']),
      obs: findCol(headers, ['obs', 'observacao']),
    });

    const res = await axios.get(`${urlBase}/usedRange(valuesOnly=true)`, { headers: { Authorization: `Bearer ${token}` } });
    const rowsAll = res.data?.values || res.data?.value?.[0]?.values || [];
    const { headers, dataRows, index: headerIndex } = findHeaderRow(rowsAll);
    const idx = headerIdx(headers);

    const idCol = idx.id !== -1 ? idx.id : 0; // fallback: primeira coluna
    const parseNumeric = (val) => {
      const n = parseInt(val, 10);
      return Number.isFinite(n) ? n : null;
    };
    const asText = (v) => (v ?? '').toString();

    const numericIds = idCol >= 0 ? dataRows.map((row) => parseNumeric(row[idCol])).filter((n) => n !== null) : [];
    let resolvedId = asText(client.id || client.codigo).trim();
    if (!resolvedId) {
      const nextNum = numericIds.length ? Math.max(...numericIds) + 1 : dataRows.length + 1;
      resolvedId = String(nextNum);
    }

    const rowIndex = idCol >= 0 ? dataRows.findIndex((row) => asText(row[idCol]) === asText(resolvedId)) : -1;
    const excelRow = headerIndex + 2 + (rowIndex === -1 ? dataRows.length : rowIndex);

    const existingRow = rowIndex === -1 ? [] : dataRows[rowIndex] || [];
    const rowValues = Array(headers.length)
      .fill('')
      .map((_, i) => existingRow[i] ?? '');

    const toSave = {
      ...client,
      id: resolvedId,
      responsavel: client.responsavel || client.name || client.company || '',
    };

    const setVal = (col, val) => {
      if (col < 0) return;
      const text = val ?? '';
      if (text.toString().trim() === '' && rowValues[col]) return; // mantem valor existente se novo vazio
      rowValues[col] = text;
    };

    if (idCol >= 0) rowValues[idCol] = resolvedId;
    setVal(idx.empresa, toSave.company);
    setVal(idx.endereco, toSave.endereco || toSave.address);
    setVal(idx.local, toSave.local);
    setVal(idx.responsavel, toSave.responsavel || toSave.name);
    setVal(idx.telefone, toSave.phone);
    setVal(idx.email, toSave.email);
    setVal(idx.obs, toSave.notes);

    const endCol = colLetter(Math.max(headers.length, rowValues.length));
    const rangeAddress = `A${excelRow}:${endCol}${excelRow}`;
    await axios.patch(
      `${urlBase}/range(address='${rangeAddress}')`,
      { values: [rowValues] },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );

    const upserts = overrides.upserts.filter((c) => normalizeId(c) !== resolvedId);
    const deletions = overrides.deletions.filter((d) => d !== resolvedId);
    saveLocalOverrides({ upserts, deletions });

    mergedRemote = applyOverrides(await fetchClientsFromGraph(), loadLocalOverrides());
  } catch (err) {
    console.error('[clients] Falha ao gravar na planilha', err);
    const fallbackId = client.id || client.codigo || client.company || client.email || client.name || crypto.randomUUID();
    const upserts = [
      ...(overrides.upserts || []).filter((c) => normalizeId(c) !== fallbackId),
      { ...client, id: fallbackId },
    ];
    const deletions = (overrides.deletions || []).filter((d) => d !== fallbackId);
    saveLocalOverrides({ upserts, deletions });
    mergedRemote = applyOverrides(mergedRemote, { upserts, deletions });
  }

  cache = { data: mergedRemote, timestamp: Date.now() };
  return mergedRemote;
};

export const removeClient = async (id) => {
  const normalizedId = (id ?? '').toString();
  const overrides = loadLocalOverrides();

  const upserts = overrides.upserts.filter((c) => normalizeId(c) !== normalizedId);
  const deletions = Array.from(new Set([...(overrides.deletions || []), normalizedId].filter(Boolean)));
  let merged = applyOverrides(cache.data || [], { upserts, deletions });

  // Delete na planilha
  try {
    const token = await acquireToken();
    const encodedSheet = encodeURIComponent(sheetName);
    const urlBase = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;
    const rowsAll = await axios.get(`${urlBase}/usedRange(valuesOnly=true)`, { headers: { Authorization: `Bearer ${token}` } });
    const rows = rowsAll.data?.values || rowsAll.data?.value?.[0]?.values || [];
    const { headers, dataRows, index: headerIndex } = findHeaderRow(rows);
    const idIdx = headerIndexByName(headers, 'id');
    if (idIdx !== -1) {
      const rowIndex = dataRows.findIndex((row) => (row[idIdx] || '').toString() === normalizedId);
      if (rowIndex !== -1) {
        const excelRow = headerIndex + 2 + rowIndex;
        const endCol = colLetter(headers.length);
        const rangeAddress = `A${excelRow}:${endCol}${excelRow}`;
        await axios.post(
          `${urlBase}/range(address='${rangeAddress}')/delete`,
          { shift: 'Up' },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        );
      }
    }
    // Sucesso: limpar override deste ID
    saveLocalOverrides({ upserts, deletions });
    merged = applyOverrides(await fetchClientsFromGraph(), loadLocalOverrides());
  } catch (err) {
    console.error('[clients] Falha ao excluir na planilha', err);
    // fallback: mantem override de delecao
    saveLocalOverrides({ upserts, deletions });
  }

  cache = { data: merged, timestamp: Date.now() };
  return merged;
};
