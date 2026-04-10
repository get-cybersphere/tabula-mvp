import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_LABELS = {
  all: 'All Cases',
  intake: 'Intake',
  in_progress: 'In Progress',
  ready: 'Ready to File',
  filed: 'Filed',
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export default function Dashboard({ navigate }) {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total: 0, intake: 0, inProgress: 0, ready: 0, filed: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    const [caseList, overview] = await Promise.all([
      window.tabula.cases.list({ status: statusFilter, search }),
      window.tabula.stats.overview(),
    ]);
    setCases(caseList);
    setStats(overview);
  }, [statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateStr) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cases</h1>
          <p className="page-subtitle">{stats.total} total cases in your workspace</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cases/new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Case
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Cases</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Intake</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{stats.intake}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.inProgress}</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-label">Ready to File</div>
          <div className="stat-value">{stats.ready}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="filter-pills">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`filter-pill ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="search-bar">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Cases Table */}
      {cases.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Debtor</th>
                <th>Chapter</th>
                <th>District</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)}>
                  <td>
                    <span className="debtor-name">
                      {c.first_name} {c.last_name}
                      {c.case_number && <span>#{c.case_number}</span>}
                    </span>
                  </td>
                  <td><span className="chapter-badge">Ch. {c.chapter}</span></td>
                  <td className="text-sm text-muted">{c.district || '—'}</td>
                  <td>
                    <span className={`badge ${c.status}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="text-sm text-muted">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <h3>No cases yet</h3>
            <p>Create your first case to get started with petition preparation.</p>
            <button className="btn btn-primary" onClick={() => navigate('/cases/new')}>
              Create First Case
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
