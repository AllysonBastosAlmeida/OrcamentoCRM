const LABOR_CODES = new Set([
  'diaria-tecnico', 'diaria-tec', 'diaria-fusao', 'acompanhamento', 'diaria-gestao',
]);

export const isLaborItem = (item) => [item.id, item.sku]
  .some((code) => LABOR_CODES.has(String(code || '').toLowerCase()));

// Consolidate presentation only; saved items retain their quantities and costs.
export const getQuotePresentationItems = (items = [], showItemValues = false, teamExecutionDays = 1) => {
  const visibleItems = items.filter((item) => !isLaborItem(item));
  const laborTotal = items.filter(isLaborItem).reduce(
    (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0,
  );
  if (showItemValues && laborTotal !== 0) {
    const quantity = Math.max(1, Math.floor(Number(teamExecutionDays) || 1));
    visibleItems.push({
      name: 'Equipe Técnica', type: 'servicos', sku: '--', unit: 'D',
      quantity: quantity || 1, price: laborTotal / (quantity || 1),
      presentationTotal: laborTotal,
    });
  }
  return visibleItems;
};
