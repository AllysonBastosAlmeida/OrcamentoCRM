const StatsCards = ({ cards }) => {
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
          <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{card.value}</p>
          {card.subtitle && <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">{card.subtitle}</p>}
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
