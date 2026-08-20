import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import ModalPortal from '../components/ModalPortal.jsx';
import ProductsTable from '../components/ProductsTable.jsx';
import { useProducts } from '../hooks/useProducts.js';
import { useToast } from '../components/ToastHost.jsx';
import { graphConfig } from '../services/api.js';
import { suggestServiceReferenceForProduct } from '../utils/quoteImporter.js';

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
    addProduct,
    updateProduct,
    removeProduct,
  } = useProducts();
  const serviceCatalog = useProducts(graphConfig.sheetServicos);

  const { pushToast } = useToast();
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [addError, setAddError] = useState('');
  const [addForm, setAddForm] = useState({
    description: '',
    unit: 'Un',
    price: '',
    category: '',
    serviceReference: '',
    scopeTemplate: '',
  });

  const categoryOptions = useMemo(() => {
    const unique = new Set();
    (products || []).forEach((product) => {
      if (product?.category) unique.add(product.category);
    });
    if (editingProduct?.category) {
      unique.add(editingProduct.category);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [products, editingProduct]);

  const parsePrice = (value) => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = value.toString().replace(/[^0-9,.-]/g, '');
    if (!cleaned) return 0;
    if (cleaned.includes('.') && cleaned.includes(',')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      const num = Number(normalized);
      return Number.isNaN(num) ? 0 : num;
    }
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    let decimalSep = -1;
    if (lastDot > lastComma) decimalSep = lastDot;
    if (lastComma > lastDot) decimalSep = lastComma;
    if (decimalSep === -1) {
      const num = Number(cleaned.replace(/[.,]/g, ''));
      return Number.isNaN(num) ? 0 : num;
    }
    const intPart = cleaned.slice(0, decimalSep).replace(/[.,]/g, '');
    const decPart = cleaned.slice(decimalSep + 1);
    const num = Number(`${intPart}.${decPart}`);
    return Number.isNaN(num) ? 0 : num;
  };

  const formatPriceInput = (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
      return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return value.toString();
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setAddForm({
      description: '',
      unit: 'Un',
      price: '',
      category: categoryOptions[0] || '',
      serviceReference: '',
      scopeTemplate: '',
    });
    setAddError('');
    setAddOpen(true);
  };

  const openEditModal = (product) => {
    if (!product) return;
    if (!hasSharePointConfig) {
      pushToast('Config do SharePoint ausente. Nao foi possivel editar.', 'error');
      return;
    }
    if (!product.item && product.item !== 0) {
      pushToast('Item sem referencia na planilha. Nao e possivel editar.', 'error');
      return;
    }
    const suggestedServiceReference =
      sheet === sheetServicos
        ? ''
        : product.serviceReference || suggestServiceReferenceForProduct(product, serviceCatalog.products) || '';
    setEditingProduct(product);
    setAddForm({
      description: product.name || product.description || '',
      unit: product.unit || 'Un',
      price: formatPriceInput(product.price),
      category: product.category || categoryOptions[0] || '',
      serviceReference: suggestedServiceReference,
      scopeTemplate: product.scopeTemplate || '',
    });
    setAddError('');
    setAddOpen(true);
  };

  const closeAddModal = () => {
    if (saving) return;
    setAddOpen(false);
    setEditingProduct(null);
  };

  useEffect(() => {
    if (!addOpen) return;
    const handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
      closeAddModal();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOpen, saving]);

  const isEditing = Boolean(editingProduct);

  const handleAdd = async () => {
    if (!hasSharePointConfig) {
      setAddError('Config do SharePoint ausente. Nao foi possivel gravar na planilha.');
      return;
    }
    if (isEditing && !editingProduct?.item && editingProduct?.item !== 0) {
      setAddError('Item sem referencia para atualizar.');
      return;
    }
    const description = addForm.description.trim();
    const category = addForm.category.trim();
    const serviceReference = addForm.serviceReference.trim();
    const scopeTemplate = addForm.scopeTemplate.trim();
    const priceValue = parsePrice(addForm.price);
    if (!description) {
      setAddError('Informe a descricao do item.');
      return;
    }
    if (!category) {
      setAddError('Selecione a categoria.');
      return;
    }
    if (!priceValue || priceValue <= 0) {
      setAddError('Informe um valor valido.');
      return;
    }

    setSaving(true);
    setAddError('');
    const startedAt = Date.now();
    try {
      if (isEditing) {
        await updateProduct({
          item: editingProduct.item,
          description,
          unit: addForm.unit,
          price: priceValue,
          category,
          serviceReference,
          scopeTemplate,
        });
        pushToast('Item atualizado.', 'success');
      } else {
        await addProduct({
          description,
          unit: addForm.unit,
          price: priceValue,
          category,
          serviceReference,
          scopeTemplate,
        });
        pushToast('Item adicionado.', 'success');
      }
      setAddOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error('Falha ao salvar item', err);
      setAddError(isEditing ? 'Falha ao atualizar item na planilha.' : 'Falha ao adicionar item na planilha.');
      pushToast(isEditing ? 'Falha ao atualizar item.' : 'Falha ao adicionar item.', 'error');
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 300) {
        await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
      }
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!hasSharePointConfig) {
      pushToast('Config do SharePoint ausente. Nao foi possivel excluir.', 'error');
      return;
    }
    if (!product?.item && product?.item !== 0) {
      pushToast('Item sem referencia na planilha. Nao e possivel excluir.', 'error');
      return;
    }
    if (deletingItem || deletingItem === 0) return;
    const confirmed = window.confirm(`Excluir o item "${product?.name || 'Sem descricao'}"?`);
    if (!confirmed) return;
    setDeletingItem(product.item);
    try {
      await removeProduct({ item: product.item });
      pushToast('Item excluido.', 'success');
    } catch (err) {
      console.error('Falha ao excluir item', err);
      pushToast('Falha ao excluir item.', 'error');
    } finally {
      setDeletingItem(null);
    }
  };

  const currentSheetLabel = sheet === sheetServicos ? 'Servicos' : 'Materiais';
  const isServicesSheet = sheet === sheetServicos;
  const modalTitle = isEditing ? 'Editar item' : 'Novo item';
  const modalActionLabel = isEditing ? 'Salvar' : 'Adicionar';
  const modalSavingLabel = isEditing ? 'Salvando alteracoes' : 'Salvando item';
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="dashboard-hero">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400 sm:text-sm">{'Cat\u00e1logo'}</p>
          <h1 className="mt-1 text-[1.8rem] font-bold leading-none text-white sm:text-[1.95rem]">Produtos (SharePoint)</h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-400">
            Carregados via Microsoft Graph diretamente da planilha QQP e Orcamento.xlsx. Atualize a qualquer momento.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <div className="dashboard-action-row">
            <div className="inline-flex h-8 items-center rounded-xl border border-white/10 bg-white/5 p-1 text-[11px] font-semibold text-white">
              <button
                type="button"
                onClick={() => setSheet(sheetMateriais)}
                className={`rounded-lg px-3 py-1 transition ${
                  sheet === sheetMateriais ? 'bg-gradient-primary text-white shadow-soft' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                Materiais
              </button>
              <button
                type="button"
                onClick={() => setSheet(sheetServicos)}
                className={`rounded-lg px-3 py-1 transition ${
                  sheet === sheetServicos ? 'bg-gradient-primary text-white shadow-soft' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                {'Servi\u00e7os'}
              </button>
            </div>
            <button className="toolbar-btn-primary" onClick={openAddModal} disabled={!hasSharePointConfig}>
              <Plus className="h-4 w-4" />
              Novo item
            </button>
          </div>
        </div>
      </div>

      {!hasSharePointConfig && (
        <div className="card border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-100 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
            <div>
              <p className="text-xs font-semibold sm:text-base">{'Configura\u00e7\u00e3o do SharePoint ausente'}</p>
              <p className="hidden text-xs sm:block sm:text-sm">
                Defina VITE_GRAPH_SITE_ID, VITE_GRAPH_DRIVE_ID, VITE_GRAPH_ITEM_ID e as abas no .env para ler a
                planilha real. Enquanto isso, exibimos dados de mock.
              </p>
              <p className="text-[11px] sm:hidden">{'Defina as vari\u00e1veis no .env para ler a planilha real.'}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100 sm:text-sm">
          Falha ao buscar produtos: {error}
        </div>
      )}

      <ProductsTable
        products={products}
        loading={loading}
        onRefresh={refresh}
        onEdit={openEditModal}
        onDelete={handleDelete}
        canManage={hasSharePointConfig}
        deletingItem={deletingItem}
      />

      {addOpen && (
        <ModalPortal>
          <div
          className="cyber-overlay fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget || saving) return;
            closeAddModal();
          }}
        >
          <div
            className="cyber-dialog w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-5"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">{modalTitle}</p>
                <h3 className="text-base font-semibold text-white sm:text-lg">{currentSheetLabel}</h3>
                {isEditing && (
                  <p className="text-[11px] text-slate-400">Item #{editingProduct?.item}</p>
                )}
              </div>
              <button className="btn-secondary" onClick={closeAddModal} disabled={saving}>
                Fechar
              </button>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Descricao
                <input
                  value={addForm.description}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 placeholder:text-slate-500 sm:py-2 sm:text-sm"
                  placeholder="Descricao do material ou servico"
                />
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                  Tipo
                  <select
                    value={addForm.unit}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, unit: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                  >
                    <option value="Un">Unidade (Un)</option>
                    <option value="M">Metro (M)</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                  Valor (R$)
                  <input
                    value={addForm.price}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, price: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 placeholder:text-slate-500 sm:py-2 sm:text-sm"
                    placeholder="Ex: 120,50"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                Categoria
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 sm:py-2 sm:text-sm"
                >
                  <option value="">Selecione</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              {!isServicesSheet ? (
                <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                  Referencia de Servico
                  <input
                    list="service-reference-options"
                    value={addForm.serviceReference}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, serviceReference: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-primary/60 placeholder:text-slate-500 sm:py-2 sm:text-sm"
                    placeholder="Ex: Conectorizacao de rede keystone/RJ45"
                  />
                  <datalist id="service-reference-options">
                    {serviceCatalog.products.map((service) => (
                      <option key={service.id || service.sku || service.name} value={service.name} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-[11px] text-slate-400">
                    O importador de orcamento usara esta referencia antes da comparacao automatica.
                  </p>
                </label>
              ) : (
                <label className="block text-xs font-semibold text-slate-300 sm:text-sm">
                  Modelo de escopo
                  <textarea
                    value={addForm.scopeTemplate}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, scopeTemplate: e.target.value }))}
                    rows={5}
                    className="mt-1 w-full resize-y rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-primary/60 placeholder:text-slate-500 sm:text-sm"
                    placeholder="Ex: Instalação de {quantidade} câmeras {local}, incluindo fixação, conexão e validação da imagem."
                  />
                  <p className="mt-1 text-[11px] font-normal text-slate-400">
                    Variáveis disponíveis: {'{quantidade}'}, {'{unidade}'}, {'{local}'}, {'{servico}'} e {'{categoria}'}.
                    Requer uma coluna “Modelo de Escopo” ou “Escopo Padrão” na aba de serviços.
                  </p>
                </label>
              )}

              <div className="text-[11px] text-slate-400 sm:text-xs">
                Quantidade, total e observacao serao mantidos em branco para a planilha calcular.
              </div>

              {addError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200 sm:text-sm">
                  {addError}
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-end gap-2 sm:mt-4">
              <button className="btn-secondary" onClick={closeAddModal} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                    Salvando...
                  </>
                ) : (
                  modalActionLabel
                )}
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {saving && addOpen && (
        <ModalPortal>
          <div className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="cyber-dialog cyber-loading-dialog flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
              <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/20" />
              <img src={logoUrl} alt="Clever Connection" className="relative h-12 w-12 rounded-full bg-white/10 p-2" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">{modalSavingLabel}</p>
              <p className="text-xs text-slate-300">Aguarde alguns instantes.</p>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {(deletingItem || deletingItem === 0) && (
        <ModalPortal>
          <div className="cyber-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="cyber-dialog cyber-loading-dialog flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
              <div className="absolute h-16 w-16 animate-pulse rounded-full bg-primary/20" />
              <img src={logoUrl} alt="Clever Connection" className="relative h-12 w-12 rounded-full bg-white/10 p-2" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Excluindo item</p>
              <p className="text-xs text-slate-300">Aguarde alguns instantes.</p>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default Produtos;
