import React, { useEffect, useState, useMemo, useCallback } from 'react';

const CATEGORY_META = {
  insider: { label: 'Insider risk', tone: 'red', blurb: 'Payments to individuals — preference + insider clawback exposure (§ 547, § 101(31))' },
  preference: { label: 'Preference period', tone: 'red', blurb: 'Single transfers ≥ $600 to a creditor inside the 90-day window (§ 547(b))' },
  discretionary: { label: 'Discretionary spend', tone: 'amber', blurb: 'Spending categories trustees scrutinize for hardship inconsistency' },
  undisclosed_income: { label: 'Undisclosed income', tone: 'amber', blurb: 'Recurring deposits not matched to declared income on Schedule I' },
};

const STATUS_META = {
  open: { label: 'Open', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  dismissed: { label: 'Dismissed', tone: 'gray' },
  snoozed: { label: 'Snoozed', tone: 'blue' },
};

function fmt$(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function ago(date) {
  if (!date) return '';
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return date;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function FindingCard({ finding, onSetStatus, expanded, onToggle }) {
  const cat = CATEGORY_META[finding.category] || { label: finding.category, tone: 'gray', blurb: '' };
  const status = STATUS_META[finding.status] || STATUS_META.open;
  const evidence = finding.evidence || [];

  const isAccepted = finding.status === 'accepted';
  const isDismissed = finding.status === 'dismissed';
  const isSnoozed = finding.status === 'snoozed';
  const isOpen = !isAccepted && !isDismissed && !isSnoozed;

  return (
    <div className={`finding-card finding-${finding.severity} finding-status-${finding.status}`}>
      <button className="finding-head" onClick={onToggle}>
        <span className={`finding-sev finding-sev-${finding.severity}`} aria-hidden="true">
          {finding.severity === 'high' ? '●' : finding.severity === 'medium' ? '◐' : '○'}
        </span>
        <div className="finding-body">
          <div className="finding-title">{finding.label}</div>
          <div className="finding-sub">
            <span className={`finding-cat finding-cat-${cat.tone}`}>{cat.label}</span>
            {finding.amount > 0 && <span>{fmt$(finding.amount)}</span>}
            {finding.monthly_estimate > 0 && <span>{fmt$(finding.monthly_estimate)}/mo</span>}
            {finding.transaction_count > 1 && <span>{finding.transaction_count} txns</span>}
            {finding.last_date && <span>through {ago(finding.last_date)}</span>}
          </div>
        </div>
        <span className={`finding-status finding-status-${status.tone}`}>{status.label}</span>
        <svg className={`finding-chev ${expanded ? 'is-open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="finding-detail">
          {finding.suggested_disposition && (
            <div className="finding-section">
              <div className="finding-section-head">Suggested disposition</div>
              <div className="finding-disposition">{finding.suggested_disposition}</div>
            </div>
          )}
          {evidence.length > 0 && (
            <div className="finding-section">
              <div className="finding-section-head">Evidence — {evidence.length} transaction{evidence.length === 1 ? '' : 's'}</div>
              <div className="finding-evidence">
                {evidence.slice(0, 12).map((t, i) => (
                  <div key={i} className="finding-txn">
                    <span className="finding-txn-date">{t.date}</span>
                    <span className="finding-txn-merchant">{t.merchant}</span>
                    <span className={`finding-txn-amt ${Number(t.amount) < 0 ? 'is-out' : 'is-in'}`}>
                      {fmt$(Math.abs(Number(t.amount) || 0))}
                    </span>
                  </div>
                ))}
                {evidence.length > 12 && (
                  <div className="finding-txn finding-txn-more">+ {evidence.length - 12} more</div>
                )}
              </div>
            </div>
          )}
          <div className="finding-actions">
            <button
              className={`btn-mini ${isAccepted ? 'btn-mini-active-green' : ''}`}
              onClick={() => onSetStatus(finding.id, isAccepted ? 'open' : 'accepted')}
            >
              {isAccepted ? '✓ Accepted' : 'Accept (will disclose)'}
            </button>
            <button
              className={`btn-mini ${isDismissed ? 'btn-mini-active' : ''}`}
              onClick={() => onSetStatus(finding.id, isDismissed ? 'open' : 'dismissed')}
            >
              {isDismissed ? '✕ Dismissed' : 'Dismiss'}
            </button>
            <button
              className={`btn-mini ${isSnoozed ? 'btn-mini-active-blue' : ''}`}
              onClick={() => onSetStatus(finding.id, isSnoozed ? 'open' : 'snoozed')}
            >
              {isSnoozed ? '◎ Snoozed' : 'Snooze'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InsightsTab({ caseData, caseId, onRefresh }) {
  const [findings, setFindings] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('open'); // 'all' | 'open' | 'high' | 'insider' | 'preference' | 'discretionary' | 'undisclosed_income'
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      const list = await window.tabula.bankIntel.list(caseId);
      setFindings(list || []);
    } catch (e) {
      setError(e.message);
    }
  }, [caseId]);

  useEffect(() => { refresh(); }, [caseId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      await window.tabula.bankIntel.analyze(caseId);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSetStatus = async (id, status) => {
    await window.tabula.bankIntel.setStatus(id, status);
    refresh();
  };

  const visible = useMemo(() => {
    if (filter === 'all') return findings;
    if (filter === 'open') return findings.filter(f => f.status === 'open');
    if (filter === 'high') return findings.filter(f => f.severity === 'high' && f.status === 'open');
    return findings.filter(f => f.category === filter);
  }, [findings, filter]);

  const counts = useMemo(() => {
    const out = {
      total: findings.length,
      open: findings.filter(f => f.status === 'open').length,
      high: findings.filter(f => f.severity === 'high' && f.status === 'open').length,
      insider: findings.filter(f => f.category === 'insider').length,
      preference: findings.filter(f => f.category === 'preference').length,
      discretionary: findings.filter(f => f.category === 'discretionary').length,
      undisclosed_income: findings.filter(f => f.category === 'undisclosed_income').length,
      accepted: findings.filter(f => f.status === 'accepted').length,
      dismissed: findings.filter(f => f.status === 'dismissed').length,
    };
    return out;
  }, [findings]);

  const docCount = (caseData?.documents || []).filter(d => d.doc_type === 'bank_statement').length;
  const noStatementsYet = docCount === 0;

  return (
    <div className="insights-tab">
      <section className="insights-hero">
        <div className="insights-hero-text">
          <div className="insights-hero-eyebrow">Bank Intelligence</div>
          <h2 className="insights-hero-title">
            {findings.length === 0 ? 'No findings yet' :
              `${counts.high} ${counts.high === 1 ? 'finding' : 'findings'} need attorney review`}
          </h2>
          <div className="insights-hero-meta">
            {findings.length > 0 ? (
              <>
                {counts.total} total · {counts.open} open · {counts.accepted} accepted · {counts.dismissed} dismissed
              </>
            ) : (
              <>Drop a bank statement on the case to populate findings, or click Re-analyze.</>
            )}
          </div>
        </div>
        <div className="insights-hero-actions">
          <button className="btn btn-primary btn-lg" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <><span className="spinner" /> Analyzing…</> : 'Re-analyze'}
          </button>
        </div>
      </section>

      {error && <div className="filing-error"><strong>Couldn't analyze.</strong> {error}</div>}

      {/* Stats grid */}
      {findings.length > 0 && (
        <section className="insights-grid">
          <StatCard label="Insider risk"        count={counts.insider}        tone="red" blurb={CATEGORY_META.insider.blurb} />
          <StatCard label="Preference period"   count={counts.preference}     tone="red" blurb={CATEGORY_META.preference.blurb} />
          <StatCard label="Discretionary spend" count={counts.discretionary}  tone="amber" blurb={CATEGORY_META.discretionary.blurb} />
          <StatCard label="Undisclosed income"  count={counts.undisclosed_income} tone="amber" blurb={CATEGORY_META.undisclosed_income.blurb} />
        </section>
      )}

      {/* Filter chips */}
      {findings.length > 0 && (
        <div className="insights-filters">
          <FilterChip label={`Open · ${counts.open}`}             active={filter === 'open'}            onClick={() => setFilter('open')} />
          <FilterChip label={`High severity · ${counts.high}`}    active={filter === 'high'}            onClick={() => setFilter('high')} />
          <FilterChip label={`Insider · ${counts.insider}`}       active={filter === 'insider'}         onClick={() => setFilter('insider')} />
          <FilterChip label={`Preference · ${counts.preference}`} active={filter === 'preference'}      onClick={() => setFilter('preference')} />
          <FilterChip label={`Discretionary · ${counts.discretionary}`}      active={filter === 'discretionary'}      onClick={() => setFilter('discretionary')} />
          <FilterChip label={`Undisclosed · ${counts.undisclosed_income}`}   active={filter === 'undisclosed_income'} onClick={() => setFilter('undisclosed_income')} />
          <FilterChip label={`All · ${counts.total}`}              active={filter === 'all'}             onClick={() => setFilter('all')} />
        </div>
      )}

      {/* Findings list */}
      {findings.length === 0 ? (
        <div className="insights-empty">
          <h3>{noStatementsYet ? 'No bank statements yet' : 'No findings'}</h3>
          <p>
            {noStatementsYet
              ? 'Drag bank statements onto the case window. Tabula will analyze 12 months of transactions for insider transfers, preference-period payments, discretionary spending patterns, and undisclosed deposits.'
              : 'The analyzer didn\'t flag anything. Either the case is clean, or the bank statements don\'t include a transaction list — try re-uploading the original PDFs.'}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="insights-empty">
          <h3>Nothing in this filter</h3>
          <p>Switch the filter chip to see other findings.</p>
        </div>
      ) : (
        <div className="findings-list">
          {visible.map(f => (
            <FindingCard
              key={f.id}
              finding={f}
              expanded={expanded === f.id}
              onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
              onSetStatus={handleSetStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, count, tone, blurb }) {
  return (
    <div className={`insights-stat insights-stat-${tone}`}>
      <div className="insights-stat-num">{count}</div>
      <div className="insights-stat-label">{label}</div>
      <div className="insights-stat-blurb">{blurb}</div>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button className={`filter-chip ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}
