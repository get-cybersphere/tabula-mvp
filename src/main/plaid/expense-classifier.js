// Plaid → manual_deductions (DRAFT generator).
//
// Maps Plaid Personal Finance Category (PFC) primary categories to
// B122A-2 deduction lines. Surfaces drafts for attorney review;
// nothing writes to manual_deductions here — that's an explicit
// attorney action in phase 2.
//
// Mapping coverage is intentionally conservative. Any PFC primary not
// in the map is left alone (returned in `unmapped` for inspection).

const PFC_TO_B122A = {
  // PFC primary                    B122A-2 line
  'RENT_AND_UTILITIES':    'B122A-2 Line 8',   // already covered by IRS Local
                                                // (we surface but flag overlap)
  'TRANSPORTATION':         'B122A-2 Line 13',  // operating
  'LOAN_PAYMENTS':          'B122A-2 Line 33a', // secured debt average
  'MEDICAL':                'B122A-2 Line 22',  // additional health care
  'INSURANCE':              'B122A-2 Line 25',  // health/disability/HSA
  'CHILD_CARE':             'B122A-2 Line 21',  // childcare for employment
  'TAX_PAYMENT':            'B122A-2 Line 35',  // priority debt (back taxes)
  'CHARITABLE_CONTRIBUTIONS': 'B122A-2 Line 27', // charitable (capped)
};

const B122A_LINE_LABELS = {
  'B122A-2 Line 8':   'Housing & utilities',
  'B122A-2 Line 13':  'Transportation operating',
  'B122A-2 Line 21':  'Childcare for employment',
  'B122A-2 Line 22':  'Additional health care',
  'B122A-2 Line 25':  'Health insurance / disability / HSA',
  'B122A-2 Line 27':  'Charitable contributions',
  'B122A-2 Line 33a': 'Avg monthly secured debt',
  'B122A-2 Line 35':  'Priority debt',
};

// PFC primaries we deliberately do NOT map. Either ambiguous,
// already covered by national/local IRS standards, or not deductible.
const PFC_IGNORE = new Set([
  'BANK_FEES', 'GENERAL_MERCHANDISE', 'GENERAL_SERVICES',
  'PERSONAL_CARE', 'FOOD_AND_DRINK',                // → IRS National Std
  'ENTERTAINMENT', 'TRAVEL',                         // not deductible
  'TRANSFER_IN', 'TRANSFER_OUT',                     // ledger noise
]);

/**
 * Classify expense transactions in the window into draft B122A-2
 * deductions, summed and averaged over the 6-month window.
 *
 * Returns: {
 *   drafts: [{ b122a_line, label, monthly_amount, source_count,
 *              source_transactions: [plaid_transaction_id, ...],
 *              overlap_with_irs_standard?: boolean }],
 *   unmapped: [{ pfc_primary, transaction_count, total_amount }]
 * }
 */
function classifyExpenses({ db, caseId, windowStart, windowEnd }) {
  const txns = db.prepare(`
    SELECT t.*
    FROM plaid_transactions t
    JOIN plaid_accounts a ON a.id = t.account_id
    JOIN plaid_items   i ON i.id = a.item_id
    WHERE i.case_id = ?
      AND i.status = 'active'
      AND t.date >= ? AND t.date <= ?
      AND t.amount > 0          -- Plaid: positive = debit/expense
      AND t.pending = 0
  `).all(caseId, windowStart, windowEnd);

  const monthCount = monthsInWindow(windowStart, windowEnd) || 6;
  const byLine = new Map();   // b122a_line → { sum, count, ids[] }
  const unmapped = new Map(); // pfc_primary → { count, sum }

  for (const t of txns) {
    const pfc = t.category_primary;
    if (!pfc) {
      unmapped.set('UNCLASSIFIED', incOrInit(unmapped.get('UNCLASSIFIED'), t.amount));
      continue;
    }
    if (PFC_IGNORE.has(pfc)) continue;
    const line = PFC_TO_B122A[pfc];
    if (!line) {
      unmapped.set(pfc, incOrInit(unmapped.get(pfc), t.amount));
      continue;
    }
    if (!byLine.has(line)) byLine.set(line, { sum: 0, count: 0, ids: [] });
    const entry = byLine.get(line);
    entry.sum += t.amount;
    entry.count += 1;
    entry.ids.push(t.plaid_transaction_id);
  }

  const drafts = [...byLine.entries()].map(([line, e]) => ({
    b122a_line: line,
    label: B122A_LINE_LABELS[line] || line,
    monthly_amount: Math.round((e.sum / monthCount) * 100) / 100,
    source_count: e.count,
    source_transactions: e.ids,
    overlap_with_irs_standard:
      line === 'B122A-2 Line 8' || line === 'B122A-2 Line 13',
  }));

  return {
    drafts,
    unmapped: [...unmapped.entries()].map(([pfc, e]) => ({
      pfc_primary: pfc,
      transaction_count: e.count,
      total_amount: Math.round(e.sum * 100) / 100,
    })),
  };
}

function incOrInit(prev, amount) {
  if (!prev) return { count: 1, sum: amount };
  return { count: prev.count + 1, sum: prev.sum + amount };
}

function monthsInWindow(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const s = new Date(startISO), e = new Date(endISO);
  if (isNaN(s) || isNaN(e)) return null;
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
}

module.exports = { classifyExpenses, PFC_TO_B122A, B122A_LINE_LABELS };
