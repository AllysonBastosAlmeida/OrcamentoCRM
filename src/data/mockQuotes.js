const today = new Date();
const addDays = (days) => new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

const mockQuotes = [
  {
    id: 'orc-001',
    title: 'Implantação Cloud Starter',
    clientName: 'Acme Corp',
    clientEmail: 'compras@acme.com',
    status: 'Enviado',
    validUntil: addDays(10),
    createdAt: addDays(-2),
    discountValue: 0,
    taxRate: 8,
    subtotal: 4200,
    total: 4536,
    items: [
      { id: 'SKU-001', name: 'Plano Cloud Starter', sku: 'CLOUD-START', price: 890, quantity: 2 },
      { id: 'SKU-004', name: 'Suporte Premium 24/7', sku: 'SUP-PREMIUM', price: 650, quantity: 3 },
    ],
    notes: 'Incluso treinamento remoto.',
  },
  {
    id: 'orc-002',
    title: 'Upgrade Analytics',
    clientName: 'DataX',
    clientEmail: 'financeiro@datax.io',
    status: 'Aprovado',
    validUntil: addDays(3),
    createdAt: addDays(-12),
    discountValue: 300,
    taxRate: 8,
    subtotal: 5200,
    total: 5296,
    items: [
      { id: 'SKU-002', name: 'Plano Cloud Business', sku: 'CLOUD-BIZ', price: 1990, quantity: 2 },
      { id: 'SKU-003', name: 'Add-on Analytics', sku: 'ADD-ANALYTICS', price: 420, quantity: 3 },
    ],
    notes: 'Prazo de go-live: 15 dias.',
  },
  {
    id: 'orc-003',
    title: 'Renovação de contratos',
    clientName: 'Grupo Polaris',
    clientEmail: 'ti@polaris.com.br',
    status: 'Rascunho',
    validUntil: addDays(20),
    createdAt: addDays(-1),
    discountValue: 0,
    taxRate: 5,
    subtotal: 3100,
    total: 3255,
    items: [{ id: 'SKU-003', name: 'Add-on Analytics', sku: 'ADD-ANALYTICS', price: 420, quantity: 5 }],
    notes: 'Aprovação pendente do board.',
  },
];

export default mockQuotes;
