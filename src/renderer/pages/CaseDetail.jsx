import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_LABELS = {
  intake: 'Intake',
  in_progress: 'In Progress',
  ready: 'Ready to File',
  filed: 'Filed',
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'creditors', label: 'Creditors' },
  { key: 'means-test', label: 'Means Test' },
  { key: 'review', label: 'Review' },
];

export default function CaseDetail({ caseId, navigate }) {
  const [caseData, setCaseData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const loadCase = useCallback(async () => {
    setLoading(true);
    const data = await window.tabula.cases.get(caseId);
    setCaseData(data);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const handleStatusChange = async (newStatus) => {
    await window.tabula.cases.update(caseId, { status: newStatus });
    loadCase();
  };

  const handleUploadDocuments = async () => {
    await window.tabula.documents.upload(caseId);
    loadCase();
  };

  const handleExtract = async (docId) => {
    await window.tabula.documents.extract(docId);
    loadCase();
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Loading case...</p>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="page">
        <div className="empty-state">
          <h3>Case not found</h3>
          <p>This case may have been deleted.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const debtor = caseData.debtors?.[0] || {};

  return (
    <div className="page">
      {/* Back + Header */}
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        All Cases
      </button>

      <div className="case-header">
        <div>
          <h1 className="page-title">{debtor.first_name} {debtor.last_name}</h1>
          <div className="case-meta">
            <span className="case-meta-item">
              <span className="chapter-badge">Chapter {caseData.chapter}</span>
            </span>
            <span className="case-meta-item">
              <strong>District:</strong> {caseData.district || 'Not set'}
            </span>
            <span className="case-meta-item">
              <strong>Created:</strong> {formatDistanceToNow(new Date(caseData.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={`badge ${caseData.status}`}>{STATUS_LABELS[caseData.status]}</span>
          <select
            className="form-select"
            value={caseData.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ width: 'auto', padding: '5px 30px 5px 12px', fontSize: '0.78rem' }}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'creditors' && caseData.creditors?.length > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.creditors.length}</span>
            )}
            {tab.key === 'documents' && caseData.documents?.length > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.documents.length}</span>
            )}
            {tab.key === 'review' && caseData.flags?.filter(f => !f.resolved).length > 0 && (
              <span style={{ marginLeft: 6, color: 'var(--accent)' }}>
                {caseData.flags.filter(f => !f.resolved).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab caseData={caseData} debtor={debtor} />}
      {activeTab === 'documents' && <DocumentsTab caseData={caseData} onUpload={handleUploadDocuments} onExtract={handleExtract} />}
      {activeTab === 'creditors' && <CreditorsTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
      {activeTab === 'means-test' && <MeansTestTab caseData={caseData} />}
      {activeTab === 'review' && <ReviewTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────── */

function OverviewTab({ caseData, debtor }) {
  const totalDebt = (caseData.creditors || []).reduce((sum, c) => sum + (c.amount_claimed || 0), 0);
  const totalAssets = (caseData.assets || []).reduce((sum, a) => sum + (a.current_value || 0), 0);
  const monthlyIncome = (caseData.income || []).reduce((sum, i) => sum + (i.gross_monthly || 0), 0);
  const monthlyExpenses = (caseData.expenses || []).reduce((sum, e) => sum + (e.monthly_amount || 0), 0);

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Debt</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            ${totalDebt.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">${totalAssets.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Monthly Income</div>
          <div className="stat-value" style={{ color: 'var(--sage)' }}>
            ${monthlyIncome.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Monthly Expenses</div>
          <div className="stat-value">${monthlyExpenses.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Debtor Information</span></div>
          <div className="card-body">
            <InfoRow label="Name" value={`${debtor.first_name || ''} ${debtor.last_name || ''}`} />
            <InfoRow label="SSN" value={debtor.ssn ? `***-**-${debtor.ssn.slice(-4)}` : '—'} />
            <InfoRow label="Date of Birth" value={debtor.dob || '—'} />
            <InfoRow label="Phone" value={debtor.phone || '—'} />
            <InfoRow label="Email" value={debtor.email || '—'} />
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Address</span></div>
          <div className="card-body">
            <InfoRow label="Street" value={debtor.address_street || '—'} />
            <InfoRow label="City" value={debtor.address_city || '—'} />
            <InfoRow label="State" value={debtor.address_state || '—'} />
            <InfoRow label="ZIP" value={debtor.address_zip || '—'} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><span className="card-title">Petition Checklist</span></div>
        <div className="card-body">
          <ChecklistItem done={!!debtor.first_name} label="Debtor information" />
          <ChecklistItem done={(caseData.income || []).length > 0} label="Income sources" />
          <ChecklistItem done={(caseData.expenses || []).length > 0} label="Monthly expenses" />
          <ChecklistItem done={(caseData.creditors || []).length > 0} label="Creditor matrix" />
          <ChecklistItem done={(caseData.assets || []).length > 0} label="Asset schedules" />
          <ChecklistItem done={(caseData.documents || []).length > 0} label="Supporting documents" />
          <ChecklistItem done={(caseData.flags || []).filter(f => !f.resolved).length === 0 && (caseData.flags || []).length > 0} label="All review flags resolved" />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ChecklistItem({ done, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        border: done ? 'none' : '1.5px solid rgba(10,10,10,0.15)',
        background: done ? 'var(--sage)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {done && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span className="text-sm" style={{ color: done ? 'var(--ink)' : 'var(--warm-gray)' }}>{label}</span>
    </div>
  );
}

/* ─── Documents Tab ────────────────────────────────────────── */

function DocumentsTab({ caseData, onUpload, onExtract }) {
  const docs = caseData.documents || [];

  return (
    <div>
      <div className="drop-zone" onClick={onUpload} style={{ marginBottom: 24 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--warm-gray)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12, opacity: 0.4 }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p style={{ fontWeight: 500, marginBottom: 4 }}>Click to upload documents</p>
        <p className="text-sm text-muted">PDF, images, or CSV — pay stubs, tax returns, bank statements, credit reports</p>
      </div>

      {docs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th>Extracted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <span style={{ fontWeight: 500 }}>{doc.filename}</span>
                  </td>
                  <td>
                    <span className="chapter-badge">{(doc.doc_type || 'other').replace('_', ' ')}</span>
                  </td>
                  <td className="text-sm text-muted">
                    {formatDistanceToNow(new Date(doc.uploaded_at), { addSuffix: true })}
                  </td>
                  <td>
                    {doc.extracted_data ? (
                      <span style={{ color: 'var(--sage)', fontWeight: 500, fontSize: '0.82rem' }}>Extracted</span>
                    ) : (
                      <span className="text-sm text-muted">Pending</span>
                    )}
                  </td>
                  <td>
                    {!doc.extracted_data && (
                      <button className="btn btn-sm btn-secondary" onClick={() => onExtract(doc.id)}>
                        Extract Data
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Creditors Tab ────────────────────────────────────────── */

function CreditorsTab({ caseData, caseId, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', address: '', accountNumber: '', debtType: 'credit_card',
    schedule: 'F', amountClaimed: '', collateralDescription: '',
    isDisputed: false, isContingent: false,
  });

  const creditors = caseData.creditors || [];
  const totalDebt = creditors.reduce((sum, c) => sum + (c.amount_claimed || 0), 0);

  const handleAdd = async () => {
    if (!form.name) return;
    await window.tabula.creditors.upsert(caseId, {
      ...form,
      amountClaimed: parseFloat(form.amountClaimed) || 0,
    });
    setForm({ name: '', address: '', accountNumber: '', debtType: 'credit_card', schedule: 'F', amountClaimed: '', collateralDescription: '', isDisputed: false, isContingent: false });
    setShowForm(false);
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span className="text-sm text-muted">{creditors.length} creditors — </span>
          <span className="text-sm" style={{ fontWeight: 500 }}>
            ${totalDebt.toLocaleString()} total claimed
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Creditor'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Creditor Name</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Capital One" />
              </div>
              <div className="form-group">
                <label className="form-label">Amount Claimed</label>
                <input className="form-input" type="number" value={form.amountClaimed} onChange={(e) => setForm({ ...form, amountClaimed: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Debt Type</label>
                <select className="form-select" value={form.debtType} onChange={(e) => setForm({ ...form, debtType: e.target.value })}>
                  <option value="credit_card">Credit Card</option>
                  <option value="medical">Medical</option>
                  <option value="auto_loan">Auto Loan</option>
                  <option value="student_loan">Student Loan</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="personal_loan">Personal Loan</option>
                  <option value="collections">Collections</option>
                  <option value="tax">Tax Debt</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Schedule</label>
                <select className="form-select" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}>
                  <option value="D">D — Secured</option>
                  <option value="E">E — Priority Unsecured</option>
                  <option value="F">F — Nonpriority Unsecured</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Account Number</label>
                <input className="form-input" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Last 4 digits" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Creditor mailing address" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add Creditor</button>
            </div>
          </div>
        </div>
      )}

      {creditors.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Creditor</th>
                <th>Type</th>
                <th>Schedule</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {creditors.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    {c.account_number && <div className="text-xs text-muted">Acct: {c.account_number}</div>}
                  </td>
                  <td className="text-sm">{(c.debt_type || '').replace('_', ' ')}</td>
                  <td><span className="chapter-badge">Sch. {c.schedule}</span></td>
                  <td className="text-sm" style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    ${(c.amount_claimed || 0).toLocaleString()}
                  </td>
                  <td>
                    {c.is_disputed ? <span className="badge intake" style={{ marginRight: 4 }}>Disputed</span> : null}
                    {c.is_contingent ? <span className="badge in_progress">Contingent</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <h3>No creditors added</h3>
            <p>Add creditors manually or upload a credit report to auto-populate.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Means Test Tab ───────────────────────────────────────── */

function MeansTestTab({ caseData }) {
  const income = caseData.income || [];
  const expenses = caseData.expenses || [];
  const totalGrossMonthly = income.reduce((s, i) => s + (i.gross_monthly || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.monthly_amount || 0), 0);
  const annualized = totalGrossMonthly * 12;
  const disposable = totalGrossMonthly - totalExpenses;

  // Simplified median check (real implementation would use census data by state/household size)
  const medianThreshold = 59580; // Approximate national median for single filer

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Form 122A — Chapter 7 Means Test</span>
          <span className={`badge ${annualized < medianThreshold ? 'ready' : 'in_progress'}`}>
            {annualized < medianThreshold ? 'Below Median' : 'Above Median'}
          </span>
        </div>
        <div className="card-body">
          <div className="stats-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-label">Gross Monthly Income</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>
                ${totalGrossMonthly.toLocaleString()}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Annualized Income</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>
                ${annualized.toLocaleString()}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Monthly Expenses</div>
              <div className="stat-value" style={{ fontSize: '1.6rem' }}>
                ${totalExpenses.toLocaleString()}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Disposable Income</div>
              <div className="stat-value" style={{ fontSize: '1.6rem', color: disposable < 0 ? 'var(--accent)' : 'var(--sage)' }}>
                ${disposable.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {income.length === 0 && expenses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No income or expense data</h3>
            <p>Upload pay stubs and bank statements to auto-populate the means test, or add data manually.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Income Sources</span></div>
            <div className="card-body">
              {income.length > 0 ? income.map((i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                  <div>
                    <div className="text-sm" style={{ fontWeight: 500 }}>{i.employer_name || i.source}</div>
                    <div className="text-xs text-muted">{i.pay_frequency}</div>
                  </div>
                  <span className="text-mono text-sm">${(i.gross_monthly || 0).toLocaleString()}/mo</span>
                </div>
              )) : <p className="text-sm text-muted">No income sources added.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Expenses</span></div>
            <div className="card-body">
              {expenses.length > 0 ? expenses.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                  <div>
                    <div className="text-sm" style={{ fontWeight: 500 }}>{e.category}</div>
                    <div className="text-xs text-muted">{e.description}</div>
                  </div>
                  <span className="text-mono text-sm">${(e.monthly_amount || 0).toLocaleString()}/mo</span>
                </div>
              )) : <p className="text-sm text-muted">No expenses added.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Review Tab ───────────────────────────────────────────── */

function ReviewTab({ caseData, caseId, onRefresh }) {
  const [note, setNote] = useState('');
  const [section, setSection] = useState('general');
  const flags = caseData.flags || [];
  const unresolvedFlags = flags.filter(f => !f.resolved);
  const resolvedFlags = flags.filter(f => f.resolved);

  const handleAddFlag = async () => {
    if (!note) return;
    await window.tabula.reviewFlags.create({ caseId, section, note });
    setNote('');
    onRefresh();
  };

  const handleResolve = async (id) => {
    await window.tabula.reviewFlags.resolve(id);
    onRefresh();
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Add Review Flag</span>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Section</label>
              <select className="form-select" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="general">General</option>
                <option value="debtor_info">Debtor Information</option>
                <option value="income">Income</option>
                <option value="expenses">Expenses</option>
                <option value="creditors">Creditors</option>
                <option value="assets">Assets</option>
                <option value="means_test">Means Test</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Note</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what needs review..." onKeyDown={(e) => e.key === 'Enter' && handleAddFlag()} />
                <button className="btn btn-primary btn-sm" onClick={handleAddFlag}>Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {unresolvedFlags.length > 0 && (
        <div className="section">
          <h3 className="section-title">Open Flags ({unresolvedFlags.length})</h3>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {unresolvedFlags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                  <div>
                    <span className="chapter-badge" style={{ marginRight: 10 }}>{flag.section.replace('_', ' ')}</span>
                    <span className="text-sm">{flag.note}</span>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleResolve(flag.id)}>Resolve</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {resolvedFlags.length > 0 && (
        <div className="section" style={{ marginTop: 24 }}>
          <h3 className="section-title" style={{ opacity: 0.5 }}>Resolved ({resolvedFlags.length})</h3>
          <div className="card" style={{ opacity: 0.5 }}>
            <div className="card-body" style={{ padding: 0 }}>
              {resolvedFlags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span className="text-sm">{flag.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {flags.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <h3>No review flags</h3>
            <p>Add flags to track items that need attorney review before filing.</p>
          </div>
        </div>
      )}
    </div>
  );
}
