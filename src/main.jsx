import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import App from './App.jsx';
import './index.css';
import { msalInstance } from './auth';

const basename = (import.meta.env.VITE_ROUTER_BASENAME || '/OrcamentoCRM').replace(/\/$/, '');
const title = import.meta.env.VITE_APP_TITLE || 'CRM Orçamentos';

if (title) {
  document.title = title;
}

msalInstance
  .initialize()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <MsalProvider instance={msalInstance}>
          <BrowserRouter basename={basename}>
            <App />
          </BrowserRouter>
        </MsalProvider>
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    console.error('Erro ao inicializar MSAL', error);
  });
