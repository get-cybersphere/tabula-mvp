// Form B 106I — Schedule I: Your Income.
// 85 fields. Splits by debtor (1 / 2). Most non-wage breakdown fields
// (5a-h deductions, 8a-h other income types) we can't fill yet because
// Tabula's `income` schema doesn't break those out — those become gaps.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function pickEmployerIncome(incomeRows) {
  // Heuristic: take the row with highest gross_monthly that has an employer.
  // Falls back to highest gross_monthly overall, or the first row.
  if (!incomeRows || !incomeRows.length) return null;
  const withEmployer = incomeRows.filter(r => (r.employer_name || '').trim());
  const pool = withEmployer.length ? withEmployer : incomeRows;
  return [...pool].sort((a, b) => (b.gross_monthly || 0) - (a.gross_monthly || 0))[0] || null;
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const d1 = data.debtor1;
  const d2 = data.debtor2;
  const isJoint = data.isJoint;

  // Employment + occupation + employer address (Debtor 1)
  const job1 = pickEmployerIncome(data.income1);
  if (job1) {
    track(setText(form, 'Occupation Debtor 1', job1.source || ''), 'Occupation Debtor 1',
          job1.source ? null : 'Occupation field is empty on income source');
    track(setText(form, 'Employers Name Debtor 1', job1.employer_name || ''), 'Employers Name Debtor 1',
          job1.employer_name ? null : "Employer name missing for Debtor 1's primary income");
    // Employer address — Tabula doesn't store this yet.
    gaps.push({ field: 'Employers Street1 Debtor 1', reason: 'Employer address not in Tabula schema — add manually' });
  } else if (d1) {
    gaps.push({ field: 'Occupation Debtor 1', reason: 'No income source recorded for Debtor 1' });
  }

  // Employment / occupation (Debtor 2)
  if (isJoint) {
    const job2 = pickEmployerIncome(data.income2);
    if (job2) {
      track(setText(form, 'Occupation Debtor 2', job2.source || ''), 'Occupation Debtor 2');
      track(setText(form, 'Employers Name Debtor 2', job2.employer_name || ''), 'Employers Name Debtor 2');
    }
  }

  // ─── Monthly income totals (debtor 1) ─────────────────────────
  const gross1 = data.computed.grossMonthly1;
  const net1 = data.computed.netMonthly1;
  const deductions1 = Math.max(0, gross1 - net1);

  if (gross1 > 0) {
    // Line 2 — gross monthly income from wages
    track(setText(form, 'Amount 2 Debtor 1', fmt(gross1)), 'Amount 2 Debtor 1');
    // Line 4 — total payroll deductions
    track(setText(form, 'Amount 4 Debtor 1', fmt(deductions1)), 'Amount 4 Debtor 1');
    // Line 6 — Calculate take-home pay (line 2 - line 4)
    track(setText(form, 'Amount 6 Debtor 1', fmt(net1)), 'Amount 6 Debtor 1');
    // Line 7 — Other monthly income from line 7 (we have nothing separate)
    track(setText(form, 'Amount 7 Debtor 1', fmt(0)), 'Amount 7 Debtor 1');
    // Line 9 — Total: Line 6 + Line 7
    track(setText(form, 'Amount 9 Debtor 1', fmt(net1)), 'Amount 9 Debtor 1');

    // 5a-h deduction breakdown — we don't have it itemized.
    if (deductions1 > 0) {
      gaps.push({
        field: 'Amount 5a-h Debtor 1',
        reason: `$${fmt(deductions1)}/mo total deductions need itemization (taxes, insurance, retirement, etc.) — Schedule I lines 5a-h`,
      });
    }
  } else {
    gaps.push({ field: 'Amount 2 Debtor 1', reason: 'No gross monthly income recorded for Debtor 1' });
  }

  // ─── Debtor 2 ─────────────────────────────────────────────────
  if (isJoint) {
    const gross2 = data.computed.grossMonthly2;
    const net2 = data.computed.netMonthly2;
    const deductions2 = Math.max(0, gross2 - net2);
    if (gross2 > 0) {
      track(setText(form, 'Amount 2 Debtor 2', fmt(gross2)), 'Amount 2 Debtor 2');
      track(setText(form, 'Amount 4 Debtor 2', fmt(deductions2)), 'Amount 4 Debtor 2');
      track(setText(form, 'Amount 6 Debtor 2', fmt(net2)), 'Amount 6 Debtor 2');
      track(setText(form, 'Amount 7 Debtor 2', fmt(0)), 'Amount 7 Debtor 2');
      track(setText(form, 'Amount 9 Debtor 2', fmt(net2)), 'Amount 9 Debtor 2');
    }
  }

  // ─── Combined household total ─────────────────────────────────
  // Line 10: Add lines 9 columns together
  track(setText(form, 'Amount 10', fmt(data.computed.householdNet)), 'Amount 10');
  // Line 11: Other regular contributions to household (default 0)
  track(setText(form, 'Amount 11', fmt(0)), 'Amount 11');
  // Line 12: Sum lines 10+11
  track(setText(form, 'Amount 12', fmt(data.computed.householdNet)), 'Amount 12');
  // Line 13: Expected increase/decrease — leave blank, attorney attests

  return {
    formCode: 'B106I',
    label: 'Schedule I — Your Income',
    mapped,
    total: 85,
    gaps,
  };
}

module.exports = { map };
