// Form B 106 Summary — Summary of Your Assets and Liabilities and Certain
// Statistical Information. 28 fields. All values are derived totals from
// the underlying schedules.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name) => { if (ok) mapped++; };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const c = data.computed;

  // Line 1a — Real property total (from Schedule A/B)
  track(setText(form, '1a', fmt(c.totalRealProperty)), '1a');
  // Line 1b — Personal property total (from Schedule A/B)
  track(setText(form, '1b', fmt(c.totalPersonalProperty)), '1b');
  // Line 1c — Total assets (1a + 1b)
  track(setText(form, '1c', fmt(c.totalAssets)), '1c');

  // Line 2 — Liabilities: Schedule D total
  track(setText(form, '2', fmt(c.totalSecuredClaims)), '2');
  // Line 3a — Schedule E/F priority total
  track(setText(form, '3a', fmt(c.totalPriorityClaims)), '3a');
  // Line 3b — Schedule E/F non-priority unsecured total
  track(setText(form, '3b', fmt(c.totalUnsecuredClaims)), '3b');
  // Line 3c — Total liabilities
  track(setText(form, '3c', fmt(c.totalDebt)), '3c');

  // Line 4 — Schedule I income (combined)
  track(setText(form, '4', fmt(c.householdNet)), '4');
  // Line 5 — Schedule J total expenses
  track(setText(form, '5', fmt(c.totalExpenses)), '5');

  // Q6/Q7 — case characterization (consumer vs business; small number of
  // creditors). For Chapter 7 consumer we can default check 6 ("yes" to
  // primarily consumer debts) but leave Q7 (1-49 creditors checkbox)
  // alone — that depends on actual creditor count.
  track(setCheck(form, 'check6', true), 'check6');
  if (data.creditors && data.creditors.length > 0 && data.creditors.length < 50) {
    track(setCheck(form, 'check7', true), 'check7');
  }

  if (c.totalDebt === 0) {
    gaps.push({ field: '3c', reason: 'No creditors recorded — total debt is $0. Confirm before filing.' });
  }
  if (c.totalAssets === 0) {
    gaps.push({ field: '1c', reason: 'No assets recorded — confirm with debtor before filing.' });
  }

  return {
    formCode: 'B106Sum',
    label: 'Summary of Your Assets and Liabilities',
    mapped,
    total: 28,
    gaps,
  };
}

module.exports = { map };
