// Smoke test for the bank-intel analyzer.
// Drives the analyzer with realistic synthetic transactions covering all
// four finding categories (insider, discretionary, preference, undisclosed).
//
// Run: node scripts/smoke-bank-intel.js

const { analyze } = require('../src/main/bank-intel/analyzer');

// Filing date "today" — relative to which the 90-day / 1-year windows
// are calculated. Pick a Monday in May so most synthetic dates fall
// nicely inside the windows.
const FILING_DATE = '2026-05-01';

function d(daysBeforeFiling) {
  const t = Date.parse(FILING_DATE) - daysBeforeFiling * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

const transactions = [
  // ─── Recurring rent — should NOT flag (business payee) ──────
  { date: d(30),  merchant: 'WELLS FARGO HOME MORTGAGE', amount: -1450.00, type: 'debit' },
  { date: d(60),  merchant: 'WELLS FARGO HOME MORTGAGE', amount: -1450.00, type: 'debit' },
  { date: d(90),  merchant: 'WELLS FARGO HOME MORTGAGE', amount: -1450.00, type: 'debit' },

  // ─── Recurring payment to individual (insider risk) ────────
  // Maria Vasquez gets $2,400 every month — high-severity insider flag
  { date: d(15),  merchant: 'ZELLE TO MARIA VASQUEZ', amount: -2400.00, type: 'debit' },
  { date: d(45),  merchant: 'ZELLE TO MARIA VASQUEZ', amount: -2400.00, type: 'debit' },
  { date: d(75),  merchant: 'ZELLE TO MARIA VASQUEZ', amount: -2400.00, type: 'debit' },
  { date: d(105), merchant: 'ZELLE TO MARIA VASQUEZ', amount: -2400.00, type: 'debit' },

  // ─── Single large transfer to individual (insider risk) ────
  { date: d(40),  merchant: 'JAMES O\'BRIEN', amount: -3500.00, type: 'debit' },

  // ─── Discretionary: private school ──────────────────────────
  { date: d(8),   merchant: 'BROOKLYN MONTESSORI ACADEMY', amount: -1100.00, type: 'debit' },
  { date: d(38),  merchant: 'BROOKLYN MONTESSORI ACADEMY', amount: -1100.00, type: 'debit' },
  { date: d(68),  merchant: 'BROOKLYN MONTESSORI ACADEMY', amount: -1100.00, type: 'debit' },

  // ─── Discretionary: travel sports ──────────────────────────
  { date: d(20),  merchant: 'NEW YORK ELITE SOCCER CLUB',  amount: -420.00,  type: 'debit' },
  { date: d(110), merchant: 'AAU TOURNAMENT REGISTRATION', amount: -180.00,  type: 'debit' },

  // ─── Discretionary: hotel + airline ─────────────────────────
  { date: d(22),  merchant: 'MARRIOTT BOSTON',             amount: -487.50,  type: 'debit' },
  { date: d(22),  merchant: 'DELTA AIR LINES',             amount: -340.00,  type: 'debit' },

  // ─── Subscription pile ─────────────────────────────────────
  { date: d(11),  merchant: 'NETFLIX',                     amount: -19.99,   type: 'debit' },
  { date: d(41),  merchant: 'NETFLIX',                     amount: -19.99,   type: 'debit' },
  { date: d(11),  merchant: 'SPOTIFY USA',                 amount: -10.99,   type: 'debit' },
  { date: d(41),  merchant: 'SPOTIFY USA',                 amount: -10.99,   type: 'debit' },
  { date: d(11),  merchant: 'APPLE ONE',                   amount: -32.95,   type: 'debit' },
  { date: d(41),  merchant: 'APPLE ONE',                   amount: -32.95,   type: 'debit' },
  { date: d(13),  merchant: 'EQUINOX FITNESS',             amount: -245.00,  type: 'debit' },
  { date: d(43),  merchant: 'EQUINOX FITNESS',             amount: -245.00,  type: 'debit' },

  // ─── Preference-period transfer to creditor ────────────────
  // Capital One in our creditors list, $1,200 transfer 45d before filing
  { date: d(45),  merchant: 'CAPITAL ONE PMT',             amount: -1200.00, type: 'debit' },

  // ─── Undisclosed income: monthly $1,800 deposit from "Side Gig LLC" ─
  // Note: this is a business name (LLC) so name-detector flags as business,
  // but undisclosed-income detector still works because the payer doesn't
  // match any declared income source.
  { date: d(20),  merchant: 'SIDE GIG LLC PAYROLL',        amount: 1800.00,  type: 'credit' },
  { date: d(50),  merchant: 'SIDE GIG LLC PAYROLL',        amount: 1800.00,  type: 'credit' },
  { date: d(80),  merchant: 'SIDE GIG LLC PAYROLL',        amount: 1800.00,  type: 'credit' },
  { date: d(110), merchant: 'SIDE GIG LLC PAYROLL',        amount: 1800.00,  type: 'credit' },

  // ─── Declared employer paystubs — should NOT flag ──────────
  { date: d(2),   merchant: 'MERCY HOSPITAL PAYROLL',      amount: 1607.25,  type: 'credit' },
  { date: d(16),  merchant: 'MERCY HOSPITAL PAYROLL',      amount: 1607.25,  type: 'credit' },
  { date: d(30),  merchant: 'MERCY HOSPITAL PAYROLL',      amount: 1607.25,  type: 'credit' },

  // ─── Gambling (red flag) ───────────────────────────────────
  { date: d(60),  merchant: 'DRAFTKINGS DEPOSIT',          amount: -200.00,  type: 'debit' },
  { date: d(64),  merchant: 'FANDUEL DEPOSIT',             amount: -150.00,  type: 'debit' },
];

const creditors = [
  { id: 'c1', name: 'Capital One',     schedule: 'F', debt_type: 'credit_card' },
  { id: 'c2', name: 'Discover',        schedule: 'F', debt_type: 'credit_card' },
  { id: 'c3', name: 'Wells Fargo',     schedule: 'D', debt_type: 'mortgage' },
  { id: 'c4', name: 'Navient',         schedule: 'F', debt_type: 'student_loan' },
];

const declaredIncome = [
  { employer_name: 'Mercy Hospital', source: 'Administrative assistant' },
];

const result = analyze({
  transactions,
  creditors,
  declaredIncome,
  asOfDate: FILING_DATE,
});

console.log(`▶ Analyzed ${result.stats.transactionsAnalyzed} transactions`);
console.log(`▶ ${result.stats.total} findings\n`);
console.log('By severity:', result.stats.findingsBySeverity);
console.log('By category:', result.stats.findingsByCategory);
console.log('\n─── Findings ───────────────────────────────────────');

for (const f of result.findings) {
  const sevDot = f.severity === 'high' ? '●' : f.severity === 'medium' ? '◐' : '○';
  console.log(`\n${sevDot} [${f.severity.toUpperCase().padEnd(6)}] ${f.label}`);
  console.log(`   category: ${f.category} · code: ${f.code}`);
  if (f.amount) console.log(`   amount: $${(f.amount).toFixed(2)}`);
  if (f.totalAmount) console.log(`   total: $${f.totalAmount.toFixed(2)}`);
  if (f.monthlyEstimate) console.log(`   monthly: ~$${f.monthlyEstimate.toFixed(2)}`);
  if (f.transactionCount) console.log(`   txns: ${f.transactionCount}`);
  if (f.daysBeforeFiling != null) console.log(`   days before filing: ${f.daysBeforeFiling}`);
  if (f.suggestedDisposition) {
    console.log(`   →  ${f.suggestedDisposition}`);
  }
}
