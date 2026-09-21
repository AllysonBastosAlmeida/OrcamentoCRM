// Add through the Excel table so its filters, formulas and formatting expand.
// Never retry this POST automatically: a lost response may already have saved it.
export const appendToQuoteTable = async (http, sheetUrl, options, row) => {
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const tables = await http.get(`${sheetUrl}/tables`, options);
  const matches = [];
  for (const table of tables.data?.value || []) {
    const url = `${sheetUrl}/tables/${encodeURIComponent(table.id)}`;
    const header = await http.get(`${url}/headerRowRange`, options);
    const names = (header.data?.values?.[0] || []).map(normalize);
    if (names[0] === 'id' && names[1] === 'po' && names[3] === 'cliente' && names[4] === 'assunto') {
      matches.push({ url, names });
    }
  }
  if (matches.length !== 1) {
    throw new Error('Nao foi possivel identificar uma unica tabela de orcamentos na planilha.');
  }
  const { url, names } = matches[0];
  const expected = ['id', 'po', 'data', 'cliente', 'assunto', 'categoria', 'valor', 'status', 'condicao', 'aprovacao', 'responsavel', 'observacao'];
  if (names.length < row.length || expected.some((name, index) => names[index] !== name)) {
    throw new Error('As colunas da tabela de orcamentos nao correspondem ao formato do CRM.');
  }
  // Extra financial columns belong to Excel; null preserves calculated columns.
  const values = [...row, ...Array(names.length - row.length).fill(null)];
  await http.post(`${url}/rows/add`, { index: null, values: [values] }, options);
};
