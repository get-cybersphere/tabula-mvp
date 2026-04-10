import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewCase from './pages/NewCase.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import MeansTest from './pages/MeansTest.jsx';

export default function App() {
  const [route, setRoute] = useState({ page: 'dashboard', params: {} });

  const navigate = useCallback((path, params = {}) => {
    if (path === '/') {
      setRoute({ page: 'dashboard', params: {} });
    } else if (path === '/cases/new') {
      setRoute({ page: 'new-case', params: {} });
    } else if (path === '/means-test') {
      setRoute({ page: 'means-test', params: {} });
    } else if (path.startsWith('/cases/')) {
      const id = path.replace('/cases/', '');
      setRoute({ page: 'case-detail', params: { id } });
    } else {
      setRoute({ page: path.replace('/', ''), params });
    }
  }, []);

  // Listen for menu-bar navigation (Cmd+N → New Case)
  useEffect(() => {
    const cleanup = window.tabula.onNavigate((path) => {
      navigate(path);
    });
    return cleanup;
  }, [navigate]);

  const renderPage = () => {
    switch (route.page) {
      case 'dashboard':
        return <Dashboard navigate={navigate} />;
      case 'new-case':
        return <NewCase navigate={navigate} />;
      case 'case-detail':
        return <CaseDetail caseId={route.params.id} navigate={navigate} />;
      case 'means-test':
        return <MeansTest navigate={navigate} />;
      default:
        return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar navigate={navigate} currentPage={route.page} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
