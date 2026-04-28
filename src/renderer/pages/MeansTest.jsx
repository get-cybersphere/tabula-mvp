import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAllStates } from '../lib/median-income.js';
import { runMeansTest, aggregateExtractedData } from '../lib/means-test.js';
import { useToast } from '../lib/toast.jsx';

const STATES = getAllStates();

const DOC_CATEGORIES = [
  { value: 'paystub', label: 'Paystub' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'other', label: 'Other' },
];

function guessCategory(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('pay') || lower.includes('stub') || lower.includes('earning')) return 'paystub';
  if (lower.includes('bank') || lower.includes('statement') || lower.includes('chase') || lower.includes('wells') || lower.includes('boa')) return 'bank_statement';
  if (lower.includes('tax') || lower.includes('1040') || lower.includes('w2') || lower.includes('w-2')) return 'tax_return';
  return 'other';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmt(n) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('en-US');
}

// ─── SVG Icons ───────────────────────────────────────────────
const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const UploadCloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'mt-spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    <style>{`@keyframes mt-spin { to { transform: rotate(360deg); } }`}</style>
  </svg>
);

const ShieldIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ScaleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="12" y1="3" x2="12" y2="21" />
    <polyline points="1 14 12 3 23 14" />
    <path d="M1 14a5 5 0 0 0 10 0" />
    <path d="M13 14a5 5 0 0 0 10 0" />
  </svg>
);


// ─── Step Indicator ──────────────────────────────────────────
function StepIndicator({ currentStep }) {
  const steps = [
    { num: 1, label: 'Upload Documents' },
    { num: 2, label: 'Extract & Analyze' },
    { num: 3, label: 'Review Results' },
  ];

  return (
    <div className="mt-steps">
      {steps.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className={`mt-step ${currentStep === step.num ? 'active' : ''} ${currentStep > step.num ? 'completed' : ''}`}>
            <div className="mt-step-number">
              {currentStep > step.num ? <CheckIcon /> : step.num}
            </div>
            <span className="mt-step-label">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mt-step-connector ${currentStep > step.num ? 'completed' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ──────────────────────────────────────────
function UploadStep({ files, setFiles, onNext }) {
  const [dragover, setDragover] = useState(false);
  const dropRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragover(false);

    const droppedFiles = Array.from(e.dataTransfer.files)
      .filter(f => ['.pdf', '.png', '.jpg', '.jpeg'].some(ext => f.name.toLowerCase().endsWith(ext)))
      .map(f => ({
        path: f.path,
        name: f.name,
        size: f.size,
        ext: f.name.split('.').pop().toLowerCase(),
        category: guessCategory(f.name),
        id: Math.random().toString(36).slice(2),
      }));

    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, [setFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragover(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragover(false);
  }, []);

  const handleBrowse = async () => {
    const result = await window.tabula.meansTest.uploadFiles();
    const newFiles = result.map(f => ({
      ...f,
      category: guessCategory(f.name),
      id: Math.random().toString(36).slice(2),
    }));
    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateCategory = (id, category) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f));
  };

  return (
    <div className="mt-fade-in">
      <div
        ref={dropRef}
        className={`mt-upload-zone ${dragover ? 'dragover' : ''} ${files.length > 0 ? 'has-files' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={files.length === 0 ? handleBrowse : undefined}
      >
        {files.length === 0 ? (
          <>
            <div className="mt-upload-icon">
              <UploadCloudIcon />
            </div>
            <div className="mt-upload-title">Drop your financial documents here</div>
            <div className="mt-upload-subtitle">or click to browse files</div>
            <div className="mt-upload-hint">
              Supports PDF, PNG, JPG — Paystubs, bank statements, tax returns
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 550, fontSize: '0.9rem' }}>{files.length} document{files.length !== 1 ? 's' : ''} ready</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--warm-gray)', marginTop: 2 }}>
                  Drag more files or click "Add Files" to add more
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleBrowse} type="button">
                Add Files
              </button>
            </div>

            <div className="mt-file-list">
              {files.map(file => (
                <div className="mt-file-item" key={file.id}>
                  <div className="mt-file-icon"><FileIcon /></div>
                  <div className="mt-file-info">
                    <div className="mt-file-name">{file.name}</div>
                    <div className="mt-file-meta">{formatBytes(file.size)}</div>
                  </div>
                  <div className="mt-file-category">
                    <select
                      value={file.category}
                      onChange={(e) => updateCategory(file.id, e.target.value)}
                    >
                      {DOC_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <button className="mt-file-remove" onClick={() => removeFile(file.id)} type="button">
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onNext}>
            Extract Financial Data
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Extraction ──────────────────────────────────────
function ExtractionStep({ files, setDocuments, onNext, onBack }) {
  const [statuses, setStatuses] = useState(() =>
    files.map(f => ({ ...f, status: 'pending', extractedData: null, error: null, statusText: 'Waiting...' }))
  );
  const [allDone, setAllDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function extractAll() {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) break;

        const file = files[i];
        const categoryLabel = DOC_CATEGORIES.find(c => c.value === file.category)?.label || file.category;

        // Mark as extracting
        setStatuses(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: 'extracting', statusText: `Analyzing ${categoryLabel} from ${file.name}...` } : s
        ));

        try {
          const result = await window.tabula.meansTest.extract(file.path, file.category);
          if (cancelled) break;

          setStatuses(prev => prev.map((s, idx) =>
            idx === i ? { ...s, status: 'done', extractedData: result, statusText: `Extracted ${Object.keys(result).length} fields` } : s
          ));
        } catch (err) {
          if (cancelled) break;

          setStatuses(prev => prev.map((s, idx) =>
            idx === i ? { ...s, status: 'error', error: err.message, statusText: 'Extraction failed — ' + (err.message || 'Unknown error') } : s
          ));
        }
      }

      if (!cancelled) {
        setAllDone(true);
      }
    }

    extractAll();
    return () => { cancelled = true; };
  }, [files]);

  useEffect(() => {
    if (allDone) {
      setDocuments(statuses.map(s => ({
        name: s.name,
        category: s.category,
        extractedData: s.extractedData,
        error: s.error,
      })));
    }
  }, [allDone, statuses, setDocuments]);

  return (
    <div className="mt-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 className="section-title">Extracting Financial Data</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--warm-gray)' }}>
          Claude is analyzing your documents and extracting structured financial data.
        </p>
      </div>

      <div className="mt-extraction-list">
        {statuses.map((item, i) => (
          <div className={`mt-extraction-item ${item.status}`} key={item.id || i}>
            <div className="mt-extraction-status-icon">
              {item.status === 'pending' && <FileIcon />}
              {item.status === 'extracting' && <SpinnerIcon />}
              {item.status === 'done' && <CheckIcon />}
              {item.status === 'error' && <XIcon />}
            </div>
            <div className="mt-extraction-info">
              <div className="mt-extraction-filename">{item.name}</div>
              <div className="mt-extraction-status-text">{item.statusText}</div>
              <div className="mt-progress-bar">
                <div className={`mt-progress-fill ${item.status}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onBack} disabled={!allDone}>
          Back
        </button>
        {allDone && (
          <button className="btn btn-primary" onClick={onNext}>
            Review Results
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Review Dashboard ────────────────────────────────
function ReviewStep({ documents, onBack, navigate }) {
  const toast = useToast();
  const aggregated = aggregateExtractedData(documents);

  const [state, setState] = useState('TX');
  const [householdSize, setHouseholdSize] = useState(
    aggregated.dependents != null ? aggregated.dependents + 1 : 1
  );
  const [vehicleCount, setVehicleCount] = useState(1);

  // Editable income sources from extraction
  const [incomeSources, setIncomeSources] = useState(
    aggregated.incomeSources.map(s => ({
      employer: s.employer,
      grossAmount: s.grossAmount,
      frequency: s.frequency,
    }))
  );

  // Editable expenses
  const [expenses, setExpenses] = useState({ ...aggregated.expenses });
  const [securedDebt, setSecuredDebt] = useState(
    (aggregated.expenses.rent || 0) + (aggregated.expenses.carPayment || 0)
  );
  const [priorityDebt, setPriorityDebt] = useState(0);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveForm, setSaveForm] = useState({ firstName: '', lastName: '' });
  const [saving, setSaving] = useState(false);

  // Run the means test reactively
  const meansResult = runMeansTest({
    incomeSources,
    stateCode: state,
    householdSize,
    vehicleCount,
    monthlySecuredDebt: securedDebt,
    monthlyPriorityDebt: priorityDebt,
    extractedExpenses: expenses,
  });

  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);
  const monthlyIncome = meansResult.cmi;

  const updateIncome = (idx, field, value) => {
    setIncomeSources(prev => prev.map((s, i) =>
      i === idx ? { ...s, [field]: field === 'grossAmount' ? parseFloat(value) || 0 : value } : s
    ));
  };

  const updateExpense = (key, value) => {
    setExpenses(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const handleSaveToCase = async () => {
    if (!saveForm.firstName || !saveForm.lastName) return;
    setSaving(true);
    try {
      const newCase = await window.tabula.cases.create({
        chapter: meansResult.recommendation === 'chapter13' ? 13 : 7,
        debtor: {
          firstName: saveForm.firstName,
          lastName: saveForm.lastName,
        },
      });
      for (const src of incomeSources) {
        await window.tabula.income.upsert(newCase.id, {
          source: 'Employment',
          employerName: src.employer,
          grossMonthly: src.grossAmount,
          netMonthly: src.grossAmount,
          payFrequency: src.frequency,
        });
      }
      for (const [category, amount] of Object.entries(expenses)) {
        if (amount > 0) {
          await window.tabula.expenses.upsert(newCase.id, {
            category,
            description: category.replace(/([A-Z])/g, ' $1').trim(),
            monthlyAmount: amount,
          });
        }
      }
      toast.success('Case created from means test');
      navigate(`/cases/${newCase.id}`);
    } catch (err) {
      console.error('Failed to save case:', err);
      toast.error(`Failed to save case: ${err.message || 'unknown error'}`);
      setSaving(false);
    }
  };

  const recTitle = meansResult.recommendation === 'chapter7'
    ? 'Chapter 7 Eligible'
    : meansResult.recommendation === 'chapter13'
      ? 'Chapter 13 Recommended'
      : 'Additional Analysis Needed';

  return (
    <div className="mt-fade-in">
      {/* Summary Cards */}
      <div className="mt-summary-cards">
        <div className="mt-summary-card">
          <div className="mt-summary-card-label">Monthly Income</div>
          <div className="mt-summary-card-value" style={{ color: 'var(--green)' }}>{fmt(monthlyIncome)}</div>
          <div className="mt-summary-card-detail">
            {fmt(meansResult.annualIncome)} annualized
          </div>
        </div>
        <div className="mt-summary-card">
          <div className="mt-summary-card-label">Monthly Expenses</div>
          <div className="mt-summary-card-value" style={{ color: 'var(--red)' }}>{fmt(totalExpenses)}</div>
          <div className="mt-summary-card-detail">
            From extracted bank statements
          </div>
        </div>
        <div className="mt-summary-card">
          <div className="mt-summary-card-label">State Median</div>
          <div className="mt-summary-card-value">{fmt(meansResult.medianIncome)}</div>
          <div className="mt-summary-card-detail">
            {STATES.find(s => s.code === state)?.name}, household of {householdSize}
          </div>
        </div>
      </div>

      {/* Income vs Expense Bar */}
      <div className="mt-income-bar-container">
        <div className="mt-income-bar-wrap">
          {monthlyIncome > 0 && (
            <>
              <div className="mt-income-bar-segment income" style={{ width: `${Math.min(100, (totalExpenses / monthlyIncome) * 100)}%`, opacity: 0.3 }} />
              <div className="mt-income-bar-segment expenses" style={{ width: `${Math.min(100, (totalExpenses / monthlyIncome) * 100)}%` }} />
              {totalExpenses < monthlyIncome && (
                <div className="mt-income-bar-segment remaining" style={{ width: `${((monthlyIncome - totalExpenses) / monthlyIncome) * 100}%` }} />
              )}
            </>
          )}
        </div>
        <div className="mt-income-bar-legend">
          <div className="mt-income-bar-legend-item">
            <div className="mt-income-bar-legend-dot" style={{ background: 'var(--green)' }} />
            Income: {fmt(monthlyIncome)}/mo
          </div>
          <div className="mt-income-bar-legend-item">
            <div className="mt-income-bar-legend-dot" style={{ background: 'var(--red)' }} />
            Expenses: {fmt(totalExpenses)}/mo
          </div>
          <div className="mt-income-bar-legend-item">
            <div className="mt-income-bar-legend-dot" style={{ background: 'rgba(10,10,10,0.08)' }} />
            Remaining: {fmt(Math.max(0, monthlyIncome - totalExpenses))}/mo
          </div>
        </div>
      </div>

      <div className="mt-review-grid">
        {/* Left: Result + Math */}
        <div>
          {/* Recommendation */}
          <div className="mt-result-card" style={{ marginBottom: 20 }}>
            <div className={`mt-result-header ${meansResult.recommendation}`}>
              <div className="mt-result-badge">
                {meansResult.recommendation === 'chapter7' ? <ShieldIcon /> : <ScaleIcon />}
              </div>
              <div>
                <div className="mt-result-rec-title">{recTitle}</div>
                <span className={`mt-result-confidence ${meansResult.confidence}`}>
                  {meansResult.confidence} confidence
                </span>
              </div>
            </div>
            <div className="mt-result-body">
              <div className="mt-result-explanation">
                {meansResult.explanation.map((line, i) => <p key={i}>{line}</p>)}
              </div>
              {meansResult.warnings.length > 0 && (
                <div className="mt-result-warnings">
                  {meansResult.warnings.map((w, i) => (
                    <div className="mt-warning" key={i}>
                      <AlertIcon />
                      <p>{w}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Math Breakdown */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Means Test Math</span>
            </div>
            <div className="card-body">
              <table className="mt-math-table">
                <tbody>
                  <tr>
                    <td>Annualized Gross Income</td>
                    <td>{fmt(meansResult.annualIncome)}</td>
                  </tr>
                  <tr>
                    <td>State Median ({state}, {householdSize} person{householdSize > 1 ? 's' : ''})</td>
                    <td>{fmt(meansResult.medianIncome)}</td>
                  </tr>
                  <tr className="subtotal">
                    <td>{meansResult.belowMedian ? 'Below Median' : 'Above Median'} by</td>
                    <td style={{ color: meansResult.belowMedian ? 'var(--green)' : 'var(--red)' }}>
                      {fmt(Math.abs(meansResult.difference))}
                    </td>
                  </tr>
                  {meansResult.deductions && (
                    <>
                      <tr><td colSpan={2} style={{ paddingTop: 18, fontWeight: 550, fontSize: '0.82rem', borderBottom: 'none' }}>Allowed Monthly Deductions</td></tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>National Standards (food/clothing)</td>
                        <td>{fmt(meansResult.deductions.nationalStandards)}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>Health Care</td>
                        <td>{fmt(meansResult.deductions.healthCare)}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>Housing & Utilities</td>
                        <td>{fmt(meansResult.deductions.housingUtilities)}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>Transportation</td>
                        <td>{fmt(meansResult.deductions.transportation)}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>Secured Debt Payments</td>
                        <td>{fmt(meansResult.deductions.securedDebt)}</td>
                      </tr>
                      <tr>
                        <td style={{ paddingLeft: 16 }}>Priority Debt Payments</td>
                        <td>{fmt(meansResult.deductions.priorityDebt)}</td>
                      </tr>
                      <tr className="subtotal">
                        <td>Total Monthly Deductions</td>
                        <td>{fmt(meansResult.deductions.total)}</td>
                      </tr>
                      <tr>
                        <td>Current Monthly Income</td>
                        <td>{fmt(meansResult.cmi)}</td>
                      </tr>
                      <tr>
                        <td>Disposable Monthly Income</td>
                        <td style={{ color: meansResult.disposableMonthlyIncome <= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fmt(meansResult.disposableMonthlyIncome)}
                        </td>
                      </tr>
                      <tr className="total">
                        <td>60-Month Disposable Income</td>
                        <td>{fmt(meansResult.disposable60Month)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Editable Data */}
        <div>
          {/* Case Setup */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Case Parameters</span>
            </div>
            <div className="card-body">
              <div className="mt-setup-grid">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">State</label>
                  <select className="form-select" value={state} onChange={e => setState(e.target.value)}>
                    {STATES.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Household Size</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max="15"
                    value={householdSize}
                    onChange={e => setHouseholdSize(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Vehicles</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    max="5"
                    value={vehicleCount}
                    onChange={e => setVehicleCount(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Income Sources */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Income Sources</span>
            </div>
            <div className="card-body">
              {incomeSources.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--warm-gray)' }}>No income data extracted.</p>
              ) : (
                incomeSources.map((src, i) => (
                  <div key={i} style={{ marginBottom: i < incomeSources.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 8 }}>{src.employer}</div>
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Gross Pay</label>
                        <div className="mt-editable">
                          <input
                            type="number"
                            step="0.01"
                            value={src.grossAmount}
                            onChange={e => updateIncome(i, 'grossAmount', e.target.value)}
                            style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: '1px solid rgba(10,10,10,0.1)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
                          />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Frequency</label>
                        <select className="form-select" value={src.frequency} onChange={e => updateIncome(i, 'frequency', e.target.value)}>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Biweekly</option>
                          <option value="semimonthly">Semi-monthly</option>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Extracted Expenses */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Monthly Expenses (Extracted)</span>
            </div>
            <div className="card-body">
              {Object.keys(expenses).length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--warm-gray)' }}>No expense data extracted.</p>
              ) : (
                Object.entries(expenses).map(([key, value]) => (
                  <div className="mt-breakdown-row" key={key}>
                    <span className="mt-breakdown-label" style={{ textTransform: 'capitalize' }}>
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <div className="mt-editable">
                      <input
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={e => updateExpense(key, e.target.value)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Debt Payments */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Debt Payments</span>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Monthly Secured Debt (mortgage + car)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={securedDebt}
                  onChange={e => setSecuredDebt(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monthly Priority Debt (taxes, child support)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={priorityDebt}
                  onChange={e => setPriorityDebt(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-disclaimer">
        This analysis is for informational purposes only and does not constitute legal advice.
        The means test calculation is simplified and may not account for all factors relevant to your case.
        Always consult a qualified bankruptcy attorney before making any filing decisions.
        Median income figures and IRS standards are based on publicly available 2024 data and may be updated periodically.
      </div>

      {/* Footer */}
      <div className="mt-export-bar">
        <button className="btn btn-ghost" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Start Over
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => {
            exportSummary(meansResult, incomeSources, expenses, state, householdSize);
            toast.success('Summary downloaded');
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Summary
          </button>
          <button className="btn btn-primary" onClick={() => setShowSaveModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save to Case
          </button>
        </div>
      </div>

      {/* Save to Case Modal */}
      {showSaveModal && (
        <SaveToCaseBackdrop onDismiss={() => !saving && setShowSaveModal(false)}>
          <div className="card" style={{ width: 400, margin: 0 }} role="dialog" aria-modal="true" aria-labelledby="save-to-case-title">
            <div className="card-header">
              <span className="card-title" id="save-to-case-title">Save to Case</span>
            </div>
            <div className="card-body">
              <p className="text-sm" style={{ color: 'var(--warm-gray)', marginBottom: 16 }}>
                Enter the debtor's name to create a new case with this extracted data.
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input
                    className="form-input"
                    autoFocus
                    value={saveForm.firstName}
                    onChange={e => setSaveForm(f => ({ ...f, firstName: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSaveToCase()}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-input"
                    value={saveForm.lastName}
                    onChange={e => setSaveForm(f => ({ ...f, lastName: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSaveToCase()}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveToCase}
                  disabled={saving || !saveForm.firstName || !saveForm.lastName}
                >
                  {saving ? 'Saving...' : 'Create Case'}
                </button>
              </div>
            </div>
          </div>
        </SaveToCaseBackdrop>
      )}
    </div>
  );
}

function SaveToCaseBackdrop({ onDismiss, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss?.(); }}
    >
      {children}
    </div>
  );
}

function exportSummary(result, incomeSources, expenses, stateCode, householdSize) {
  const recLabel = result.recommendation === 'chapter7' ? 'Chapter 7 Eligible'
    : result.recommendation === 'chapter13' ? 'Chapter 13 Recommended'
      : 'Additional Analysis Needed';

  let text = `BANKRUPTCY MEANS TEST ANALYSIS\n${'='.repeat(40)}\n\n`;
  text += `Date: ${new Date().toLocaleDateString()}\n`;
  text += `State: ${stateCode} | Household Size: ${householdSize}\n\n`;
  text += `RECOMMENDATION: ${recLabel} (${result.confidence} confidence)\n\n`;

  text += `INCOME\n${'-'.repeat(30)}\n`;
  text += `Annual Gross Income: ${fmt(result.annualIncome)}\n`;
  text += `Current Monthly Income: ${fmt(result.cmi)}\n`;
  text += `State Median Income: ${fmt(result.medianIncome)}\n`;
  text += `${result.belowMedian ? 'Below' : 'Above'} Median by: ${fmt(Math.abs(result.difference))}\n\n`;

  if (result.deductions) {
    text += `ALLOWED DEDUCTIONS (monthly)\n${'-'.repeat(30)}\n`;
    text += `National Standards: ${fmt(result.deductions.nationalStandards)}\n`;
    text += `Health Care: ${fmt(result.deductions.healthCare)}\n`;
    text += `Housing & Utilities: ${fmt(result.deductions.housingUtilities)}\n`;
    text += `Transportation: ${fmt(result.deductions.transportation)}\n`;
    text += `Secured Debt: ${fmt(result.deductions.securedDebt)}\n`;
    text += `Priority Debt: ${fmt(result.deductions.priorityDebt)}\n`;
    text += `Total Deductions: ${fmt(result.deductions.total)}\n\n`;
    text += `Disposable Monthly Income: ${fmt(result.disposableMonthlyIncome)}\n`;
    text += `60-Month Disposable: ${fmt(result.disposable60Month)}\n\n`;
  }

  text += `EXPLANATION\n${'-'.repeat(30)}\n`;
  result.explanation.forEach(line => { text += `${line}\n`; });

  if (result.warnings.length > 0) {
    text += `\nWARNINGS\n${'-'.repeat(30)}\n`;
    result.warnings.forEach(w => { text += `* ${w}\n`; });
  }

  text += `\n${'='.repeat(40)}\n`;
  text += `DISCLAIMER: This is not legal advice. Consult a bankruptcy attorney.\n`;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `means-test-analysis-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}


// ─── Main Page Component ─────────────────────────────────────
export default function MeansTest({ navigate }) {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    window.tabula.meansTest.checkApiKey().then(setHasApiKey);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Means Test</h1>
          <p className="page-subtitle">Upload financial documents to determine Chapter 7 or Chapter 13 eligibility</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Back to Cases
        </button>
      </div>

      <StepIndicator currentStep={step} />

      {!hasApiKey && step === 1 && (
        <div className="mt-api-warning">
          <AlertIcon />
          <div className="mt-api-warning-text">
            <p>
              <strong>API key not configured.</strong> Set the <code>ANTHROPIC_API_KEY</code> environment variable before launching the app to enable AI-powered document extraction.
            </p>
            <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--warm-gray)' }}>
              Without it, document extraction will fail. You can still manually enter data in the review step.
            </p>
          </div>
        </div>
      )}

      {step === 1 && (
        <UploadStep
          files={files}
          setFiles={setFiles}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <ExtractionStep
          files={files}
          setDocuments={setDocuments}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <ReviewStep
          documents={documents}
          onBack={() => { setStep(1); setFiles([]); setDocuments([]); }}
          navigate={navigate}
        />
      )}
    </div>
  );
}
