const STOPWORDS = new Set([
  'a',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'para',
  'por',
]);

const UNIT_ALIASES = {
  m: 'm',
  mt: 'm',
  mts: 'm',
  metro: 'm',
  metros: 'm',
  pt: 'pt',
  pts: 'pt',
  pto: 'pt',
  ptos: 'pt',
  ponto: 'pt',
  pontos: 'pt',
  h: 'h',
  hr: 'h',
  hrs: 'h',
  hora: 'h',
  horas: 'h',
  d: 'd',
  dia: 'd',
  dias: 'd',
  un: 'un',
  und: 'un',
  unds: 'un',
  unid: 'un',
  unidade: 'un',
  unidades: 'un',
  barra: 'barra',
  barras: 'barra',
  rolo: 'rolo',
  rolos: 'rolo',
  caixa: 'caixa',
  caixas: 'caixa',
};

const TOKEN_ALIASES = {
  optica: ['optico', 'optic'],
  optico: ['optica', 'optic'],
  optic: ['optica', 'optico'],
  conector: ['connector'],
  connector: ['conector'],
  conectorizacao: ['conectorizar', 'crimpagem', 'crimpar'],
  crimpagem: ['conectorizacao', 'crimpar'],
  keystone: ['rj45', 'tomada'],
  rj45: ['keystone'],
  eletrodutos: ['eletroduto'],
  eletroduto: ['eletrodutos'],
  conduletes: ['condulete'],
  condulete: ['conduletes'],
  curvas: ['curva'],
  curva: ['curvas'],
  luvas: ['luva'],
  luva: ['luvas'],
  rede: ['utp', 'cat6'],
  utp: ['rede'],
  cat6: ['rede'],
  fibra: ['optica', 'optico'],
  cfoa: ['fibra', 'optico'],
  cabo: ['cabos'],
  cabos: ['cabo'],
  lancamento: ['lancar', 'passagem', 'instalacao'],
  instalacao: ['instalacao', 'instalar', 'montagem'],
  adm: ['administrativo', 'escritorio'],
};

const PACKAGING_KEYWORDS = ['barra', 'barras', 'rolo', 'rolos', 'bobina', 'bobinas', 'caixa', 'caixas', 'tubo', 'tubos', 'vara', 'varas'];

const SERVICE_FAMILIES = [
  {
    key: 'conectorizacao',
    detect: /(conector|connector|rj45|keystone|tomada)/,
    requiredAny: ['conector', 'rj45', 'keystone', 'tomada', 'conectorizacao', 'crimpagem'],
    preferredAny: ['conectorizacao', 'crimpagem', 'keystone', 'rj45', 'tomada'],
    avoidAny: ['lancamento', 'passagem', 'remocao', 'fibra'],
    preferAdm: true,
    quantityMode: 'same',
    note: 'Servico derivado da conectorizacao de rede identificada na lista.',
  },
  {
    key: 'rede',
    detect: /(cabo.*rede|rede|utp|cat6|cat 6|dados|lan)/,
    requiredAny: ['rede', 'utp', 'cat6', 'dados'],
    preferredAny: ['lancamento', 'instalacao', 'passagem', 'cabo'],
    avoidAny: ['conectorizacao', 'crimpagem', 'keystone'],
    preferAdm: true,
    quantityMode: 'linear',
    note: 'Servico derivado do cabo de rede identificado na lista.',
  },
  {
    key: 'fibra',
    detect: /(fibra|optic|optico|optica|cfoa|fo\b)/,
    requiredAny: ['fibra', 'optica', 'optico', 'cfoa', '4fo', '6fo', '8fo', '12fo'],
    preferredAny: ['lancamento', 'instalacao', 'passagem', 'fibra'],
    preferAdm: true,
    quantityMode: 'linear',
    note: 'Servico derivado do cabo de fibra optica identificado na lista.',
  },
  {
    key: 'eletroduto',
    detect: /(eletroduto|tubo pvc|infraestrutura pvc)/,
    requiredAny: ['eletroduto', 'tubo'],
    preferredAny: ['instalacao', 'lancamento', 'passagem', 'infraestrutura'],
    preferAdm: true,
    quantityMode: 'linear',
    note: 'Servico derivado da instalacao de eletroduto.',
  },
  {
    key: 'condulete',
    detect: /(condulete)/,
    requiredAny: ['condulete'],
    preferredAny: ['instalacao', 'montagem'],
    preferAdm: true,
    quantityMode: 'same',
    note: 'Servico derivado do condulete identificado na lista.',
  },
  {
    key: 'curva',
    detect: /(curva)/,
    requiredAny: ['curva'],
    preferredAny: ['instalacao', 'montagem'],
    preferAdm: true,
    quantityMode: 'same',
    note: 'Servico derivado da curva identificada na lista.',
  },
  {
    key: 'luva',
    detect: /(luva)/,
    requiredAny: ['luva'],
    preferredAny: ['instalacao', 'montagem'],
    preferAdm: true,
    quantityMode: 'same',
    note: 'Servico derivado da luva identificada na lista.',
  },
];

const normalizeText = (value) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/cat[\s./_-]*(\d+)/g, 'cat$1')
    .replace(/(\d+)\s*fo\b/g, '$1fo')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2')
    .replace(/["'`°º]/g, ' ')
    .replace(/[^\p{L}\p{N}/., -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseNumber = (value) => {
  if (typeof value === 'number') return value;
  const normalized = (value || '').toString().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const singularizeToken = (token) => {
  if (!token || token.length <= 3) return token;
  if (token.includes('/')) return token;
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
};

const normalizeToken = (token) => {
  const singular = singularizeToken(token);
  return singular.replace(/^0+(\d+[a-z]+)$/i, '$1');
};

const tokenize = (value, options = {}) => {
  const { expandAliases = true } = options;
  const normalized = normalizeText(value);
  const matches = normalized.match(/[a-z0-9]+(?:\/[a-z0-9]+)*/g) || [];
  const tokens = matches.flatMap((token) => {
    const normalizedToken = normalizeToken(token);
    if (!expandAliases) {
      return [normalizedToken];
    }
    const aliases = TOKEN_ALIASES[normalizedToken] || [];
    return [normalizedToken, ...aliases];
  });
  return Array.from(new Set(tokens.filter((token) => token && !STOPWORDS.has(token))));
};

const normalizeUnit = (unit) => UNIT_ALIASES[normalizeText(unit)] || '';

const weightToken = (token) => {
  if (!token) return 0;
  if (/\d/.test(token)) return 5.5;
  if (token.length >= 6) return 2.6;
  return 1.4;
};

const buildCatalogText = (product) =>
  [product?.name, product?.sku, product?.category, product?.description, product?.unit].filter(Boolean).join(' ');

const buildReferenceLookupScore = (service, serviceReference) => {
  const referenceText = normalizeText(serviceReference);
  const serviceName = normalizeText(service?.name);
  const serviceSku = normalizeText(service?.sku);
  const serviceItem = normalizeText(service?.item || service?.id);
  const serviceCatalogText = normalizeText(buildCatalogText(service));
  const referenceTokens = new Set(tokenize(serviceReference, { expandAliases: false }));
  const serviceTokens = new Set(tokenize(serviceCatalogText, { expandAliases: false }));
  const matchedReferenceTokens = [...referenceTokens].filter((token) => serviceTokens.has(token));

  if (!referenceText) return 0;
  if (serviceName === referenceText || serviceSku === referenceText || serviceItem === referenceText) return 100;
  if (serviceCatalogText === referenceText) return 98;
  if (serviceName.includes(referenceText)) return 92;
  if (serviceCatalogText.includes(referenceText)) return 90;
  if (referenceText.includes(serviceName) && serviceName) return 88;
  if (referenceText.includes(serviceCatalogText) && serviceCatalogText) return 86;
  if (serviceSku && referenceText.includes(serviceSku)) return 84;
  if (matchedReferenceTokens.length >= 3) return 80 + Math.min(8, matchedReferenceTokens.length * 2);
  if (matchedReferenceTokens.length >= 2) return 72 + Math.min(6, matchedReferenceTokens.length * 2);
  return 0;
};

const detectMetersPerUnit = (product) => {
  const text = normalizeText(buildCatalogText(product));
  const hasPackage = PACKAGING_KEYWORDS.some((keyword) => text.includes(keyword));
  if (!hasPackage) return 0;
  const meterMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:m|metro|metros)\b/);
  if (!meterMatch) return 0;
  return parseNumber(meterMatch[1]);
};

const detectPackageLabel = (product) => {
  const text = normalizeText(buildCatalogText(product));
  return PACKAGING_KEYWORDS.find((keyword) => text.includes(keyword)) || normalizeText(product?.unit) || 'unidade';
};

const buildRequestedLabel = ({ quantity, requestedUnit }, unitOverride = '') => {
  const unit = unitOverride || requestedUnit;
  if (!unit) return `${quantity} un`;
  return `${quantity} ${unit}`;
};

const resolveEffectiveRequestedUnit = (line, product) => {
  const explicitUnit = normalizeUnit(line?.requestedUnit);
  if (explicitUnit) return explicitUnit;
  const productUnit = normalizeUnit(product?.unit);
  if (productUnit === 'm') {
    return 'm';
  }
  return '';
};

const resolveSuggestedQuantity = (line, product) => {
  const baseQuantity = Math.max(1, Number(line.quantity || 1));
  const effectiveRequestedUnit = resolveEffectiveRequestedUnit(line, product);
  if (effectiveRequestedUnit !== 'm') {
    return {
      quantity: Math.ceil(baseQuantity),
      note: `${buildRequestedLabel(line)} conforme lista enviada.`,
    };
  }

  const metersPerUnit = detectMetersPerUnit(product);
  if (metersPerUnit > 0) {
    const suggestedQuantity = Math.ceil(baseQuantity / metersPerUnit);
    const packageLabel = detectPackageLabel(product);
    return {
      quantity: Math.max(1, suggestedQuantity),
      note: `${baseQuantity} m convertidos para ${suggestedQuantity} ${packageLabel}(s) de ${metersPerUnit} m.`,
    };
  }

  return {
    quantity: Math.ceil(baseQuantity),
    note: `${baseQuantity} m mantidos como quantidade linear.`,
  };
};

const resolveLinearQuantity = (line, product, label) => {
  const baseQuantity = Math.max(1, Number(line.quantity || 1));
  const effectiveRequestedUnit = resolveEffectiveRequestedUnit(line, product);

  if (effectiveRequestedUnit === 'm') {
    return {
      quantity: Math.ceil(baseQuantity),
      note: `${baseQuantity} m reaproveitados para ${label}.`,
    };
  }

  const metersPerUnit = detectMetersPerUnit(product);
  if (metersPerUnit > 0) {
    const totalMeters = Math.ceil(baseQuantity * metersPerUnit);
    return {
      quantity: totalMeters,
      note: `${buildRequestedLabel(line)} convertidos para ${totalMeters} m em ${label}, considerando ${metersPerUnit} m por unidade.`,
    };
  }

  return null;
};

const parseImportLine = (rawLine) => {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)([a-zA-Z]*)\s+(.+)$/);
  if (!match) {
    return {
      rawLine: trimmed,
      quantity: 1,
      requestedUnit: '',
      description: trimmed,
    };
  }

  const quantity = parseNumber(match[1]) || 1;
  let requestedUnit = normalizeUnit(match[2]);
  let description = match[3].trim();

  if (!requestedUnit) {
    const [firstToken, ...restTokens] = description.split(/\s+/);
    const normalizedCandidate = normalizeUnit(firstToken);
    if (normalizedCandidate && restTokens.length > 0) {
      requestedUnit = normalizedCandidate;
      description = restTokens.join(' ');
    }
  }

  return {
    rawLine: trimmed,
    quantity,
    requestedUnit,
    description,
  };
};

const scoreCandidate = (line, product) => {
  const lineText = normalizeText(line.description);
  const candidateText = normalizeText(buildCatalogText(product));
  const lineTokens = tokenize(line.description);
  const candidateTokens = new Set(tokenize(candidateText, { expandAliases: false }));
  const matchedTokens = lineTokens.filter((token) => candidateTokens.has(token));

  if (!matchedTokens.length) {
    return {
      score: 0,
      matchedTokens: [],
    };
  }

  let score = matchedTokens.reduce((acc, token) => acc + weightToken(token), 0);

  if (lineText && candidateText.includes(lineText)) {
    score += 8;
  }

  if (line.requestedUnit === 'm' && /cabo|fibra|optic|eletroduto|tubo/.test(candidateText)) {
    score += 2;
  }

  if (matchedTokens.length >= 3) {
    score += 2;
  }

  const unmatchedStrongTokens = lineTokens.filter((token) => !candidateTokens.has(token) && weightToken(token) >= 2.6);
  if (unmatchedStrongTokens.length) {
    score -= unmatchedStrongTokens.length * 1.2;
  }

  return {
    score,
    matchedTokens,
  };
};

const buildConfidence = (score, gap) => {
  const raw = Math.round(score * 7 + Math.max(0, gap) * 8);
  return Math.max(0, Math.min(100, raw));
};

const determineServiceFamily = (line, matchedProduct) => {
  const referenceText = normalizeText(
    [line?.description, matchedProduct?.name, matchedProduct?.category, matchedProduct?.serviceReference]
      .filter(Boolean)
      .join(' '),
  );
  return SERVICE_FAMILIES.find((family) => family.detect.test(referenceText)) || null;
};

const includesAnyToken = (tokens, expectedTokens = []) => expectedTokens.some((token) => tokens.has(token));

const scoreServiceCandidate = (service, family) => {
  const text = buildCatalogText(service);
  const normalizedText = normalizeText(text);
  const tokens = new Set(tokenize(text));

  if (!includesAnyToken(tokens, family.requiredAny)) {
    return null;
  }

  let score = 12;

  family.requiredAny.forEach((token) => {
    if (tokens.has(token)) {
      score += weightToken(token);
    }
  });

  family.preferredAny.forEach((token) => {
    if (tokens.has(token)) {
      score += 3.2;
    }
  });

  (family.avoidAny || []).forEach((token) => {
    if (tokens.has(token)) {
      score -= 4.2;
    }
  });

  if (family.preferAdm) {
    if (/\badm\b|administrativo|escritorio/.test(normalizedText)) {
      score += 5;
    }
    if (/industrial/.test(normalizedText)) {
      score -= 4.5;
    }
  }

  if (/material/.test(normalizedText) && !/servico|servico|instalacao|lancamento|montagem|passagem/.test(normalizedText)) {
    score -= 6;
  }

  return {
    score,
    normalizedText,
  };
};

const resolveDerivedServiceQuantity = (line, family, matchedProduct, service) => {
  const baseQuantity = Math.max(1, Number(line.quantity || 1));

  const serviceUnit = normalizeUnit(service?.unit);
  const shouldUseLinearQuantity = family?.quantityMode === 'linear' || serviceUnit === 'm';

  if (shouldUseLinearQuantity) {
    const linearMeta = resolveLinearQuantity(line, matchedProduct, 'o servico correspondente');
    if (linearMeta) {
      return linearMeta;
    }

    if (serviceUnit === 'm') {
      return null;
    }
  }

  return {
    quantity: Math.ceil(baseQuantity),
    note: `${buildRequestedLabel(line)} reaproveitado para o servico correspondente.`,
  };
};

const buildServiceSuggestion = (line, matchedProduct, servicesCatalog) => {
  const referencedService = matchedProduct?.serviceReference
    ? servicesCatalog
        .map((service) => ({
          service,
          score: buildReferenceLookupScore(service, matchedProduct.serviceReference),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)[0] || null
    : null;

  if (referencedService) {
    const quantityMeta = resolveDerivedServiceQuantity(line, { quantityMode: 'same' }, matchedProduct, referencedService.service);
    if (!quantityMeta) return null;
    return {
      family: 'referencia-cadastrada',
      note: `Servico referenciado no cadastro do produto. ${quantityMeta.note}`.trim(),
      bestMatch: {
        id: referencedService.service.id,
        name: referencedService.service.name,
        sku: referencedService.service.sku,
        category: referencedService.service.category,
        unit: referencedService.service.unit,
        price: Number(referencedService.service.price || 0),
        type: referencedService.service.type || 'servicos',
        scopeTemplate: referencedService.service.scopeTemplate || '',
        score: referencedService.score,
      },
      suggestedItem: {
        id: referencedService.service.id,
        name: referencedService.service.name,
        sku: referencedService.service.sku,
        category: referencedService.service.category || '',
        price: Number(referencedService.service.price || 0),
        quantity: quantityMeta.quantity,
        unit: referencedService.service.unit || '',
        type: 'servicos',
        source: 'service-reference-import',
        importLine: line.rawLine,
        derivedFrom: matchedProduct?.name || line.description,
        scopeTemplate: referencedService.service.scopeTemplate || '',
      },
      alternatives: [],
    };
  }

  const family = determineServiceFamily(line, matchedProduct);
  if (!family) return null;

  const ranked = servicesCatalog
    .map((service) => {
      const scoring = scoreServiceCandidate(service, family);
      return scoring ? { service, ...scoring } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  if (!best || best.score < 15) return null;

  const quantityMeta = resolveDerivedServiceQuantity(line, family, matchedProduct, best.service);
  if (!quantityMeta) return null;

  return {
    family: family.key,
    note: `${family.note} ${quantityMeta.note}`.trim(),
    bestMatch: {
      id: best.service.id,
      name: best.service.name,
      sku: best.service.sku,
      category: best.service.category,
      unit: best.service.unit,
      price: Number(best.service.price || 0),
      type: best.service.type || 'servicos',
      scopeTemplate: best.service.scopeTemplate || '',
      score: best.score,
    },
    suggestedItem: {
      id: best.service.id,
      name: best.service.name,
      sku: best.service.sku,
      category: best.service.category || '',
      price: Number(best.service.price || 0),
      quantity: quantityMeta.quantity,
      unit: best.service.unit || '',
      type: 'servicos',
      source: 'derived-service-import',
      importLine: line.rawLine,
      derivedFrom: matchedProduct?.name || line.description,
      scopeTemplate: best.service.scopeTemplate || '',
    },
    alternatives: ranked.slice(1, 3).map((entry) => ({
      id: entry.service.id,
      name: entry.service.name,
      score: entry.score,
    })),
  };
};

export const buildImportPreview = (rawText, catalog = {}) => {
  const materialsCatalog = Array.isArray(catalog?.materials) ? catalog.materials : [];
  const servicesCatalog = Array.isArray(catalog?.services) ? catalog.services : [];

  const lines = (rawText || '')
    .split(/\r?\n/)
    .map(parseImportLine)
    .filter(Boolean);

  const results = lines.map((line, index) => {
    const ranked = materialsCatalog
      .map((product) => ({
        product,
        ...scoreCandidate(line, product),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const bestMatch = ranked[0] || null;
    const secondMatch = ranked[1] || null;
    const gap = bestMatch ? bestMatch.score - (secondMatch?.score || 0) : 0;
    let status = 'unmatched';

    if (bestMatch?.score >= 10 && gap >= 1.4) {
      status = 'matched';
    } else if (bestMatch?.score >= 6) {
      status = 'review';
    }

    const confidence = bestMatch ? buildConfidence(bestMatch.score, gap) : 0;
    const effectiveRequestedUnit = bestMatch ? resolveEffectiveRequestedUnit(line, bestMatch.product) : normalizeUnit(line.requestedUnit);
    const quantityMeta = bestMatch ? resolveSuggestedQuantity(line, bestMatch.product) : null;
    const materialSuggestedItem =
      bestMatch && quantityMeta
        ? {
            id: bestMatch.product.id,
            name: bestMatch.product.name,
            sku: bestMatch.product.sku,
            category: bestMatch.product.category || '',
            price: Number(bestMatch.product.price || 0),
            quantity: quantityMeta.quantity,
            unit: bestMatch.product.unit || '',
            type: 'materiais',
            source: 'catalog-import',
            importLine: line.rawLine,
          }
        : null;
    const derivedService = bestMatch ? buildServiceSuggestion(line, bestMatch.product, servicesCatalog) : null;

    return {
      id: `import-line-${index}`,
      ...line,
      requestedLabel: buildRequestedLabel(line, effectiveRequestedUnit),
      status,
      confidence,
      matchedTokens: bestMatch?.matchedTokens || [],
      bestMatch: bestMatch
        ? {
            id: bestMatch.product.id,
            name: bestMatch.product.name,
            sku: bestMatch.product.sku,
            category: bestMatch.product.category,
            unit: bestMatch.product.unit,
            type: 'materiais',
            price: bestMatch.product.price,
            score: bestMatch.score,
          }
        : null,
      alternatives: ranked.slice(1, 3).map((entry) => ({
        id: entry.product.id,
        name: entry.product.name,
        type: 'materiais',
        score: entry.score,
      })),
      note: quantityMeta?.note || '',
      suggestedItem: materialSuggestedItem,
      derivedService,
    };
  });

  const summary = {
    totalLines: results.length,
    matchedCount: results.filter((entry) => entry.status === 'matched').length,
    reviewCount: results.filter((entry) => entry.status === 'review').length,
    unmatchedCount: results.filter((entry) => entry.status === 'unmatched').length,
    derivedServicesCount: results.filter((entry) => entry.derivedService?.suggestedItem).length,
  };

  return {
    lines: results,
    summary,
  };
};

export const suggestServiceReferenceForProduct = (product, servicesCatalog = []) => {
  if (!product || !Array.isArray(servicesCatalog) || !servicesCatalog.length) return null;
  const pseudoLine = {
    rawLine: product.name || product.description || '',
    quantity: 1,
    requestedUnit: normalizeUnit(product.unit),
    description: product.name || product.description || '',
  };
  const suggestion = buildServiceSuggestion(pseudoLine, product, servicesCatalog);
  return suggestion?.bestMatch?.name || null;
};
