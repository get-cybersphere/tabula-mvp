import React, { useState, useEffect, useRef, useCallback } from 'react';
import { confirmAction } from '../../lib/confirm.js';

/**
 * AI Case Assistant — slide-out panel with Claude-powered contextual chat.
 * Maintains per-case conversation history. Knows the full case context:
 * financials, creditors, deadlines, notes, and practice type.
 */
export default function AIAssistant({ caseId, practiceType, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Load conversation history
  useEffect(() => {
    if (!caseId || !isOpen) return;
    setLoadingHistory(true);
    window.tabula.ai.history(caseId).then((history) => {
      setMessages(history);
      setLoadingHistory(false);
    });
  }, [caseId, isOpen]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg, created_at: new Date().toISOString() }]);
    setLoading(true);

    try {
      const result = await window.tabula.ai.chat(caseId, userMsg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.message, created_at: new Date().toISOString(), error: result.error },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, created_at: new Date().toISOString(), error: true },
      ]);
    }
    setLoading(false);
  }, [input, loading, caseId]);

  const handleClear = async () => {
    if (!confirmAction('Clear this conversation? This cannot be undone.')) return;
    await window.tabula.ai.clear(caseId);
    setMessages([]);
  };

  const suggestions = practiceType === 'personal_injury'
    ? [
        'What is the statute of limitations for this case?',
        'Draft a demand letter outline',
        'What liens should I look for?',
        'Estimate the settlement range',
      ]
    : practiceType === 'bankruptcy'
    ? [
        'Should this be Chapter 7 or 13?',
        'Are there any preference payments to flag?',
        'What exemptions apply in this state?',
        'Identify non-dischargeable debts',
      ]
    : [
        'Summarize this case',
        'What are the key deadlines?',
        'Draft a case memo',
        'What issues should I flag?',
      ];

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0,
      width: 440, backgroundColor: 'var(--paper)',
      borderLeft: '1px solid rgba(10,10,10,0.08)',
      boxShadow: '-8px 0 24px rgba(10,10,10,0.06)',
      display: 'flex', flexDirection: 'column',
      zIndex: 500,
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 22px', borderBottom: '1px solid rgba(10,10,10,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        WebkitAppRegion: 'no-drag',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.15rem', letterSpacing: -0.5 }}>
            Tabula AI
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase', color: 'var(--warm-gray)', marginTop: 2 }}>
            Case Assistant
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClear} title="Clear conversation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px 22px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {loadingHistory ? (
          <div style={{ textAlign: 'center', color: 'var(--warm-gray)', fontSize: '0.85rem', marginTop: 40 }}>
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--warm-gray)', marginBottom: 16 }}>
              Ask me anything about this case. I have full context on the debtor, financials, creditors, and documents.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="btn btn-secondary btn-sm"
                  style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.8rem' }}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                backgroundColor: msg.role === 'user' ? 'var(--ink)' : msg.error ? 'var(--red-light, #fbeae6)' : 'white',
                color: msg.role === 'user' ? 'var(--paper)' : msg.error ? 'var(--accent)' : 'var(--ink)',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                border: msg.role === 'user' ? 'none' : '1px solid rgba(10,10,10,0.06)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
              backgroundColor: 'white', border: '1px solid rgba(10,10,10,0.06)',
              fontSize: '0.85rem', color: 'var(--warm-gray)',
            }}>
              <span className="ai-thinking">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '14px 22px', borderTop: '1px solid rgba(10,10,10,0.06)',
        display: 'flex', gap: 8,
      }}>
        <input
          ref={inputRef}
          className="form-input"
          style={{ flex: 1, fontSize: '0.85rem' }}
          placeholder="Ask about this case..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ padding: '8px 14px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
