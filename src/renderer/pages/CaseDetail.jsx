import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { runMeansTest } from '../lib/means-test.js';
import { getAllStates } from '../lib/median-income.js';
import { computeCompleteness } from '../lib/case-completeness.js';
import { computeDeadlines } from '../lib/deadlines.js';
import AIAssistant from '../components/case/AIAssistant.jsx';
import { AccidentDetailsTab, MedicalRecordsTab, CaseValuationTab, SettlementTab, PIDeadlinesTab } from '../components/case/PIWorkflow.jsx';
import { useToast } from '../lib/toast.jsx';
import { confirmAction } from '../lib/confirm.js';

const STATUS_LABELS = {
  intake: 'Intake',
  in_progress: 'In Progress',
  ready: 'Ready to File',
  filed: 'Filed',
};

const BANKRUPTCY_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'documents', label: 'Documents' },
  { key: 'assets', label: 'Assets' },
  { key: 'creditors', label: 'Creditors' },
  { key: 'means-test', label: 'Means Test' },
  { key: 'review', label: 'Review' },
];

const PI_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'accident', label: 'Accident & Insurance' },
  { key: 'medical', label: 'Medical Records' },
  { key: 'valuation', label: 'Case Valuation' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review' },
];

const TABS = BANKRUPTCY_TABS; // default, overridden per-case below

export default function CaseDetail({ caseId, initialTab, navigate }) {
  const [caseData, setCaseData] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const toast = useToast();

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
    try {
      await window.tabula.cases.update(caseId, { status: newStatus });
      toast.success(`Status changed to ${STATUS_LABELS[newStatus] || newStatus}`);
      loadCase();
    } catch (err) {
      toast.error(`Could not update status: ${err.message || 'unknown error'}`);
    }
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
            {caseData.practice_type && caseData.practice_type !== 'bankruptcy' && (
              <span className="case-meta-item">
                <span className="chapter-badge" style={{ textTransform: 'capitalize' }}>
                  {(caseData.practice_type || '').replace('_', ' ')}
                </span>
              </span>
            )}
            {(!caseData.practice_type || caseData.practice_type === 'bankruptcy') && (
            <span className="case-meta-item">
              <span className="chapter-badge">Chapter {caseData.chapter}</span>
            </span>
            )}
            <span className="case-meta-item">
              <strong>District:</strong> {caseData.district || 'Not set'}
            </span>
            <span className="case-meta-item">
              <strong>Created:</strong> {formatDistanceToNow(new Date(caseData.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn btn-sm ${aiOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAiOpen(!aiOpen)}
            title="Toggle AI Assistant"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 7.27 19H6a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h-1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
            </svg>
            AI Assistant
          </button>
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

      {/* Tabs — practice-specific */}
      {(() => {
        const isPI = caseData.practice_type === 'personal_injury';
        const tabs = isPI ? PI_TABS : BANKRUPTCY_TABS;
        return (
          <>
            <div className="tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`tab ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  {tab.key === 'creditors' && caseData.creditors?.length > 0 && (
                    <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.creditors.length}</span>
                  )}
                  {tab.key === 'medical' && caseData.medicalRecords?.length > 0 && (
                    <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.medicalRecords.length}</span>
                  )}
                  {tab.key === 'documents' && caseData.documents?.length > 0 && (
                    <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.documents.length}</span>
                  )}
                  {tab.key === 'assets' && caseData.assets?.length > 0 && (
                    <span style={{ marginLeft: 6, opacity: 0.5 }}>{caseData.assets.length}</span>
                  )}
                  {tab.key === 'review' && caseData.flags?.filter(f => !f.resolved).length > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--accent)' }}>
                      {caseData.flags.filter(f => !f.resolved).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Shared tabs */}
            {activeTab === 'overview' && <OverviewTab caseData={caseData} debtor={debtor} caseId={caseId} onRefresh={loadCase} />}
            {activeTab === 'timeline' && <TimelineTab caseId={caseId} />}
            {activeTab === 'documents' && <DocumentsTab caseData={caseData} onUpload={handleUploadDocuments} onExtract={handleExtract} />}
            {activeTab === 'review' && <ReviewTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}

            {/* Bankruptcy-only tabs */}
            {!isPI && activeTab === 'assets' && <AssetsTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
            {!isPI && activeTab === 'creditors' && <CreditorsTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}
            {!isPI && activeTab === 'means-test' && <MeansTestTab caseData={caseData} caseId={caseId} onRefresh={loadCase} />}

            {/* PI-only tabs */}
            {isPI && activeTab === 'accident' && <AccidentDetailsTab caseId={caseId} caseData={caseData} onRefresh={loadCase} />}
            {isPI && activeTab === 'medical' && <MedicalRecordsTab caseId={caseId} onRefresh={loadCase} />}
            {isPI && activeTab === 'valuation' && <CaseValuationTab caseId={caseId} caseData={caseData} />}
            {isPI && activeTab === 'settlement' && <SettlementTab caseId={caseId} onRefresh={loadCase} />}
            {isPI && activeTab === 'deadlines' && <PIDeadlinesTab caseId={caseId} onRefresh={loadCase} />}
          </>
        );
      })()}

      {/* AI Assistant Panel */}
      <AIAssistant
        caseId={caseId}
        practiceType={caseData.practice_type || 'bankruptcy'}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────── */

function OverviewTab({ caseData, debtor, caseId, onRefresh }) {
  const totalDebt = (caseData.creditors || []).reduce((sum, c) => sum + (c.amount_claimed || 0), 0);
  const totalAssets = (caseData.assets || []).reduce((sum, a) => sum + (a.current_value || 0), 0);
  const monthlyIncome = (caseData.income || []).reduce((sum, i) => sum + (i.gross_monthly || 0), 0);
  const monthlyExpenses = (caseData.expenses || []).reduce((sum, e) => sum + (e.monthly_amount || 0), 0);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [debtorForm, setDebtorForm] = useState({
    firstName: debtor.first_name || '',
    lastName: debtor.last_name || '',
    ssn: debtor.ssn || '',
    dob: debtor.dob || '',
    phone: debtor.phone || '',
    email: debtor.email || '',
    street: debtor.address_street || '',
    city: debtor.address_city || '',
    state: debtor.address_state || '',
    zip: debtor.address_zip || '',
  });

  const handleSaveInfo = async () => {
    await window.tabula.debtors.upsert(caseId, { ...debtorForm, id: debtor.id, isJoint: false });
    setEditingInfo(false);
    onRefresh();
  };

  const handleSaveAddress = async () => {
    await window.tabula.debtors.upsert(caseId, { ...debtorForm, id: debtor.id, isJoint: false });
    setEditingAddress(false);
    onRefresh();
  };

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
    if (!confirmAction('Remove the joint debtor from this case? This cannot be undone.')) return;
    await window.tabula.debtors.delete(id);
    onRefresh();
  };

  const isPI = caseData.practice_type === 'personal_injury';
  const totalMedicalBilled = (caseData.medicalRecords || []).reduce((s, r) => s + (r.total_billed || 0), 0);
  const totalMedicalPaid = (caseData.medicalRecords || []).reduce((s, r) => s + (r.total_paid || 0), 0);
  const totalMedicalOutstanding = totalMedicalBilled - totalMedicalPaid;
  const totalLiens = (caseData.medicalRecords || []).reduce((s, r) => s + (r.has_lien ? (r.lien_amount || 0) : 0), 0);

  return (
    <div>
      {isPI ? (
        /* ── PI Summary Stats ──────────────────────────────── */
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Medical Bills</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>
              ${totalMedicalBilled.toLocaleString()}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Insurance Paid</div>
            <div className="stat-value" style={{ color: 'var(--sage)' }}>
              ${totalMedicalPaid.toLocaleString()}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>
              ${totalMedicalOutstanding.toLocaleString()}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Liens</div>
            <div className="stat-value">${totalLiens.toLocaleString()}</div>
          </div>
        </div>
      ) : (
        /* ── Bankruptcy Summary Stats ──────────────────────── */
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
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">{isPI ? 'Client Information' : 'Debtor Information'}</span>
            {!editingInfo && (
              <button className="btn btn-sm btn-secondary" onClick={() => setEditingInfo(true)}>Edit</button>
            )}
          </div>
          <div className="card-body">
            {editingInfo ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">First Name</label>
                    <input className="form-input" value={debtorForm.firstName} onChange={e => setDebtorForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input className="form-input" value={debtorForm.lastName} onChange={e => setDebtorForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">SSN</label>
                    <input className="form-input" value={debtorForm.ssn} onChange={e => setDebtorForm(f => ({ ...f, ssn: e.target.value }))} placeholder="XXX-XX-XXXX" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input className="form-input" type="date" value={debtorForm.dob} onChange={e => setDebtorForm(f => ({ ...f, dob: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" value={debtorForm.phone} onChange={e => setDebtorForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={debtorForm.email} onChange={e => setDebtorForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingInfo(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveInfo}>Save</button>
                </div>
              </>
            ) : (
              <>
                <InfoRow label="Name" value={`${debtor.first_name || ''} ${debtor.last_name || ''}`} />
                <InfoRow label="SSN" value={debtor.ssn ? `***-**-${debtor.ssn.slice(-4)}` : '—'} />
                <InfoRow label="Date of Birth" value={debtor.dob || '—'} />
                <InfoRow label="Phone" value={debtor.phone || '—'} />
                <InfoRow label="Email" value={debtor.email || '—'} />
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Address</span>
            {!editingAddress && (
              <button className="btn btn-sm btn-secondary" onClick={() => setEditingAddress(true)}>Edit</button>
            )}
          </div>
          <div className="card-body">
            {editingAddress ? (
              <>
                <div className="form-group">
                  <label className="form-label">Street</label>
                  <input className="form-input" value={debtorForm.street} onChange={e => setDebtorForm(f => ({ ...f, street: e.target.value }))} />
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input className="form-input" value={debtorForm.city} onChange={e => setDebtorForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input className="form-input" value={debtorForm.state} onChange={e => setDebtorForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} placeholder="TX" maxLength="2" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ZIP</label>
                    <input className="form-input" value={debtorForm.zip} onChange={e => setDebtorForm(f => ({ ...f, zip: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingAddress(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveAddress}>Save</button>
                </div>
              </>
            ) : (
              <>
                <InfoRow label="Street" value={debtor.address_street || '—'} />
                <InfoRow label="City" value={debtor.address_city || '—'} />
                <InfoRow label="State" value={debtor.address_state || '—'} />
                <InfoRow label="ZIP" value={debtor.address_zip || '—'} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Joint Debtor Section — bankruptcy only */}
      {!isPI && <div className="card" style={{ marginTop: 20 }}>
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
      </div>}

      <DeadlinesCard caseData={caseData} />

      {!isPI && <CompletenessPanel caseData={caseData} />}
    </div>
  );
}

/**
 * Detailed completeness panel — shows score, what's done, and what's missing
 * with specific hints. Drives the "what's missing per client" pain point.
 */
function CompletenessPanel({ caseData }) {
  const completeness = computeCompleteness(caseData);
  const { score, readyToFile, items, missing, completedItems, totalItems } = completeness;

  const barColor =
    readyToFile ? 'var(--sage)' :
    score >= 75 ? 'var(--amber)' :
    score >= 40 ? 'var(--blue)' :
    'var(--accent)';

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title">Petition Readiness</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="text-sm" style={{ color: 'var(--warm-gray)' }}>
            {completedItems} of {totalItems} complete
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontWeight: 600, fontSize: '0.95rem',
            color: barColor,
          }}>
            {score}%
          </span>
          {readyToFile && (
            <span className="badge ready">Ready to File</span>
          )}
        </div>
      </div>
      <div className="card-body">
        {/* Progress bar */}
        <div style={{
          height: 6, borderRadius: 3, background: 'rgba(10,10,10,0.06)',
          overflow: 'hidden', marginBottom: 20,
        }}>
          <div style={{
            width: `${score}%`, height: '100%', background: barColor,
            transition: 'width 200ms ease-out',
          }} />
        </div>

        {/* What's missing — highlighted */}
        {missing.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="text-sm" style={{ fontWeight: 600, marginBottom: 10, color: 'var(--accent)' }}>
              Missing ({missing.length})
            </div>
            {missing.map((m) => (
              <div key={m.key} style={{
                display: 'flex', gap: 10, padding: '8px 12px',
                background: 'rgba(196, 124, 72, 0.06)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: 4, marginBottom: 6,
              }}>
                <span style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>!</span>
                <div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{m.label}</div>
                  {m.hint && (
                    <div className="text-xs" style={{ color: 'var(--warm-gray)', marginTop: 2 }}>
                      {m.hint}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Full checklist — compact */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
          {items.map((item) => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
              opacity: item.done ? 1 : (item.required ? 0.85 : 0.55),
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: item.done ? 'none' : '1.5px solid rgba(10,10,10,0.18)',
                background: item.done ? 'var(--sage)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {item.done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span className="text-sm" style={{ color: item.done ? 'var(--ink)' : 'var(--warm-gray)' }}>
                {item.label}
              </span>
              {!item.required && !item.done && (
                <span className="text-xs" style={{ color: 'var(--warm-gray)', opacity: 0.6 }}>
                  optional
                </span>
              )}
            </div>
          ))}
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
      ) : !showForm && (
        <div className="card">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <h3>No creditors yet</h3>
            <p>Add each creditor the debtor owes money to. These populate Schedule D, E, and F of the petition.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add First Creditor</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Assets Tab ───────────────────────────────────────────── */

function AssetsTab({ caseData, caseId, onRefresh }) {
  const assets = caseData.assets || [];
  const totalValue = assets.reduce((sum, a) => sum + (a.current_value || 0), 0);
  const totalExempt = assets.reduce((sum, a) => sum + (a.exemption_amount || 0), 0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: 'real_estate', description: '', currentValue: '', schedule: 'A',
    exemptionStatute: '', exemptionAmount: '',
  });

  const ASSET_CATEGORIES = [
    { value: 'real_estate', label: 'Real Estate', schedule: 'A' },
    { value: 'vehicle', label: 'Vehicle', schedule: 'B' },
    { value: 'bank_account', label: 'Bank Account', schedule: 'B' },
    { value: 'household_goods', label: 'Household Goods', schedule: 'B' },
    { value: 'clothing', label: 'Clothing', schedule: 'B' },
    { value: 'retirement', label: 'Retirement Account', schedule: 'B' },
    { value: 'other', label: 'Other', schedule: 'B' },
  ];

  const handleCategoryChange = (cat) => {
    const match = ASSET_CATEGORIES.find(c => c.value === cat);
    setForm(f => ({ ...f, category: cat, schedule: match?.schedule || 'B' }));
  };

  const handleAdd = async () => {
    if (!form.description) return;
    await window.tabula.assets.upsert(caseId, {
      ...form,
      currentValue: parseFloat(form.currentValue) || 0,
      exemptionAmount: parseFloat(form.exemptionAmount) || 0,
    });
    setForm({ category: 'real_estate', description: '', currentValue: '', schedule: 'A', exemptionStatute: '', exemptionAmount: '' });
    setShowForm(false);
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span className="text-sm text-muted">{assets.length} asset{assets.length !== 1 ? 's' : ''} — </span>
          <span className="text-sm" style={{ fontWeight: 500 }}>${totalValue.toLocaleString()} total value</span>
          {totalExempt > 0 && (
            <span className="text-sm text-muted"> · ${totalExempt.toLocaleString()} exempt</span>
          )}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Asset'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
                  {ASSET_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Current Value</label>
                <input className="form-input" type="number" value={form.currentValue} onChange={e => setForm(f => ({ ...f, currentValue: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 2018 Honda Civic, checking account at Chase, home at 123 Main St" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Exemption Statute <span className="text-muted">(optional)</span></label>
                <input className="form-input" value={form.exemptionStatute} onChange={e => setForm(f => ({ ...f, exemptionStatute: e.target.value }))} placeholder="e.g. TX Prop. Code § 41.001" />
              </div>
              <div className="form-group">
                <label className="form-label">Exempt Amount</label>
                <input className="form-input" type="number" value={form.exemptionAmount} onChange={e => setForm(f => ({ ...f, exemptionAmount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add Asset</button>
            </div>
          </div>
        </div>
      )}

      {assets.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Schedule</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th style={{ textAlign: 'right' }}>Exempt</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.description}</td>
                  <td className="text-sm">{(a.category || '').replace('_', ' ')}</td>
                  <td><span className="chapter-badge">Sch. {a.schedule}</span></td>
                  <td className="text-sm" style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    ${(a.current_value || 0).toLocaleString()}
                  </td>
                  <td className="text-sm" style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: a.exemption_amount > 0 ? 'var(--sage)' : 'var(--warm-gray)' }}>
                    {a.exemption_amount > 0 ? `$${(a.exemption_amount || 0).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showForm && (
        <div className="card">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <h3>No assets listed</h3>
            <p>List all property the debtor owns — real estate, vehicles, bank accounts, and personal property. These populate Schedules A and B.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add First Asset</button>
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
    if (!confirmAction('Delete this income entry?')) return;
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
    if (!confirmAction('Delete this expense entry?')) return;
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

/* ─── Timeline Tab ─────────────────────────────────────────── */

function TimelineTab({ caseId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.tabula.events.list(caseId).then(evs => {
      if (!cancelled) {
        setEvents(evs || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <p className="text-sm text-muted">Loading timeline...</p>;
  if (events.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <h3>No timeline events yet</h3>
          <p>Events appear here as you upload documents, extract data, add creditors, and change case status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: '20px 24px' }}>
        {events.map((ev, i) => (
          <TimelineEvent key={ev.id} event={ev} isLast={i === events.length - 1} />
        ))}
      </div>
    </div>
  );
}

function TimelineEvent({ event, isLast }) {
  const color = eventColor(event.event_type);
  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      <div style={{ position: 'relative', flexShrink: 0, width: 16 }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: color, marginTop: 5,
          border: '2px solid var(--paper)',
          boxShadow: `0 0 0 1.5px ${color}`,
          position: 'relative', zIndex: 1,
        }} />
        {!isLast && (
          <div style={{
            position: 'absolute', left: 6, top: 17, bottom: -14,
            width: 1, background: 'rgba(10,10,10,0.08)',
          }} />
        )}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div className="text-sm" style={{ fontWeight: 500 }}>{event.description}</div>
          <div className="text-xs text-muted" style={{ flexShrink: 0, fontFamily: 'var(--mono)' }}>
            {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
          </div>
        </div>
        <div className="text-xs" style={{ color: 'var(--warm-gray)', marginTop: 2 }}>
          {event.event_type.replace(/_/g, ' ')}
        </div>
      </div>
    </div>
  );
}

function eventColor(eventType) {
  if (eventType === 'case_filed') return 'var(--accent)';
  if (eventType.startsWith('document_')) return 'var(--blue)';
  if (eventType.endsWith('_added')) return 'var(--sage)';
  if (eventType === 'status_changed') return 'var(--amber)';
  if (eventType.includes('review_flag')) return 'var(--accent)';
  return 'var(--warm-gray)';
}

/* ─── Deadlines Card (rendered inside Overview) ────────────── */

function DeadlinesCard({ caseData }) {
  const deadlines = computeDeadlines(caseData);
  if (deadlines.length === 0) return null;
  const active = deadlines.filter(d => d.status !== 'past' && d.status !== 'completed');
  if (active.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title">Upcoming Deadlines</span>
        <span className="text-xs text-muted">{active.length} statutory deadline{active.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {active.map((d, i) => (
          <DeadlineRow key={d.key} deadline={d} isLast={i === active.length - 1} />
        ))}
      </div>
    </div>
  );
}

function DeadlineRow({ deadline, isLast }) {
  const { label, date, rangeEnd, daysFromNow, status, severity, description } = deadline;
  const accent =
    status === 'overdue' ? 'var(--accent)' :
    severity === 'critical' && daysFromNow <= 14 ? 'var(--accent)' :
    severity === 'critical' ? 'var(--amber)' :
    severity === 'high' ? 'var(--amber)' :
    severity === 'medium' ? 'var(--blue)' :
    'var(--warm-gray)';

  const dateText = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rangeText = rangeEnd
    ? ` – ${new Date(rangeEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : '';

  const relativeText =
    status === 'overdue' ? `${Math.abs(daysFromNow)} day${Math.abs(daysFromNow) === 1 ? '' : 's'} overdue` :
    daysFromNow === 0 ? 'Today' :
    daysFromNow < 0 ? `${Math.abs(daysFromNow)} days ago` :
    `in ${daysFromNow} day${daysFromNow === 1 ? '' : 's'}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 24px',
      borderBottom: isLast ? 'none' : '1px solid rgba(10,10,10,0.04)',
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ flex: 1 }}>
        <div className="text-sm" style={{ fontWeight: 500 }}>{label}</div>
        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
          {description}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="text-sm" style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>
          {dateText}{rangeText}
        </div>
        <div className="text-xs" style={{ color: accent, fontWeight: 500, marginTop: 2 }}>
          {relativeText}
        </div>
      </div>
    </div>
  );
}
