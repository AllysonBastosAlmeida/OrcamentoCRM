import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, FileDown, Gem, Menu, Plus } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { findShowcaseGroupByPath, showcaseNavGroups } from './navLinks.js';

const pageMeta = {
  '/': {
    eyebrow: 'Clever Connection',
    title: 'CONTROLE A OPERACAO,\nNAO O CAOS.',
    description: 'CRM comercial para orcamentos, clientes e relatorios com presenca forte, leitura rapida e foco em decisao.',
  },
  '/orcamentos': {
    eyebrow: 'Clever Connection',
    title: 'ORCAMENTOS VISIVEIS,\nDECISOES MAIS RAPIDAS.',
    description: 'Sistema para criar, acompanhar e fechar orcamentos com mais clareza, velocidade e controle comercial.',
  },
  '/clientes': {
    eyebrow: 'Clever Connection',
    title: 'CLIENTES MAPEADOS,\nRELACOES MAIS CLARAS.',
    description: 'Carteira apresentada com mais impacto visual e leitura mais direta de relacionamento e recorrencia.',
  },
  '/contatos-internos': {
    eyebrow: 'Clever Connection',
    title: 'REDE INTERNA VIVA,\nOPERACAO VISIVEL.',
    description: 'Responsaveis internos tratados como parte ativa da articulacao comercial.',
  },
  '/produtos': {
    eyebrow: 'Clever Connection',
    title: 'PORTFOLIO FORTE,\nCONSULTA DIRETA.',
    description: 'Catalogo com mais presenca visual e navegacao objetiva para compor propostas.',
  },
  '/relatorios': {
    eyebrow: 'Clever Connection',
    title: 'RELATORIOS PRONTOS,\nENTREGA MAIS FORTE.',
    description: 'Exportacoes e relatorios com leitura mais premium para consolidacao e entrega.',
  },
};

const ShowcaseHeader = ({
  appTitle,
  currentPath,
  user,
  onMenuClick,
  onCreateQuote,
  onOpenReports,
  onSelectSubsection,
  onToggleGoldShowcase,
}) => {
  const navigate = useNavigate();
  const meta = pageMeta[currentPath] || pageMeta['/'];
  const activeGroup = findShowcaseGroupByPath(currentPath);
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const navBarRef = useRef(null);
  const navCenterRef = useRef(null);
  const [navPinned, setNavPinned] = useState(false);
  const [navScrollProgress, setNavScrollProgress] = useState(0);
  const [navShellHeight, setNavShellHeight] = useState(0);
  const [openGroupId, setOpenGroupId] = useState(null);
  const [hoveredGroupId, setHoveredGroupId] = useState(null);
  const [hoveredSubPath, setHoveredSubPath] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const previewGroup = showcaseNavGroups.find((group) => group.id === openGroupId) || activeGroup;
  const operationHeroImage = showcaseNavGroups.find((group) => group.id === 'operacao')?.heroImage || 'showcase-clever-command-hero.png';
  const heroImage = isMobileViewport ? operationHeroImage : previewGroup?.heroImage || operationHeroImage;
  const heroImageUrl = `${normalizedBaseUrl}${heroImage}`;
  const heroTitle = meta.title.split('\n');
  const activeSubsection = activeGroup.items.find((item) => item.to === currentPath) || activeGroup.items[0];

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();

    mediaQuery.addEventListener?.('change', updateViewport);
    return () => mediaQuery.removeEventListener?.('change', updateViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let frameId = null;

    const updateNavScrollState = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      setNavPinned(scrollY > 10);
      setNavScrollProgress(Math.min(scrollY / 220, 1));
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateNavScrollState();
      });
    };

    updateNavScrollState();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!navBarRef.current) {
      return undefined;
    }

    const updateNavShellHeight = () => {
      setNavShellHeight(navBarRef.current?.offsetHeight || 0);
    };

    updateNavShellHeight();
    window.addEventListener('resize', updateNavShellHeight);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateNavShellHeight);
      resizeObserver.observe(navBarRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateNavShellHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    setHoveredGroupId(null);
    setHoveredSubPath(null);
  }, [currentPath]);

  useEffect(() => {
    if (!openGroupId) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!navCenterRef.current?.contains(event.target)) {
        setOpenGroupId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [openGroupId]);

  const navBackgroundAlpha = Math.min(0.94, navScrollProgress * 0.98);
  const navBorderAlpha = Math.min(0.22, navScrollProgress * 0.24);
  const navShadowAlpha = Math.min(0.4, navScrollProgress * 0.42);
  const openGroup = showcaseNavGroups.find((group) => group.id === openGroupId) || null;
  const handleGroupClick = (group) => {
    const firstGroupPath = group.items[0]?.to || '/';
    const isCurrentPathInsideGroup = group.items.some((item) => item.to === currentPath);
    setHoveredGroupId(null);
    setHoveredSubPath(null);

    if (!isCurrentPathInsideGroup) {
      navigate(firstGroupPath);
      setOpenGroupId(group.id);
      return;
    }

    setOpenGroupId((prev) => (prev === group.id ? null : group.id));
  };

  return (
    <header className="showcase-topbar showcase-topbar-hero" style={{ '--showcase-hero-image': `url(${heroImageUrl})` }}>
      <div className="showcase-hero-bg-wrap" aria-hidden="true">
        <img src={heroImageUrl} alt="" className="showcase-hero-bg-image" />
      </div>
      <div className="showcase-hero-gradient" aria-hidden="true" />

      <div
        className={`showcase-nav-shell ${navPinned ? 'showcase-nav-shell-pinned' : ''}`}
        style={{
          minHeight: navShellHeight ? `${navShellHeight}px` : undefined,
          '--showcase-nav-bg-alpha': navBackgroundAlpha.toFixed(3),
          '--showcase-nav-border-alpha': navBorderAlpha.toFixed(3),
          '--showcase-nav-shadow-alpha': navShadowAlpha.toFixed(3),
        }}
      >
        <div ref={navBarRef} className={`showcase-nav-bar showcase-nav-bar-landing ${navPinned ? 'showcase-nav-bar-pinned' : ''}`}>
          <div className="showcase-nav-leading">
            <button type="button" className="showcase-square-btn lg:hidden" onClick={onMenuClick} aria-label="Abrir menu">
              <Menu className="h-4 w-4" />
            </button>
          </div>

          <div className="showcase-nav-mobile-summary lg:hidden">
            <p className="showcase-nav-mobile-group">{activeGroup.label}</p>
            <p className="showcase-nav-mobile-path">{activeSubsection?.label || appTitle}</p>
          </div>

          <div ref={navCenterRef} className="showcase-nav-center">
            <div className="showcase-nav-primary">
              {showcaseNavGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`showcase-nav-group-tab ${
                    activeGroup.id === group.id && !hoveredGroupId ? 'showcase-nav-group-tab-active' : ''
                  } ${openGroupId === group.id ? 'showcase-nav-group-tab-open' : ''} ${
                    hoveredGroupId === group.id ? 'showcase-nav-group-tab-hovered' : ''
                  }`}
                  onClick={() => handleGroupClick(group)}
                  onMouseEnter={() => setHoveredGroupId(group.id)}
                  onMouseLeave={() => setHoveredGroupId((prev) => (prev === group.id ? null : prev))}
                  aria-expanded={openGroupId === group.id}
                  aria-haspopup="true"
                >
                  {group.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openGroupId === group.id ? 'rotate-180' : ''}`} />
                </button>
              ))}
            </div>

            {openGroup ? (
              <nav className="showcase-nav-desktop showcase-nav-desktop-landing showcase-nav-desktop-secondary showcase-nav-dropdown">
                {openGroup.items.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => {
                      onSelectSubsection?.();
                      setOpenGroupId(null);
                      setHoveredSubPath(null);
                    }}
                    onMouseEnter={() => setHoveredSubPath(link.to)}
                    onMouseLeave={() => setHoveredSubPath((prev) => (prev === link.to ? null : prev))}
                    className={() =>
                      `showcase-nav-tab showcase-nav-tab-landing ${
                        currentPath === link.to && !hoveredSubPath ? 'showcase-nav-tab-active' : ''
                      } ${hoveredSubPath === link.to ? 'showcase-nav-tab-hovered' : ''}`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="showcase-nav-actions">
            <div className="showcase-user-chip">Modo teste</div>
            <button type="button" className="showcase-pill-btn" onClick={onToggleGoldShowcase}>
              <Gem className="h-4 w-4" />
              Encerrar teste
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="showcase-landing-content">
        <div className="showcase-hero-copy showcase-hero-copy-landing">
          <p className="showcase-eyebrow">{meta.eyebrow}</p>
          <h1 className="showcase-hero-title">
            {heroTitle.map((line) => (
              <span key={line} className="showcase-hero-title-line">
                {line}
              </span>
            ))}
          </h1>
          <p className="showcase-hero-text">{meta.description}</p>

          <div className="showcase-command-row showcase-command-row-landing">
            <button type="button" className="showcase-solid-btn" onClick={onCreateQuote}>
              <Plus className="h-4 w-4" />
              Novo orcamento
            </button>
            <button type="button" className="showcase-outline-btn" onClick={onOpenReports}>
              <FileDown className="h-4 w-4" />
              Ver relatorios
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default ShowcaseHeader;
