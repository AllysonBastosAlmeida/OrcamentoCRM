const StatsCards = ({ cards }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-400">{card.title}</p>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-primary">
              {card.icon}
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
          {card.subtitle && <p className="mt-1 text-xs text-slate-400">{card.subtitle}</p>}
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
