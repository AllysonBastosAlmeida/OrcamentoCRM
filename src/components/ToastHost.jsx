import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ToastContext = createContext({ pushToast: () => {} });

const iconFor = (type) => {
  if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (type === 'error') return <AlertCircle className="h-4 w-4 text-rose-300" />;
  return <Info className="h-4 w-4 text-amber-200" />;
};

const toneClassFor = (type) => {
  if (type === 'success') return 'border-emerald-400/20 bg-emerald-500/10';
  if (type === 'error') return 'border-rose-400/20 bg-rose-500/10';
  return 'border-amber-300/20 bg-amber-500/10';
};

const normalizeToastPayload = (input, fallbackType = 'info') => {
  if (typeof input === 'object' && input !== null) {
    return {
      title: input.title || '',
      message: input.message || '',
      type: input.type || fallbackType || 'info',
      duration: Number(input.duration) > 0 ? Number(input.duration) : 4000,
    };
  }

  return {
    title: '',
    message: input || '',
    type: fallbackType || 'info',
    duration: 4000,
  };
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (input, type = 'info') => {
      const toast = normalizeToastPayload(input, type);
      if (!toast.title && !toast.message) return;
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, ...toast }]);
      setTimeout(() => removeToast(id), toast.duration);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[92vw] max-w-sm flex-col gap-2 sm:w-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-2xl border bg-slate-950/95 px-3 py-2.5 text-xs text-white shadow-2xl backdrop-blur ${toneClassFor(toast.type)}`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{iconFor(toast.type)}</div>
              <div className="min-w-0 flex-1">
                {toast.title ? <p className="font-semibold text-white">{toast.title}</p> : null}
                {toast.message ? <p className="text-[11px] text-slate-200">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                className="text-[11px] text-slate-300 hover:text-white"
                onClick={() => removeToast(toast.id)}
              >
                Fechar
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
