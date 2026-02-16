const mockProducts = [
  {
    id: 'SKU-001',
    name: 'Plano Cloud Starter',
    sku: 'CLOUD-START',
    price: 890,
    stock: 120,
    category: 'Serviços',
    description: 'Plano de entrada com suporte padrão e implantação rápida.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SKU-002',
    name: 'Plano Cloud Business',
    sku: 'CLOUD-BIZ',
    price: 1990,
    stock: 80,
    category: 'Serviços',
    description: 'Solução completa com SLA empresarial e integrações prontas.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SKU-003',
    name: 'Licenças Add-on Analytics',
    sku: 'ADD-ANALYTICS',
    price: 420,
    stock: 260,
    category: 'Add-ons',
    description: 'Módulo avançado de dashboards e exportação customizada.',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SKU-004',
    name: 'Suporte Premium 24/7',
    sku: 'SUP-PREMIUM',
    price: 650,
    stock: 999,
    category: 'Serviços',
    description: 'Equipe dedicada, canais prioritários e health-check mensal.',
    updatedAt: new Date().toISOString(),
  },
];

export default mockProducts;
