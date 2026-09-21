import test from 'node:test';
import assert from 'node:assert/strict';
import { appendToQuoteTable } from '../src/services/quoteTable.js';

const headers = ['ID', 'PO', 'Data', 'Cliente', 'Assunto', 'Categoria', 'Valor', 'Status', 'Condição', 'Aprovação', 'Responsavel', 'Observação', 'Column1', 'NF', 'Data_Criação', 'Prazo_Dias', 'Data_Pagamento', 'Situação'];
const row = ['1', '206', '2026-09-21', 'Cliente', 'Teste', 'Categoria', 100, 'Rascunho', 'Rascunho', 'Aguardando', 'Responsavel', '', '{}'];
const mock = (names = headers, fail = false) => {
  const writes = [];
  return {
    writes,
    async get(url) {
      if (url.endsWith('/tables')) return { data: { value: [{ id: 'other' }, { id: 'quotes' }] } };
      return { data: { values: [url.includes('/other/') ? ['Outra tabela'] : names] } };
    },
    async post(url, body) {
      writes.push({ url, body });
      if (fail) throw new Error('Network response lost');
    },
  };
};

test('inserts in the matching table with all 18 columns, leaving financial formulas to Excel', async () => {
  const http = mock();
  await appendToQuoteTable(http, '/sheet', {}, row);
  assert.equal(http.writes.length, 1);
  assert.equal(http.writes[0].url, '/sheet/tables/quotes/rows/add');
  assert.deepEqual(http.writes[0].body, { index: null, values: [[...row, null, null, null, null, null]] });
});
test('does not write outside the table when the layout is missing or incompatible', async () => {
  for (const names of [[], headers.slice(0, 12), headers.map((h) => h === 'Valor' ? 'Unexpected' : h)]) {
    const http = mock(names);
    await assert.rejects(appendToQuoteTable(http, '/sheet', {}, row));
    assert.equal(http.writes.length, 0);
  }
});
test('does not repeat insertion or fall back to cell writes after an ambiguous failure', async () => {
  const http = mock(headers, true);
  await assert.rejects(appendToQuoteTable(http, '/sheet', {}, row), /Network/);
  assert.equal(http.writes.length, 1);
});
