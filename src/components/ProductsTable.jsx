import { useMemo, useState } from 'react';
import { Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';

const ProductsTable = ({ products, loading, onRefresh, onEdit, onDelete, canManage, deletingItem }) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const showActions = Boolean(onEdit || onDelete);

  const categories = useMemo(() => {
    const unique = new Set();
    (products || []).forEach((product) => {
      if (product?.category) {
        unique.add(product.category);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [products]);

  const normalizeText = (value) =>
    value
      ?.toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const normalizedQuery = normalizeText(query.trim());
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
      const haystack = normalizeText(
        [product.name, product.sku, product.description, product.category, product.serviceReference].filter(Boolean).join(' '),
      );
      return haystack.includes(normalizedQuery);
    });
  }, [products, categoryFilter, normalizedQuery]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/5 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white sm:text-sm">Produtos do SharePoint</p>
            <p className="text-[11px] text-slate-400">Fonte: Excel online (Graph API)</p>
          </div>
          <button
            className="btn-secondary shrink-0"
            onClick={onRefresh}
            disabled={loading}
            title="Atualizar produtos"
            aria-label="Atualizar produtos"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 sm:text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">Buscar</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              data-global-search
              placeholder="Nome, SKU, descricao..."
              className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500 sm:text-xs"
            />
          </label>
          <label className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 sm:flex sm:text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">
              Categoria
            </span>
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              className="bg-transparent text-[11px] text-white outline-none sm:text-xs"
            >
              <option value="all">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-[11px] text-slate-400 sm:text-xs">
            Mostrando {filteredProducts.length} de {(products || []).length}
          </span>
        </div>
      </div>
      <div className="md:hidden">
        {filteredProducts.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-400">Nenhum produto encontrado com os filtros atuais.</div>
        ) : (
          pagedProducts.map((product, idx) => {
            const itemValue = product?.item ?? product?.id ?? product?.sku ?? '';
            const canManageRow = Boolean(canManage && (product?.item || product?.item === 0));
            const isDeleting =
              (product?.item || product?.item === 0) &&
              (deletingItem || deletingItem === 0) &&
              String(product.item) === String(deletingItem);
            return (
              <div
                key={itemValue || `product-mobile-${idx}`}
                className="border-b border-white/5 px-3 py-2 text-[11px] last:border-b-0 hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                        {itemValue || '--'}
                      </span>
                      <p className="break-words text-xs font-semibold text-white">{product.name}</p>
                    </div>
                    <p className="break-words text-[10px] text-slate-400">{product.category || 'Sem categoria'}</p>
                    {product.serviceReference ? (
                      <p className="mt-1 break-words text-[10px] text-sky-200/90">Servico: {product.serviceReference}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-xs font-semibold text-white">{formatCurrency(product.price)}</span>
                    <span className="text-[10px] text-slate-400">Estoque {product.stock}</span>
                    {showActions && (
                      <div className="flex items-center gap-1.5">
                        <button
                          className="rounded-lg border border-white/10 p-1 text-slate-200 transition hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onEdit && onEdit(product)}
                          title={canManageRow ? 'Editar' : 'Item sem referencia para editar'}
                          disabled={!onEdit || !canManageRow}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-lg border border-rose-500/40 p-1 text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onDelete && onDelete(product)}
                          title={canManageRow ? 'Excluir' : 'Item sem referencia para excluir'}
                          disabled={!onDelete || !canManageRow || isDeleting}
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="hidden max-h-[280px] overflow-y-auto scroll-container md:block md:max-h-[480px]">
        <table className="table w-full table-fixed leading-tight">
          <thead className="sticky top-0 z-10 bg-white/5">
            <tr>
              <th className="w-14 px-3 py-0.5 sm:px-4 sm:py-1.5">Item</th>
              <th className="w-[280px] px-3 py-0.5 sm:px-4 sm:py-1.5">Produto</th>
              <th className="hidden px-3 py-0.5 lg:table-cell lg:px-4 lg:py-1.5">SKU</th>
              <th className="hidden px-3 py-0.5 xl:table-cell xl:px-4 xl:py-1.5">Ref. Servico</th>
              <th className="w-24 px-3 py-0.5 sm:px-4 sm:py-1.5">Preço</th>
              <th className="w-20 px-3 py-0.5 sm:px-4 sm:py-1.5">Estoque</th>
              <th className="hidden px-3 py-0.5 lg:table-cell lg:px-4 lg:py-1.5">Categoria</th>
              <th className="hidden px-3 py-0.5 xl:table-cell xl:px-4 xl:py-1.5">Atualizado</th>
              {showActions && <th className="px-3 py-0.5 sm:px-4 sm:py-1.5 text-right">Acoes</th>}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-3 text-center text-xs text-slate-400 sm:px-4 sm:py-6 sm:text-sm"
                  colSpan={showActions ? 9 : 8}
                >
                  Nenhum produto encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              pagedProducts.map((product, idx) => {
                const itemValue = product?.item ?? product?.id ?? product?.sku ?? '';
                const canManageRow = Boolean(canManage && (product?.item || product?.item === 0));
                const isDeleting =
                  (product?.item || product?.item === 0) &&
                  (deletingItem || deletingItem === 0) &&
                  String(product.item) === String(deletingItem);
                return (
                  <tr key={itemValue || `product-${idx}`} className="hover:bg-white/5">
                    <td className="px-3 py-0.5 sm:px-4 sm:py-1.5 text-slate-200">{itemValue || '--'}</td>
                    <td className="px-3 py-0.5 sm:px-4 sm:py-1.5">
                      <p
                        className="truncate text-white"
                        title={product.name}
                      >
                        {product.name}
                      </p>
                    </td>
                    <td className="hidden px-3 py-0.5 lg:table-cell lg:px-4 lg:py-1.5 text-slate-200">{product.sku}</td>
                    <td className="hidden px-3 py-0.5 xl:table-cell xl:px-4 xl:py-1.5 text-slate-200">
                      <span className="block truncate" title={product.serviceReference || ''}>
                        {product.serviceReference || '--'}
                      </span>
                    </td>
                    <td className="px-3 py-0.5 sm:px-4 sm:py-1.5 text-white">{formatCurrency(product.price)}</td>
                    <td className="px-3 py-0.5 sm:px-4 sm:py-1.5 text-slate-200">{product.stock}</td>
                    <td className="hidden px-3 py-0.5 lg:table-cell lg:px-4 lg:py-1.5 text-slate-200">
                      <span className="block truncate" title={product.category}>
                        {product.category}
                      </span>
                    </td>
                    <td className="hidden px-3 py-0.5 xl:table-cell xl:px-4 xl:py-1.5 text-slate-400">
                      {new Date(product.updatedAt).toLocaleDateString('pt-BR')}
                    </td>
                    {showActions && (
                      <td className="px-3 py-0.5 sm:px-4 sm:py-1.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="rounded-lg border border-white/10 p-1.5 text-slate-200 transition hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:p-2"
                            onClick={() => onEdit && onEdit(product)}
                            title={canManageRow ? 'Editar' : 'Item sem referencia para editar'}
                            disabled={!onEdit || !canManageRow}
                          >
                            <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            className="rounded-lg border border-rose-500/40 p-1.5 text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2"
                            onClick={() => onDelete && onDelete(product)}
                            title={canManageRow ? 'Excluir' : 'Item sem referencia para excluir'}
                            disabled={!onDelete || !canManageRow || isDeleting}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {filteredProducts.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-white/5 bg-white/5 px-3 py-2 text-[11px] text-slate-300 sm:text-xs">
          <button
            className="btn-secondary"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </button>
          <div className="hidden items-center gap-1 sm:flex">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                type="button"
                className={`page-chip ${num === currentPage ? 'page-chip-active' : ''}`}
                onClick={() => setPage(num)}
              >
                {num}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 sm:hidden">
            {currentPage} / {totalPages}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Próximo
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductsTable;
