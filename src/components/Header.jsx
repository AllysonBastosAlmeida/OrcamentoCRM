import { useMemo } from 'react';
import { FileDown, Gem, Menu, Plus, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LogoutButton from './LogoutButton.jsx';

const Header = ({
  user,
  onLogout,
  onMenuClick,
  cyberModeEnabled,
  goldShowcaseEnabled,
  onToggleCyberMode,
  onToggleGoldShowcase,
}) => {
  const navigate = useNavigate();
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
    <header className="sticky top-0 z-20 flex w-full flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-900/80 to-slate-950/90 px-3 py-2 backdrop-blur sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          className="rounded-lg border border-white/10 p-2 text-white hover:border-primary/50 hover:bg-white/5 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 sm:text-[11px]">Painel</p>
          <p className="truncate text-[15px] font-bold leading-none text-white">{'CRM Or\u00e7amentos'}</p>
        </div>
      </div>

      <div className="header-toolbar">
        <div className="header-toolbar-group">
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-gold-test ${goldShowcaseEnabled ? 'toolbar-btn-gold-test-active' : ''}`}
            onClick={onToggleGoldShowcase}
            title={goldShowcaseEnabled ? 'Desativar tema experimental' : 'Ativar tema experimental'}
          >
            <Gem className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Teste tema</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => navigate('/orcamentos?new=1')}
            title={'Novo or\u00e7amento (N)'}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">{'Novo or\u00e7amento'}</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => navigate('/clientes?new=1')}
            title="Novo cliente"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Novo cliente</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => navigate('/relatorios')}
            title="Exportar"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Exportar</span>
          </button>
        </div>
        <button
          type="button"
          className={`toolbar-icon-btn ${cyberModeEnabled ? 'toolbar-icon-btn-active' : ''}`}
          onClick={onToggleCyberMode}
          title={cyberModeEnabled ? 'Desativar modo ciber' : 'Ativar modo ciber'}
          aria-label={cyberModeEnabled ? 'Desativar modo ciber' : 'Ativar modo ciber'}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <div className="hidden min-w-0 flex-col items-end text-right text-sm text-slate-300 2xl:flex">
          <span className="truncate font-semibold text-white">{user?.name || 'Usu\u00e1rio'}</span>
          <span className="truncate text-[11px] text-slate-400">{user?.email || 'Conta MSAL'}</span>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white shadow-soft">
          {initials}
        </div>
        <LogoutButton onLogout={onLogout} className="toolbar-btn" labelClassName="hidden 2xl:inline" />
      </div>
    </header>
  );
};

export default Header;
