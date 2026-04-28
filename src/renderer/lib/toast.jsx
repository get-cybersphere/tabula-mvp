import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind, message, opts = {}) => {
    const id = nextId++;
    const ttl = opts.ttl ?? 4000;
    setToasts((t) => [...t, { id, kind, message }]);
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const api = {
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts ?? { ttl: 6000 }),
    info: (msg, opts) => push('info', msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function Toaster({ toasts, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxWidth: 360, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const color =
    toast.kind === 'success' ? 'var(--sage)' :
    toast.kind === 'error' ? 'var(--accent)' :
    'var(--blue)';

  return (
    <div
      ref={ref}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      style={{
        background: 'white',
        border: '1px solid rgba(10,10,10,0.08)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(10,10,10,0.10)',
        padding: '12px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        fontSize: '0.88rem', color: 'var(--ink)',
        pointerEvents: 'auto',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(20px)',
        transition: 'opacity 180ms ease, transform 180ms ease',
      }}
    >
      <div style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 2, color: 'var(--warm-gray)', lineHeight: 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
