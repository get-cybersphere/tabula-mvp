// Insider transfer detector — flags payments to individuals that may be
// preferences (11 USC § 547) or fraudulent transfers (§ 548).
//
// Two distinct legal windows matter:
//   - 90 days before filing: arms-length preferences > $600 (consumer)
//   - 1 year before filing: insider preferences (relatives, business affiliates)
//
// We can't *know* who's an insider without the attorney telling us — but
// the attorney isn't going to scroll 12 months of statements looking for
// the relevant transactions. Our job: flag every payment to an
// individual-named payee in BOTH windows, let the attorney mark which
// payees are insiders.
//
// Patterns we surface:
//   - Single transfer to an individual ≥ $600
//   - Recurring payment to an individual (≥ 3 over 6mo, ≈ same amount)
//   - Aggregate to an individual ≥ $1500/yr

const { classifyPayee } = require('./name-detector');

function normalizePayee(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/^(ZELLE TO|VENMO TO|CASH APP TO|PAYPAL TO|ACH|EFT|WIRE|DEBIT|TRANSFER TO|PAYMENT TO|PAY TO)[\s:#-]*/i, '')
    .replace(/[#:].*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const PREFERENCE_THRESHOLD = 600;       // 11 USC § 547(c)(8) — consumer
const INSIDER_LOOKBACK_DAYS = 365;
const ARM_LENGTH_LOOKBACK_DAYS = 90;
const RECURRING_MIN_COUNT = 3;
const RECURRING_AMOUNT_TOLERANCE = 0.10; // 10%

function daysAgo(date, asOf) {
  const t1 = Date.parse(date);
  const t2 = asOf ? Date.parse(asOf) : Date.now();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return Infinity;
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
}

function findInsiderRisk(transactions, opts = {}) {
  const asOfDate = opts.asOfDate || new Date().toISOString();
  const findings = [];

  // Only outflows (negative amounts or explicitly typed as 'debit') — we
  // don't care about deposits FROM individuals here.
  const outflows = transactions.filter(t => {
    const amt = Number(t.amount);
    if (Number.isFinite(amt) && amt < 0) return true;
    if (t.type && /debit|withdrawal|payment|transfer.?out/i.test(t.type)) return true;
    return false;
  });

  // Group by normalized payee
  const byPayee = {};
  for (const t of outflows) {
    const key = normalizePayee(t.merchant);
    if (!key) continue;
    const cls = classifyPayee(key);
    if (cls !== 'individual') continue;
    byPayee[key] = byPayee[key] || { name: key, txns: [] };
    byPayee[key].txns.push(t);
  }

  for (const [name, group] of Object.entries(byPayee)) {
    const txns = group.txns;
    const totalAmount = txns.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

    // Single large transfer >= preference threshold
    for (const t of txns) {
      const amt = Math.abs(Number(t.amount) || 0);
      if (amt >= PREFERENCE_THRESHOLD) {
        const dAgo = daysAgo(t.date, asOfDate);
        const inArmsLengthWindow = dAgo <= ARM_LENGTH_LOOKBACK_DAYS;
        const inInsiderWindow = dAgo <= INSIDER_LOOKBACK_DAYS;
        if (!inInsiderWindow) continue;
        findings.push({
          code: 'insider_single_transfer',
          label: `Large transfer to individual: ${name}`,
          severity: inArmsLengthWindow ? 'high' : 'medium',
          payee: name,
          amount: amt,
          date: t.date,
          daysBeforeFiling: dAgo,
          window: inArmsLengthWindow ? '90-day' : '1-year',
          transactions: [t],
          suggestedDisposition: inArmsLengthWindow
            ? 'Disclose on SOFA Q7 (transfers in 2 years). If recipient is non-insider creditor, this is a § 547 preference subject to clawback. Confirm relationship.'
            : 'Disclose on SOFA Q7 (transfers in 2 years). § 547 only reaches insiders within 1 year — confirm whether this payee is an insider per § 101(31).',
        });
      }
    }

    // Recurring payment pattern (≥ 3 transfers within ±10% of median amount)
    if (txns.length >= RECURRING_MIN_COUNT) {
      const amounts = txns.map(t => Math.abs(Number(t.amount) || 0)).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      const within = amounts.filter(a => Math.abs(a - median) / Math.max(1, median) <= RECURRING_AMOUNT_TOLERANCE);
      if (within.length >= RECURRING_MIN_COUNT) {
        // Sort txns by date for cadence display
        const sorted = [...txns].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        findings.push({
          code: 'insider_recurring',
          label: `Recurring payment to individual: ${name}`,
          severity: 'high',
          payee: name,
          amount: median,
          totalAmount,
          transactionCount: txns.length,
          firstDate: sorted[0].date,
          lastDate: sorted[sorted.length - 1].date,
          transactions: txns,
          suggestedDisposition: `${txns.length} payments of ~$${median.toFixed(0)} totaling $${totalAmount.toFixed(0)} to an individual. Confirm relationship — if family member or business affiliate (§ 101(31) insider), full 1-year window applies. Disclose on SOFA Q7 if any transfer is in the look-back.`,
        });
      }
    }
  }

  // Aggregate-to-individual: if NOT already flagged as recurring or single
  // large, but total > $1500 per year, surface as a softer signal.
  for (const [name, group] of Object.entries(byPayee)) {
    const total = group.txns.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    if (total < 1500) continue;
    const alreadyFlagged = findings.some(f =>
      (f.code === 'insider_single_transfer' || f.code === 'insider_recurring') &&
      f.payee === name
    );
    if (alreadyFlagged) continue;
    findings.push({
      code: 'insider_aggregate',
      label: `Aggregate payments to individual: ${name}`,
      severity: 'medium',
      payee: name,
      totalAmount: total,
      transactionCount: group.txns.length,
      transactions: group.txns,
      suggestedDisposition: `${group.txns.length} payments totaling $${total.toFixed(0)} across the period. Confirm whether this individual is a relative, business affiliate, or arms-length recipient.`,
    });
  }

  return findings;
}

module.exports = { findInsiderRisk };
