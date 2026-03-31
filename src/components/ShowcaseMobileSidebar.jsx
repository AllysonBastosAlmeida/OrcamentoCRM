import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Gem, X } from 'lucide-react';
import LogoutButton from './LogoutButton.jsx';
import { findShowcaseGroupByPath, showcaseNavGroups } from './navLinks.js';

const ShowcaseMobileSidebar = ({
  open,
  onClose,
  currentPath,
  appTitle,
  user,
  onLogout,
  onSelectSubsection,
  onToggleGoldShowcase,
}) => {
  const initials = useMemo(() => {
    if (!user?.name) return 'CR';
    return user.name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }, [user]);
  const activeGroup = findShowcaseGroupByPath(currentPath);
  const [openGroupId, setOpenGroupId] = useState(activeGroup.id);

  useEffect(() => {
    if (!open) {
      return;
    }

    setOpenGroupId(activeGroup.id);
  }, [activeGroup.id, open]);

  if (!open) return null;

  return (
    <div className="showcase-mobile-overlay lg:hidden">
      <button type="button" className="showcase-mobile-backdrop" onClick={onClose} aria-label="Fechar menu" />
      <aside className="showcase-mobile-drawer">
        <div className="showcase-mobile-head">
          <div>
            <p className="showcase-brand-eyebrow">Clever Connection Lab</p>
            <p className="showcase-brand-title">{appTitle}</p>
          </div>
          <button type="button" className="showcase-square-btn" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="showcase-user-card">
          <div className="showcase-user-avatar">{initials}</div>
          <div className="showcase-user-copy">
            <p className="showcase-user-label">Operador</p>
            <p className="showcase-user-name">{user?.name || 'Usuario CRM'}</p>
            <p className="showcase-user-email">{user?.email || 'Conta MSAL'}</p>
          </div>
        </div>

        <div className="showcase-mobile-nav-groups">
          {showcaseNavGroups.map((group) => (
            <div key={group.id} className="showcase-mobile-nav-section">
              <button
                type="button"
                className={`showcase-mobile-group-toggle ${activeGroup.id === group.id ? 'showcase-mobile-group-toggle-active' : ''} ${
                  openGroupId === group.id ? 'showcase-mobile-group-toggle-open' : ''
                }`}
                onClick={() => setOpenGroupId((prev) => (prev === group.id ? null : group.id))}
                aria-expanded={openGroupId === group.id}
              >
                <span className="showcase-mobile-nav-title">{group.label}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openGroupId === group.id ? 'rotate-180' : ''}`} />
              </button>

              {openGroupId === group.id ? (
                <nav className="showcase-mobile-nav">
                  {group.items.map((link) => {
                    const Icon = link.icon;
                    const isActive = currentPath === link.to;

                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => {
                          onSelectSubsection?.();
                          onClose();
                        }}
                        className={`showcase-mobile-nav-link ${isActive ? 'showcase-mobile-nav-link-active' : ''}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{link.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              ) : null}
            </div>
          ))}
        </div>

        <div className="showcase-mobile-actions">
          <button
            type="button"
            className="showcase-pill-btn justify-center"
            onClick={() => {
              onToggleGoldShowcase();
              onClose();
            }}
          >
            <Gem className="h-4 w-4" />
            Encerrar teste
          </button>
          <LogoutButton onLogout={onLogout} className="showcase-outline-btn justify-center" />
        </div>
      </aside>
    </div>
  );
};

export default ShowcaseMobileSidebar;
