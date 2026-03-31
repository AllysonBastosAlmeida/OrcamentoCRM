import { appendAuditEntryToSheet, fetchAuditLogFromSheet, hasQuoteSheetConfig } from '../services/quoteSheet.js';

const AUDIT_KEY = 'crm-orcamentos:audit';
const MAX_ENTRIES = 80;

const readLocalAudit = () => {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.warn('[audit] Falha ao ler historico local', error);
    return [];
  }
};

const storeLocalAudit = (entry) => {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = [
      {
        id: entry.id || crypto.randomUUID(),
        action: entry.action || 'update',
        poNumber: entry.poNumber || '',
        title: entry.title || '',
        clientCompany: entry.clientCompany || '',
        userName: entry.userName || '',
        userEmail: entry.userEmail || '',
        timestamp: entry.timestamp || new Date().toISOString(),
        source: entry.source || '',
        summary: entry.summary || '',
        details: Array.isArray(entry.details) ? entry.details.filter(Boolean).slice(0, 6) : [],
      },
      ...(Array.isArray(list) ? list : []),
    ];
    localStorage.setItem(AUDIT_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)));
  } catch (error) {
    console.warn('[audit] Falha ao registrar historico local', error);
  }
};

export const appendAuditEntry = (entry) => {
  storeLocalAudit(entry);
  if (!hasQuoteSheetConfig) return;
  appendAuditEntryToSheet(entry).catch((error) => {
    console.warn('[audit] Falha ao registrar historico compartilhado', error);
  });
};

export const getAuditLog = async () => {
  const localLog = readLocalAudit();
  if (hasQuoteSheetConfig) {
    const sharedLog = await fetchAuditLogFromSheet();
    if (sharedLog.length) {
      const byKey = new Map();
      [...localLog, ...sharedLog].forEach((entry) => {
        const key = [
          entry.action || '',
          entry.poNumber || '',
          entry.title || '',
          entry.timestamp || '',
          entry.userEmail || '',
        ].join('|');
        if (!byKey.has(key) || (entry.details && entry.details.length)) {
          byKey.set(key, entry);
        }
      });
      return Array.from(byKey.values())
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, MAX_ENTRIES);
    }
  }
  return localLog;
};
