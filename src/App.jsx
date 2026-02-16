import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import ScrollToTopButton from './components/ScrollToTopButton.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orcamentos from './pages/Orcamentos.jsx';
import Clientes from './pages/Clientes.jsx';
import Produtos from './pages/Produtos.jsx';
import Relatorios from './pages/Relatorios.jsx';
import { getActiveAccount, loginRequest } from './auth.js';

const LoadingState = ({ message = 'Autenticando...' }) => (
  <div className="flex min-h-screen items-center justify-center bg-background text-white">
    <div className="glass-panel flex items-center gap-3 rounded-xl px-6 py-4">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <p className="text-sm font-semibold">{message}</p>
    </div>
  </div>
);

const ProtectedRoute = ({ isAuthenticated, onLogin, children }) => {
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center">
          <p className="text-sm text-slate-200">Sessão expirada ou não autenticada.</p>
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
  const [account, setAccount] = useState(getActiveAccount());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAuthenticated = useMemo(() => !!account, [account]);

  useEffect(() => {
    const ensureLogin = async () => {
      setIsLoading(true);
      try {
        let active = getActiveAccount() || accounts[0];
        if (!active) {
          const loginResponse = await instance.loginPopup(loginRequest);
          active = loginResponse.account;
          instance.setActiveAccount(active);
        }
        setAccount(active);
        setUser({
          name: active?.name,
          email: active?.username,
        });
        setError(null);
      } catch (loginError) {
        console.error('Erro no login', loginError);
        setError(loginError.message || 'Falha na autenticação');
      } finally {
        setIsLoading(false);
      }
    };

    ensureLogin();
  }, [accounts, instance]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      const loginResponse = await instance.loginPopup(loginRequest);
      const active = loginResponse.account;
      instance.setActiveAccount(active);
      setAccount(active);
      setUser({
        name: active?.name,
        email: active?.username,
      });
      setError(null);
    } catch (loginError) {
      setError(loginError.message || 'Erro ao autenticar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await instance.logoutPopup({ account });
      setAccount(null);
    } catch (logoutError) {
      console.error('Erro no logout', logoutError);
    }
  };

  if (isLoading || inProgress === 'login') {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-white">
        <div className="glass-panel rounded-2xl px-8 py-6 text-center">
          <p className="text-lg font-semibold text-red-300">Erro ao autenticar</p>
          <p className="mt-2 text-sm text-slate-200">{error}</p>
          <button className="btn-primary mt-4" onClick={handleLogin}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const appTitle = import.meta.env.VITE_APP_TITLE || 'CRM Orçamentos';

  return (
    <div className="flex min-h-screen bg-background text-white">
      <Sidebar currentPath={location.pathname} appTitle={appTitle} />
      <div className="flex flex-1 flex-col">
        <Header user={user} onLogout={handleLogout} />
        <main className="scroll-container flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
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
              path="/relatorios"
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated} onLogin={handleLogin}>
                  <Relatorios />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ScrollToTopButton />
      </div>
    </div>
  );
}

export default App;
