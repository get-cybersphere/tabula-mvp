import React, { useState, useEffect } from 'react';

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const CasesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const DocumentsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function Sidebar({ navigate, currentPage }) {
  const [stats, setStats] = useState({ total: 0, intake: 0, inProgress: 0, ready: 0, filed: 0 });

  useEffect(() => {
    window.tabula.stats.overview().then(setStats);
  }, [currentPage]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">Tabula</div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Workspace</div>

        <div
          className={`sidebar-link ${currentPage === 'dashboard' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <DashboardIcon />
          Dashboard
        </div>

        <div
          className={`sidebar-link ${currentPage === 'dashboard' ? '' : ''}`}
          onClick={() => navigate('/')}
        >
          <CasesIcon />
          All Cases
          <span className="sidebar-badge">{stats.total}</span>
        </div>

        <div className="sidebar-section-label">Tools</div>

        <div
          className={`sidebar-link ${currentPage === 'means-test' ? 'active' : ''}`}
          onClick={() => navigate('/means-test')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="3" x2="12" y2="21" />
            <polyline points="1 14 12 3 23 14" />
            <path d="M1 14a5 5 0 0 0 10 0" />
            <path d="M13 14a5 5 0 0 0 10 0" />
          </svg>
          Means Test
        </div>

        <div className="sidebar-section-label">Pipeline</div>

        <div className="sidebar-link" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Intake
          <span className="sidebar-badge">{stats.intake}</span>
        </div>

        <div className="sidebar-link" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          In Progress
          <span className="sidebar-badge">{stats.inProgress}</span>
        </div>

        <div className="sidebar-link" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Ready to File
          <span className="sidebar-badge">{stats.ready}</span>
        </div>

        <div className="sidebar-link" onClick={() => navigate('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
          Filed
          <span className="sidebar-badge">{stats.filed}</span>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-new-case" onClick={() => navigate('/cases/new')}>
          <PlusIcon />
          New Case
        </button>
      </div>
    </aside>
  );
}
