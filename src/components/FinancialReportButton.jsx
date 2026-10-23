import { useState } from 'react';
import ModalPortal from './ModalPortal.jsx';

const states = ['Aprovado', 'Em execução', 'Concluído', 'Faturado', 'Pago'];
export default function FinancialReportButton({ syncing }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({ start: '2026-01-01', end: '2026-12-31', cutoff: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()), client: 'Yara', states });
  const exportReport = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { downloadFinancialReport } = await import('../utils/financialReport.js');
      const { loadFinancialSource } = await import('../services/financialSource.js');
      const source = await loadFinancialSource();
      await downloadFinancialReport(source.quotes, { ...options, sourceIssues: source.sourceIssues, sourceLabel: source.sourceLabel });
      setOpen(false);
    } catch (e) {
      setError(e.message || 'Não foi possível gerar o relatório.');
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button type="button" className="btn-primary text-xs" disabled={syncing} onClick={() => setOpen(true)}>Exportar Relatório Financeiro (.xlsx)</button>
    {open && <ModalPortal><div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={exportReport} role="dialog" aria-modal="true" aria-labelledby="financial-report-title" className="cyber-dialog w-full max-w-xl rounded-2xl bg-slate-900 p-6 text-white">
        <h3 id="financial-report-title" className="text-lg font-semibold">Relatório financeiro</h3>
        <p className="my-3 text-sm text-slate-300">Consulta a fonte completa no SharePoint, independentemente dos filtros e páginas da tela. Inclui criação ou evento comprovado no período. A situação é a original atual; a data de corte não reconstrói o histórico.</p>
        <div className="grid grid-cols-2 gap-3">
          {[['start', 'Início'], ['end', 'Fim'], ['cutoff', 'Data de corte']].map(([key, label]) => <label key={key} className="text-sm">{label}<input required type="date" value={options[key]} onChange={(e) => setOptions({ ...options, [key]: e.target.value })} className="mt-1 w-full rounded bg-slate-800 p-2" /></label>)}
          <label className="text-sm">Cliente contém<input value={options.client} onChange={(e) => setOptions({ ...options, client: e.target.value })} className="mt-1 w-full rounded bg-slate-800 p-2" placeholder="Todos" /></label>
        </div>
        <fieldset className="my-4"><legend>Situações incluídas</legend><div className="mt-2 flex flex-wrap gap-3">{states.map((state) => <label key={state} className="text-sm"><input type="checkbox" checked={options.states.includes(state)} onChange={(e) => setOptions({ ...options, states: e.target.checked ? [...options.states, state] : options.states.filter((s) => s !== state) })} /> {state}</label>)}</div></fieldset>
        <p className="text-sm text-amber-100">Datas, notas e recebimentos ausentes ficam em branco. Custos são estimativas do sistema. Revise descrições e observações antes de compartilhar com terceiros.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={busy || syncing}>{busy ? 'Gerando…' : 'Gerar Excel'}</button></div>
      </form>
    </div></ModalPortal>}
  </>;
}
