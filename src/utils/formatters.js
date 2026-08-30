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
  if (normalized === 'concluído' || normalized === 'concluido') return 'badge-complete';
  if (normalized === 'reprovado' || normalized === 'perdido') return 'badge-danger';
  if (normalized === 'aguardando') return 'badge-info';
  if (normalized === 'rascunho') return 'badge-warning';
  return 'badge bg-slate-500/20 text-slate-200';
};
