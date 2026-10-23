export const resolveQuoteClients = (quotes, clients) => {
  const byId = new Map(clients.filter((client) => client.id != null && client.id !== '')
    .map((client) => [String(client.id), client]));
  return quotes.map((quote) => {
    const client = byId.get(String(quote.clientId || ''));
    if (!client) return quote;
    return {
      ...quote,
      clientCompany: client.company || quote.clientCompany,
      clientName: client.responsavel || client.name || quote.clientName,
    };
  });
};
