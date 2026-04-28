import React, { useEffect, useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

/**
 * PlaidConnectCard — surfaced in the Means Test view.
 *
 * Phase 1 scaffold:
 *   - "Connect bank" button that opens Plaid Link
 *   - Token exchange handled via IPC (renderer never sees access_token)
 *   - List of connected items with last sync time + sync button
 *   - Disconnect with confirmation
 *
 * Phase 2 (separate PR): "Detect income" / "Classify expenses" buttons
 * that pull from plaid:detectIncome / plaid:classifyExpenses and
 * surface drafts for the attorney to accept into the means test.
 *
 * If Plaid is not configured (no PLAID_CLIENT_ID / PLAID_SECRET in
 * .env) the card renders a quiet hint instead of the connect button.
 */
export default function PlaidConnectCard({ caseId }) {
  const [configured, setConfigured] = useState(null);  // null = checking
  const [items, setItems] = useState([]);
  const [linkToken, setLinkToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const list = await window.tabula.plaid.listForCase(caseId);
    setItems(list);
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await window.tabula.plaid.isConfigured();
      if (cancelled) return;
      setConfigured(cfg.configured);
      if (cfg.configured) await refresh();
    })();
    return () => { cancelled = true; };
  }, [caseId, refresh]);

  const requestLinkToken = async () => {
    setError(null);
    const res = await window.tabula.plaid.createLinkToken(caseId);
    if (res.error) {
      setError(res.error);
      return null;
    }
    setLinkToken(res.link_token);
    return res.link_token;
  };

  const onSuccess = useCallback(async (publicToken, metadata) => {
    setBusy(true);
    setError(null);
    try {
      const res = await window.tabula.plaid.exchangeToken(caseId, publicToken, metadata);
      if (res.error) { setError(res.error); return; }
      // Pull initial transaction history right away
      await window.tabula.plaid.syncTransactions(res.itemId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [caseId, refresh]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => { if (err) setError(err.error_message || err.error_code); },
  });

  // Once we have a link token AND Plaid Link is ready, open the widget
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleConnect = async () => {
    const token = await requestLinkToken();
    if (!token) return;
    // open() will fire from the effect above once Link initializes
  };

  const handleSync = async (itemId) => {
    setBusy(true);
    try {
      await window.tabula.plaid.syncTransactions(itemId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (itemId, name) => {
    if (!window.confirm(`Disconnect ${name}? This revokes Tabula's access to the bank. Stored transactions remain in the case for audit.`)) return;
    setBusy(true);
    try {
      await window.tabula.plaid.disconnectItem(itemId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) return null;
  if (!configured) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Bank connection</span>
          <span className="text-xs text-muted">not configured</span>
        </div>
        <div className="card-body">
          <p className="text-sm" style={{ color: 'var(--warm-gray)' }}>
            Plaid is not configured. Set <code>PLAID_CLIENT_ID</code> and{' '}
            <code>PLAID_SECRET</code> in <code>.env</code> to enable direct
            bank-feed import for the means test.
          </p>
        </div>
      </div>
    );
  }

  const active = items.filter(i => i.status === 'active');
  const revoked = items.filter(i => i.status !== 'active');

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">Bank connection</span>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleConnect}
          disabled={busy}
        >
          {busy ? 'Connecting…' : '+ Connect bank'}
        </button>
      </div>
      <div className="card-body">
        {error && (
          <div role="alert" style={{
            background: 'var(--red-light, #fbeae6)', color: 'var(--accent)',
            padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}

        {active.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--warm-gray)', margin: 0 }}>
            No bank accounts connected yet. Connecting pulls 6 months of
            transactions for direct CMI calculation per 11&nbsp;U.S.C. §&nbsp;101(10A).
          </p>
        )}

        {active.map(it => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '12px 0', borderBottom: '1px solid rgba(10,10,10,0.05)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 550, fontSize: '0.9rem' }}>{it.institution_name}</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                {it.accounts.length} account{it.accounts.length === 1 ? '' : 's'}
                {' · '}
                {it.transactionCount.toLocaleString()} transaction{it.transactionCount === 1 ? '' : 's'}
                {' · '}
                {it.last_synced_at
                  ? `synced ${formatRelative(it.last_synced_at)}`
                  : 'never synced'}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {it.accounts.map(a => `${a.name || a.type} ••${a.mask || '?'}`).join('  ·  ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => handleSync(it.id)} disabled={busy}>
                Sync
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => handleDisconnect(it.id, it.institution_name)} disabled={busy}>
                Disconnect
              </button>
            </div>
          </div>
        ))}

        {revoked.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--warm-gray)' }}>
              {revoked.length} previously disconnected — show
            </summary>
            {revoked.map(it => (
              <div key={it.id} style={{ fontSize: '0.82rem', color: 'var(--warm-gray)', padding: '6px 0' }}>
                {it.institution_name} · disconnected (transactions retained for audit)
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

function formatRelative(iso) {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  } catch { return iso; }
}
