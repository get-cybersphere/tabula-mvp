// Toaster — top-right stacked notifications.
//
// Hook + component split: useToaster() owns the queue + auto-dismiss timers,
// and exposes a stable toast() API. <Toaster/> renders the queue.
//
// Each toast has:
//   - tone: 'success' | 'info' | 'warn' | 'error' | 'progress'
//   - title (string)
//   - body (string, optional)
//   - meta (string, optional — small mono right-side, e.g. doc type)
//   - onClick (optional click-through)
//   - duration (ms; 0 = sticky until dismissed)
//
// Progress toasts (e.g. "Processing 12 documents…") are sticky and
// updatable: toast.update(id, partial) replaces the toast in place.

import React, { useEffect, useRef, useState, useCallback } from 'react';

let _toastIdSeq = 1;

export function useToaster() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
    const tm = timersRef.current.get(id);
    if (tm) { clearTimeout(tm); timersRef.current.delete(id); }
  }, []);

  const toast = useCallback((opts) => {
    const id = opts.id || _toastIdSeq++;
    setToasts(prev => {
      const existingIdx = prev.findIndex(x => x.id === id);
      const next = { id, tone: 'info', duration: 4500, ...opts };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], ...next };
        return copy;
      }
      return [...prev, next];
    });
    const dur = opts.duration ?? 4500;
    if (dur > 0) {
      const prevTimer = timersRef.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timersRef.current.set(id, setTimeout(() => dismiss(id), dur));
    } else {
      const prevTimer = timersRef.current.get(id);
      if (prevTimer) { clearTimeout(prevTimer); timersRef.current.delete(id); }
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id, patch) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch.duration && patch.duration > 0) {
      const prevTimer = timersRef.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timersRef.current.set(id, setTimeout(() => dismiss(id), patch.duration));
    }
  }, [dismiss]);

  useEffect(() => () => {
    for (const tm of timersRef.current.values()) clearTimeout(tm);
    timersRef.current.clear();
  }, []);

  return { toasts, toast, update, dismiss };
}

export function Toaster({ toasts, onDismiss }) {
  return (
    <div className="toaster">
      {toasts.map(t => (
        <button
          key={t.id}
          className={`toast toast-${t.tone || 'info'}`}
          onClick={() => { t.onClick?.(); onDismiss(t.id); }}
          tabIndex={0}
        >
          <span className={`toast-dot toast-dot-${t.tone || 'info'}`} aria-hidden="true">
            {t.tone === 'progress' ? <span className="spinner" /> : null}
          </span>
          <span className="toast-text">
            <span className="toast-title">{t.title}</span>
            {t.body && <span className="toast-body">{t.body}</span>}
          </span>
          {t.meta && <span className="toast-meta">{t.meta}</span>}
          <span
            className="toast-x"
            role="button"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }}
          >×</span>
        </button>
      ))}
    </div>
  );
}
