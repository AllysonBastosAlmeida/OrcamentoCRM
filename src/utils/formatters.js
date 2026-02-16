export const formatCurrency = (value = 0) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (date) => {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('pt-BR');
};

export const statusBadgeClass = (status) => {
  const normalized = status?.toLowerCase();
  if (normalized === 'aprovado') return 'badge-success';
  if (normalized === 'enviado') return 'badge-info';
  if (normalized === 'rascunho') return 'badge-warning';
  if (normalized === 'perdido') return 'badge bg-rose-500/20 text-rose-200';
  return 'badge bg-slate-500/20 text-slate-200';
};
