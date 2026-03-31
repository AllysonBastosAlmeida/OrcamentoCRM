import { PublicClientApplication } from '@azure/msal-browser';

const scopes =
  import.meta.env.VITE_MSAL_SCOPES?.split(/\s+/).filter(Boolean) ?? [
    'User.Read',
    'Files.Read',
    'Files.Read.All',
    'Sites.Read.All',
    'Mail.ReadWrite',
    'Mail.Send',
  ];

const DEFAULT_ROUTER_BASENAME = '/OrcamentoCRM';
const routerBase = import.meta.env.VITE_ROUTER_BASENAME || DEFAULT_ROUTER_BASENAME;
const normalizedBase = routerBase.endsWith('/') ? routerBase : `${routerBase}/`;
const fallbackRedirectUri = `${window.location.origin}${normalizedBase}`;
const prodRedirectUri = import.meta.env.VITE_MSAL_REDIRECT_URI_PROD || fallbackRedirectUri;
const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || '';

export const hasMsalConfig = Boolean(clientId);

const msalConfig = {
  auth: {
    clientId,
    authority: import.meta.env.VITE_MSAL_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: import.meta.env.DEV ? fallbackRedirectUri : prodRedirectUri,
  },
  cache: {
    cacheLocation: import.meta.env.VITE_MSAL_CACHE_LOCATION || 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes,
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const getActiveAccount = () => {
  const currentActive = msalInstance.getActiveAccount?.() || null;
  if (currentActive) {
    return currentActive;
  }

  const accounts = msalInstance.getAllAccounts().filter(Boolean);
  if (accounts.length > 0 && accounts[0]) {
    try {
      msalInstance.setActiveAccount(accounts[0]);
    } catch (error) {
      console.warn('[auth] Falha ao definir conta ativa do MSAL', error);
    }
    return accounts[0];
  }
  return null;
};

export const acquireToken = async () => {
  const account = getActiveAccount();
  if (!account) {
    throw new Error('Nenhuma conta ativa encontrada para adquirir token');
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  } catch (error) {
    const result = await msalInstance.acquireTokenPopup(loginRequest);
    return result.accessToken;
  }
};
