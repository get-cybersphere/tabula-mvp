// Undisclosed-income detector.
//
// Surfaces deposit patterns that don't match any declared income source.
// A bankruptcy trustee will pull the same statements and ask: "What's
// this $1,800 monthly deposit you didn't list on Schedule I?"
// Catching it pre-filing lets the attorney either disclose properly or
// confirm the deposit is legitimately non-income (refunds, transfers
// between own accounts, gifts).
//
// Heuristic:
//   1. Group inflows by normalized payer name
//   2. For each payer with ≥ 3 deposits clustered around a median amount,
//      compute the implied monthly contribution
//   3. If no declared income source's `employer_name` matches the payer
//      AND the implied monthly value > $250, flag as undisclosed
//
// We deliberately ignore one-off deposits (transfers, refunds) and
// payers that look like the debtor's own accounts.

const RECURRING_MIN_COUNT = 3;
const RECURRING_AMOUNT_TOLERANCE = 0.15;
const MIN_MONTHLY_FLAG = 250;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function payerLooksLikeOwnAccount(name) {
  return /\b(transfer|xfer|dep|deposit|wire|trnsfr|own|self)\b/i.test(name) &&
         !/\b(payroll|salary|wages)\b/i.test(name);
}

function payerLikelyMatchesEmployer(payer, declaredIncome) {
  if (!declaredIncome || declaredIncome.length === 0) return false;
  const p = normalize(payer);
  if (!p) return false;
  for (const inc of declaredIncome) {
    const e = normalize(inc.employer_name || '');
    const s = normalize(inc.source || '');
    if (!e && !s) continue;
    if (e && (p.includes(e) || e.includes(p))) return true;
    if (s && (p.includes(s) || s.includes(p))) return true;
    // Token overlap on long-ish tokens
    const pt = new Set(p.split(' ').filter(t => t.length >= 4));
    for (const t of (e + ' ' + s).split(' ')) {
      if (t.length >= 4 && pt.has(t)) return true;
    }
  }
  return false;
}

function findUndisclosedIncome(transactions, declaredIncome = []) {
  // Inflows: positive amounts or 'credit' / 'deposit' types
  const inflows = transactions.filter(t => {
    const amt = Number(t.amount);
    if (Number.isFinite(amt) && amt > 0) return true;
    if (t.type && /credit|deposit|transfer.?in/i.test(t.type)) return true;
    return false;
  });
  if (inflows.length === 0) return [];

  // Group by normalized payer
  const byPayer = {};
  for (const t of inflows) {
    const key = normalize(t.merchant);
    if (!key) continue;
    if (payerLooksLikeOwnAccount(t.merchant)) continue;
    byPayer[key] = byPayer[key] || { display: t.merchant, txns: [] };
    byPayer[key].txns.push(t);
  }

  const findings = [];
  for (const [_, group] of Object.entries(byPayer)) {
    const txns = group.txns;
    if (txns.length < RECURRING_MIN_COUNT) continue;

    const amounts = txns.map(t => Math.abs(Number(t.amount) || 0)).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const within = amounts.filter(a => Math.abs(a - median) / Math.max(1, median) <= RECURRING_AMOUNT_TOLERANCE);
    if (within.length < RECURRING_MIN_COUNT) continue;

    if (payerLikelyMatchesEmployer(group.display, declaredIncome)) continue;

    // Estimate monthly: median * (count / months_spanned)
    const dates = txns.map(t => Date.parse(t.date)).filter(Number.isFinite).sort();
    if (!dates.length) continue;
    const monthsSpanned = Math.max(1, (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24 * 30.44));
    const monthlyEst = (median * txns.length) / monthsSpanned;
    if (monthlyEst < MIN_MONTHLY_FLAG) continue;

    findings.push({
      code: 'undisclosed_income',
      label: `Recurring deposit not on Schedule I: ${group.display}`,
      severity: monthlyEst >= 1000 ? 'high' : 'medium',
      payer: group.display,
      monthlyEstimate: monthlyEst,
      transactionCount: txns.length,
      medianAmount: median,
      transactions: txns,
      suggestedDisposition: `${txns.length} recurring deposits averaging ~$${monthlyEst.toFixed(0)}/mo from a payer that doesn't match any declared income source. Either add to Schedule I (Line 8a-h: other income) OR confirm with debtor that these are non-income (account transfer, refund, gift). Trustee will see these on the same statements.`,
    });
  }

  return findings;
}

module.exports = { findUndisclosedIncome };
