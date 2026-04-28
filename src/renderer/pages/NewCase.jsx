import React, { useState } from 'react';
import { useToast } from '../lib/toast.jsx';

const DISTRICTS = [
  'N.D. Alabama', 'M.D. Alabama', 'S.D. Alabama', 'D. Alaska', 'D. Arizona',
  'E.D. Arkansas', 'W.D. Arkansas', 'C.D. California', 'E.D. California',
  'N.D. California', 'S.D. California', 'D. Colorado', 'D. Connecticut',
  'D. Delaware', 'M.D. Florida', 'N.D. Florida', 'S.D. Florida',
  'M.D. Georgia', 'N.D. Georgia', 'S.D. Georgia', 'D. Hawaii', 'D. Idaho',
  'C.D. Illinois', 'N.D. Illinois', 'S.D. Illinois', 'N.D. Indiana',
  'S.D. Indiana', 'N.D. Iowa', 'S.D. Iowa', 'D. Kansas', 'E.D. Kentucky',
  'W.D. Kentucky', 'E.D. Louisiana', 'M.D. Louisiana', 'W.D. Louisiana',
  'D. Maine', 'D. Maryland', 'D. Massachusetts', 'E.D. Michigan',
  'W.D. Michigan', 'D. Minnesota', 'N.D. Mississippi', 'S.D. Mississippi',
  'E.D. Missouri', 'W.D. Missouri', 'D. Montana', 'D. Nebraska',
  'D. Nevada', 'D. New Hampshire', 'D. New Jersey', 'D. New Mexico',
  'E.D. New York', 'N.D. New York', 'S.D. New York', 'W.D. New York',
  'E.D. North Carolina', 'M.D. North Carolina', 'W.D. North Carolina',
  'D. North Dakota', 'N.D. Ohio', 'S.D. Ohio', 'E.D. Oklahoma',
  'N.D. Oklahoma', 'W.D. Oklahoma', 'D. Oregon', 'E.D. Pennsylvania',
  'M.D. Pennsylvania', 'W.D. Pennsylvania', 'D. Rhode Island',
  'D. South Carolina', 'D. South Dakota', 'E.D. Tennessee',
  'M.D. Tennessee', 'W.D. Tennessee', 'E.D. Texas', 'N.D. Texas',
  'S.D. Texas', 'W.D. Texas', 'D. Utah', 'D. Vermont', 'E.D. Virginia',
  'W.D. Virginia', 'E.D. Washington', 'W.D. Washington',
  'N.D. West Virginia', 'S.D. West Virginia', 'E.D. Wisconsin',
  'W.D. Wisconsin', 'D. Wyoming',
];

export default function NewCase({ navigate }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    ssn: '',
    dob: '',
    phone: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    chapter: 7,
    district: '',
    practiceType: 'bankruptcy',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.firstName.trim()) next.firstName = 'First name is required';
    if (!form.lastName.trim()) next.lastName = 'Last name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Enter a valid email address';
    }
    if (form.zip && !/^\d{5}(-\d{4})?$/.test(form.zip)) {
      next.zip = 'Use a 5- or 9-digit ZIP';
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      const firstField = Object.keys(validation)[0];
      const el = document.querySelector(`[name="${firstField}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
      return;
    }
    setSaving(true);
    try {
      const result = await window.tabula.cases.create({
        chapter: form.practiceType === 'bankruptcy' ? form.chapter : null,
        district: form.practiceType === 'bankruptcy' ? form.district : null,
        practiceType: form.practiceType,
        debtor: {
          firstName: form.firstName,
          lastName: form.lastName,
          ssn: form.ssn,
          dob: form.dob,
          phone: form.phone,
          email: form.email,
          street: form.street,
          city: form.city,
          state: form.state,
          zip: form.zip,
        },
      });
      toast.success('Case created');
      navigate(`/cases/${result.id}`);
    } catch (err) {
      console.error('Failed to create case:', err);
      toast.error(`Failed to create case: ${err.message || 'unknown error'}`);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Case</h1>
          <p className="page-subtitle">
            {form.practiceType === 'bankruptcy' ? 'Enter debtor information to create a new bankruptcy case' :
             form.practiceType === 'personal_injury' ? 'Enter client and accident information to open a new PI case' :
             form.practiceType === 'estate_administration' ? 'Enter decedent and fiduciary information to open an estate case' :
             'Enter client information to create a new case'}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Case Information</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Practice Area</label>
              <div className="filter-pills" style={{ marginBottom: 16 }}>
                {[
                  { key: 'bankruptcy', label: 'Bankruptcy' },
                  { key: 'personal_injury', label: 'Personal Injury' },
                  { key: 'estate_administration', label: 'Estate Administration' },
                  { key: 'general', label: 'General / Other' },
                ].map(p => (
                  <button
                    key={p.key}
                    type="button"
                    className={`filter-pill ${form.practiceType === p.key ? 'active' : ''}`}
                    onClick={() => update('practiceType', p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {form.practiceType === 'bankruptcy' && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Chapter</label>
                  <select
                    className="form-select"
                    value={form.chapter}
                    onChange={(e) => update('chapter', parseInt(e.target.value))}
                  >
                    <option value={7}>Chapter 7 — Liquidation</option>
                    <option value={13}>Chapter 13 — Wage Earner Plan</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">District</label>
                  <select
                    className="form-select"
                    value={form.district}
                    onChange={(e) => update('district', e.target.value)}
                  >
                    <option value="">Select district...</option>
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">{form.practiceType === 'bankruptcy' ? 'Debtor' : 'Client'} Information</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  className="form-input"
                  type="text"
                  name="firstName"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  aria-invalid={!!errors.firstName}
                  required
                />
                {errors.firstName && <FieldError text={errors.firstName} />}
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  className="form-input"
                  type="text"
                  name="lastName"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  aria-invalid={!!errors.lastName}
                  required
                />
                {errors.lastName && <FieldError text={errors.lastName} />}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Social Security Number</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="XXX-XX-XXXX"
                  value={form.ssn}
                  onChange={(e) => update('ssn', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.dob}
                  onChange={(e) => update('dob', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  name="email"
                  placeholder="debtor@email.com"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <FieldError text={errors.email} />}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Address</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Street Address</label>
              <input
                className="form-input"
                type="text"
                placeholder="123 Main Street, Apt 4B"
                value={form.street}
                onChange={(e) => update('street', e.target.value)}
              />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">City</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="TX"
                  maxLength="2"
                  value={form.state}
                  onChange={(e) => update('state', e.target.value.toUpperCase())}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ZIP Code</label>
                <input
                  className="form-input"
                  type="text"
                  name="zip"
                  placeholder="75001"
                  maxLength="10"
                  value={form.zip}
                  onChange={(e) => update('zip', e.target.value)}
                  aria-invalid={!!errors.zip}
                />
                {errors.zip && <FieldError text={errors.zip} />}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldError({ text }) {
  return (
    <div role="alert" style={{
      marginTop: 6, fontSize: '0.78rem', color: 'var(--accent)',
    }}>
      {text}
    </div>
  );
}
