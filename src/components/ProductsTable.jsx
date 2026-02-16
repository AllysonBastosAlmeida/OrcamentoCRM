import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';

const ProductsTable = ({ products, loading, onRefresh }) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(() => {
    const unique = new Set();
    (products || []).forEach((product) => {
      if (product?.category) {
        unique.add(product.category);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [products]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    return (products || []).filter((product) => {
      if (!product) {
        return false;
      }
      if (categoryFilter !== 'all' && product.category !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [product.name, product.sku, product.description, product.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [products, categoryFilter, normalizedQuery]);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Produtos do SharePoint</p>
            <p className="text-xs text-slate-400">Fonte: Excel online (Graph API)</p>
          </div>
          <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, SKU, descricao..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categoria</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="bg-transparent text-sm text-white outline-none"
            >
              <option value="all">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-slate-400">
            Mostrando {filteredProducts.length} de {(products || []).length}
          </span>
        </div>
      </div>
      <div className="max-h-[520px] overflow-x-auto overflow-y-auto scroll-container">
        <table className="table">
          <thead className="sticky top-0 z-10 bg-white/5">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Estoque</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={6}>
                  Nenhum produto encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-slate-400">{product.description}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">{product.sku}</td>
                  <td className="px-4 py-3 font-semibold text-white">{formatCurrency(product.price)}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{product.stock}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{product.category}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(product.updatedAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductsTable;
