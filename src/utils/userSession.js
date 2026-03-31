const USER_KEY = 'crm-orcamentos:user';

export const setCurrentUser = (user) => {
  try {
    if (!user) {
      localStorage.removeItem(USER_KEY);
      return;
    }
    const payload = {
      name: user.name || '',
      email: user.email || '',
    };
    localStorage.setItem(USER_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[userSession] Falha ao salvar usuario', error);
  }
};

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: parsed.name || '',
      email: parsed.email || '',
    };
  } catch (error) {
    console.warn('[userSession] Falha ao ler usuario', error);
    return null;
  }
};
