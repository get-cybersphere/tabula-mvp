import React, { useState } from 'react';

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
  });
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) return;
    setSaving(true);
    try {
      const result = await window.tabula.cases.create({
        chapter: form.chapter,
        district: form.district,
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
      navigate(`/cases/${result.id}`);
    } catch (err) {
      console.error('Failed to create case:', err);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Case</h1>
          <p className="page-subtitle">Enter debtor information to create a new bankruptcy case</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Filing Information</span>
          </div>
          <div className="card-body">
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
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Debtor Information</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  required
                />
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
                  placeholder="debtor@email.com"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
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
                  placeholder="75001"
                  maxLength="10"
                  value={form.zip}
                  onChange={(e) => update('zip', e.target.value)}
                />
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
