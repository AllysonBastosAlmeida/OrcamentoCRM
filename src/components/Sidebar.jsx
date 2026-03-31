import { NavLink } from 'react-router-dom';
import { navLinks } from './navLinks.js';

const Sidebar = ({ currentPath, appTitle }) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;

  return (
    <aside className="hidden w-72 flex-col border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-900/90 to-slate-950/95 p-6 text-white shadow-2xl shadow-primary/10 lg:flex">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-soft">
          <img src={logoUrl} alt="Clever Connection" className="h-6 w-6 object-contain" />
        </div>
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">CRM</p>
          <p className="text-lg font-bold">{appTitle}</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = currentPath === link.to;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-white/10 text-white shadow-soft border border-primary/30'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
        <p className="font-semibold text-white">SharePoint + Entra ID</p>
        <p className="mt-1 leading-relaxed text-slate-300">
          Autentica??o MSAL, produtos direto do Excel online, e fluxo de or?amentos com exporta??o integrada.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
