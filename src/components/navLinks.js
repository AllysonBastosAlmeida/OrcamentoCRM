import { ChartPie, ContactRound, FileSpreadsheet, LayoutGrid, PackageSearch, UsersRound } from 'lucide-react';

export const navLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid },
  { to: '/orcamentos', label: 'Orcamentos', icon: FileSpreadsheet },
  { to: '/clientes', label: 'Clientes', icon: UsersRound },
  { to: '/contatos-internos', label: 'Contatos internos', icon: ContactRound },
  { to: '/produtos', label: 'Produto/Servi\u00e7os', icon: PackageSearch },
  { to: '/relatorios', label: 'Relatorios', icon: ChartPie },
];

const findLink = (path) => navLinks.find((link) => link.to === path);

export const showcaseNavGroups = [
  {
    id: 'comercial',
    label: 'Comercial',
    heroImage: 'showcase-orcamentos-hero-test.png',
    items: ['/', '/orcamentos', '/clientes'].map(findLink).filter(Boolean),
  },
  {
    id: 'operacao',
    label: 'Operacao',
    heroImage: 'showcase-clever-command-hero.jpg',
    items: ['/contatos-internos', '/produtos', '/relatorios'].map(findLink).filter(Boolean),
  },
];

export const findShowcaseGroupByPath = (path) =>
  showcaseNavGroups.find((group) => group.items.some((item) => item.to === path)) || showcaseNavGroups[0];
