import { useEffect, useState } from 'react';
import { getClients, refreshClients, removeClient, upsertClient } from '../services/clients.js';

export const useClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (opts = {}) => {
    setLoading(true);
    try {
      const data = await (opts.force ? refreshClients() : getClients());
      setClients(data);
      window.dispatchEvent(new CustomEvent('crm:clients-updated', { detail: data }));
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao carregar clientes');
      if (opts.force) throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onClientsChanged = (event) => setClients(event.detail);
    window.addEventListener('crm:clients-updated', onClientsChanged);
    return () => window.removeEventListener('crm:clients-updated', onClientsChanged);
  }, []);

  const saveClient = async (client) => {
    setLoading(true);
    try {
      const merged = await upsertClient(client);
      setClients(merged);
      window.dispatchEvent(new CustomEvent('crm:clients-updated', { detail: merged }));
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao salvar cliente');
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (id) => {
    setLoading(true);
    try {
      const merged = await removeClient(id);
      setClients(merged);
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao excluir cliente');
    } finally {
      setLoading(false);
    }
  };

  return { clients, loading, error, refresh: () => load({ force: true }), saveClient, deleteClient };
};
