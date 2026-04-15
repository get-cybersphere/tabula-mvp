import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { computeUpcomingDeadlines } from '../lib/deadlines.js';

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

/** Pill showing completeness percentage + missing-items badge. */
function CompletenessChip({ score, missingCount, readyToFile }) {
  // Color progression: red → amber → sage as we approach 100%
  const color =
    readyToFile ? 'var(--sage)' :
    score >= 75 ? 'var(--amber)' :
    score >= 40 ? 'var(--blue)' :
    'var(--accent)';
  const bg =
    readyToFile ? 'rgba(106, 138, 100, 0.12)' :
    score >= 75 ? 'rgba(204, 153, 51, 0.12)' :
    score >= 40 ? 'rgba(66, 99, 140, 0.10)' :
    'rgba(196, 124, 72, 0.10)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 12,
        background: bg, color,
        fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--mono)',
      }}>
        {score}%
      </div>
      {missingCount > 0 && (
        <span className="text-xs" style={{ color: 'var(--warm-gray)' }}>
          {missingCount} missing
        </span>
      )}
      {readyToFile && (
        <span className="text-xs" style={{ color: 'var(--sage)', fontWeight: 500 }}>
          ready
        </span>
      )}
    </div>
  );
}

export default function Dashboard({ navigate, initialFilter }) {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total: 0, intake: 0, inProgress: 0, ready: 0, filed: 0 });
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'all');
  const [search, setSearch] = useState('');

  const [recentEvents, setRecentEvents] = useState([]);
  const [allCases, setAllCases] = useState([]);

  const loadData = useCallback(async () => {
    // Load all cases (for deadlines) + filtered cases (for the table) + stats + recent activity.
    const [caseList, overview, allCaseList, events] = await Promise.all([
      window.tabula.cases.list({ status: statusFilter, search }),
      window.tabula.stats.overview(),
      window.tabula.cases.list({ status: 'all', search: '' }),
      window.tabula.events.recent(12),
    ]);
    setCases(caseList);
    setStats(overview);
    setAllCases(allCaseList);
    setRecentEvents(events || []);
  }, [statusFilter, search]);

  useEffect(() => {
    if (initialFilter) setStatusFilter(initialFilter);
  }, [initialFilter]);

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

      {/* Firm-wide deadlines + recent activity row */}
      <DashboardInsights cases={allCases} events={recentEvents} navigate={navigate} />


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
                <th>Completeness</th>
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
                  <td>
                    <CompletenessChip
                      score={c.completeness || 0}
                      missingCount={c.missing_count || 0}
                      readyToFile={!!c.ready_to_file}
                    />
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

/** Two-column panel: upcoming deadlines + recent activity across the firm. */
function DashboardInsights({ cases, events, navigate }) {
  const upcoming = computeUpcomingDeadlines(cases || [], undefined, 8);
  if (upcoming.length === 0 && events.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 24 }}>
      {/* Deadlines */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Upcoming Deadlines</span>
          <span className="text-xs text-muted">across all filed cases</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted" style={{ padding: 20 }}>
              No upcoming statutory deadlines. Deadlines appear after a case is filed.
            </p>
          ) : (
            upcoming.map((d, i) => (
              <div
                key={`${d.case_id}-${d.key}`}
                onClick={() => navigate(`/cases/${d.case_id}`)}
                style={{
                  display: 'flex', gap: 14, alignItems: 'center',
                  padding: '10px 22px',
                  borderBottom: i === upcoming.length - 1 ? 'none' : '1px solid rgba(10,10,10,0.04)',
                  borderLeft: `3px solid ${deadlineColor(d)}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{d.label}</div>
                  <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {d.debtor_name} · Ch. {d.chapter}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="text-sm" style={{ fontFamily: 'var(--mono)' }}>
                    {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-xs" style={{ color: deadlineColor(d), fontWeight: 500 }}>
                    {d.status === 'overdue'
                      ? `${Math.abs(d.daysFromNow)}d overdue`
                      : d.daysFromNow === 0 ? 'today' : `in ${d.daysFromNow}d`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Activity</span>
        </div>
        <div className="card-body" style={{ padding: 0, maxHeight: 360, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <p className="text-sm text-muted" style={{ padding: 20 }}>
              Upload documents or update cases to see activity here.
            </p>
          ) : (
            events.map((ev, i) => (
              <div
                key={ev.id}
                onClick={() => navigate(`/cases/${ev.case_id}`)}
                style={{
                  padding: '10px 22px',
                  borderBottom: i === events.length - 1 ? 'none' : '1px solid rgba(10,10,10,0.04)',
                  cursor: 'pointer',
                }}
              >
                <div className="text-sm" style={{ fontWeight: 500 }}>{ev.description}</div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  {[ev.first_name, ev.last_name].filter(Boolean).join(' ')} · {formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: true })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function deadlineColor(d) {
  if (d.status === 'overdue') return 'var(--accent)';
  if (d.severity === 'critical' && d.daysFromNow <= 14) return 'var(--accent)';
  if (d.severity === 'critical' || d.severity === 'high') return 'var(--amber)';
  if (d.severity === 'medium') return 'var(--blue)';
  return 'var(--warm-gray)';
}

