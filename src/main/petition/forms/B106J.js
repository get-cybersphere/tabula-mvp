// Form B 106J — Schedule J: Your Expenses.
// 79 fields. Bucket Tabula expenses into Schedule J line numbers via
// expense-categorizer, then fill totals.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');
const { bucketExpenses } = require('../expense-categorizer');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const { buckets, unmatched } = bucketExpenses(data.expenses);

  // Fill each bucketed line. Line names map directly to AcroForm names.
  for (const [line, amount] of Object.entries(buckets)) {
    if (!amount) continue;
    track(setText(form, line, fmt(amount)), line);
  }

  // Line 5 — sum of lines 6-23 expense categories (some forms compute this).
  // Line 21 — Combined total monthly expenses.
  // We compute these from the buckets ourselves so the totals are present
  // even if the form doesn't auto-calc.
  const totalExpenses = data.computed.totalExpenses;
  track(setText(form, '21', fmt(totalExpenses)), '21');

  // Line 22a/22b/22c — calculation of monthly net income
  // 22a = combined monthly income (from Schedule I line 12)
  // 22b = total monthly expenses (line 21)
  // 22c = monthly net income (22a - 22b)
  track(setText(form, '22a', fmt(data.computed.householdNet)), '22a');
  track(setText(form, '22b', fmt(totalExpenses)), '22b');
  track(setText(form, '22c', fmt(data.computed.monthlyNet)), '22c');

  // Dependents — no schema yet. Surface as a gap so attorney adds inline.
  gaps.push({
    field: 'Dependents (line 2a-e)',
    reason: 'Dependents not tracked in Tabula yet — add directly on Schedule J after generation',
  });

  if (unmatched.length) {
    gaps.push({
      field: 'Other (line 19)',
      reason: `${unmatched.length} expense${unmatched.length === 1 ? '' : 's'} bucketed as "Other" — re-categorize for proper line placement: ` +
        unmatched.slice(0, 5).map(e => `"${e.category}" $${fmt(e.monthly_amount)}`).join(', '),
    });
  }

  if (totalExpenses === 0) {
    gaps.push({ field: '21', reason: 'No expenses recorded — Schedule J cannot be filed empty' });
  }

  // Line 24 - Last question is whether expenses are expected to change
  // (yes/no checkbox). Default to "no" — most cases don't.
  track(setCheck(form, 'check24', false), 'check24');

  return {
    formCode: 'B106J',
    label: 'Schedule J — Your Expenses',
    mapped,
    total: 79,
    gaps,
  };
}

module.exports = { map };
