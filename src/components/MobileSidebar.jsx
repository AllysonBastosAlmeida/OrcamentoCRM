import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { navLinks } from './navLinks.js';

const MobileSidebar = ({ open, onClose, currentPath, appTitle, user }) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;

  if (!open) return null;
  return (
    <div className="cyber-overlay fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70"
        aria-label="Fechar menu"
        onClick={onClose}
      />
      <aside className="cyber-dialog relative h-full w-64 max-w-[85vw] bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950 p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-soft">
              <img src={logoUrl} alt="Clever Connection" className="h-6 w-6 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-400">CRM</p>
              <p className="truncate text-base font-bold">{appTitle}</p>
            </div>
          </div>
          <button className="rounded-lg border border-white/10 p-2 text-slate-200" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-2.5 text-[11px] text-slate-300">
          <p className="font-semibold text-white">{user?.name || 'Usuário'}</p>
          <p className="text-[11px] text-slate-400">{user?.email || 'Conta MSAL'}</p>
        </div>

        <nav className="space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = currentPath === link.to;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onClose}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-white/10 text-white shadow-soft border border-primary/30'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </div>
  );
};

export default MobileSidebar;
