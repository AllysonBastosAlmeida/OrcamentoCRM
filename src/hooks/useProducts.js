import { useCallback, useEffect, useState } from 'react';
import {
  addProductToSheet,
  deleteProductFromSheet,
  getProducts,
  refreshProducts,
  updateProductInSheet,
  graphConfig,
} from '../services/api.js';

export const useProducts = (defaultSheet) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(defaultSheet || graphConfig.sheetMateriais);
  const [source, setSource] = useState('unknown');
  const [fetchedAt, setFetchedAt] = useState(null);

  const fetchProducts = useCallback(
    async (options = {}) => {
      setLoading(true);
      try {
        const result = await (options.forceRefresh ? refreshProducts(sheet) : getProducts({ sheet }));
        setProducts(result.items || []);
        setSource(result.source || 'unknown');
        setFetchedAt(result.fetchedAt || Date.now());
        setError(null);
      } catch (err) {
        setError(err.message || 'Erro ao buscar produtos');
      } finally {
        setLoading(false);
      }
    },
    [sheet],
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, sheet]);

  return {
    products,
    loading,
    error,
    source,
    fetchedAt,
    sheet,
    setSheet,
    refresh: () => fetchProducts({ forceRefresh: true }),
    addProduct: async (payload) => {
      const result = await addProductToSheet({ ...payload, sheet });
      await fetchProducts({ forceRefresh: true });
      return result;
    },
    updateProduct: async (payload) => {
      const result = await updateProductInSheet({ ...payload, sheet });
      await fetchProducts({ forceRefresh: true });
      return result;
    },
    removeProduct: async (payload) => {
      const result = await deleteProductFromSheet({ ...payload, sheet });
      await fetchProducts({ forceRefresh: true });
      return result;
    },
    hasSharePointConfig: graphConfig.hasSharePointConfig,
    sheetMateriais: graphConfig.sheetMateriais,
    sheetServicos: graphConfig.sheetServicos,
    siteId: graphConfig.siteId,
    driveId: graphConfig.driveId,
    itemId: graphConfig.itemId,
  };
};
