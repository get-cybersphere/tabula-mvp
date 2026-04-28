import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewCase from './pages/NewCase.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import MeansTest from './pages/MeansTest.jsx';
import Analytics from './pages/Analytics.jsx';
import TabulaAI from './pages/TabulaAI.jsx';
import { ToastProvider } from './lib/toast.jsx';

export default function App() {
  const [route, setRoute] = useState({ page: 'dashboard', params: {} });

  const navigate = useCallback((path, params = {}) => {
    if (path === '/' || path.startsWith('/?')) {
      setRoute({ page: 'dashboard', params });
    } else if (path === '/cases/new') {
      setRoute({ page: 'new-case', params: {} });
    } else if (path === '/ai') {
      setRoute({ page: 'tabula-ai', params });
    } else if (path === '/means-test') {
      setRoute({ page: 'means-test', params: {} });
    } else if (path === '/analytics') {
      setRoute({ page: 'analytics', params: {} });
    } else if (path.startsWith('/cases/')) {
      const parts = path.replace('/cases/', '').split('/');
      const id = parts[0];
      const tab = parts[1] || null;
      setRoute({ page: 'case-detail', params: { id, tab } });
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
        return <Dashboard navigate={navigate} initialFilter={route.params.filter} />;
      case 'new-case':
        return <NewCase navigate={navigate} />;
      case 'case-detail':
        return <CaseDetail caseId={route.params.id} initialTab={route.params.tab} navigate={navigate} />;
      case 'tabula-ai':
        return <TabulaAI navigate={navigate} initialTab={route.params.tab} />;
      case 'means-test':
        return <MeansTest navigate={navigate} />;
      case 'analytics':
        return <Analytics navigate={navigate} />;
      default:
        return <Dashboard navigate={navigate} initialFilter={route.params.filter} />;
    }
  };

  return (
    <ToastProvider>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <div className="app-shell">
        <Sidebar navigate={navigate} currentPage={route.page} />
        <main className="main-content" id="main-content" tabIndex="-1">
          {renderPage()}
        </main>
      </div>
    </ToastProvider>
  );
}
