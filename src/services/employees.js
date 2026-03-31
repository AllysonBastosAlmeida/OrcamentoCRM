import axios from 'axios';
import { acquireToken } from '../auth.js';

const driveId =
  import.meta.env.VITE_GRAPH_DRIVE_ID_CLIENTES || 'b!scYxP1iKHk-2Xn5kVVhFAGdG9X8BFZBGvt5w-aBi12Mo0YszQX9hSakmug3Ij2Qf';
const itemId = import.meta.env.VITE_GRAPH_ITEM_CLIENTES || '01FWWAKIQQT5LZBQ5UGNBILG4UQ6VQGUJ3';
const sheetName = import.meta.env.VITE_GRAPH_SHEET_FUNCIONARIOS || 'Funcionarios';
const graphBase = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL = 1000 * 60 * 5;
const LOCAL_KEY = 'employees_local_overrides_v1';

let cache = { data: [], ts: 0 };

const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const normalizeId = (employee) => (employee?.id || employee?.name || employee?.email || employee?.phone || '').toString();

const saveLocalOverrides = (overrides) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.warn('[employees] Falha ao salvar overrides locais', error);
  }
};

const sanitizeOverrides = (overrides) => {
  const result = { upserts: [], deletions: [] };
  const seen = new Set();

  (overrides.upserts || []).forEach((employee) => {
    const id = normalizeId(employee);
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.upserts.push({ ...employee, id });
  });

  result.deletions = Array.from(new Set((overrides.deletions || []).filter(Boolean).map((item) => item.toString())));
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
    console.warn('[employees] Falha ao ler overrides locais', error);
    return { upserts: [], deletions: [] };
  }
};

const applyOverrides = (remoteEmployees, overrides) => {
  const merged = new Map();

  remoteEmployees.forEach((employee) => {
    const id = normalizeId(employee);
    if (id) merged.set(id, employee);
  });

  (overrides.deletions || []).forEach((id) => merged.delete(id));

  (overrides.upserts || []).forEach((employee) => {
    const id = normalizeId(employee) || crypto.randomUUID();
    merged.set(id, { ...employee, id });
  });

  return Array.from(merged.values());
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map((cell) => normalizeKey(cell));
    const hasName = normalized.some((c) => c === 'nome' || c === 'name');
    if (hasName) return { headers: rows[i], dataRows: rows.slice(i + 1), index: i };
  }
  return { headers: rows[0] || [], dataRows: rows.slice(1), index: 0 };
};

const headerIndexByName = (headers, name) => headers.findIndex((header) => normalizeKey(header) === normalizeKey(name));

const findCol = (headers, candidates) => {
  for (const candidate of candidates) {
    const idx = headerIndexByName(headers, candidate);
    if (idx !== -1) return idx;
  }
  return -1;
};

const colLetter = (n) => {
  let str = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    str = String.fromCharCode(65 + mod) + str;
    n = Math.floor((n - mod) / 26);
  }
  return str;
};

const resolveRowIndex = (dataRows, idx, employee) => {
  const targetId = (employee.id ?? '').toString().trim();
  const targetName = normalizeKey(employee.name);
  const targetEmail = normalizeKey(employee.email);

  if (idx.id >= 0 && targetId) {
    const byId = dataRows.findIndex((row) => (row[idx.id] || '').toString().trim() === targetId);
    if (byId !== -1) return byId;
  }

  return dataRows.findIndex((row) => {
    const name = idx.name >= 0 ? normalizeKey(row[idx.name]) : '';
    const email = idx.email >= 0 ? normalizeKey(row[idx.email]) : '';
    const matchesName = targetName && name === targetName;
    const matchesEmail = targetEmail && email === targetEmail;
    return matchesName || matchesEmail;
  });
};

const mapRow = (headers, row) => {
  const get = (...keys) => {
    for (const key of keys) {
      const idx = headerIndexByName(headers, key);
      if (idx >= 0) {
        const value = row[idx];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return '';
  };

  const name = get('nome', 'name');
  const email = get('email', 'e-mail');
  const phone = get('telefone', 'fone', 'celular');
  const role = get('cargo', 'funcao', 'função');
  const area = get('area', 'departamento', 'setor');
  const notes = get('obs', 'observacao', 'observação');
  const id = get('id') || name || email || phone;

  return {
    id,
    name,
    email,
    phone,
    role,
    area,
    notes,
  };
};

const fetchEmployeesFromGraph = async () => {
  if (!driveId || !itemId) throw new Error('Config do Excel de funcionarios ausente');

  const token = await acquireToken();
  const encodedSheet = encodeURIComponent(sheetName);
  const url = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;

  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  const rows = res.data?.values || res.data?.value?.[0]?.values || [];
  if (!rows.length) return [];

  const { headers, dataRows } = findHeaderRow(rows);
  return dataRows
    .filter((row) => row.some(Boolean))
    .map((row) => mapRow(headers, row))
    .filter((employee) => employee.name);
};

export const getEmployees = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache.data.length && now - cache.ts < CACHE_TTL) return cache.data;

  const remote = await fetchEmployeesFromGraph();
  const overrides = loadLocalOverrides();
  const merged = applyOverrides(remote, overrides);
  cache = { data: merged, ts: now };
  return merged;
};

export const refreshEmployees = async () => getEmployees({ force: true });

export const upsertEmployee = async (employee) => {
  const overrides = loadLocalOverrides();
  let mergedRemote = applyOverrides(await fetchEmployeesFromGraph(), overrides);

  try {
    const token = await acquireToken();
    const encodedSheet = encodeURIComponent(sheetName);
    const urlBase = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;
    const res = await axios.get(`${urlBase}/usedRange(valuesOnly=true)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rowsAll = res.data?.values || res.data?.value?.[0]?.values || [];
    const { headers, dataRows, index: headerIndex } = findHeaderRow(rowsAll);
    const idx = {
      id: findCol(headers, ['id']),
      name: findCol(headers, ['nome', 'name']),
      email: findCol(headers, ['email', 'e-mail']),
      phone: findCol(headers, ['telefone', 'fone', 'celular']),
      role: findCol(headers, ['cargo', 'funcao', 'função']),
      area: findCol(headers, ['area', 'departamento', 'setor']),
      notes: findCol(headers, ['obs', 'observacao', 'observação']),
    };

    const parseNumeric = (value) => {
      const num = parseInt(value, 10);
      return Number.isFinite(num) ? num : null;
    };
    const asText = (value) => (value ?? '').toString();

    const numericIds = idx.id >= 0 ? dataRows.map((row) => parseNumeric(row[idx.id])).filter((n) => n !== null) : [];
    let resolvedId = asText(employee.id).trim();
    if (!resolvedId) {
      const nextNum = numericIds.length ? Math.max(...numericIds) + 1 : dataRows.length + 1;
      resolvedId = String(nextNum);
    }

    const rowIndex = resolveRowIndex(dataRows, idx, { id: resolvedId, name: employee.name, email: employee.email });
    const excelRow = headerIndex + 2 + (rowIndex === -1 ? dataRows.length : rowIndex);
    const existingRow = rowIndex === -1 ? [] : dataRows[rowIndex] || [];
    const rowValues = Array(headers.length)
      .fill('')
      .map((_, i) => existingRow[i] ?? '');

    const toSave = {
      ...employee,
      id: resolvedId,
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role || '',
      area: employee.area || '',
      notes: employee.notes || '',
    };

    const setVal = (col, value) => {
      if (col < 0) return;
      rowValues[col] = value ?? '';
    };

    if (idx.id >= 0) rowValues[idx.id] = resolvedId;
    setVal(idx.name, toSave.name);
    setVal(idx.email, toSave.email);
    setVal(idx.phone, toSave.phone);
    setVal(idx.role, toSave.role);
    setVal(idx.area, toSave.area);
    setVal(idx.notes, toSave.notes);

    const endCol = colLetter(Math.max(headers.length, rowValues.length));
    const rangeAddress = `A${excelRow}:${endCol}${excelRow}`;
    await axios.patch(
      `${urlBase}/range(address='${rangeAddress}')`,
      { values: [rowValues] },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );

    const upserts = overrides.upserts.filter((item) => normalizeId(item) !== resolvedId);
    const deletions = overrides.deletions.filter((item) => item !== resolvedId);
    saveLocalOverrides({ upserts, deletions });
    mergedRemote = applyOverrides(await fetchEmployeesFromGraph(), loadLocalOverrides());
  } catch (error) {
    console.error('[employees] Falha ao gravar na planilha', error);
    const fallbackId = employee.id || employee.name || employee.email || employee.phone || crypto.randomUUID();
    const upserts = [
      ...(overrides.upserts || []).filter((item) => normalizeId(item) !== fallbackId),
      { ...employee, id: fallbackId },
    ];
    const deletions = (overrides.deletions || []).filter((item) => item !== fallbackId);
    saveLocalOverrides({ upserts, deletions });
    mergedRemote = applyOverrides(mergedRemote, { upserts, deletions });
  }

  cache = { data: mergedRemote, ts: Date.now() };
  return mergedRemote;
};

export const removeEmployee = async (id) => {
  const normalizedId = (id ?? '').toString();
  const overrides = loadLocalOverrides();
  const upserts = overrides.upserts.filter((item) => normalizeId(item) !== normalizedId);
  const deletions = Array.from(new Set([...(overrides.deletions || []), normalizedId].filter(Boolean)));
  let merged = applyOverrides(cache.data || [], { upserts, deletions });

  try {
    const token = await acquireToken();
    const encodedSheet = encodeURIComponent(sheetName);
    const urlBase = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}`;
    const rowsAll = await axios.get(`${urlBase}/usedRange(valuesOnly=true)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rows = rowsAll.data?.values || rowsAll.data?.value?.[0]?.values || [];
    const { headers, dataRows, index: headerIndex } = findHeaderRow(rows);
    const idx = {
      id: findCol(headers, ['id']),
      name: findCol(headers, ['nome', 'name']),
      email: findCol(headers, ['email', 'e-mail']),
    };

    const currentEmployee =
      (cache.data || []).find((item) => normalizeId(item) === normalizedId) ||
      overrides.upserts.find((item) => normalizeId(item) === normalizedId) ||
      { id: normalizedId, name: normalizedId, email: '' };
    const rowIndex = resolveRowIndex(dataRows, idx, currentEmployee);

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

    saveLocalOverrides({ upserts, deletions });
    merged = applyOverrides(await fetchEmployeesFromGraph(), loadLocalOverrides());
  } catch (error) {
    console.error('[employees] Falha ao excluir na planilha', error);
    saveLocalOverrides({ upserts, deletions });
  }

  cache = { data: merged, ts: Date.now() };
  return merged;
};

export default getEmployees;
