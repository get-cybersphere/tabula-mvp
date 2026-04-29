import React, { useEffect, useState, useCallback } from 'react';
import { sixMonthWindow } from '../../lib/means-test.js';

// Toast feedback comes from feat/ux-p0-fixes (PR 1). Until that
// branch lands on main, we keep a no-op shim so this PR builds in
// isolation. After PR 1 merges, swap this for `import { useToast }
// from '../../lib/toast.jsx'`.
function useToast() {
  return {
    success: (msg) => console.log('[toast.success]', msg),
    error:   (msg) => { console.error('[toast.error]', msg); window.alert(msg); },
    info:    (msg) => console.info('[toast.info]', msg),
  };
}

/**
 * PlaidReviewCard — phase 2 of the Plaid integration.
 *
 * After bank(s) are connected via PlaidConnectCard, this card surfaces:
 *   - Detected income receipts (drafts), each with a checkbox
 *   - Classified expenses (drafts) mapped to B122A-2 lines, with
 *     editable amounts (e.g. cap to IRS Local Standard) + checkboxes
 *
 * "Accept selected" persists into income_receipts / manual_deductions
 * with plaid_transaction citations. The audit packet PDF + B122A export
 * read those citations and render them alongside document and IRS
 * citations — no math change required.
 *
 * Intentionally a quiet, dense card: shows when at least one Plaid
 * item is active for the case; otherwise hidden.
 */
export default function PlaidReviewCard({ caseId, filingDate, onAccepted }) {
  const toast = useToast();
  const [hasItems, setHasItems] = useState(false);
  const [income, setIncome] = useState({ loaded: false, drafts: [], selected: new Set() });
  const [expenses, setExpenses] = useState({ loaded: false, drafts: [], unmapped: [], selected: new Set(), edited: {} });
  const [busy, setBusy] = useState(false);

  // Compute the means test 6-month window from the filing date (defaults
  // to today). The detector and classifier use this window.
  const cmiWindow = sixMonthWindow(filingDate || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items = await activePlaidItemsForCase(caseId);
      if (cancelled) return;
      setHasItems(items.length > 0);
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  const loadIncome = useCallback(async () => {
    if (!cmiWindow) return;
    setBusy(true);
    try {
      const drafts = await window.tabula.plaid.detectIncome(caseId, cmiWindow.start, cmiWindow.end);
      // Default: pre-select high-confidence drafts
      const selected = new Set(drafts.filter(d => d.confidence === 'high').map(d => d.plaid_transaction_id));
      setIncome({ loaded: true, drafts, selected });
    } catch (err) {
      toast.error(`Detect income failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }, [caseId, cmiWindow, toast]);

  const loadExpenses = useCallback(async () => {
    if (!cmiWindow) return;
    setBusy(true);
    try {
      const result = await window.tabula.plaid.classifyExpenses(caseId, cmiWindow.start, cmiWindow.end);
      // Default: pre-select drafts that don't overlap with IRS standards
      const selected = new Set(
        result.drafts.filter(d => !d.overlap_with_irs_standard).map(d => d.b122a_line)
      );
      setExpenses({
        loaded: true,
        drafts: result.drafts,
        unmapped: result.unmapped || [],
        selected,
        edited: {},
      });
    } catch (err) {
      toast.error(`Classify expenses failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }, [caseId, cmiWindow, toast]);

  const acceptIncome = async () => {
    const toAccept = income.drafts.filter(d => income.selected.has(d.plaid_transaction_id));
    if (toAccept.length === 0) {
      toast.info('No income drafts selected');
      return;
    }
    setBusy(true);
    try {
      const res = await window.tabula.plaid.acceptIncomeDrafts(caseId, toAccept);
      toast.success(`${res.accepted} income receipt${res.accepted === 1 ? '' : 's'} added`);
      setIncome({ loaded: false, drafts: [], selected: new Set() });
      onAccepted?.();
    } catch (err) {
      toast.error(`Accept failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const acceptExpenses = async () => {
    const toAccept = expenses.drafts
      .filter(d => expenses.selected.has(d.b122a_line))
      .map(d => ({
        ...d,
        monthly_amount: expenses.edited[d.b122a_line] != null
          ? Number(expenses.edited[d.b122a_line])
          : d.monthly_amount,
      }));
    if (toAccept.length === 0) {
      toast.info('No expense drafts selected');
      return;
    }
    setBusy(true);
    try {
      const res = await window.tabula.plaid.acceptExpenseDrafts(caseId, toAccept);
      toast.success(`${res.accepted} deduction${res.accepted === 1 ? '' : 's'} added`);
      setExpenses({ loaded: false, drafts: [], unmapped: [], selected: new Set(), edited: {} });
      onAccepted?.();
    } catch (err) {
      toast.error(`Accept failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  if (!hasItems) return null;
  if (!cmiWindow) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">Plaid review</span>
        <span className="text-xs text-muted">
          window: {cmiWindow.start} → {cmiWindow.end}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Income drafts */}
        <section>
          <SectionHeader
            title="Detected income"
            sub="Recurring deposits matching paystub patterns. Accepted items become income receipts that feed CMI."
            action={
              !income.loaded ? (
                <button className="btn btn-sm btn-secondary" onClick={loadIncome} disabled={busy}>
                  Detect income
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={acceptIncome} disabled={busy || income.selected.size === 0}>
                  Accept {income.selected.size} income receipt{income.selected.size === 1 ? '' : 's'}
                </button>
              )
            }
          />
          {income.loaded && (
            income.drafts.length === 0 ? (
              <EmptyHint>No recurring deposits detected in the 6-month window. Either no wage income hit these accounts, or transactions haven't synced yet.</EmptyHint>
            ) : (
              <IncomeTable
                drafts={income.drafts}
                selected={income.selected}
                onToggle={(id) => setIncome(s => {
                  const next = new Set(s.selected);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return { ...s, selected: next };
                })}
                onSelectAll={() => setIncome(s => ({
                  ...s,
                  selected: new Set(s.drafts.map(d => d.plaid_transaction_id)),
                }))}
                onSelectNone={() => setIncome(s => ({ ...s, selected: new Set() }))}
              />
            )
          )}
        </section>

        {/* Expense drafts */}
        <section>
          <SectionHeader
            title="Classified expenses"
            sub="Transaction categories mapped to B122A-2 deduction lines. Edit amounts to cap to allowed standards before accepting."
            action={
              !expenses.loaded ? (
                <button className="btn btn-sm btn-secondary" onClick={loadExpenses} disabled={busy}>
                  Classify expenses
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={acceptExpenses} disabled={busy || expenses.selected.size === 0}>
                  Accept {expenses.selected.size} deduction{expenses.selected.size === 1 ? '' : 's'}
                </button>
              )
            }
          />
          {expenses.loaded && (
            expenses.drafts.length === 0 ? (
              <EmptyHint>No mapped expense categories detected. {expenses.unmapped.length > 0 && `${expenses.unmapped.length} unmapped categories present (see below).`}</EmptyHint>
            ) : (
              <>
                <ExpenseTable
                  drafts={expenses.drafts}
                  selected={expenses.selected}
                  edited={expenses.edited}
                  onToggle={(line) => setExpenses(s => {
                    const next = new Set(s.selected);
                    if (next.has(line)) next.delete(line); else next.add(line);
                    return { ...s, selected: next };
                  })}
                  onEdit={(line, value) => setExpenses(s => ({
                    ...s,
                    edited: { ...s.edited, [line]: value },
                  }))}
                />
                {expenses.unmapped.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--warm-gray)' }}>
                      {expenses.unmapped.length} unmapped categories — show
                    </summary>
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--warm-gray)' }}>
                      {expenses.unmapped.map(u => (
                        <div key={u.pfc_primary} style={{ padding: '2px 0' }}>
                          {u.pfc_primary}: {u.transaction_count} txns, ${u.total_amount.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 550, fontSize: '0.88rem' }}>{title}</div>
        <div className="text-xs text-muted" style={{ marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <p className="text-sm" style={{ color: 'var(--warm-gray)', margin: 0, padding: '8px 0' }}>
      {children}
    </p>
  );
}

function IncomeTable({ drafts, selected, onToggle, onSelectAll, onSelectNone }) {
  // Group by source_label so the user sees one row per "source × cadence",
  // expand to see individual deposits.
  const byGroup = new Map();
  for (const d of drafts) {
    const key = `${d.source_label}|${d.cadence || 'unknown'}`;
    if (!byGroup.has(key)) byGroup.set(key, { source: d.source_label, cadence: d.cadence, confidence: d.confidence, items: [] });
    byGroup.get(key).items.push(d);
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: '0.78rem' }}>
        <button className="btn btn-sm btn-ghost" onClick={onSelectAll} style={{ padding: '2px 8px' }}>Select all</button>
        <button className="btn btn-sm btn-ghost" onClick={onSelectNone} style={{ padding: '2px 8px' }}>Select none</button>
      </div>
      {[...byGroup.values()].map(group => (
        <details key={group.source + group.cadence} open style={{
          padding: '8px 10px',
          borderLeft: '3px solid var(--blue)',
          background: 'rgba(59, 108, 181, 0.04)',
          marginBottom: 6,
          borderRadius: 4,
        }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
            {group.source}
            <span className="text-xs text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
              {group.items.length} deposit{group.items.length === 1 ? '' : 's'} · {group.cadence} · {group.confidence}
            </span>
          </summary>
          <table style={{ width: '100%', marginTop: 6, fontSize: '0.82rem' }}>
            <tbody>
              {group.items.map(d => (
                <tr key={d.plaid_transaction_id}>
                  <td style={{ padding: '3px 0', width: 24 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.plaid_transaction_id)}
                      onChange={() => onToggle(d.plaid_transaction_id)}
                      aria-label={`Accept deposit on ${d.pay_date}`}
                    />
                  </td>
                  <td style={{ padding: '3px 0', fontFamily: 'var(--mono)' }}>{d.pay_date}</td>
                  <td style={{ padding: '3px 0', fontFamily: 'var(--mono)', textAlign: 'right' }}>
                    ${d.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

function ExpenseTable({ drafts, selected, edited, onToggle, onEdit }) {
  const sorted = [...drafts].sort((a, b) =>
    String(a.b122a_line).localeCompare(String(b.b122a_line), 'en', { numeric: true })
  );
  return (
    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(10,10,10,0.08)' }}>
          <th style={{ width: 24 }}></th>
          <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500, color: 'var(--warm-gray)', fontSize: '0.78rem' }}>B122A-2 line</th>
          <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 500, color: 'var(--warm-gray)', fontSize: '0.78rem' }}>Category</th>
          <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--warm-gray)', fontSize: '0.78rem' }}>Source txns</th>
          <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 500, color: 'var(--warm-gray)', fontSize: '0.78rem' }}>Monthly avg</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(d => (
          <tr key={d.b122a_line} style={{
            borderBottom: '1px solid rgba(10,10,10,0.04)',
            background: d.overlap_with_irs_standard ? 'rgba(184, 134, 11, 0.05)' : undefined,
          }}>
            <td style={{ padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={selected.has(d.b122a_line)}
                onChange={() => onToggle(d.b122a_line)}
                aria-label={`Accept ${d.b122a_line}`}
              />
            </td>
            <td style={{ padding: '6px 0' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{d.b122a_line}</div>
            </td>
            <td style={{ padding: '6px 0' }}>
              {d.label}
              {d.overlap_with_irs_standard && (
                <div className="text-xs" style={{ color: 'var(--amber)', marginTop: 2 }}>
                  ⚠ overlaps IRS Local Standard — review before accepting
                </div>
              )}
            </td>
            <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>
              {d.source_count}
            </td>
            <td style={{ padding: '6px 0', textAlign: 'right' }}>
              <input
                type="number"
                step="0.01"
                value={edited[d.b122a_line] ?? d.monthly_amount}
                onChange={(e) => onEdit(d.b122a_line, e.target.value)}
                style={{
                  width: 92, textAlign: 'right',
                  padding: '4px 6px',
                  border: '1px solid rgba(10,10,10,0.12)',
                  borderRadius: 4,
                  fontFamily: 'var(--mono)', fontSize: '0.82rem',
                }}
                aria-label={`Monthly amount for ${d.b122a_line}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Pre-flight: are there any active Plaid items for this case?
async function activePlaidItemsForCase(caseId) {
  if (!window.tabula?.plaid?.listForCase) return [];
  try {
    const all = await window.tabula.plaid.listForCase(caseId);
    return all.filter(i => i.status === 'active');
  } catch {
    return [];
  }
}
