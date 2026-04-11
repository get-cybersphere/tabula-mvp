import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { runMeansTest } from '../lib/means-test.js';
import { getAllStates } from '../lib/median-income.js';

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
      {activeTab === 'overview' && <OverviewTab caseData={caseData} debtor={debtor} caseId={caseId} onRefresh={loadCase} />}
      {activeTab === 'documents' && <DocumentsTab caseData={caseData} onUpload={handleUploadDocuments} onExtract={handleExtract} />}
      {activeTab === 'creditors' && <CreditorsTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
      {activeTab === 'means-test' && <MeansTestTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
      {activeTab === 'review' && <ReviewTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────── */

function OverviewTab({ caseData, debtor, caseId, onRefresh }) {
  const totalDebt = (caseData.creditors || []).reduce((sum, c) => sum + (c.amount_claimed || 0), 0);
  const totalAssets = (caseData.assets || []).reduce((sum, a) => sum + (a.current_value || 0), 0);
  const monthlyIncome = (caseData.income || []).reduce((sum, i) => sum + (i.gross_monthly || 0), 0);
  const monthlyExpenses = (caseData.expenses || []).reduce((sum, e) => sum + (e.monthly_amount || 0), 0);

  const jointDebtor = (caseData.debtors || []).find(d => d.is_joint === 1);
  const [showJointForm, setShowJointForm] = useState(false);
  const [jointForm, setJointForm] = useState({
    firstName: '', lastName: '', ssn: '', dob: '', phone: '', email: '',
    street: '', city: '', state: '', zip: '',
  });

  const handleAddJointDebtor = async () => {
    if (!jointForm.firstName || !jointForm.lastName) return;
    await window.tabula.debtors.upsert(caseId, { ...jointForm, isJoint: true });
    setShowJointForm(false);
    setJointForm({ firstName: '', lastName: '', ssn: '', dob: '', phone: '', email: '', street: '', city: '', state: '', zip: '' });
    onRefresh();
  };

  const handleRemoveJointDebtor = async (id) => {
    await window.tabula.debtors.delete(id);
    onRefresh();
  };

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

      {/* Joint Debtor Section */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <span className="card-title">Joint Filing (Spouse)</span>
          {!jointDebtor && !showJointForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowJointForm(true)}>+ Add Joint Debtor</button>
          )}
        </div>
        <div className="card-body">
          {jointDebtor ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <InfoRow label="Name" value={`${jointDebtor.first_name || ''} ${jointDebtor.last_name || ''}`} />
                  <InfoRow label="SSN" value={jointDebtor.ssn ? `***-**-${jointDebtor.ssn.slice(-4)}` : '—'} />
                  <InfoRow label="Date of Birth" value={jointDebtor.dob || '—'} />
                </div>
                <div>
                  <InfoRow label="Phone" value={jointDebtor.phone || '—'} />
                  <InfoRow label="Email" value={jointDebtor.email || '—'} />
                  <InfoRow label="Address" value={jointDebtor.address_street ? `${jointDebtor.address_street}, ${jointDebtor.address_city || ''} ${jointDebtor.address_state || ''} ${jointDebtor.address_zip || ''}` : '—'} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => handleRemoveJointDebtor(jointDebtor.id)}>Remove Joint Debtor</button>
              </div>
            </div>
          ) : showJointForm ? (
            <div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-input" value={jointForm.firstName} onChange={(e) => setJointForm({ ...jointForm, firstName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-input" value={jointForm.lastName} onChange={(e) => setJointForm({ ...jointForm, lastName: e.target.value })} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">SSN</label>
                  <input className="form-input" value={jointForm.ssn} onChange={(e) => setJointForm({ ...jointForm, ssn: e.target.value })} placeholder="XXX-XX-XXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input className="form-input" type="date" value={jointForm.dob} onChange={(e) => setJointForm({ ...jointForm, dob: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={jointForm.phone} onChange={(e) => setJointForm({ ...jointForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" value={jointForm.email} onChange={(e) => setJointForm({ ...jointForm, email: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Street</label>
                  <input className="form-input" value={jointForm.street} onChange={(e) => setJointForm({ ...jointForm, street: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-input" value={jointForm.city} onChange={(e) => setJointForm({ ...jointForm, city: e.target.value })} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input className="form-input" value={jointForm.state} onChange={(e) => setJointForm({ ...jointForm, state: e.target.value })} placeholder="e.g. TX" />
                </div>
                <div className="form-group">
                  <label className="form-label">ZIP</label>
                  <input className="form-input" value={jointForm.zip} onChange={(e) => setJointForm({ ...jointForm, zip: e.target.value })} />
                </div>
                <div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowJointForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddJointDebtor}>Add Joint Debtor</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No joint debtor. Click "Add Joint Debtor" for a joint filing.</p>
          )}
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

function MeansTestTab({ caseData, caseId, onRefresh }) {
  const STATES = getAllStates();
  const income = caseData.income || [];
  const expenses = caseData.expenses || [];
  const debtor = caseData.debtors?.[0] || {};
  const hasJoint = (caseData.debtors || []).some(d => d.is_joint === 1);

  // Income form
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({
    source: 'Employment', employerName: '', grossMonthly: '', netMonthly: '', payFrequency: 'monthly',
  });

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'housing', description: '', monthlyAmount: '',
  });

  // Means test parameters
  const [stateCode, setStateCode] = useState(debtor.address_state || 'TX');
  const [householdSize, setHouseholdSize] = useState(hasJoint ? 2 : 1);
  const [showResult, setShowResult] = useState(false);

  // Build income sources in the format runMeansTest expects
  const incomeSources = income.map(i => ({
    employer: i.employer_name || i.source,
    grossAmount: i.gross_monthly || 0,
    frequency: 'monthly', // already stored as monthly in DB
  }));

  const totalGrossMonthly = income.reduce((s, i) => s + (i.gross_monthly || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.monthly_amount || 0), 0);

  // Aggregate expenses for the means test
  const expenseMap = {};
  for (const e of expenses) {
    expenseMap[e.category] = (expenseMap[e.category] || 0) + (e.monthly_amount || 0);
  }

  const meansResult = showResult ? runMeansTest({
    incomeSources,
    stateCode,
    householdSize,
    extractedExpenses: expenseMap,
  }) : null;

  const handleAddIncome = async () => {
    if (!incomeForm.grossMonthly) return;
    await window.tabula.income.upsert(caseId, {
      source: incomeForm.source,
      employerName: incomeForm.employerName,
      grossMonthly: parseFloat(incomeForm.grossMonthly) || 0,
      netMonthly: parseFloat(incomeForm.netMonthly) || 0,
      payFrequency: incomeForm.payFrequency,
    });
    setIncomeForm({ source: 'Employment', employerName: '', grossMonthly: '', netMonthly: '', payFrequency: 'monthly' });
    setShowIncomeForm(false);
    setShowResult(false);
    onRefresh();
  };

  const handleDeleteIncome = async (id) => {
    await window.tabula.income.delete(id);
    setShowResult(false);
    onRefresh();
  };

  const handleAddExpense = async () => {
    if (!expenseForm.monthlyAmount) return;
    await window.tabula.expenses.upsert(caseId, {
      category: expenseForm.category,
      description: expenseForm.description,
      monthlyAmount: parseFloat(expenseForm.monthlyAmount) || 0,
    });
    setExpenseForm({ category: 'housing', description: '', monthlyAmount: '' });
    setShowExpenseForm(false);
    setShowResult(false);
    onRefresh();
  };

  const handleDeleteExpense = async (id) => {
    await window.tabula.expenses.delete(id);
    setShowResult(false);
    onRefresh();
  };

  function fmt(n) {
    if (n == null || isNaN(n)) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  return (
    <div>
      {/* Means Test Parameters & Run */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Form 122A — Chapter 7 Means Test</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">State</label>
              <select className="form-select" value={stateCode} onChange={e => { setStateCode(e.target.value); setShowResult(false); }}>
                {STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Household Size</label>
              <input className="form-input" type="number" min="1" max="15" value={householdSize} onChange={e => { setHouseholdSize(parseInt(e.target.value) || 1); setShowResult(false); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Monthly Income / Expenses</label>
              <div className="text-sm" style={{ padding: '9px 0' }}>
                {fmt(totalGrossMonthly)} / {fmt(totalExpenses)}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowResult(true)}
              disabled={income.length === 0}
              style={{ height: 40 }}
            >
              Run Means Test
            </button>
          </div>
        </div>
      </div>

      {/* Means Test Result */}
      {meansResult && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Result</span>
            <span className={`badge ${meansResult.recommendation === 'chapter7' ? 'ready' : meansResult.recommendation === 'chapter13' ? 'in_progress' : 'intake'}`}>
              {meansResult.belowMedian ? 'Below Median' : 'Above Median'}
            </span>
          </div>
          <div className="card-body">
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-label">Recommendation</div>
                <div className="stat-value" style={{ fontSize: '1.4rem', color: meansResult.recommendation === 'chapter7' ? 'var(--sage)' : 'var(--accent)' }}>
                  {meansResult.recommendation === 'chapter7' ? 'Chapter 7 Eligible' : meansResult.recommendation === 'chapter13' ? 'Chapter 13' : 'Needs Analysis'}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Confidence</div>
                <div className="stat-value" style={{ fontSize: '1.4rem' }}>{meansResult.confidence}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Annualized Income</div>
                <div className="stat-value" style={{ fontSize: '1.4rem' }}>{fmt(meansResult.annualIncome)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">State Median</div>
                <div className="stat-value" style={{ fontSize: '1.4rem' }}>{fmt(meansResult.medianIncome)}</div>
              </div>
            </div>

            {meansResult.explanation.map((line, i) => (
              <p key={i} className="text-sm" style={{ marginBottom: 6, color: 'var(--warm-gray)' }}>{line}</p>
            ))}

            {meansResult.warnings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {meansResult.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: 'rgba(196, 124, 72, 0.08)', borderRadius: 6, marginBottom: 6 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>!</span>
                    <span className="text-sm">{w}</span>
                  </div>
                ))}
              </div>
            )}

            {meansResult.deductions && (
              <div style={{ marginTop: 16 }}>
                <h4 className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>Deductions Breakdown</h4>
                <div style={{ fontSize: '0.82rem' }}>
                  <InfoRow label="National Standards (food/clothing)" value={fmt(meansResult.deductions.nationalStandards)} />
                  <InfoRow label="Health Care" value={fmt(meansResult.deductions.healthCare)} />
                  <InfoRow label="Housing & Utilities" value={fmt(meansResult.deductions.housingUtilities)} />
                  <InfoRow label="Transportation" value={fmt(meansResult.deductions.transportation)} />
                  <InfoRow label="Total Deductions" value={fmt(meansResult.deductions.total)} />
                  <InfoRow label="Disposable Monthly Income" value={fmt(meansResult.disposableMonthlyIncome)} />
                  <InfoRow label="60-Month Disposable" value={fmt(meansResult.disposable60Month)} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Income & Expense Editors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Income Sources */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Income Sources</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowIncomeForm(!showIncomeForm)}>
              {showIncomeForm ? 'Cancel' : '+ Add Income'}
            </button>
          </div>
          <div className="card-body">
            {showIncomeForm && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(10,10,10,0.06)' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Source</label>
                    <select className="form-select" value={incomeForm.source} onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}>
                      <option value="Employment">Employment</option>
                      <option value="Self-employment">Self-employment</option>
                      <option value="Social Security">Social Security</option>
                      <option value="Pension">Pension</option>
                      <option value="Rental Income">Rental Income</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Employer / Name</label>
                    <input className="form-input" value={incomeForm.employerName} onChange={(e) => setIncomeForm({ ...incomeForm, employerName: e.target.value })} placeholder="e.g. Acme Corp" />
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Gross Monthly</label>
                    <input className="form-input" type="number" value={incomeForm.grossMonthly} onChange={(e) => setIncomeForm({ ...incomeForm, grossMonthly: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Net Monthly</label>
                    <input className="form-input" type="number" value={incomeForm.netMonthly} onChange={(e) => setIncomeForm({ ...incomeForm, netMonthly: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Pay Frequency</label>
                    <select className="form-select" value={incomeForm.payFrequency} onChange={(e) => setIncomeForm({ ...incomeForm, payFrequency: e.target.value })}>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="semimonthly">Semi-monthly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowIncomeForm(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAddIncome}>Add Income</button>
                </div>
              </div>
            )}

            {income.length > 0 ? income.map((i) => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                <div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{i.employer_name || i.source}</div>
                  <div className="text-xs text-muted">{i.pay_frequency}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="text-mono text-sm">${(i.gross_monthly || 0).toLocaleString()}/mo</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteIncome(i.id)} style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--warm-gray)' }}>
                    x
                  </button>
                </div>
              </div>
            )) : <p className="text-sm text-muted">No income sources added.</p>}
          </div>
        </div>

        {/* Expenses */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Expenses</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? 'Cancel' : '+ Add Expense'}
            </button>
          </div>
          <div className="card-body">
            {showExpenseForm && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(10,10,10,0.06)' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                      <option value="housing">Housing</option>
                      <option value="rent">Rent</option>
                      <option value="utilities">Utilities</option>
                      <option value="food">Food / Groceries</option>
                      <option value="transportation">Transportation</option>
                      <option value="gas">Gas</option>
                      <option value="carPayment">Car Payment</option>
                      <option value="insurance">Insurance</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="childcare">Childcare</option>
                      <option value="education">Education</option>
                      <option value="clothing">Clothing</option>
                      <option value="subscriptions">Subscriptions</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input className="form-input" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="Optional details" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Amount</label>
                  <input className="form-input" type="number" value={expenseForm.monthlyAmount} onChange={(e) => setExpenseForm({ ...expenseForm, monthlyAmount: e.target.value })} placeholder="0.00" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowExpenseForm(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAddExpense}>Add Expense</button>
                </div>
              </div>
            )}

            {expenses.length > 0 ? expenses.map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(10,10,10,0.04)' }}>
                <div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{e.category}</div>
                  <div className="text-xs text-muted">{e.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="text-mono text-sm">${(e.monthly_amount || 0).toLocaleString()}/mo</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteExpense(e.id)} style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--warm-gray)' }}>
                    x
                  </button>
                </div>
              </div>
            )) : <p className="text-sm text-muted">No expenses added.</p>}
          </div>
        </div>
      </div>
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
