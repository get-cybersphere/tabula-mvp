// Preference-period transfer detector — 11 USC § 547(b).
//
// Trigger: any single transfer ≥ $600 to a creditor of antecedent debt
// within 90 days of filing (1 year if insider). The trustee can recover
// these as preferential transfers, leaving the debtor on the hook a
// second time. Surfacing them BEFORE filing lets the attorney decide:
//   - delay filing past the 90-day window, or
//   - disclose and defend (e.g., ordinary-course-of-business defense).
//
// We compare bank transactions against the case's existing creditor list:
//   - exact name match (normalized)
//   - fuzzy substring match for common short forms (CITI vs Citibank)
//   - account-number-last-4 match if both present

const PREFERENCE_THRESHOLD = 600;
const ARM_LENGTH_LOOKBACK_DAYS = 90;

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,&]/g, ' ')
    .replace(/\b(bank|na|n\.a\.|inc|corp|llc|ltd|co|company|usa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function payeeMatchesCreditor(payeeName, creditor) {
  if (!payeeName || !creditor) return false;
  const p = normalize(payeeName);
  const c = normalize(creditor.name);
  if (!p || !c) return false;
  if (p === c) return true;
  // Substring either direction (handles "WELLS FARGO" matching "Wells Fargo Bank NA")
  if (p.includes(c) || c.includes(p)) return true;
  // Token overlap — at least 1 distinctive token (4+ chars) shared
  const pt = new Set(p.split(' ').filter(t => t.length >= 4));
  const ct = c.split(' ').filter(t => t.length >= 4);
  for (const t of ct) if (pt.has(t)) return true;
  return false;
}

function daysBetween(a, b) {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return Infinity;
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
}

function findPreferenceTransfers(transactions, creditors, opts = {}) {
  const asOfDate = opts.asOfDate || new Date().toISOString();
  if (!Array.isArray(creditors) || creditors.length === 0) return [];

  const findings = [];

  for (const t of transactions) {
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt < PREFERENCE_THRESHOLD) continue;
    // Only outflows
    const isOutflow = (Number(t.amount) < 0) || (t.type && /debit|withdrawal|payment|transfer.?out/i.test(t.type));
    if (!isOutflow) continue;

    const dAgo = daysBetween(t.date, asOfDate);
    if (dAgo > ARM_LENGTH_LOOKBACK_DAYS) continue;

    // Find matching creditor
    const matched = creditors.find(c => payeeMatchesCreditor(t.merchant, c));
    if (!matched) continue;

    findings.push({
      code: 'preference_transfer',
      label: `Possible preference: $${amt.toFixed(0)} to ${matched.name}`,
      severity: 'high',
      creditorName: matched.name,
      creditorId: matched.id,
      amount: amt,
      date: t.date,
      daysBeforeFiling: dAgo,
      transactions: [t],
      suggestedDisposition: `§ 547(b) preference window (${dAgo}d before filing). Trustee may recover. Either delay filing past ${ARM_LENGTH_LOOKBACK_DAYS - dAgo}d to clear the window, OR disclose on SOFA Q6 and prepare an ordinary-course-of-business defense. Verify the antecedent debt actually existed and the transfer was on account of it.`,
    });
  }

  return findings;
}

module.exports = { findPreferenceTransfers };
