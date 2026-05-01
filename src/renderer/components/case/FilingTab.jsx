import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_TONE = {
  draft: { label: 'Draft', tone: 'amber' },
  reviewed: { label: 'Reviewed', tone: 'blue' },
  filed: { label: 'Filed', tone: 'green' },
};

function pct(mapped, total) {
  if (!total) return 0;
  return Math.round((mapped / total) * 100);
}

function PacketCard({ packet, onReveal, onSetStatus, onDelete, onSelect, selected }) {
  const meta = STATUS_TONE[packet.status] || { label: packet.status, tone: 'gray' };
  const summary = packet.summary || {};
  return (
    <div
      className={`packet-card ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="packet-card-row">
        <div>
          <div className="packet-card-title">
            Packet · {new Date(packet.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            <span className="packet-card-time">
              {' '}{new Date(packet.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <div className="packet-card-sub">
            {summary.formsTotal || '—'} forms · {summary.mappedFields || 0}/{summary.totalFields || 0} fields filled
            {summary.totalGaps != null && <> · {summary.totalGaps} review flags</>}
          </div>
        </div>
        <span className={`packet-status-pill packet-status-${meta.tone}`}>{meta.label}</span>
      </div>
      <div className="packet-card-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn-mini" onClick={() => onReveal(packet.id)}>Reveal in Finder</button>
        <select
          className="status-select"
          value={packet.status}
          onChange={(e) => onSetStatus(packet.id, e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="filed">Filed</option>
        </select>
        <button className="btn-mini btn-mini-danger" onClick={() => onDelete(packet.id)}>Delete</button>
      </div>
    </div>
  );
}

function FormRow({ form, expanded, onToggle, onOpen, currentPacket }) {
  const p = pct(form.mapped, form.total);
  const isHeaderOnly = form.headerOnly || (!form.gaps?.[0]?.field?.startsWith('Debtor'));
  const tone =
    p >= 70 ? 'green' :
    p >= 30 ? 'amber' :
    p > 0 ? 'red' : 'gray';

  return (
    <div className={`form-row ${expanded ? 'is-expanded' : ''}`}>
      <button className="form-row-head" onClick={onToggle}>
        <div className="form-row-left">
          <span className="form-code">{form.code}</span>
          <span className="form-label">{form.label}</span>
        </div>
        <div className="form-row-meta">
          <span className="form-pages">{form.pages}p</span>
          <span className={`form-pct form-pct-${tone}`}>{p}%</span>
          <div className={`form-bar form-bar-${tone}`}>
            <div className="form-bar-fill" style={{ width: `${p}%` }} />
          </div>
          <span className="form-count">{form.mapped}/{form.total}</span>
          <svg
            className={`form-chev ${expanded ? 'is-open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="form-row-body">
          {form.gaps && form.gaps.length > 0 ? (
            <div className="form-gaps">
              <div className="form-gaps-head">
                {form.gaps.length} review point{form.gaps.length === 1 ? '' : 's'} for the attorney:
              </div>
              <ul className="form-gaps-list">
                {form.gaps.map((g, i) => (
                  <li key={i}>
                    <span className="gap-field">{g.field}</span>
                    <span className="gap-reason">{g.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="form-gaps-empty">All fields auto-mapped — review on review tab.</div>
          )}
          {currentPacket?.outputDir && (
            <div className="form-row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => onOpen(form)}>
                Open this form
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilingTab({ caseData, caseId, onRefresh }) {
  const [forms, setForms] = useState([]);
  const [packets, setPackets] = useState([]);
  const [activePacket, setActivePacket] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const chapter = caseData?.chapter || 7;
  const debtorName = caseData?.debtors?.[0]
    ? `${caseData.debtors[0].first_name || ''} ${caseData.debtors[0].last_name || ''}`.trim()
    : '—';
  const district = caseData?.district || '';

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      const [preview, prior] = await Promise.all([
        window.tabula.petition.preview(caseId),
        window.tabula.petition.listPackets(caseId),
      ]);
      setForms(preview?.forms || []);
      setPackets(prior || []);
      if (prior?.length && !activePacket) {
        const fullPacket = await window.tabula.petition.getPacket(prior[0].id);
        setActivePacket(fullPacket);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [caseId, activePacket]);

  useEffect(() => { refresh(); }, [caseId]); // refresh on case switch

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await window.tabula.petition.generate(caseId, {});
      const fresh = await window.tabula.petition.getPacket(result.id);
      setActivePacket(fresh);
      await refresh();
      onRefresh?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectPacket = useCallback(async (id) => {
    const full = await window.tabula.petition.getPacket(id);
    setActivePacket(full);
    setExpanded(null);
  }, []);

  const handleReveal = useCallback(async (id) => {
    await window.tabula.petition.revealPacket(id);
  }, []);

  const handleStatus = useCallback(async (id, status) => {
    await window.tabula.petition.setStatus(id, status);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this packet draft? The PDF folder will be removed.')) return;
    await window.tabula.petition.deletePacket(id);
    if (activePacket?.id === id) setActivePacket(null);
    refresh();
  }, [activePacket, refresh]);

  const handleOpenForm = useCallback(async (form) => {
    if (!activePacket) return;
    const match = (activePacket.manifest?.forms || []).find(f => f.code === form.code);
    if (match?.outputFile) {
      await window.tabula.petition.openForm(activePacket.id, match.outputFile);
    }
  }, [activePacket]);

  // When a packet is selected, prefer its per-form mapped/total over the
  // live preview so the user sees the same numbers that wrote the PDFs.
  const displayForms = useMemo(() => {
    if (!activePacket?.manifest?.forms) return forms;
    const byCode = new Map(activePacket.manifest.forms.map(f => [f.code, f]));
    return forms.map(f => {
      const m = byCode.get(f.code);
      if (!m) return f;
      return { ...f, mapped: m.mapped, total: m.total, gaps: m.gaps };
    });
  }, [forms, activePacket]);

  const totals = useMemo(() => {
    const totalFields = displayForms.reduce((s, f) => s + (f.total || 0), 0);
    const mappedFields = displayForms.reduce((s, f) => s + (f.mapped || 0), 0);
    const flaggedForms = displayForms.filter(f => (f.gaps || []).length > 0).length;
    return {
      totalFields,
      mappedFields,
      flaggedForms,
      pct: pct(mappedFields, totalFields),
    };
  }, [displayForms]);

  return (
    <div className="filing-tab">
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <section className="filing-hero">
        <div className="filing-hero-text">
          <div className="filing-hero-eyebrow">Filing Packet</div>
          <h2 className="filing-hero-title">
            Chapter {chapter} Voluntary Petition for {debtorName || 'this debtor'}
          </h2>
          <div className="filing-hero-meta">
            {district || <em>district not set</em>} · {displayForms.length} forms · {totals.totalFields.toLocaleString()} fields
          </div>
        </div>
        <div className="filing-hero-actions">
          <div className="filing-hero-pct">
            <div className="filing-hero-pct-num">{totals.pct}%</div>
            <div className="filing-hero-pct-label">auto-filled</div>
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <span className="spinner" /> Drafting packet…
              </>
            ) : packets.length > 0 ? 'Generate New Draft' : 'Generate Filing Packet'}
          </button>
        </div>
      </section>

      {error && (
        <div className="filing-error">
          <strong>Couldn't generate packet.</strong> {error}
        </div>
      )}

      {/* ─── Past drafts ──────────────────────────────────────── */}
      {packets.length > 0 && (
        <section className="filing-section">
          <div className="filing-section-head">
            <h3>Past drafts</h3>
            <span className="text-muted">{packets.length} draft{packets.length === 1 ? '' : 's'}</span>
          </div>
          <div className="packet-list">
            {packets.map(p => (
              <PacketCard
                key={p.id}
                packet={p}
                selected={activePacket?.id === p.id}
                onSelect={() => handleSelectPacket(p.id)}
                onReveal={handleReveal}
                onSetStatus={handleStatus}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Form catalog ─────────────────────────────────────── */}
      <section className="filing-section">
        <div className="filing-section-head">
          <h3>Forms in this packet</h3>
          <span className="text-muted">
            {totals.mappedFields.toLocaleString()} / {totals.totalFields.toLocaleString()} fields ·{' '}
            {totals.flaggedForms} need{totals.flaggedForms === 1 ? 's' : ''} review
          </span>
        </div>

        {displayForms.length === 0 ? (
          <div className="empty-state">
            <h3>Loading forms…</h3>
          </div>
        ) : (
          <div className="form-list">
            {displayForms.map(f => (
              <FormRow
                key={f.code}
                form={f}
                expanded={expanded === f.code}
                onToggle={() => setExpanded(expanded === f.code ? null : f.code)}
                onOpen={handleOpenForm}
                currentPacket={activePacket}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Empty-state guidance ─────────────────────────────── */}
      {packets.length === 0 && (
        <section className="filing-guidance">
          <p>
            <strong>How this works.</strong> Tabula has all 16 official US Courts forms
            pre-loaded. When you click <em>Generate Filing Packet</em>, it pulls everything
            from this case — debtor identity, income, expenses, schedules — and writes a
            folder of fillable PDFs ready for attorney review.
          </p>
          <p>
            Forms shown at low percentages are not broken — they're either mapped header-only
            (per-field mapping shipping in the next release) or have data gaps surfaced as
            review flags so you know exactly what to verify before filing.
          </p>
        </section>
      )}
    </div>
  );
}
