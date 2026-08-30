import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FilePlus2, Menu, PanelTop, Sparkles, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { acquireToken } from '../auth.js';
import LogoutButton from './LogoutButton.jsx';
import { navLinks } from './navLinks.js';

const PAGE_TITLES = {
  '/': ['Visão geral'],
  '/orcamentos': ['Orçamentos'],
  '/clientes': ['Clientes'],
  '/contatos-internos': ['Equipe e contatos'],
  '/produtos': ['Produtos e serviços'],
  '/relatorios': ['Relatórios'],
};

const ProfessionalShell = ({ children, currentPath, user, mobileOpen, onMobileOpen, onMobileClose, onLogout, onCreateQuote, onUsePreviousInterface }) => {
  const [title] = PAGE_TITLES[currentPath] || PAGE_TITLES['/'];
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const initials = useMemo(() => {
    const parts = (user?.name || 'CC').trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]).join('').toUpperCase();
  }, [user?.name]);
  const baseUrl = import.meta.env.BASE_URL || '/';
  const logoUrl = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}logo.png`;

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const loadPhoto = async () => {
      try {
        const token = await acquireToken();
        const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setProfilePhotoUrl(objectUrl);
      } catch (error) {
        console.info('[profile] Foto Microsoft indisponível; usando iniciais.', error);
      }
    };
    loadPhoto();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.email]);

  const renderAvatar = (className = 'professional-avatar') => (
    <div className={className} aria-hidden="true">{profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : initials}</div>
  );

  const navigation = (
    <nav className="professional-nav" aria-label="Navegação principal">
      {navLinks.map((link) => {
        const Icon = link.icon;
        return <NavLink key={link.to} to={link.to} end={link.to === '/'} onClick={onMobileClose} className={({ isActive }) => `professional-nav-link ${isActive ? 'professional-nav-link-active' : ''}`}><Icon className="h-[18px] w-[18px]" /><span>{link.label}</span></NavLink>;
      })}
    </nav>
  );

  const accountMenu = (mobile = false) => (
    <details className={`professional-account-menu ${mobile ? 'is-mobile' : ''}`}>
      <summary className="professional-user-card">
        {renderAvatar()}
        <div className="min-w-0 flex-1"><strong>{user?.name || 'Usuário'}</strong><span>Conta Microsoft</span></div>
        <ChevronDown className="professional-account-chevron h-4 w-4" />
      </summary>
      <div className="professional-account-popover">
        <button type="button" onClick={onUsePreviousInterface}><PanelTop className="h-4 w-4" /><span>Visual anterior</span></button>
        <LogoutButton onLogout={onLogout} className="professional-account-action professional-account-logout" />
      </div>
    </details>
  );

  return (
    <div className="professional-shell">
      <aside className="professional-sidebar">
        <div className="professional-brand"><div className="professional-logo"><img src={logoUrl} alt="Clever Connection" /></div><div><p>Clever Connection</p><span>CRM Comercial</span></div></div>
        <div className="professional-nav-label">Workspace</div>
        {navigation}
        <div className="professional-sidebar-footer">{accountMenu()}</div>
      </aside>

      {mobileOpen ? <div className="professional-mobile-overlay lg:hidden">
        <button type="button" className="professional-mobile-backdrop" onClick={onMobileClose} aria-label="Fechar menu" />
        <aside className="professional-mobile-drawer">
          <div className="professional-brand"><div className="professional-logo"><img src={logoUrl} alt="" /></div><div><p>Clever Connection</p><span>CRM Comercial</span></div><button type="button" className="professional-icon-btn ml-auto" onClick={onMobileClose}><X className="h-5 w-5" /></button></div>
          {navigation}
          <div className="professional-sidebar-footer">{accountMenu(true)}</div>
        </aside>
      </div> : null}

      <div className="professional-main">
        <header className="professional-topbar">
          <button type="button" className="professional-icon-btn lg:hidden" onClick={onMobileOpen} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
          <div className="professional-workspace-status">{renderAvatar('professional-topbar-avatar')}<div><strong>Bem-vindo, {user?.name || 'Usuário'}</strong></div></div>
          <div className="professional-context-pill"><Sparkles className="h-3.5 w-3.5" /><span>Você está em</span><strong>{title}</strong></div>
          <button type="button" className="professional-primary-action" onClick={onCreateQuote}><FilePlus2 className="h-4 w-4" /><span>Novo orçamento</span></button>
        </header>
        <main className="professional-content">{children}</main>
      </div>
    </div>
  );
};

export default ProfessionalShell;
