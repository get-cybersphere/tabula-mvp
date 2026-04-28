import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Tabula AI — Harvey-style Command Center ──────────────────
   Full-page AI co-counsel. Clean, minimal, high-end.
──────────────────────────────────────────────────────────────── */

// Only sources that are actually wired into the AI context.
// Add new ones here once they're connected to the main process.
const SOURCES = [
  { key: 'case_files', label: 'Case Files', color: '#3b6cb5', connected: true },
];

const WORKFLOWS = {
  bankruptcy: [
    { id: 'means_test', title: 'Run Means Test Analysis', desc: 'Analyze income, expenses, and determine Ch. 7 eligibility', steps: 3, type: 'Analysis' },
    { id: 'exemption_plan', title: 'Build Exemption Strategy', desc: 'State-specific asset protection with statute citations', steps: 4, type: 'Strategy' },
    { id: 'creditor_audit', title: 'Audit Creditor Matrix', desc: 'Verify schedules, flag preference payments & non-dischargeable debts', steps: 3, type: 'Review' },
    { id: 'petition_review', title: 'Pre-Filing Petition Review', desc: 'Comprehensive review of all schedules and statements', steps: 5, type: 'Review' },
  ],
  personal_injury: [
    { id: 'demand_letter', title: 'Draft Demand Letter', desc: 'Itemized damages, medical chronology, and liability analysis', steps: 5, type: 'Draft' },
    { id: 'case_valuation', title: 'Full Case Valuation', desc: 'Multiplier analysis and settlement range projection', steps: 4, type: 'Analysis' },
    { id: 'med_summary', title: 'Medical Record Summary', desc: 'Treatment timeline with causal connection analysis', steps: 3, type: 'Review' },
    { id: 'lien_resolution', title: 'Lien Resolution Strategy', desc: 'Identify, verify, and negotiate all liens', steps: 4, type: 'Strategy' },
  ],
  general: [
    { id: 'case_memo', title: 'Draft Case Memo', desc: 'Legal memorandum analyzing facts, issues, and strategy', steps: 4, type: 'Draft' },
    { id: 'timeline', title: 'Build Case Timeline', desc: 'Chronological event timeline from case documents', steps: 3, type: 'Analysis' },
    { id: 'research', title: 'Legal Research Brief', desc: 'Relevant statutes, case law, and analysis', steps: 4, type: 'Research' },
    { id: 'client_letter', title: 'Draft Client Letter', desc: 'Professional correspondence on case status', steps: 2, type: 'Draft' },
  ],
};

const PROMPTS = {
  bankruptcy: [
    { label: 'Means test eligibility', prompt: 'Analyze this debtor\'s means test eligibility. Consider current monthly income, allowed deductions under IRS standards, and determine if they pass the Chapter 7 means test.' },
    { label: 'Exemption analysis', prompt: 'What exemptions are available in this state? List each applicable exemption statute, the maximum protection amount, and flag any non-exempt assets.' },
    { label: 'Non-dischargeable debts', prompt: 'Identify any debts that may be non-dischargeable under §523. Analyze student loans, taxes, fraud-based debts, and DUI obligations.' },
    { label: 'Chapter 13 plan feasibility', prompt: 'Evaluate whether a Chapter 13 plan is feasible. Calculate disposable income, minimum plan payment, and determine plan length.' },
  ],
  personal_injury: [
    { label: 'Settlement range', prompt: 'Based on the medical specials and liability, estimate a settlement range using the multiplier method and comparable verdicts.' },
    { label: 'Demand letter outline', prompt: 'Draft a demand letter outline with liability facts, injury description, treatment chronology, specials summary, and total demand.' },
    { label: 'Liability analysis', prompt: 'Perform a detailed liability analysis. Assess negligence elements, comparative fault, and evaluate liability strength.' },
    { label: 'Lien identification', prompt: 'Identify all potential liens: Medicare, Medicaid, ERISA, hospital liens, workers comp. Explain negotiation strategies for each.' },
  ],
  general: [
    { label: 'Case assessment', prompt: 'Evaluate the overall strength of this case. Identify key issues, strengths, weaknesses, and likely outcomes.' },
    { label: 'Research memo', prompt: 'Draft a legal research memo on the primary issue. Include relevant statutes, case law, and analysis.' },
    { label: 'Client update', prompt: 'Draft a client update letter explaining current status, recent developments, and next steps.' },
    { label: 'Motion outline', prompt: 'Outline a motion with legal standard, supporting arguments, and relevant case citations.' },
  ],
};

export default function TabulaAI({ navigate, initialTab }) {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [view, setView] = useState(initialTab || 'chat'); // chat, workflows, prompts
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    window.tabula.cases.list({ status: 'all' }).then(setCases);
  }, []);

  useEffect(() => {
    if (initialTab) setView(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!selectedCase) { setMessages([]); return; }
    window.tabula.ai.history(selectedCase.id).then(setMessages);
  }, [selectedCase]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const practiceType = selectedCase?.practice_type || 'bankruptcy';
  const workflows = WORKFLOWS[practiceType] || WORKFLOWS.general;
  const prompts = PROMPTS[practiceType] || PROMPTS.general;

  const handleSend = useCallback(async (overrideMsg) => {
    const msg = overrideMsg || input.trim();
    if (!msg || loading) return;
    if (!overrideMsg) setInput('');
    setView('chat');

    if (!selectedCase) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: msg, created_at: new Date().toISOString() },
        { role: 'assistant', content: 'Select a client matter above to give me case context — I\'ll be able to access financials, documents, creditors, and notes for precise analysis.', created_at: new Date().toISOString() },
      ]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: msg, created_at: new Date().toISOString() }]);
    setLoading(true);

    try {
      const result = await window.tabula.ai.chat(selectedCase.id, msg);
      setMessages(prev => [...prev, { role: 'assistant', content: result.message, created_at: new Date().toISOString(), error: result.error }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, created_at: new Date().toISOString(), error: true }]);
    }
    setLoading(false);
  }, [input, loading, selectedCase]);

  const handleClear = async () => {
    if (selectedCase) await window.tabula.ai.clear(selectedCase.id);
    setMessages([]);
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="tai-page">
      {/* Main content area */}
      <div className="tai-container">
        {!hasConversation ? (
          /* ─── Empty State: Harvey-style centered layout ─── */
          <div className="tai-hero">
            <div className="tai-hero-brand">Tabula</div>

            {/* Big input */}
            <div className="tai-hero-input-wrap">
              <textarea
                ref={inputRef}
                className="tai-hero-textarea"
                placeholder="Ask Tabula anything..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                rows={3}
              />
              <div className="tai-hero-input-bar">
                <div className="tai-hero-tags">
                  <button className={`tai-hero-tag ${view === 'prompts' ? 'active' : ''}`} onClick={() => setView(view === 'prompts' ? 'chat' : 'prompts')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Prompts
                  </button>
                  <button className={`tai-hero-tag ${view === 'workflows' ? 'active' : ''}`} onClick={() => setView(view === 'workflows' ? 'chat' : 'workflows')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Workflows
                  </button>
                </div>
                <button className="tai-hero-ask" onClick={() => handleSend()} disabled={!input.trim() || loading}>
                  Ask Tabula
                </button>
              </div>
            </div>

            {/* Source connectors row */}
            <div className="tai-hero-sources">
              {SOURCES.map(s => (
                <div key={s.key} className={`tai-src ${s.connected ? 'on' : ''}`}>
                  <span className="tai-src-dot" style={{ background: s.connected ? s.color : '#ccc' }} />
                  {s.label}
                  {!s.connected && <span className="tai-src-plus">+</span>}
                </div>
              ))}
            </div>

            {/* Case context picker */}
            <div className="tai-hero-context">
              <button className="tai-ctx-btn" onClick={() => setShowPicker(!showPicker)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {selectedCase ? `${selectedCase.first_name} ${selectedCase.last_name}` : 'Set client matter'}
              </button>
              {selectedCase && (
                <button className="tai-ctx-view" onClick={() => navigate(`/cases/${selectedCase.id}`)}>
                  View case
                </button>
              )}
            </div>

            {showPicker && (
              <div className="tai-picker-dropdown">
                {cases.map(c => (
                  <div
                    key={c.id}
                    className={`tai-picker-opt ${selectedCase?.id === c.id ? 'active' : ''}`}
                    onClick={() => { setSelectedCase(c); setShowPicker(false); }}
                  >
                    <strong>{c.first_name} {c.last_name}</strong>
                    <span className="tai-picker-meta">
                      {(c.practice_type || 'bankruptcy').replace('_', ' ')}
                      {c.practice_type === 'bankruptcy' && ` · Ch. ${c.chapter}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Inline content: workflows or prompts */}
            {view === 'workflows' && (
              <div className="tai-inline-section">
                <div className="tai-inline-header">Recommended Workflows</div>
                <div className="tai-wf-grid">
                  {workflows.map(w => (
                    <div key={w.id} className="tai-wf-card" onClick={() => {
                      const msg = `Run workflow: "${w.title}" — ${w.desc}. Provide comprehensive, structured analysis with headings and statute citations.`;
                      handleSend(msg);
                    }}>
                      <div className="tai-wf-title">{w.title}</div>
                      <div className="tai-wf-desc">{w.desc}</div>
                      <div className="tai-wf-foot">
                        <span className={`tai-wf-type ${w.type.toLowerCase()}`}>{w.type}</span>
                        <span className="tai-wf-steps">{w.steps} steps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'prompts' && (
              <div className="tai-inline-section">
                <div className="tai-inline-header">
                  {practiceType === 'bankruptcy' ? 'Bankruptcy' : practiceType === 'personal_injury' ? 'Personal Injury' : 'General'} Prompts
                </div>
                <div className="tai-prompt-grid">
                  {prompts.map((p, i) => (
                    <div key={i} className="tai-prompt-card" onClick={() => { setInput(p.prompt); setView('chat'); inputRef.current?.focus(); }}>
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Default: quick prompt pills */}
            {view === 'chat' && (
              <div className="tai-quick-row">
                {prompts.slice(0, 4).map((p, i) => (
                  <button key={i} className="tai-quick" onClick={() => { setInput(p.prompt); inputRef.current?.focus(); }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ─── Conversation View ─── */
          <>
            {/* Sticky header with context */}
            <div className="tai-conv-header">
              <div className="tai-conv-left">
                <span className="tai-conv-brand">Tabula</span>
                {selectedCase && (
                  <span className="tai-conv-case">
                    {selectedCase.first_name} {selectedCase.last_name}
                    <span className="tai-conv-type">{(selectedCase.practice_type || 'bankruptcy').replace('_', ' ')}</span>
                  </span>
                )}
              </div>
              <div className="tai-conv-actions">
                <button className="btn btn-ghost btn-sm" onClick={handleClear}>New chat</button>
              </div>
            </div>

            {/* Messages */}
            <div className="tai-messages" ref={scrollRef}>
              {messages.map((msg, i) => (
                <div key={i} className={`tai-msg ${msg.role}`}>
                  {msg.role === 'assistant' && <div className="tai-msg-av">T</div>}
                  <div className={`tai-msg-body ${msg.role} ${msg.error ? 'error' : ''}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="tai-msg assistant">
                  <div className="tai-msg-av">T</div>
                  <div className="tai-msg-body assistant"><span className="ai-thinking">Analyzing...</span></div>
                </div>
              )}
            </div>

            {/* Bottom input */}
            <div className="tai-conv-input">
              <input
                ref={inputRef}
                className="tai-conv-field"
                placeholder="Ask a follow-up..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={loading}
              />
              <button className="tai-conv-send" onClick={() => handleSend()} disabled={loading || !input.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
