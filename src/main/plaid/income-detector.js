// Plaid → income receipts (DRAFT generator).
//
// Given a case and a 6-month window, scan plaid_transactions for
// recurring deposits that look like wage income. Group by (source +
// cadence), surface as draft receipts that the attorney reviews and
// accepts in the renderer. Nothing is written to income_receipts here
// — that's an explicit attorney action in phase 2.

/**
 * Detect candidate income receipts in the 6-month statutory CMI window.
 *
 * Returns an array of receipt drafts:
 *   [{ pay_date, gross_amount, source_label, plaid_transaction_id,
 *      cadence, confidence }]
 *
 * Rules:
 *   - Only credits (Plaid: amount < 0)
 *   - Plaid PFC.primary === 'INCOME', OR
 *   - Recurring deposits matching same merchant_name within ±5%
 *     amount over ≥3 occurrences in the window
 */
function detectIncomeReceipts({ db, caseId, windowStart, windowEnd }) {
  const txns = db.prepare(`
    SELECT t.*, a.item_id
    FROM plaid_transactions t
    JOIN plaid_accounts a ON a.id = t.account_id
    JOIN plaid_items   i ON i.id = a.item_id
    WHERE i.case_id = ?
      AND i.status = 'active'
      AND t.date >= ? AND t.date <= ?
      AND t.amount < 0          -- Plaid: negative = credit/deposit
      AND t.pending = 0
    ORDER BY t.date ASC
  `).all(caseId, windowStart, windowEnd);

  const drafts = [];

  // Path 1: Plaid already classified as INCOME → high confidence
  for (const t of txns) {
    if (t.category_primary === 'INCOME') {
      drafts.push({
        pay_date: t.date,
        gross_amount: -t.amount,
        source_label: t.merchant_name || t.name || 'Income deposit',
        plaid_transaction_id: t.plaid_transaction_id,
        cadence: 'pfc_classified',
        confidence: 'high',
      });
    }
  }

  // Path 2: recurring-deposit pattern → medium confidence
  // Group by merchant_name (or name) and look for 3+ deposits with
  // amounts within ±5% of the median.
  const byMerchant = new Map();
  for (const t of txns) {
    if (t.category_primary === 'INCOME') continue;     // already handled
    const key = (t.merchant_name || t.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(t);
  }
  for (const [, group] of byMerchant) {
    if (group.length < 3) continue;
    const amounts = group.map(t => -t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const within5pct = group.filter(t => Math.abs((-t.amount) - median) <= median * 0.05);
    if (within5pct.length < 3) continue;
    for (const t of within5pct) {
      drafts.push({
        pay_date: t.date,
        gross_amount: -t.amount,
        source_label: t.merchant_name || t.name,
        plaid_transaction_id: t.plaid_transaction_id,
        cadence: estimateCadence(within5pct.map(x => x.date)),
        confidence: 'medium',
      });
    }
  }

  // Dedupe by plaid_transaction_id (a txn could be hit by both paths)
  const seen = new Set();
  return drafts.filter(d => {
    if (seen.has(d.plaid_transaction_id)) return false;
    seen.add(d.plaid_transaction_id);
    return true;
  });
}

function estimateCadence(isoDates) {
  if (!isoDates || isoDates.length < 2) return 'unknown';
  const sorted = [...isoDates].sort();
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]);
    const b = new Date(sorted[i]);
    gaps.push(Math.round((b - a) / (1000 * 60 * 60 * 24)));
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg <= 8)  return 'weekly';
  if (avg <= 16) return 'biweekly';
  if (avg <= 17) return 'semimonthly';
  if (avg <= 35) return 'monthly';
  return 'irregular';
}

module.exports = { detectIncomeReceipts, estimateCadence };
