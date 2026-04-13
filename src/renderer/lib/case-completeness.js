// Case completeness — pure derivation from case state.
//
// Given a case object (as returned by cases:get), returns a structured
// checklist of what the case has and what's missing. Used by:
// - Dashboard: completeness % chip per row
// - Case Detail Overview: expanded checklist with "fix it" hints
// - Deadline/missing panels
//
// No I/O. No framework. Just data in → data out.

/**
 * Per-chapter required document types.
 * Bankruptcy practice: Chapter 7 and Chapter 13 share the core financial
 * doc requirements; Chapter 13 adds the repayment-plan cadence docs.
 */
const REQUIRED_DOCS_BY_CHAPTER = {
  7: ['pay_stub', 'bank_statement', 'tax_return', 'credit_report'],
  13: ['pay_stub', 'bank_statement', 'tax_return', 'credit_report'],
};

/** Items with weights — weight is roughly "how much of a filing blocker is this." */
const CHECK_DEFINITIONS = [
  {
    key: 'debtor_identity',
    label: 'Debtor identity',
    weight: 10,
    required: true,
    check: (c) => {
      const d = (c.debtors || []).find(d => d.is_joint === 0) || (c.debtors || [])[0];
      return !!(d && d.first_name && d.last_name && d.ssn && d.dob);
    },
    missingHint: 'Debtor first name, last name, SSN, and DOB required',
  },
  {
    key: 'debtor_address',
    label: 'Debtor address',
    weight: 5,
    required: true,
    check: (c) => {
      const d = (c.debtors || []).find(d => d.is_joint === 0) || (c.debtors || [])[0];
      return !!(d && d.address_street && d.address_city && d.address_state && d.address_zip);
    },
    missingHint: 'Full address required for venue / district determination',
  },
  {
    key: 'income',
    label: 'Income sources',
    weight: 10,
    required: true,
    check: (c) => (c.income || []).length > 0,
    missingHint: 'At least one income source needed for means test',
  },
  {
    key: 'expenses',
    label: 'Monthly expenses',
    weight: 8,
    required: true,
    check: (c) => (c.expenses || []).length > 0,
    missingHint: 'Monthly expenses required for Schedule J and means test',
  },
  {
    key: 'creditors',
    label: 'Creditor matrix',
    weight: 10,
    required: true,
    check: (c) => (c.creditors || []).length > 0,
    missingHint: 'At least one creditor required for schedules D/E/F',
  },
  {
    key: 'assets',
    label: 'Asset schedules',
    weight: 5,
    required: false,
    check: (c) => (c.assets || []).length > 0,
    missingHint: 'Add asset schedules (real/personal property) for schedule A/B',
  },
  {
    key: 'supporting_docs',
    label: 'Supporting documents uploaded',
    weight: 8,
    required: true,
    check: (c) => (c.documents || []).length > 0,
    missingHint: 'Upload paystubs, bank statements, tax returns',
  },
  {
    key: 'required_doc_types',
    label: 'All required document types present',
    weight: 10,
    required: true,
    check: (c) => {
      const required = REQUIRED_DOCS_BY_CHAPTER[c.chapter] || [];
      const present = new Set((c.documents || []).map(d => d.doc_type));
      return required.every(t => present.has(t));
    },
    missingHint: (c) => {
      const required = REQUIRED_DOCS_BY_CHAPTER[c.chapter] || [];
      const present = new Set((c.documents || []).map(d => d.doc_type));
      const missing = required.filter(t => !present.has(t));
      if (missing.length === 0) return null;
      return `Missing: ${missing.map(t => t.replace('_', ' ')).join(', ')}`;
    },
  },
  {
    key: 'review_flags',
    label: 'All review flags resolved',
    weight: 5,
    required: false,
    check: (c) => {
      const flags = c.flags || [];
      if (flags.length === 0) return true;
      return flags.every(f => f.resolved === 1 || f.resolved === true);
    },
    missingHint: (c) => {
      const open = (c.flags || []).filter(f => !f.resolved).length;
      return `${open} open review flag${open === 1 ? '' : 's'} to resolve`;
    },
  },
];

/**
 * Compute completeness for a single case.
 * @param {object} caseData - result of cases:get
 * @returns {{
 *   score: number,               // 0-100
 *   readyToFile: boolean,        // all required items passing
 *   totalItems: number,
 *   completedItems: number,
 *   items: Array<{key, label, done, required, weight, hint}>,
 *   missing: Array<{key, label, hint}>   // required-and-not-done, ordered by weight desc
 * }}
 */
function computeCompleteness(caseData) {
  if (!caseData) {
    return { score: 0, readyToFile: false, totalItems: 0, completedItems: 0, items: [], missing: [] };
  }

  const items = CHECK_DEFINITIONS.map(def => {
    const done = !!def.check(caseData);
    const hint = done
      ? null
      : typeof def.missingHint === 'function'
        ? def.missingHint(caseData)
        : def.missingHint;
    return {
      key: def.key,
      label: def.label,
      done,
      required: def.required,
      weight: def.weight,
      hint,
    };
  });

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const completedWeight = items.filter(i => i.done).reduce((s, i) => s + i.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100);

  const requiredItems = items.filter(i => i.required);
  const readyToFile = requiredItems.every(i => i.done);

  const missing = items
    .filter(i => i.required && !i.done)
    .sort((a, b) => b.weight - a.weight)
    .map(i => ({ key: i.key, label: i.label, hint: i.hint }));

  return {
    score,
    readyToFile,
    totalItems: items.length,
    completedItems: items.filter(i => i.done).length,
    items,
    missing,
  };
}

/**
 * Shorthand for dashboard: given a lightweight case summary (without nested
 * income/expenses/etc.), return just the completeness score.
 *
 * This accepts either a full case object or a partial summary — it computes
 * what it can from what's there and treats missing nested arrays as empty.
 */
function completenessScore(caseData) {
  return computeCompleteness(caseData).score;
}

module.exports = {
  computeCompleteness,
  completenessScore,
  REQUIRED_DOCS_BY_CHAPTER,
  CHECK_DEFINITIONS,
};
