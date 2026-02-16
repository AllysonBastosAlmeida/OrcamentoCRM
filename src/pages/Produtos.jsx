import { AlertCircle, Database, ShieldCheck } from 'lucide-react';
import ProductsTable from '../components/ProductsTable.jsx';
import { useProducts } from '../hooks/useProducts.js';
import { formatCurrency } from '../utils/formatters.js';

const Produtos = () => {
  const {
    products,
    loading,
    error,
    hasSharePointConfig,
    sheet,
    setSheet,
    sheetMateriais,
    sheetServicos,
    refresh,
  } = useProducts();

  const totalValue = products.reduce((acc, product) => acc + (product.price || 0), 0);
  const lowStock = products.filter((p) => p.stock < 10).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Catálogo</p>
          <h1 className="text-2xl font-bold text-white">Produtos (SharePoint)</h1>
          <p className="text-sm text-slate-400">
            Carregados via Microsoft Graph diretamente da planilha QQP e Orcamento.xlsx. Atualize a qualquer momento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-sm font-semibold text-white">
            <button
              type="button"
              onClick={() => setSheet(sheetMateriais)}
              className={`rounded-lg px-4 py-2 transition ${
                sheet === sheetMateriais ? 'bg-gradient-primary text-white shadow-soft' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              Materiais
            </button>
            <button
              type="button"
              onClick={() => setSheet(sheetServicos)}
              className={`rounded-lg px-4 py-2 transition ${
                sheet === sheetServicos ? 'bg-gradient-primary text-white shadow-soft' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {'Servi\u00e7os'}
            </button>
          </div>
        </div>
      </div>

      {!hasSharePointConfig && (
        <div className="card border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />
            <div>
              <p className="font-semibold">Configuração do SharePoint ausente</p>
              <p className="text-sm">
                Defina VITE_GRAPH_SITE_ID, VITE_GRAPH_DRIVE_ID, VITE_GRAPH_ITEM_ID e as abas no .env para ler a
                planilha real. Enquanto isso, exibimos dados de mock.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          Falha ao buscar produtos: {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Itens disponíveis</p>
              <p className="text-xl font-bold text-white">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Valor de tabela</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totalValue)}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-amber-300">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Estoque baixo</p>
              <p className="text-xl font-bold text-white">{lowStock}</p>
            </div>
          </div>
        </div>
      </div>

      <ProductsTable products={products} loading={loading} onRefresh={refresh} />
    </div>
  );
};

export default Produtos;
