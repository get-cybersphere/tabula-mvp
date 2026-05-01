// Gathers + normalizes everything a form mapper needs for a case.
//
// The `cases:get` IPC already pulls related rows. We do a bit more here:
// - Split the primary debtor's name into first/middle/last/suffix (forms ask for them separately)
// - Split address line 1 / 2 from a single-line `address_street`
// - Group income by debtor (joint vs primary) so Schedule I lines map cleanly
// - Bucket creditors by schedule (D=secured, EF=priority+unsecured)
// - Pre-compute monthly totals so Schedule J / Sum / 122A use the same numbers
// - Determine debtor1 vs debtor2 ordering (`is_joint = 0` is debtor1)
//
// All currency values are kept as JS numbers (not strings). Mappers format
// at the field-set boundary using currency.fmt().

const { splitName, splitStreet, fullName } = require('./name-utils');
const { sum } = require('./currency');
const { matchDistrict } = require('./district-matcher');

function asDebtor(d) {
  if (!d) return null;
  const name = splitName(d.first_name, d.last_name);
  const addr = splitStreet(d.address_street);
  return {
    id: d.id,
    is_joint: !!d.is_joint,
    first: name.first,
    middle: name.middle,
    last: name.last,
    suffix: name.suffix,
    fullName: fullName(d),
    ssn: d.ssn || '',
    ssnLast4: (d.ssn || '').replace(/\D/g, '').slice(-4),
    dob: d.dob || '',
    address: {
      line1: addr.line1,
      line2: addr.line2,
      street: d.address_street || '',
      city: d.address_city || '',
      state: d.address_state || '',
      zip: d.address_zip || '',
      county: d.address_county || '',
    },
    phone: d.phone || '',
    email: d.email || '',
  };
}

function normalizeCreditor(c) {
  return {
    ...c,
    name: c.name || '',
    address: c.address || '',
    accountLast4: (c.account_number || '').replace(/[^A-Za-z0-9]/g, '').slice(-4),
    schedule: c.schedule || '',           // 'D', 'E', 'F'
    type: c.debt_type || '',
    claim: Number(c.amount_claimed || 0),
    collateral: c.collateral_description || '',
    isDisputed: !!c.is_disputed,
    isContingent: !!c.is_contingent,
  };
}

function collectCaseData(db, caseId) {
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!c) return null;

  const debtors = db.prepare('SELECT * FROM debtors WHERE case_id = ? ORDER BY is_joint ASC').all(caseId);
  const income = db.prepare('SELECT * FROM income WHERE case_id = ?').all(caseId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE case_id = ?').all(caseId);
  const assets = db.prepare('SELECT * FROM assets WHERE case_id = ?').all(caseId);
  const creditorsRaw = db.prepare('SELECT * FROM creditors WHERE case_id = ?').all(caseId);
  const documents = db.prepare('SELECT * FROM documents WHERE case_id = ?').all(caseId);

  const primary = debtors.find(d => d.is_joint === 0) || debtors[0] || null;
  const joint = debtors.find(d => d.is_joint === 1) || (debtors.length > 1 ? debtors[1] : null);

  const debtor1 = asDebtor(primary);
  const debtor2 = asDebtor(joint);
  const isJoint = !!debtor2;

  const income1 = income.filter(i => primary && i.debtor_id === primary.id);
  const income2 = joint ? income.filter(i => i.debtor_id === joint.id) : [];
  // Income rows missing debtor_id: bucket into debtor1 by default.
  const incomeUnassigned = income.filter(i => !i.debtor_id);

  const allD1Income = [...income1, ...incomeUnassigned];

  const grossMonthly1 = sum(allD1Income, 'gross_monthly');
  const netMonthly1 = sum(allD1Income, 'net_monthly');
  const grossMonthly2 = sum(income2, 'gross_monthly');
  const netMonthly2 = sum(income2, 'net_monthly');
  const householdGross = grossMonthly1 + grossMonthly2;
  const householdNet = netMonthly1 + netMonthly2;
  const totalExpenses = sum(expenses, 'monthly_amount');
  const monthlyNet = householdNet - totalExpenses;

  const expensesByCategory = {};
  for (const e of expenses) {
    const k = (e.category || 'other').toLowerCase();
    expensesByCategory[k] = (expensesByCategory[k] || 0) + Number(e.monthly_amount || 0);
  }

  const creditors = creditorsRaw.map(normalizeCreditor);
  const creditorBuckets = {
    secured: creditors.filter(c => c.schedule === 'D'),
    priority: creditors.filter(c => c.schedule === 'E' || c.schedule === 'E/F-priority'),
    unsecured: creditors.filter(c => c.schedule === 'F' || c.schedule === 'E/F-unsecured'),
  };

  const totalSecuredClaims = sum(creditorBuckets.secured, 'claim');
  const totalPriorityClaims = sum(creditorBuckets.priority, 'claim');
  const totalUnsecuredClaims = sum(creditorBuckets.unsecured, 'claim');
  const totalRealProperty = sum(assets.filter(a => a.schedule === 'A' || a.schedule === 'A/B-real'), 'current_value');
  const totalPersonalProperty = sum(assets.filter(a => a.schedule === 'B' || a.schedule === 'A/B-personal'), 'current_value');

  const district = matchDistrict(c.district);

  return {
    case: {
      id: c.id,
      caseNumber: c.case_number || '',
      chapter: Number(c.chapter || 7),
      district: district || c.district || '',
      districtRaw: c.district || '',
      districtMatched: !!district,
      status: c.status,
      practiceType: c.practice_type || 'bankruptcy',
      filedAt: c.filed_at,
    },
    debtor1,
    debtor2,
    isJoint,
    income1: allD1Income,
    income2,
    expenses,
    expensesByCategory,
    assets,
    creditors,
    creditorBuckets,
    documents,
    computed: {
      grossMonthly1,
      grossMonthly2,
      netMonthly1,
      netMonthly2,
      householdGross,
      householdNet,
      totalExpenses,
      monthlyNet,
      totalSecuredClaims,
      totalPriorityClaims,
      totalUnsecuredClaims,
      totalRealProperty,
      totalPersonalProperty,
      totalAssets: totalRealProperty + totalPersonalProperty,
      totalDebt: totalSecuredClaims + totalPriorityClaims + totalUnsecuredClaims,
    },
  };
}

module.exports = { collectCaseData };
