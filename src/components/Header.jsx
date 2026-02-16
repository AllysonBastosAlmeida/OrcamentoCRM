import { useMemo } from 'react';
import { Bell, Menu } from 'lucide-react';
import LogoutButton from './LogoutButton.jsx';

const Header = ({ user, onLogout }) => {
  const initials = useMemo(() => {
    if (!user?.name) return 'CR';
    return user.name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }, [user]);

  return (
    <header className="sticky top-0 z-20 flex w-full items-center justify-between border-b border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-900/80 to-slate-950/90 px-4 py-4 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <button className="rounded-lg border border-white/10 p-2 text-white hover:border-primary/50 hover:bg-white/5 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Painel</p>
          <p className="text-lg font-bold text-white">CRM Orçamentos</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden rounded-lg border border-white/10 p-2 text-white transition hover:border-primary/50 hover:bg-white/5 md:inline-flex">
          <Bell className="h-4 w-4" />
        </button>
        <div className="hidden flex-col items-end text-right text-sm text-slate-300 md:flex">
          <span className="font-semibold text-white">{user?.name || 'Usuário'}</span>
          <span className="text-xs text-slate-400">{user?.email || 'Conta MSAL'}</span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-white shadow-soft">
          {initials}
        </div>
        <LogoutButton onLogout={onLogout} />
      </div>
    </header>
  );
};

export default Header;
