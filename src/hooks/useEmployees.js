import { useEffect, useState } from 'react';
import { getEmployees, refreshEmployees, removeEmployee, upsertEmployee } from '../services/employees.js';

export const useEmployees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (opts = {}) => {
    setLoading(true);
    try {
      const data = await (opts.force ? refreshEmployees() : getEmployees());
      setEmployees(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err.message || 'Erro ao carregar contatos internos');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveEmployee = async (employee) => {
    setLoading(true);
    try {
      const merged = await upsertEmployee(employee);
      setEmployees(merged);
      setError(null);
      return merged;
    } catch (err) {
      setError(err.message || 'Erro ao salvar contato interno');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteEmployee = async (id) => {
    setLoading(true);
    try {
      const merged = await removeEmployee(id);
      setEmployees(merged);
      setError(null);
      return merged;
    } catch (err) {
      setError(err.message || 'Erro ao excluir contato interno');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    employees,
    loading,
    error,
    refresh: () => load({ force: true }),
    saveEmployee,
    deleteEmployee,
  };
};
