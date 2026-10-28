import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuoteClients } from '../src/utils/quoteClients.js';

test('preserves the manually saved responsible when client records load or change', () => {
  const quote = { id: 'quote-1', clientId: 'client-1', clientName: 'Contato manual' };
  for (const responsavel of ['Contato cadastrado', 'Novo contato cadastrado']) {
    const [resolved] = resolveQuoteClients([quote], [{ id: 'client-1', responsavel }]);
    assert.equal(resolved.clientName, 'Contato manual');
    assert.equal(quote.clientName, 'Contato manual');
  }
});

test('fills a missing responsible from the linked client', () => {
  const quote = { clientId: 1, clientName: '' };
  assert.equal(resolveQuoteClients([quote], [{ id: '1', responsavel: 'Responsavel', name: 'Nome' }])[0].clientName, 'Responsavel');
  assert.equal(resolveQuoteClients([quote], [{ id: '1', name: 'Nome' }])[0].clientName, 'Nome');
});

test('keeps quotes without a matching client unchanged', () => {
  const quote = { clientId: 'missing', clientName: 'Contato manual' };
  assert.equal(resolveQuoteClients([quote], [])[0], quote);
});
