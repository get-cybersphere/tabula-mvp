import React, { useState, useEffect } from 'react';

export default function Sidebar({ navigate, currentPage }) {
  const [stats, setStats] = useState({ total: 0, intake: 0, inProgress: 0, ready: 0, filed: 0 });
  const [casesExpanded, setCasesExpanded] = useState(true);

  useEffect(() => {
    window.tabula.stats.overview().then(setStats);
  }, [currentPage]);

  const isAI = currentPage === 'tabula-ai';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">Tabula</div>
      </div>

      {/* + Create button */}
      <div className="sidebar-create-wrap">
        <button className="sidebar-create-btn" onClick={() => navigate('/cases/new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* Assistant — like Harvey's top-level */}
        <div
          className={`sidebar-link sidebar-link-primary ${isAI ? 'active' : ''}`}
          onClick={() => navigate('/ai')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Assistant
        </div>

        {/* Cases — pipeline of matters */}
        <div
          className={`sidebar-link ${currentPage === 'dashboard' && !isAI ? 'active' : ''}`}
          onClick={() => { setCasesExpanded(!casesExpanded); navigate('/'); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Cases
        </div>

        {/* Sub-items under Cases — pipeline statuses */}
        {casesExpanded && (
          <div className="sidebar-sub-items">
            <div className="sidebar-sub-link" onClick={() => navigate('/', { filter: 'intake' })}>
              Intake
              <span className="sidebar-badge">{stats.intake}</span>
            </div>
            <div className="sidebar-sub-link" onClick={() => navigate('/', { filter: 'in_progress' })}>
              In Progress
              <span className="sidebar-badge">{stats.inProgress}</span>
            </div>
            <div className="sidebar-sub-link" onClick={() => navigate('/', { filter: 'ready' })}>
              Ready to File
              <span className="sidebar-badge">{stats.ready}</span>
            </div>
            <div className="sidebar-sub-link" onClick={() => navigate('/', { filter: 'filed' })}>
              Filed
              <span className="sidebar-badge">{stats.filed}</span>
            </div>
          </div>
        )}

        {/* History */}
        <div
          className={`sidebar-link ${currentPage === 'analytics' ? 'active' : ''}`}
          onClick={() => navigate('/analytics')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          History
        </div>

        {/* Means Test — eligibility wizard */}
        <div
          className={`sidebar-link ${currentPage === 'means-test' ? 'active' : ''}`}
          onClick={() => navigate('/means-test')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Means Test
        </div>
      </nav>
    </aside>
  );
}
