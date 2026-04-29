import React, { useState } from 'react';

/**
 * UnhandledLinesBanner — mandatory pre-result acknowledgment.
 *
 * The means test today does not auto-derive every B122A-2 deduction line.
 * Anything not modeled (childcare, court-ordered support, additional
 * health care, etc.) must be explicitly acknowledged by the attorney
 * BEFORE the result panel is shown. This protects against silent
 * omissions that would inflate disposable income.
 *
 * Props:
 *   unhandled       — Array<{ line, label, reason, value, handled }>
 *   acknowledgments — Set<string> (lines acknowledged "Not Applicable")
 *   onAcknowledge   — (line: string) => void
 *   onUnacknowledge — (line: string) => void
 *   onEnterValue    — (line: string) => void  (opens manual-entry form)
 *
 * The result panel renders behind <ResultGate> below; until every line is
 * either handled (value entered) or acknowledged, the gate is closed.
 */
export default function UnhandledLinesBanner({ unhandled = [], acknowledgments = new Set(), onAcknowledge, onUnacknowledge, onEnterValue }) {
  const open = unhandled.filter(u => !u.handled && !acknowledgments.has(u.line));
  const acknowledged = unhandled.filter(u => acknowledgments.has(u.line));
  const handled = unhandled.filter(u => u.handled);

  if (unhandled.length === 0) return null;

  return (
    <div
      role="alert"
      aria-labelledby="unhandled-banner-title"
      style={{
        background: 'rgba(196, 85, 58, 0.06)',
        border: '1px solid var(--accent)',
        borderLeft: '4px solid var(--accent)',
        borderRadius: 8,
        padding: '16px 18px',
        marginBottom: 20,
      }}
    >
      <div id="unhandled-banner-title" style={{
        fontWeight: 600, color: 'var(--accent)', marginBottom: 4,
        fontSize: '0.95rem',
      }}>
        {open.length > 0
          ? `${open.length} B122A-2 line${open.length === 1 ? '' : 's'} not modeled — review required`
          : 'All B122A-2 lines reviewed'}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--warm-gray)', margin: '0 0 12px' }}>
        These deduction lines are not auto-extracted yet. Enter a value or mark <em>Not applicable</em>.
        The result is hidden until each is resolved.
      </p>

      {open.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {open.map(u => (
            <UnhandledRow
              key={u.line}
              item={u}
              onAck={() => onAcknowledge && onAcknowledge(u.line)}
              onEnter={() => onEnterValue && onEnterValue(u.line)}
            />
          ))}
        </div>
      )}

      {(acknowledged.length > 0 || handled.length > 0) && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--warm-gray)' }}>
            {acknowledged.length} marked Not Applicable, {handled.length} entered manually — show
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {handled.map(u => (
              <ResolvedRow key={u.line} item={u} status={`entered: $${(u.value || 0).toLocaleString()}/mo`} />
            ))}
            {acknowledged.map(u => (
              <ResolvedRow
                key={u.line}
                item={u}
                status="not applicable"
                onUndo={() => onUnacknowledge && onUnacknowledge(u.line)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function UnhandledRow({ item, onAck, onEnter }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 12px',
      background: 'white',
      border: '1px solid rgba(10,10,10,0.06)',
      borderRadius: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--warm-gray)', marginRight: 8 }}>
            {item.line}
          </span>
          {item.label}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--warm-gray)', marginTop: 2 }}>
          {item.reason}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onEnter}>
          Enter value
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onAck}>
          Not applicable
        </button>
      </div>
    </div>
  );
}

function ResolvedRow({ item, status, onUndo }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px',
      fontSize: '0.8rem', color: 'var(--warm-gray)',
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>{item.line}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      <span style={{ color: 'var(--sage)' }}>{status}</span>
      {onUndo && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onUndo} style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
          undo
        </button>
      )}
    </div>
  );
}

/**
 * ResultGate — hides the result behind a translucent overlay until every
 * unhandled line is resolved (acknowledged OR entered). Caller passes
 * `unresolvedCount`; when 0 the gate vanishes.
 */
export function ResultGate({ unresolvedCount, children }) {
  if (unresolvedCount === 0) return children;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ filter: 'blur(2px)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(246,244,240,0.6)',
        borderRadius: 10,
      }}>
        <div style={{
          background: 'white',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          padding: '14px 20px',
          fontSize: '0.9rem',
          color: 'var(--ink)',
          maxWidth: 360, textAlign: 'center',
        }}>
          <strong>Result hidden</strong>
          <div style={{ marginTop: 4, color: 'var(--warm-gray)', fontSize: '0.82rem' }}>
            Resolve {unresolvedCount} unhandled line{unresolvedCount === 1 ? '' : 's'} above to view the means test result.
          </div>
        </div>
      </div>
    </div>
  );
}
