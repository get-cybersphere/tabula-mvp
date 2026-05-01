// Bank intel analyzer — orchestrates the four detectors.
//
// Input: { transactions, creditors, declaredIncome, asOfDate }
// Output: array of findings, each tagged with type, severity, evidence
//
// We don't dedupe across detectors — a single transaction CAN trigger
// multiple findings (insider_recurring + preference_transfer is a
// useful combo: "this $2k payment is BOTH on the preference list AND a
// recurring transfer to an individual"). The UI groups findings by
// transaction id to avoid visual duplication.

const { findInsiderRisk } = require('./insider-detector');
const { findDiscretionary } = require('./discretionary-rules');
const { findPreferenceTransfers } = require('./preference-detector');
const { findUndisclosedIncome } = require('./undisclosed-income-detector');

function analyze({ transactions, creditors = [], declaredIncome = [], asOfDate }) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { findings: [], stats: emptyStats() };
  }

  // Normalize transaction shape — accept multiple input shapes:
  //   { date, merchant, amount, type }            (our standard)
  //   { date, description, amount, type }         (Plaid-ish)
  //   { date, payee, amount, debit_credit }       (bank-format)
  const normalized = transactions
    .map(normalizeTxn)
    .filter(t => t.date && t.merchant && Number.isFinite(t.amount));

  const allFindings = [];
  for (const f of findInsiderRisk(normalized, { asOfDate })) allFindings.push({ ...f, category: 'insider' });
  for (const f of findDiscretionary(normalized)) allFindings.push({ ...f, category: 'discretionary' });
  for (const f of findPreferenceTransfers(normalized, creditors, { asOfDate })) allFindings.push({ ...f, category: 'preference' });
  for (const f of findUndisclosedIncome(normalized, declaredIncome)) allFindings.push({ ...f, category: 'undisclosed_income' });

  // Stable sort: severity (high → low) then date desc.
  const sevWeight = { high: 3, medium: 2, low: 1 };
  allFindings.sort((a, b) => {
    const w = (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0);
    if (w !== 0) return w;
    const da = a.date || a.lastDate || '';
    const db_ = b.date || b.lastDate || '';
    return db_.localeCompare(da);
  });

  return {
    findings: allFindings,
    stats: {
      transactionsAnalyzed: normalized.length,
      transactionsSkipped: transactions.length - normalized.length,
      findingsByCategory: countBy(allFindings, 'category'),
      findingsBySeverity: countBy(allFindings, 'severity'),
      total: allFindings.length,
    },
  };
}

function normalizeTxn(t) {
  return {
    date: t.date || t.transaction_date || t.posted_date || '',
    merchant: t.merchant || t.description || t.payee || t.name || '',
    amount: Number(t.amount ?? 0),
    type: t.type || t.debit_credit || '',
    raw: t,
  };
}

function countBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key] || 'unknown';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function emptyStats() {
  return { transactionsAnalyzed: 0, transactionsSkipped: 0, findingsByCategory: {}, findingsBySeverity: {}, total: 0 };
}

module.exports = { analyze };
