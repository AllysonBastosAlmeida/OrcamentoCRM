import axios from 'axios';
import { acquireToken } from '../auth.js';

const driveId = import.meta.env.VITE_GRAPH_DRIVE_ID_CLIENTES || 'b!scYxP1iKHk-2Xn5kVVhFAGdG9X8BFZBGvt5w-aBi12Mo0YszQX9hSakmug3Ij2Qf';
const itemId = import.meta.env.VITE_GRAPH_ITEM_CLIENTES || '01FWWAKIQQT5LZBQ5UGNBILG4UQ6VQGUJ3';
const sheetName = import.meta.env.VITE_GRAPH_SHEET_FUNCIONARIOS || 'Funcionarios';
const graphBase = 'https://graph.microsoft.com/v1.0';
const CACHE_TTL = 1000 * 60 * 10;

let cache = { data: [], ts: 0 };

const normalizeKey = (value) =>
  value
    ?.toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const findHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map((cell) => normalizeKey(cell));
    const hasName = normalized.some((c) => c === 'nome' || c === 'name');
    if (hasName) return { headers: rows[i], dataRows: rows.slice(i + 1), index: i };
  }
  return { headers: rows[0] || [], dataRows: rows.slice(1), index: 0 };
};

const headerIndexByName = (headers, name) => headers.findIndex((h) => normalizeKey(h) === normalizeKey(name));

const mapRow = (headers, row) => {
  const get = (key) => {
    const idx = headerIndexByName(headers, key);
    return idx >= 0 ? row[idx] : '';
  };
  const name = get('nome') || get('name');
  const email = get('email') || get('e-mail');
  const phone = get('telefone') || get('fone') || get('celular');
  const id = get('id') || name || email || phone;
  return { id, name, email, phone };
};

export const getEmployees = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache.data.length && now - cache.ts < CACHE_TTL) return cache.data;

  if (!driveId || !itemId) throw new Error('Config do Excel de funcionarios ausente');

  const token = await acquireToken();
  const encodedSheet = encodeURIComponent(sheetName);
  const url = `${graphBase}/drives/${driveId}/items/${itemId}/workbook/worksheets/${encodedSheet}/usedRange(valuesOnly=true)`;

  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  const rows = res.data?.values || res.data?.value?.[0]?.values || [];
  if (!rows.length) return [];

  const { headers, dataRows } = findHeaderRow(rows);
  const employees = dataRows
    .filter((r) => r.some(Boolean))
    .map((row) => mapRow(headers, row))
    .filter((e) => e.name);

  cache = { data: employees, ts: now };
  return employees;
};

export default getEmployees;
