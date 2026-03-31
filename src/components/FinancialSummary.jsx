import { CheckCircle2, Clock4, DollarSign, FileSearch } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';

const FinancialSummary = ({ quotes }) => {
  const totals = quotes.reduce(
    (acc, quote) => {
      acc.total += quote.total || 0;
      if (quote.status === 'Aprovado') acc.approved += quote.total || 0;
      if (quote.status === 'Enviado') acc.sent += quote.total || 0;
      if (quote.status === 'Rascunho') acc.draft += 1;
      if (quote.status === 'Perdido') acc.lost += 1;
      return acc;
    },
    { total: 0, approved: 0, sent: 0, draft: 0, lost: 0 },
  );

  const cards = [
    {
      title: 'Valor total',
      value: formatCurrency(totals.total),
      icon: <DollarSign className="h-5 w-5" />,
      subtitle: 'Soma de todos os orçamentos',
    },
    {
      title: 'Aprovados',
      value: formatCurrency(totals.approved),
      icon: <CheckCircle2 className="h-5 w-5" />,
      subtitle: 'Receita prevista',
    },
    {
      title: 'Enviados',
      value: formatCurrency(totals.sent),
      icon: <Clock4 className="h-5 w-5" />,
      subtitle: 'Aguardando resposta',
    },
    {
      title: 'Pendências',
      value: `${totals.draft} rascunhos / ${totals.lost} perdidos`,
      icon: <FileSearch className="h-5 w-5" />,
      subtitle: 'Follow-ups prioritários',
    },
  ];

  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="card p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 sm:text-sm">{card.title}</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-primary sm:h-10 sm:w-10">
              {card.icon}
            </div>
          </div>
          <p className="mt-3 text-lg font-bold text-white sm:text-xl">{card.value}</p>
          <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">{card.subtitle}</p>
        </div>
      ))}
    </div>
  );
};

export default FinancialSummary;
