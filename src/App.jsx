import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Loader2, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import ShowcaseHeader from './components/ShowcaseHeader.jsx';
import ShowcaseMobileSidebar from './components/ShowcaseMobileSidebar.jsx';
import ShowcaseThemeLayer from './components/ShowcaseThemeLayer.jsx';
import ProfessionalShell from './components/ProfessionalShell.jsx';
import ScrollToTopButton from './components/ScrollToTopButton.jsx';
import { ToastProvider } from './components/ToastHost.jsx';
import OverflowTooltip from './components/OverflowTooltip.jsx';
import { getActiveAccount, hasMsalConfig, loginRequest } from './auth.js';
import { setCurrentUser } from './utils/userSession.js';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Orcamentos = lazy(() => import('./pages/Orcamentos.jsx'));
const Clientes = lazy(() => import('./pages/Clientes.jsx'));
const ContatosInternos = lazy(() => import('./pages/ContatosInternos.jsx'));
const Produtos = lazy(() => import('./pages/Produtos.jsx'));
const Relatorios = lazy(() => import('./pages/Relatorios.jsx'));

const AuthScreen = ({
  eyebrow = 'Segurança Microsoft 365',
  title,
  description,
  actionLabel,
  onAction,
  icon,
  busy = false,
  secondary,
}) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const logoUrl = `${normalizedBaseUrl}logo.png`;
  const appTitle = import.meta.env.VITE_APP_TITLE || 'CRM Orçamentos';

  return (
    <div className="auth-screen auth-screen-professional relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 text-white">
      <div className="auth-screen-bg" />
      <div className="auth-screen-orb auth-screen-orb-a" />
      <div className="auth-screen-orb auth-screen-orb-b" />
      <div className="auth-screen-grid" />
      <div className="auth-panel relative w-full max-w-3xl overflow-hidden rounded-[32px]">
        <div className="auth-panel-header px-6 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="auth-logo-wrap flex h-14 w-14 items-center justify-center rounded-2xl">
              <img src={logoUrl} alt="Clever Connection" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200/75">{eyebrow}</p>
              <p className="text-xl font-bold text-white">{appTitle}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-7 sm:px-8 sm:py-8 lg:grid-cols-[1.15fr,0.85fr] lg:items-center">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{description}</p>

            {secondary ? (
              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">{secondary}</p>
            ) : null}

            {actionLabel && onAction ? (
              <div className="mt-6">
                <button className="auth-action-btn min-w-[12rem] justify-center" onClick={onAction} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {actionLabel}
                </button>
              </div>
            ) : null}
          </div>

          <div className="auth-side-card rounded-[28px] p-6">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-300/15 bg-sky-400/8 text-sky-200 shadow-[0_0_30px_rgba(59,130,246,0.12)]">
              {icon}
            </div>
            <div className="space-y-2 text-sm text-slate-300">
              <p className="font-semibold text-white">Acesso corporativo protegido</p>
              <p>O CRM continua vinculado à sua conta Microsoft 365 para dados, planilhas e envio de rascunhos no Outlook.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LoadingState = ({ message = 'Autenticando...' }) => (
  <AuthScreen
    eyebrow="Preparando ambiente"
    title="Conectando sua sessão"
    description={message}
    icon={<Loader2 className="h-8 w-8 animate-spin" />}
    secondary="Integração com Microsoft 365 e SharePoint"
  />
);

const SignedOutState = ({ onLogin, busy = false }) => (
  <AuthScreen
    eyebrow="Sessão encerrada"
    title="Você saiu do CRM com segurança"
    description="Sua conta foi desconectada. Quando quiser voltar, abra uma nova sessão para continuar trabalhando com orçamentos, clientes e relatórios."
    actionLabel="Entrar novamente"
    onAction={onLogin}
    busy={busy}
    icon={<LogOut className="h-8 w-8" />}
    secondary="Nenhuma ação pendente foi mantida ativa no navegador"
  />
);

const ErrorState = ({ message, onRetry, busy = false }) => (
  <AuthScreen
    eyebrow="Falha de autenticação"
    title="Não foi possível concluir o acesso"
    description={message}
    actionLabel="Tentar novamente"
    onAction={onRetry}
    busy={busy}
    icon={<ShieldCheck className="h-8 w-8" />}
    secondary="Se o erro persistir, revise a sessão Microsoft e tente novamente"
  />
);

const ProtectedRoute = ({ isAuthenticated, onLogin, children }) => {
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center">
          <p className="text-sm text-slate-200">{'Sessão expirada ou não autenticada.'}</p>
          <button className="btn-primary" onClick={onLogin}>
            Entrar novamente
          </button>
        </div>
      </div>
    );
  }
  return children;
};

function App() {
  const { instance, accounts, inProgress } = useMsal();
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState(getActiveAccount());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [interfaceMode, setInterfaceMode] = useState(() => localStorage.getItem('crm-interface-mode') || 'professional');
  const [showcaseEntryActive, setShowcaseEntryActive] = useState(false);
  const showcaseWasActiveRef = useRef(false);
  const showcaseStageRef = useRef(null);
  const showcaseLastPathRef = useRef(null);
  const showcaseScrollOnRouteChangeRef = useRef(false);

  const isAuthenticated = useMemo(() => !!account, [account]);
  const showcaseActive = isAuthenticated && !signedOut && !isLoggingOut && !error && interfaceMode === 'previous';
  const professionalActive = isAuthenticated && !signedOut && !isLoggingOut && !error && interfaceMode === 'professional';

  const applyAuthenticatedUser = (active) => {
    if (!active) {
      throw new Error('Falha ao obter a conta autenticada.');
    }

    try {
      instance.setActiveAccount(active);
    } catch (setActiveError) {
      console.warn('[auth] Nao foi possivel definir a conta ativa', setActiveError);
    }

    setAccount(active);
    setUser({
      name: active?.name,
      email: active?.username,
    });
    setCurrentUser({ name: active?.name, email: active?.username });
  };

  useEffect(() => {
    const ensureLogin = async () => {
      if (isLoggingOut || signedOut || inProgress === 'logout') {
        setIsLoading(false);
        return;
      }
      if (inProgress !== 'none') {
        return;
      }

      setIsLoading(true);
      try {
        if (!hasMsalConfig) {
          throw new Error('Configuracao do Microsoft Login ausente no ambiente publicado.');
        }

        let active = getActiveAccount() || accounts.find(Boolean);
        if (!active) {
          const loginResponse = await instance.loginPopup(loginRequest);
          active = loginResponse?.account || getActiveAccount() || instance.getActiveAccount?.() || accounts.find(Boolean) || null;
        }
        applyAuthenticatedUser(active);
        setSignedOut(false);
        setError(null);
      } catch (loginError) {
        if (loginError?.message?.includes('interaction_in_progress')) {
          return;
        }
        console.error('Erro no login', loginError);
        setError(loginError.message || 'Falha na autentica\u00e7\u00e3o');
      } finally {
        setIsLoading(false);
      }
    };

    ensureLogin();
  }, [accounts, inProgress, instance, isLoggingOut, signedOut]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('showcase-theme-enabled', showcaseActive);
    document.body.classList.toggle('showcase-theme-entering', showcaseActive && showcaseEntryActive);
    document.body.classList.toggle('professional-theme', professionalActive);
    localStorage.removeItem('crm-cyber-mode');
    localStorage.removeItem('crm-legacy-theme');
    localStorage.removeItem('crm-gold-showcase');
    return () => {
      document.body.classList.remove('showcase-theme-enabled');
      document.body.classList.remove('showcase-theme-entering');
      document.body.classList.remove('professional-theme');
    };
  }, [professionalActive, showcaseActive, showcaseEntryActive]);

  useEffect(() => {
    localStorage.setItem('crm-interface-mode', interfaceMode);
    setMobileOpen(false);
  }, [interfaceMode]);

  useEffect(() => {
    const wasActive = showcaseWasActiveRef.current;
    showcaseWasActiveRef.current = showcaseActive;

    if (!showcaseActive) {
      setShowcaseEntryActive(false);
      return undefined;
    }

    if (!wasActive) {
      setShowcaseEntryActive(true);
      const timeoutId = window.setTimeout(() => setShowcaseEntryActive(false), 1250);
      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [showcaseActive]);

  useEffect(() => {
    if (!showcaseActive) {
      showcaseLastPathRef.current = null;
      showcaseScrollOnRouteChangeRef.current = false;
      return;
    }

    const previousPath = showcaseLastPathRef.current;
    showcaseLastPathRef.current = location.pathname;

    if (!previousPath || previousPath === location.pathname || !showcaseScrollOnRouteChangeRef.current) {
      return;
    }

    showcaseScrollOnRouteChangeRef.current = false;
    window.requestAnimationFrame(() => {
      showcaseStageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [location.pathname, showcaseActive]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      const isTyping =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable);
      if (isTyping) return;

      if (event.key === '/') {
        event.preventDefault();
        const searchInput = document.querySelector('[data-global-search]');
        if (searchInput) {
          searchInput.focus();
          if (typeof searchInput.select === 'function') searchInput.select();
        }
        return;
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        navigate('/orcamentos?new=1');
        return;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [navigate, showcaseActive]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setSignedOut(false);
      setError(null);
      if (!hasMsalConfig) {
        throw new Error('Configuracao do Microsoft Login ausente no ambiente publicado.');
      }
      const loginResponse = await instance.loginPopup(loginRequest);
      const active = loginResponse?.account || getActiveAccount() || instance.getActiveAccount?.() || accounts.find(Boolean) || null;
      applyAuthenticatedUser(active);
      setError(null);
    } catch (loginError) {
      setError(loginError.message || 'Erro ao autenticar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setIsLoading(false);
    setError(null);
    setMobileOpen(false);
    try {
      await instance.logoutPopup({ account });
    } catch (logoutError) {
      console.error('Erro no logout', logoutError);
    } finally {
      setAccount(null);
      setUser(null);
      setCurrentUser(null);
      setSignedOut(true);
      setIsLoggingOut(false);
    }
  };

  const requestShowcaseStageScroll = () => {
    showcaseScrollOnRouteChangeRef.current = true;
  };

  if (isLoggingOut || inProgress === 'logout') {
    return <LoadingState message="Encerrando sua sessão com segurança..." />;
  }

  if (isLoading || inProgress === 'login') {
    return <LoadingState message="Autenticando com Microsoft 365..." />;
  }

  if (signedOut && !isAuthenticated) {
    return <SignedOutState onLogin={handleLogin} busy={inProgress !== 'none'} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleLogin} busy={inProgress !== 'none'} />;
  }

  const appTitle = import.meta.env.VITE_APP_TITLE || 'CRM Or\u00e7amentos';
  const appRoutes = (
    <Suspense fallback={<LoadingState message="Carregando pagina..." />}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orcamentos"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <Orcamentos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/produtos"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <Produtos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <Clientes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contatos-internos"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <ContatosInternos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/relatorios"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
              <Relatorios />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );

  return (
    <ToastProvider>
      <OverflowTooltip />
      <div
        className={`app-shell ${showcaseActive ? 'showcase-theme-enabled' : ''} ${
          showcaseEntryActive ? 'showcase-theme-entering' : ''
        } ${professionalActive ? 'professional-theme' : ''
        }`}
      >
        {showcaseActive ? <ShowcaseThemeLayer /> : null}
        {showcaseEntryActive ? <div className="showcase-theme-flash" aria-hidden="true" /> : null}
        {showcaseActive ? <div className="app-content showcase-shell text-white">
          <div className="showcase-main-column">
            <ShowcaseHeader
              appTitle={appTitle}
              currentPath={location.pathname}
              onMenuClick={() => setMobileOpen(true)}
              onCreateQuote={() => navigate('/orcamentos?new=1')}
              onCreateClient={() => navigate('/clientes?new=1')}
              onOpenReports={() => navigate('/relatorios')}
              onSelectSubsection={requestShowcaseStageScroll}
              onUseNewInterface={() => setInterfaceMode('professional')}
            />
            <main ref={showcaseStageRef} className="showcase-stage-scroll">
              <div className="showcase-stage-shell">
                <div className="showcase-stage-content">{appRoutes}</div>
              </div>
            </main>
            <ScrollToTopButton />
          </div>
          <ShowcaseMobileSidebar
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            currentPath={location.pathname}
            appTitle={appTitle}
            user={user}
            onLogout={handleLogout}
            onSelectSubsection={requestShowcaseStageScroll}
          />
        </div> : (
          <ProfessionalShell
            currentPath={location.pathname}
            user={user}
            mobileOpen={mobileOpen}
            onMobileOpen={() => setMobileOpen(true)}
            onMobileClose={() => setMobileOpen(false)}
            onLogout={handleLogout}
            onCreateQuote={() => navigate('/orcamentos?new=1')}
            onUsePreviousInterface={() => setInterfaceMode('previous')}
          >
            {appRoutes}
          </ProfessionalShell>
        )}
      </div>
    </ToastProvider>
  );
}

export default App;
