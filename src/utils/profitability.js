const MATERIAL_MARKUP_FACTOR = 1.3;
const ACTUAL_TAX_RATE = 0.02;
const DAILY_TECH_COST = 125;
const FUSION_TECH_COST = 300;
const FOLLOW_UP_COST = 90;

const SERVICE_COST_BY_ID = new Map([
  ['diaria-tecnico', DAILY_TECH_COST],
  ['DIARIA-TEC', DAILY_TECH_COST],
  ['diaria-fusao', FUSION_TECH_COST],
  ['DIARIA-FUSAO', FUSION_TECH_COST],
  ['acompanhamento', FOLLOW_UP_COST],
  ['ACOMPANHAMENTO', FOLLOW_UP_COST],
]);

const toNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Number(toNumber(value).toFixed(2));

const getItemTotal = (item) => roundCurrency(toNumber(item?.price) * toNumber(item?.quantity));

const getItemRealCost = (item) => {
  const explicit = item?.realCost;
  if (explicit === null || explicit === undefined || explicit === '') return null;
  return roundCurrency(toNumber(explicit) * toNumber(item?.quantity));
};

const getDisplayName = (item) => item?.name || item?.sku || item?.id || 'Item';

export const PROFITABILITY_ASSUMPTIONS = {
  materialMarkupFactor: MATERIAL_MARKUP_FACTOR,
  actualTaxRate: ACTUAL_TAX_RATE,
  dailyTechCost: DAILY_TECH_COST,
  fusionTechCost: FUSION_TECH_COST,
  followUpCost: FOLLOW_UP_COST,
};

export const calculateQuoteProfitability = (quote) => {
  const items = Array.isArray(quote?.items) ? quote.items : [];
  const revenue = roundCurrency(quote?.total ?? quote?.totalNumber ?? 0);

  if (!items.length) {
    return {
      ready: false,
      itemCount: 0,
      revenue,
      assumptions: PROFITABILITY_ASSUMPTIONS,
      gaps: ['Este orcamento nao possui itens detalhados salvos para calcular a rentabilidade.'],
    };
  }

  const materialItems = items.filter((item) => item?.type === 'materiais');
  const serviceItems = items.filter((item) => item?.type === 'servicos');

  const materialRevenue = roundCurrency(materialItems.reduce((acc, item) => acc + getItemTotal(item), 0));
  const materialDetails = [];
  const materialCost = roundCurrency(
    materialItems.reduce((acc, item) => {
      const itemTotal = getItemTotal(item);
      const explicitCost = getItemRealCost(item);
      const realCost = explicitCost !== null ? explicitCost : roundCurrency(itemTotal / MATERIAL_MARKUP_FACTOR);
      materialDetails.push({
        id: item?.id || crypto.randomUUID(),
        name: getDisplayName(item),
        quantity: toNumber(item?.quantity),
        billed: itemTotal,
        realCost,
        difference: roundCurrency(itemTotal - realCost),
        note: explicitCost !== null ? 'Valor real informado manualmente' : 'Custo calculado pela regra venda / 1,30',
      });
      return acc + realCost;
    }, 0),
  );
  const materialProfit = roundCurrency(materialRevenue - materialCost);

  let serviceRevenue = 0;
  let serviceCost = 0;
  let manualServiceRevenue = 0;
  let manualServiceCost = 0;
  let coveredServiceRevenue = 0;
  const serviceDetails = [];

  serviceItems.forEach((item) => {
    const itemTotal = getItemTotal(item);
    const itemId = item?.id || item?.sku || '';
    const explicitCost = getItemRealCost(item);

    serviceRevenue += itemTotal;

    if (item?.source === 'manual') {
      manualServiceRevenue += itemTotal;
      const realCost = explicitCost !== null ? explicitCost : 0;
      if (explicitCost !== null) {
        manualServiceCost += explicitCost;
        serviceCost += explicitCost;
      }
      serviceDetails.push({
        id: item?.id || crypto.randomUUID(),
        name: getDisplayName(item),
        quantity: toNumber(item?.quantity),
        billed: itemTotal,
        realCost,
        difference: roundCurrency(itemTotal - realCost),
        note: explicitCost !== null ? 'Servico manual com valor real informado' : 'Servico manual sem valor real: custo zero',
      });
      coveredServiceRevenue += itemTotal;
      return;
    }

    const modeledCost = SERVICE_COST_BY_ID.get(itemId);
    if (modeledCost) {
      const realCost = roundCurrency(modeledCost * toNumber(item?.quantity));
      serviceCost += realCost;
      serviceDetails.push({
        id: item?.id || crypto.randomUUID(),
        name: getDisplayName(item),
        quantity: toNumber(item?.quantity),
        billed: itemTotal,
        realCost,
        difference: roundCurrency(itemTotal - realCost),
        note: `Custo interno modelado de ${roundCurrency(modeledCost)} por unidade`,
      });
      coveredServiceRevenue += itemTotal;
      return;
    }

    // Servicos cadastrados fora das diarias entram como lucro integral:
    // nao existe custo interno adicional alem dos itens modelados.
    serviceDetails.push({
      id: item?.id || crypto.randomUUID(),
      name: getDisplayName(item),
      quantity: toNumber(item?.quantity),
      billed: itemTotal,
      realCost: 0,
      difference: itemTotal,
      note: 'Servico cadastrado sem custo interno adicional',
    });
    coveredServiceRevenue += itemTotal;
  });

  serviceRevenue = roundCurrency(serviceRevenue);
  serviceCost = roundCurrency(serviceCost);
  manualServiceRevenue = roundCurrency(manualServiceRevenue);
  manualServiceCost = roundCurrency(manualServiceCost);
  const serviceProfit = roundCurrency(serviceRevenue - serviceCost);

  const actualTaxCost = roundCurrency(revenue * ACTUAL_TAX_RATE);
  const estimatedCost = roundCurrency(materialCost + serviceCost + actualTaxCost);
  const estimatedProfit = roundCurrency(revenue - estimatedCost);
  const estimatedMarginPct = revenue > 0 ? Number(((estimatedProfit / revenue) * 100).toFixed(2)) : 0;

  const manualWithoutRealCost = serviceItems.filter(
    (item) => item?.source === 'manual' && getItemRealCost(item) === null,
  );
  const gaps = [];

  if (manualWithoutRealCost.length > 0) {
    gaps.push(
      `Ha ${manualWithoutRealCost.length} item(ns) manual(is) sem "Valor Real". Eles estao sendo considerados com custo zero ate esse valor ser informado.`,
    );
  }

  return {
    ready: true,
    itemCount: items.length,
    revenue,
    materialRevenue,
    materialCost,
    materialProfit,
    materialDetails,
    serviceRevenue,
    serviceCost,
    serviceProfit,
    serviceDetails,
    manualServiceRevenue,
    manualServiceCost,
    actualTaxCost,
    estimatedCost,
    estimatedProfit,
    estimatedMarginPct,
    coveragePct: serviceRevenue > 0 ? Number(((coveredServiceRevenue / serviceRevenue) * 100).toFixed(2)) : 100,
    unmappedServiceLabels: [],
    assumptions: PROFITABILITY_ASSUMPTIONS,
    gaps,
  };
};
