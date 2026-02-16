import { PublicClientApplication } from '@azure/msal-browser';

const scopes =
  import.meta.env.VITE_MSAL_SCOPES?.split(/\s+/).filter(Boolean) ?? [
    'User.Read',
    'Files.Read',
    'Files.Read.All',
    'Sites.Read.All',
  ];

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || '',
    authority: import.meta.env.VITE_MSAL_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: import.meta.env.DEV
      ? import.meta.env.VITE_MSAL_REDIRECT_URI
      : import.meta.env.VITE_MSAL_REDIRECT_URI_PROD,
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
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
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
