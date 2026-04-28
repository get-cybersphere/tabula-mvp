import React, { useState, useEffect, useCallback } from 'react';
import { confirmAction } from '../../lib/confirm.js';

/* ─── PI Workflow Tabs ─────────────────────────────────────────
   Full personal-injury workflow module: accident details, medical
   records, case valuation, settlement tracking, and deadlines.
   Renders inside CaseDetail when practice_type === 'personal_injury'.
──────────────────────────────────────────────────────────────── */

// ─── Accident & Insurance Details ───────────────────────────────

export function AccidentDetailsTab({ caseId, caseData, onRefresh }) {
  const [details, setDetails] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await window.tabula.pi.details.get(caseId);
    setDetails(d);
    if (d) {
      setForm({
        accidentDate: d.accident_date || '',
        accidentType: d.accident_type || '',
        accidentLocation: d.accident_location || '',
        accidentDescription: d.accident_description || '',
        policeReportNumber: d.police_report_number || '',
        weatherConditions: d.weather_conditions || '',
        liabilityAssessment: d.liability_assessment || '',
        comparativeFaultPct: d.comparative_fault_pct || 0,
        insuranceCompany: d.insurance_company || '',
        insurancePolicyNumber: d.insurance_policy_number || '',
        insuranceAdjuster: d.insurance_adjuster || '',
        insuranceAdjusterPhone: d.insurance_adjuster_phone || '',
        insuranceClaimNumber: d.insurance_claim_number || '',
        insuranceCoverageLimit: d.insurance_coverage_limit || '',
        atFaultParty: d.at_fault_party || '',
        atFaultInsurance: d.at_fault_insurance || '',
        atFaultPolicyLimit: d.at_fault_policy_limit || '',
        umUimAvailable: !!d.um_uim_available,
        umUimLimit: d.um_uim_limit || '',
      });
    } else {
      setForm({
        accidentDate: '', accidentType: 'auto', accidentLocation: '', accidentDescription: '',
        policeReportNumber: '', weatherConditions: '', liabilityAssessment: '',
        comparativeFaultPct: 0, insuranceCompany: '', insurancePolicyNumber: '',
        insuranceAdjuster: '', insuranceAdjusterPhone: '', insuranceClaimNumber: '',
        insuranceCoverageLimit: '', atFaultParty: '', atFaultInsurance: '',
        atFaultPolicyLimit: '', umUimAvailable: false, umUimLimit: '',
      });
      setEditing(true);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    await window.tabula.pi.details.upsert(caseId, form);
    await load();
    setEditing(false);
    setSaving(false);
    onRefresh?.();
  };

  const ACCIDENT_TYPES = [
    { key: 'auto', label: 'Auto Accident' },
    { key: 'truck', label: 'Truck Accident' },
    { key: 'motorcycle', label: 'Motorcycle' },
    { key: 'pedestrian', label: 'Pedestrian' },
    { key: 'slip_fall', label: 'Slip & Fall' },
    { key: 'workplace', label: 'Workplace' },
    { key: 'medical_malpractice', label: 'Medical Malpractice' },
    { key: 'product_liability', label: 'Product Liability' },
    { key: 'dog_bite', label: 'Dog Bite' },
    { key: 'other', label: 'Other' },
  ];

  if (!editing && details) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Accident Info Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Accident Details</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          </div>
          <div className="card-body">
            <div className="pi-detail-grid">
              <div className="pi-detail-item">
                <span className="pi-detail-label">Date</span>
                <span className="pi-detail-value">{details.accident_date || '--'}</span>
              </div>
              <div className="pi-detail-item">
                <span className="pi-detail-label">Type</span>
                <span className="pi-detail-value" style={{ textTransform: 'capitalize' }}>
                  {(details.accident_type || '--').replace('_', ' ')}
                </span>
              </div>
              <div className="pi-detail-item">
                <span className="pi-detail-label">Location</span>
                <span className="pi-detail-value">{details.accident_location || '--'}</span>
              </div>
              <div className="pi-detail-item">
                <span className="pi-detail-label">Police Report #</span>
                <span className="pi-detail-value">{details.police_report_number || '--'}</span>
              </div>
              <div className="pi-detail-item">
                <span className="pi-detail-label">Weather</span>
                <span className="pi-detail-value">{details.weather_conditions || '--'}</span>
              </div>
              <div className="pi-detail-item">
                <span className="pi-detail-label">Comparative Fault</span>
                <span className="pi-detail-value">{details.comparative_fault_pct || 0}%</span>
              </div>
            </div>
            {details.accident_description && (
              <div style={{ marginTop: 16 }}>
                <span className="pi-detail-label">Description</span>
                <p style={{ marginTop: 4, color: 'var(--ink)', lineHeight: 1.5, fontSize: '0.88rem' }}>
                  {details.accident_description}
                </p>
              </div>
            )}
            {details.liability_assessment && (
              <div style={{ marginTop: 12 }}>
                <span className="pi-detail-label">Liability Assessment</span>
                <p style={{ marginTop: 4, color: 'var(--ink)', lineHeight: 1.5, fontSize: '0.88rem' }}>
                  {details.liability_assessment}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Insurance Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Insurance Information</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12, color: 'var(--warm-gray)' }}>Client's Insurance</h4>
                <div className="pi-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Company</span>
                    <span className="pi-detail-value">{details.insurance_company || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Policy #</span>
                    <span className="pi-detail-value">{details.insurance_policy_number || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Adjuster</span>
                    <span className="pi-detail-value">{details.insurance_adjuster || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Adjuster Phone</span>
                    <span className="pi-detail-value">{details.insurance_adjuster_phone || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Claim #</span>
                    <span className="pi-detail-value">{details.insurance_claim_number || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Coverage Limit</span>
                    <span className="pi-detail-value">${Number(details.insurance_coverage_limit || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12, color: 'var(--warm-gray)' }}>At-Fault Party Insurance</h4>
                <div className="pi-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">At-Fault Party</span>
                    <span className="pi-detail-value">{details.at_fault_party || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Insurance</span>
                    <span className="pi-detail-value">{details.at_fault_insurance || '--'}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">Policy Limit</span>
                    <span className="pi-detail-value">${Number(details.at_fault_policy_limit || 0).toLocaleString()}</span>
                  </div>
                  <div className="pi-detail-item">
                    <span className="pi-detail-label">UM/UIM</span>
                    <span className="pi-detail-value">
                      {details.um_uim_available ? `Available ($${Number(details.um_uim_limit || 0).toLocaleString()})` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit form
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Accident Details</span>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Accident Date</label>
              <input className="form-input" type="date" value={form.accidentDate} onChange={e => update('accidentDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Accident Type</label>
              <select className="form-select" value={form.accidentType} onChange={e => update('accidentType', e.target.value)}>
                {ACCIDENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input className="form-input" type="text" placeholder="Intersection, address, or description" value={form.accidentLocation} onChange={e => update('accidentLocation', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Describe the accident..." value={form.accidentDescription} onChange={e => update('accidentDescription', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Police Report #</label>
              <input className="form-input" type="text" value={form.policeReportNumber} onChange={e => update('policeReportNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Weather Conditions</label>
              <input className="form-input" type="text" placeholder="Clear, rainy, etc." value={form.weatherConditions} onChange={e => update('weatherConditions', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Comparative Fault %</label>
              <input className="form-input" type="number" min="0" max="100" value={form.comparativeFaultPct} onChange={e => update('comparativeFaultPct', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Liability Assessment</label>
            <textarea className="form-input" rows={2} placeholder="Notes on liability..." value={form.liabilityAssessment} onChange={e => update('liabilityAssessment', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Insurance Information</span>
        </div>
        <div className="card-body">
          <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12, color: 'var(--warm-gray)' }}>Client's Insurance</h4>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Insurance Company</label>
              <input className="form-input" type="text" value={form.insuranceCompany} onChange={e => update('insuranceCompany', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Policy Number</label>
              <input className="form-input" type="text" value={form.insurancePolicyNumber} onChange={e => update('insurancePolicyNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Coverage Limit ($)</label>
              <input className="form-input" type="number" value={form.insuranceCoverageLimit} onChange={e => update('insuranceCoverageLimit', e.target.value)} />
            </div>
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Adjuster Name</label>
              <input className="form-input" type="text" value={form.insuranceAdjuster} onChange={e => update('insuranceAdjuster', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Adjuster Phone</label>
              <input className="form-input" type="tel" value={form.insuranceAdjusterPhone} onChange={e => update('insuranceAdjusterPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Claim Number</label>
              <input className="form-input" type="text" value={form.insuranceClaimNumber} onChange={e => update('insuranceClaimNumber', e.target.value)} />
            </div>
          </div>

          <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12, marginTop: 20, color: 'var(--warm-gray)' }}>At-Fault Party</h4>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">At-Fault Party Name</label>
              <input className="form-input" type="text" value={form.atFaultParty} onChange={e => update('atFaultParty', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">At-Fault Insurance</label>
              <input className="form-input" type="text" value={form.atFaultInsurance} onChange={e => update('atFaultInsurance', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Policy Limit ($)</label>
              <input className="form-input" type="number" value={form.atFaultPolicyLimit} onChange={e => update('atFaultPolicyLimit', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="umUim" checked={form.umUimAvailable} onChange={e => update('umUimAvailable', e.target.checked)} />
              <label htmlFor="umUim" className="form-label" style={{ marginBottom: 0 }}>UM/UIM Coverage Available</label>
            </div>
            {form.umUimAvailable && (
              <div className="form-group">
                <label className="form-label">UM/UIM Limit ($)</label>
                <input className="form-input" type="number" value={form.umUimLimit} onChange={e => update('umUimLimit', e.target.value)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {details && <button className="btn btn-secondary" onClick={() => { setEditing(false); load(); }}>Cancel</button>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Details'}
        </button>
      </div>
    </div>
  );
}

// ─── Medical Records Tab ────────────────────────────────────────

export function MedicalRecordsTab({ caseId, onRefresh }) {
  const [records, setRecords] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    const data = await window.tabula.pi.medical.list(caseId);
    setRecords(data);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => ({
    providerName: '', providerType: 'hospital', treatmentType: '',
    firstVisit: '', lastVisit: '', totalVisits: 0,
    totalBilled: 0, totalPaid: 0, lienAmount: 0, hasLien: false,
    status: 'ongoing', notes: '',
  });

  const openNew = () => { setForm(resetForm()); setEditingRecord(null); setShowForm(true); };

  const openEdit = (record) => {
    setForm({
      id: record.id,
      providerName: record.provider_name || '',
      providerType: record.provider_type || 'hospital',
      treatmentType: record.treatment_type || '',
      firstVisit: record.first_visit || '',
      lastVisit: record.last_visit || '',
      totalVisits: record.total_visits || 0,
      totalBilled: record.total_billed || 0,
      totalPaid: record.total_paid || 0,
      lienAmount: record.lien_amount || 0,
      hasLien: !!record.has_lien,
      status: record.status || 'ongoing',
      notes: record.notes || '',
    });
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleSave = async () => {
    await window.tabula.pi.medical.upsert(caseId, form);
    setShowForm(false);
    load();
    onRefresh?.();
  };

  const handleDelete = async (id) => {
    if (!confirmAction('Delete this medical record? This cannot be undone.')) return;
    await window.tabula.pi.medical.delete(id);
    load();
    onRefresh?.();
  };

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowForm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  const totalBilled = records.reduce((s, r) => s + (r.total_billed || 0), 0);
  const totalPaid = records.reduce((s, r) => s + (r.total_paid || 0), 0);
  const totalLiens = records.filter(r => r.has_lien).reduce((s, r) => s + (r.lien_amount || 0), 0);

  const PROVIDER_TYPES = [
    'hospital', 'emergency_room', 'orthopedic', 'chiropractor', 'physical_therapy',
    'neurologist', 'pain_management', 'surgeon', 'imaging', 'pharmacy', 'other',
  ];

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Providers</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{records.length}</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Total Billed</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>${totalBilled.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Total Paid</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)' }}>${totalPaid.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Outstanding Liens</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber)' }}>${totalLiens.toLocaleString()}</div>
        </div>
      </div>

      {/* Records Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Medical Providers & Treatment</span>
          <button className="btn btn-sm btn-primary" onClick={openNew}>+ Add Provider</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {records.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p style={{ color: 'var(--warm-gray)' }}>No medical records yet. Add providers to track treatment.</p>
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Provider</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Visits</th>
                  <th style={thStyle}>First Visit</th>
                  <th style={thStyle}>Last Visit</th>
                  <th style={thStyle}>Billed</th>
                  <th style={thStyle}>Lien</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--cream)' }}>
                    <td style={tdStyle}><strong>{r.provider_name}</strong></td>
                    <td style={tdStyle}><span style={{ textTransform: 'capitalize', fontSize: '0.82rem' }}>{(r.provider_type || '').replace('_', ' ')}</span></td>
                    <td style={tdStyle}>{r.total_visits || 0}</td>
                    <td style={tdStyle}>{r.first_visit || '--'}</td>
                    <td style={tdStyle}>{r.last_visit || '--'}</td>
                    <td style={tdStyle}>${(r.total_billed || 0).toLocaleString()}</td>
                    <td style={tdStyle}>
                      {r.has_lien ? (
                        <span style={{ color: 'var(--amber)', fontWeight: 600 }}>${(r.lien_amount || 0).toLocaleString()}</span>
                      ) : '--'}
                    </td>
                    <td style={tdStyle}>
                      <span className={`pi-status-badge ${r.status}`}>
                        {(r.status || 'ongoing').replace('_', ' ')}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => handleDelete(r.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="pi-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="pi-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>{editingRecord ? 'Edit Provider' : 'Add Medical Provider'}</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Provider Name</label>
                <input className="form-input" type="text" placeholder="Dr. Smith / City Hospital" value={form.providerName} onChange={e => update('providerName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Provider Type</label>
                <select className="form-select" value={form.providerType} onChange={e => update('providerType', e.target.value)}>
                  {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Treatment Type</label>
              <input className="form-input" type="text" placeholder="e.g., Spinal adjustments, MRI, Surgery" value={form.treatmentType} onChange={e => update('treatmentType', e.target.value)} />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">First Visit</label>
                <input className="form-input" type="date" value={form.firstVisit} onChange={e => update('firstVisit', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Visit</label>
                <input className="form-input" type="date" value={form.lastVisit} onChange={e => update('lastVisit', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Total Visits</label>
                <input className="form-input" type="number" min="0" value={form.totalVisits} onChange={e => update('totalVisits', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Total Billed ($)</label>
                <input className="form-input" type="number" step="0.01" value={form.totalBilled} onChange={e => update('totalBilled', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Total Paid ($)</label>
                <input className="form-input" type="number" step="0.01" value={form.totalPaid} onChange={e => update('totalPaid', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => update('status', e.target.value)}>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="referred">Referred</option>
                  <option value="pending_records">Pending Records</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="hasLien" checked={form.hasLien} onChange={e => update('hasLien', e.target.checked)} />
                <label htmlFor="hasLien" className="form-label" style={{ marginBottom: 0 }}>Has Medical Lien</label>
              </div>
              {form.hasLien && (
                <div className="form-group">
                  <label className="form-label">Lien Amount ($)</label>
                  <input className="form-input" type="number" step="0.01" value={form.lienAmount} onChange={e => update('lienAmount', parseFloat(e.target.value) || 0)} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.providerName}>
                {editingRecord ? 'Update' : 'Add Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Case Valuation Tab ─────────────────────────────────────────

export function CaseValuationTab({ caseId, caseData }) {
  const [records, setRecords] = useState([]);
  const [details, setDetails] = useState(null);
  const [multiplier, setMultiplier] = useState(3);

  // 6 valuation parameters flagged by Sstieglitz
  const debtor = caseData?.debtors?.[0] || {};
  const calcAge = (dob) => {
    if (!dob) return '';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };
  const [plaintiffAge, setPlaintiffAge] = useState(calcAge(debtor.dob) || '');
  const [jurisdiction, setJurisdiction] = useState(caseData?.district || '');
  const [injurySeverity, setInjurySeverity] = useState('moderate');
  const [occupation, setOccupation] = useState('');
  const [annualIncome, setAnnualIncome] = useState('');

  // Verdict range estimation
  const [verdictEstimate, setVerdictEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    window.tabula.pi.medical.list(caseId).then(setRecords);
    window.tabula.pi.details.get(caseId).then(setDetails);
  }, [caseId]);

  const totalMedicals = records.reduce((s, r) => s + (r.total_billed || 0), 0);
  const totalLiens = records.filter(r => r.has_lien).reduce((s, r) => s + (r.lien_amount || 0), 0);
  const painSuffering = totalMedicals * multiplier;
  const faultPct = details?.comparative_fault_pct || 0;
  const grossValue = totalMedicals + painSuffering;
  const faultReduction = grossValue * (faultPct / 100);
  const netCaseValue = grossValue - faultReduction;

  // Settlement distribution (standard 33.3% contingency)
  const contingencyPct = 33.33;
  const attorneyFee = netCaseValue * (contingencyPct / 100);
  const estimatedCosts = 2500; // placeholder
  const netToClient = netCaseValue - attorneyFee - estimatedCosts - totalLiens;

  const policyLimit = details?.at_fault_policy_limit || 0;
  const umLimit = details?.um_uim_available ? (details?.um_uim_limit || 0) : 0;
  const maxRecovery = policyLimit + umLimit;

  const handleEstimateRange = async () => {
    setEstimating(true);
    try {
      const accType = (details?.accident_type || 'auto').replace('_', ' ');
      const injuries = records.map(r => r.treatment_type || r.provider_type || '').filter(Boolean).join(', ');
      const prompt = `You are a personal injury case valuation expert. Based on the following case parameters, estimate a realistic jury verdict and settlement range. Be specific about the dollar range and explain your reasoning briefly.

Case Parameters:
- Jurisdiction: ${jurisdiction || 'Unknown'}
- Accident Type: ${accType}
- Plaintiff Age: ${plaintiffAge || 'Unknown'}
- Injury Severity: ${injurySeverity}
- Occupation: ${occupation || 'Unknown'}
- Annual Income: ${annualIncome ? '$' + Number(annualIncome).toLocaleString() : 'Unknown'}
- Medical Specials to Date: $${totalMedicals.toLocaleString()}
- Total Medical Providers: ${records.length}
- Treatment Types: ${injuries || 'Not specified'}
- Comparative Fault: ${faultPct}%
- At-Fault Policy Limit: $${policyLimit.toLocaleString()}
- UM/UIM Available: ${umLimit > 0 ? '$' + umLimit.toLocaleString() : 'No'}
- Medical Liens: $${totalLiens.toLocaleString()}

Respond in this exact JSON format:
{
  "lowRange": <number>,
  "highRange": <number>,
  "medianEstimate": <number>,
  "confidence": "low|medium|high",
  "reasoning": "<2-3 sentences explaining the range>",
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "warnings": ["<any concerns about the case>"]
}`;

      const response = await window.tabula.ai.chat(caseId, prompt);
      // Parse JSON from Claude's response
      const text = typeof response === 'string' ? response : response?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        setVerdictEstimate(JSON.parse(jsonMatch[0]));
      }
    } catch (err) {
      console.error('Verdict estimation failed:', err);
      setVerdictEstimate({ error: err.message || 'Estimation failed' });
    }
    setEstimating(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Case Parameters — the 6 factors Sstieglitz flagged */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Case Parameters</span>
          <span className="text-xs text-muted">factors that drive comparable verdict matching</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Plaintiff Age</label>
              <input className="form-input" type="number" min="0" max="120" value={plaintiffAge} onChange={e => setPlaintiffAge(e.target.value)} placeholder="Auto-filled from DOB" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Jurisdiction (County)</label>
              <input className="form-input" type="text" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="e.g. Travis County, TX" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Injury Severity</label>
              <select className="form-select" value={injurySeverity} onChange={e => setInjurySeverity(e.target.value)}>
                <option value="soft_tissue">Soft Tissue (minor strain/sprain)</option>
                <option value="moderate">Moderate (herniation, fracture)</option>
                <option value="serious">Serious (surgery required)</option>
                <option value="severe">Severe (TBI, spinal cord)</option>
                <option value="catastrophic">Catastrophic (permanent disability)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Occupation</label>
              <input className="form-input" type="text" value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="e.g. Administrative assistant" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Annual Income</label>
              <input className="form-input" type="number" value={annualIncome} onChange={e => setAnnualIncome(e.target.value)} placeholder="e.g. 42000" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleEstimateRange}
                disabled={estimating}
                style={{ width: '100%', height: 40 }}
              >
                {estimating ? 'Estimating...' : 'Estimate Verdict Range'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Verdict Range Estimation Card */}
      {verdictEstimate && !verdictEstimate.error && (
        <div className="card" style={{ borderLeft: '4px solid var(--sage)' }}>
          <div className="card-header">
            <span className="card-title">AI-Estimated Verdict Range</span>
            <span className={`badge ${verdictEstimate.confidence === 'high' ? 'ready' : verdictEstimate.confidence === 'medium' ? 'in_progress' : 'intake'}`}>
              {verdictEstimate.confidence} confidence
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Low Estimate</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warm-gray)' }}>${Number(verdictEstimate.lowRange || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Median Estimate</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--sage)' }}>${Number(verdictEstimate.medianEstimate || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>High Estimate</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warm-gray)' }}>${Number(verdictEstimate.highRange || 0).toLocaleString()}</div>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--ink)', lineHeight: 1.6, marginBottom: 12 }}>
              {verdictEstimate.reasoning}
            </p>

            {verdictEstimate.keyFactors && verdictEstimate.keyFactors.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 }}>Key Factors</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {verdictEstimate.keyFactors.map((f, i) => (
                    <span key={i} style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 12, background: 'rgba(106,138,100,0.1)', color: 'var(--sage)' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {verdictEstimate.warnings && verdictEstimate.warnings.length > 0 && (
              <div>
                {verdictEstimate.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 10px', background: 'rgba(196,124,72,0.06)', borderRadius: 4, marginBottom: 4, fontSize: '0.82rem', color: 'var(--accent)' }}>
                    <span style={{ fontWeight: 600 }}>!</span> {w}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(10,10,10,0.03)', borderRadius: 4, fontSize: '0.75rem', color: 'var(--warm-gray)' }}>
              AI-estimated range based on case parameters. Not a legal citation. Verify with jurisdiction-specific verdict research before including in demand.
            </div>
          </div>
        </div>
      )}

      {verdictEstimate?.error && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="card-body">
            <p style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>Verdict estimation failed: {verdictEstimate.error}</p>
          </div>
        </div>
      )}

      {/* Damages Calculator */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Case Valuation Calculator</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Damages</h4>
              <div className="pi-calc-row">
                <span>Medical Specials</span>
                <span className="pi-calc-value">${totalMedicals.toLocaleString()}</span>
              </div>
              <div className="pi-calc-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Pain & Suffering (
                  <select value={multiplier} onChange={e => setMultiplier(parseFloat(e.target.value))} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--cream)', fontSize: '0.82rem' }}>
                    {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(m => <option key={m} value={m}>{m}x</option>)}
                  </select>
                  )
                </span>
                <span className="pi-calc-value">${painSuffering.toLocaleString()}</span>
              </div>
              <div className="pi-calc-divider" />
              <div className="pi-calc-row" style={{ fontWeight: 700 }}>
                <span>Gross Case Value</span>
                <span className="pi-calc-value">${grossValue.toLocaleString()}</span>
              </div>
              {faultPct > 0 && (
                <div className="pi-calc-row" style={{ color: 'var(--red)' }}>
                  <span>Comparative Fault ({faultPct}%)</span>
                  <span className="pi-calc-value">-${faultReduction.toLocaleString()}</span>
                </div>
              )}
              <div className="pi-calc-row pi-calc-total">
                <span>Net Case Value</span>
                <span className="pi-calc-value">${netCaseValue.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Settlement Distribution</h4>
              <div className="pi-calc-row">
                <span>Gross Recovery</span>
                <span className="pi-calc-value">${netCaseValue.toLocaleString()}</span>
              </div>
              <div className="pi-calc-row" style={{ color: 'var(--red)' }}>
                <span>Attorney Fee ({contingencyPct}%)</span>
                <span className="pi-calc-value">-${attorneyFee.toLocaleString()}</span>
              </div>
              <div className="pi-calc-row" style={{ color: 'var(--red)' }}>
                <span>Estimated Costs</span>
                <span className="pi-calc-value">-${estimatedCosts.toLocaleString()}</span>
              </div>
              {totalLiens > 0 && (
                <div className="pi-calc-row" style={{ color: 'var(--amber)' }}>
                  <span>Medical Liens</span>
                  <span className="pi-calc-value">-${totalLiens.toLocaleString()}</span>
                </div>
              )}
              <div className="pi-calc-divider" />
              <div className="pi-calc-row pi-calc-total" style={{ color: 'var(--green)' }}>
                <span>Net to Client</span>
                <span className="pi-calc-value">${Math.max(0, netToClient).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Policy Limits Analysis */}
      {policyLimit > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recovery Analysis</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Case Value</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>${netCaseValue.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Max Recovery (Policy Limits)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: maxRecovery >= netCaseValue ? 'var(--green)' : 'var(--red)' }}>
                  ${maxRecovery.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--warm-gray)', marginBottom: 4 }}>Coverage Gap</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: netCaseValue > maxRecovery ? 'var(--red)' : 'var(--green)' }}>
                  {netCaseValue > maxRecovery ? `-$${(netCaseValue - maxRecovery).toLocaleString()}` : 'Fully Covered'}
                </div>
              </div>
            </div>
            {netCaseValue > maxRecovery && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--red-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--red)' }}>
                Case value exceeds available policy limits. Consider UM/UIM claim, personal assets of at-fault party, or umbrella/excess policies.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settlement Tracker Tab ─────────────────────────────────────

export function SettlementTab({ caseId, onRefresh }) {
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', type: 'demand', fromParty: '', amount: '', notes: '' });

  const load = useCallback(async () => {
    const data = await window.tabula.pi.settlements.list(caseId);
    setEntries(data);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowForm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    await window.tabula.pi.settlements.create(caseId, {
      ...form,
      amount: parseFloat(form.amount) || 0,
    });
    setShowForm(false);
    setForm({ date: '', type: 'demand', fromParty: '', amount: '', notes: '' });
    load();
    onRefresh?.();
  };

  const handleDelete = async (id) => {
    if (!confirmAction('Delete this settlement entry?')) return;
    await window.tabula.pi.settlements.delete(id);
    load();
  };

  const demands = entries.filter(e => e.type === 'demand');
  const offers = entries.filter(e => e.type === 'offer');
  const counters = entries.filter(e => e.type === 'counter');

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Negotiation Log</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>+ Add Entry</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {entries.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p style={{ color: 'var(--warm-gray)' }}>No settlement activity yet. Start by logging a demand.</p>
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              {/* Visual negotiation timeline */}
              <div className="pi-negotiation-timeline">
                {entries.map((entry, i) => (
                  <div key={entry.id} className="pi-negotiation-entry">
                    <div className={`pi-neg-dot ${entry.type}`} />
                    <div className="pi-neg-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className={`pi-neg-type ${entry.type}`}>{entry.type.toUpperCase()}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--warm-gray)', marginLeft: 8 }}>
                            {entry.date} {entry.from_party ? `\u2014 ${entry.from_party}` : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>${(entry.amount || 0).toLocaleString()}</span>
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)', padding: 4 }} onClick={() => handleDelete(entry.id)}>&times;</button>
                        </div>
                      </div>
                      {entry.notes && <p style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--warm-gray)' }}>{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      {showForm && (
        <div className="pi-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="pi-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Log Settlement Activity</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => update('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => update('type', e.target.value)}>
                  <option value="demand">Demand</option>
                  <option value="offer">Offer</option>
                  <option value="counter">Counteroffer</option>
                  <option value="final">Final Settlement</option>
                  <option value="mediation">Mediation Result</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From Party</label>
                <input className="form-input" type="text" placeholder="Insurance company, adjuster..." value={form.fromParty} onChange={e => update('fromParty', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount ($)</label>
                <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.date || !form.amount}>Add Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deadlines / Statute of Limitations Tab ─────────────────────

export function PIDeadlinesTab({ caseId, onRefresh }) {
  const [statutes, setStatutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ statuteType: 'personal_injury', jurisdiction: '', deadline: '', notes: '' });

  const load = useCallback(async () => {
    const data = await window.tabula.pi.statutes.list(caseId);
    setStatutes(data);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowForm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    await window.tabula.pi.statutes.upsert(caseId, form);
    setShowForm(false);
    setForm({ statuteType: 'personal_injury', jurisdiction: '', deadline: '', notes: '' });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirmAction('Delete this statute / deadline entry?')) return;
    await window.tabula.pi.statutes.delete(id);
    load();
  };

  const STATUTE_TYPES = [
    { key: 'personal_injury', label: 'Personal Injury SOL' },
    { key: 'wrongful_death', label: 'Wrongful Death SOL' },
    { key: 'property_damage', label: 'Property Damage SOL' },
    { key: 'med_malpractice', label: 'Medical Malpractice SOL' },
    { key: 'gov_claim', label: 'Government Tort Claim' },
    { key: 'um_uim', label: 'UM/UIM Deadline' },
    { key: 'demand_response', label: 'Demand Response Deadline' },
    { key: 'discovery', label: 'Discovery Deadline' },
    { key: 'trial', label: 'Trial Date' },
    { key: 'other', label: 'Other Deadline' },
  ];

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Deadlines & Statutes of Limitations</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>+ Add Deadline</button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {statutes.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p style={{ color: 'var(--warm-gray)' }}>No deadlines tracked yet. Add statute of limitations and key dates.</p>
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              {statutes.map(s => {
                const isOverdue = s.deadline < today && !s.filed_date;
                const isUrgent = !isOverdue && s.deadline && !s.filed_date && new Date(s.deadline) - new Date() < 30 * 24 * 60 * 60 * 1000;
                return (
                  <div key={s.id} className={`pi-deadline-card ${isOverdue ? 'overdue' : isUrgent ? 'urgent' : s.filed_date ? 'filed' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {STATUTE_TYPES.find(t => t.key === s.statute_type)?.label || s.statute_type}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--warm-gray)', marginTop: 2 }}>
                          {s.jurisdiction && `${s.jurisdiction} \u2014 `}
                          Deadline: <strong>{s.deadline}</strong>
                          {s.filed_date && <span style={{ color: 'var(--green)', marginLeft: 8 }}>Filed: {s.filed_date}</span>}
                        </div>
                        {s.notes && <div style={{ fontSize: '0.8rem', color: 'var(--warm-gray)', marginTop: 4 }}>{s.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isOverdue && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.8rem' }}>OVERDUE</span>}
                        {isUrgent && <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '0.8rem' }}>URGENT</span>}
                        {s.filed_date && <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.8rem' }}>COMPLETE</span>}
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)' }} onClick={() => handleDelete(s.id)}>&times;</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="pi-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="pi-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Add Deadline</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.statuteType} onChange={e => update('statuteType', e.target.value)}>
                  {STATUTE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Jurisdiction</label>
                <input className="form-input" type="text" placeholder="State / County" value={form.jurisdiction} onChange={e => update('jurisdiction', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Deadline</label>
                <input className="form-input" type="date" value={form.deadline} onChange={e => update('deadline', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Filed Date (if applicable)</label>
                <input className="form-input" type="date" value={form.filedDate || ''} onChange={e => update('filedDate', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.deadline}>Add Deadline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────

const thStyle = {
  textAlign: 'left', padding: '10px 12px', fontSize: '0.75rem',
  fontWeight: 600, color: 'var(--warm-gray)', textTransform: 'uppercase',
  letterSpacing: '0.03em', borderBottom: '2px solid var(--cream)',
};

const tdStyle = {
  padding: '10px 12px', fontSize: '0.85rem', verticalAlign: 'middle',
};
