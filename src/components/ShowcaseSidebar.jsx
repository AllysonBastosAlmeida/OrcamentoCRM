import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Gem, ShieldCheck, Sparkles } from 'lucide-react';
import LogoutButton from './LogoutButton.jsx';
import { navLinks } from './navLinks.js';

const linkDescriptions = {
  '/': 'Painel',
  '/orcamentos': 'Pipeline',
  '/clientes': 'Contas',
  '/contatos-internos': 'Rede',
  '/produtos': 'Catalogo',
  '/relatorios': 'Entrega',
};

const ShowcaseSidebar = ({ currentPath, appTitle, user, onLogout, onToggleGoldShowcase }) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;
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
    <aside className="showcase-sidebar hidden lg:flex">
      <div className="showcase-brand-block">
        <div className="showcase-brand-mark">
          <img src={logoUrl} alt="Clever Connection" className="h-6 w-6 object-contain" />
        </div>
        <div className="showcase-brand-copy">
          <p className="showcase-brand-eyebrow">Vector Grid</p>
          <p className="showcase-brand-title">{appTitle}</p>
          <p className="showcase-brand-subtitle">Shell experimental com leitura tecnica e ousada.</p>
        </div>
      </div>

      <div className="showcase-insight-card">
        <div className="showcase-insight-line">
          <Sparkles className="h-4 w-4" />
          <span>Modo paralelo</span>
        </div>
        <p className="showcase-insight-text">Paleta acida, contraste alto e hierarquia inspirada em sistema de comando.</p>
      </div>

      <nav className="showcase-nav">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = currentPath === link.to;

          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`showcase-nav-link ${isActive ? 'showcase-nav-link-active' : ''}`}
            >
              <span className="showcase-nav-icon">
                <Icon className="h-4 w-4" />
              </span>
              <span className="showcase-nav-copy">
                <span className="showcase-nav-label">{link.label}</span>
                <span className="showcase-nav-description">{linkDescriptions[link.to] || 'Area'}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="showcase-sidebar-footer">
        <div className="showcase-user-card">
          <div className="showcase-user-avatar">{initials}</div>
          <div className="showcase-user-copy">
            <p className="showcase-user-label">Operador</p>
            <p className="showcase-user-name">{user?.name || 'Usuario CRM'}</p>
            <p className="showcase-user-email">{user?.email || 'Conta MSAL'}</p>
          </div>
        </div>

        <div className="showcase-footer-note">
          <div className="showcase-insight-line">
            <ShieldCheck className="h-4 w-4" />
            <span>Fluxo preservado</span>
          </div>
          <p>Mesmo login, mesma base e mesmas paginas internas.</p>
        </div>

        <button type="button" className="showcase-pill-btn justify-center" onClick={onToggleGoldShowcase}>
          <Gem className="h-4 w-4" />
          Voltar ao layout base
        </button>
        <LogoutButton onLogout={onLogout} className="showcase-outline-btn justify-center" />
      </div>
    </aside>
  );
};

export default ShowcaseSidebar;
