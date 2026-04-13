const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeCompleteness,
  completenessScore,
  REQUIRED_DOCS_BY_CHAPTER,
} = require('../../src/renderer/lib/case-completeness');

// Helpers to build test cases
function emptyCase(overrides = {}) {
  return {
    chapter: 7,
    debtors: [],
    income: [],
    expenses: [],
    creditors: [],
    assets: [],
    documents: [],
    flags: [],
    ...overrides,
  };
}

function fullDebtor() {
  return [{
    is_joint: 0,
    first_name: 'John',
    last_name: 'Doe',
    ssn: '123-45-6789',
    dob: '1985-04-15',
    address_street: '742 Evergreen Terrace',
    address_city: 'Austin',
    address_state: 'TX',
    address_zip: '78702',
  }];
}

function fullDocSet() {
  return REQUIRED_DOCS_BY_CHAPTER[7].map(t => ({ doc_type: t }));
}

// ─────────────────────────────────────────────────────────────
// Empty case
// ─────────────────────────────────────────────────────────────

test('empty case is not ready to file and has many missing items', () => {
  const c = computeCompleteness(emptyCase());
  // Note: a small baseline score is expected because "no review flags"
  // trivially passes the "all resolved" check. The meaningful signal is
  // `readyToFile === false` and a non-empty `missing` list.
  assert.equal(c.readyToFile, false);
  assert.ok(c.missing.length >= 5, 'should flag most required items as missing');
  assert.ok(c.score < 20, `baseline score should be small, got ${c.score}`);
});

test('null case returns zero state without throwing', () => {
  const c = computeCompleteness(null);
  assert.equal(c.score, 0);
  assert.equal(c.readyToFile, false);
  assert.equal(c.items.length, 0);
});

// ─────────────────────────────────────────────────────────────
// Missing items are weight-ordered
// ─────────────────────────────────────────────────────────────

test('missing items list is ordered by weight (highest first)', () => {
  const c = computeCompleteness(emptyCase());
  for (let i = 1; i < c.missing.length; i++) {
    // Find the weights by cross-referencing with items
    const prev = c.items.find(it => it.key === c.missing[i - 1].key).weight;
    const curr = c.items.find(it => it.key === c.missing[i].key).weight;
    assert.ok(prev >= curr, `missing items should be weight-desc: ${prev} >= ${curr}`);
  }
});

test('optional items do not appear in missing list', () => {
  const c = computeCompleteness(emptyCase());
  // assets is optional — should not block readiness or appear in missing
  assert.ok(!c.missing.find(m => m.key === 'assets'));
});

// ─────────────────────────────────────────────────────────────
// Debtor checks
// ─────────────────────────────────────────────────────────────

test('debtor_identity passes only with all four required fields', () => {
  const partial = emptyCase({ debtors: [{ is_joint: 0, first_name: 'John', last_name: 'Doe' }] });
  const c = computeCompleteness(partial);
  assert.equal(c.items.find(i => i.key === 'debtor_identity').done, false);

  const full = emptyCase({ debtors: fullDebtor() });
  const c2 = computeCompleteness(full);
  assert.equal(c2.items.find(i => i.key === 'debtor_identity').done, true);
});

test('debtor_address requires street, city, state, and zip', () => {
  const missingZip = emptyCase({ debtors: [{
    is_joint: 0, first_name: 'J', last_name: 'D',
    address_street: '1 Main', address_city: 'Austin', address_state: 'TX',
  }] });
  const c = computeCompleteness(missingZip);
  assert.equal(c.items.find(i => i.key === 'debtor_address').done, false);
});

// ─────────────────────────────────────────────────────────────
// Doc type check — the main "what's missing" signal
// ─────────────────────────────────────────────────────────────

test('required_doc_types fails when chapter 7 is missing tax return', () => {
  const c = emptyCase({
    documents: [
      { doc_type: 'pay_stub' },
      { doc_type: 'bank_statement' },
      { doc_type: 'credit_report' },
      // tax_return missing
    ],
  });
  const result = computeCompleteness(c);
  const check = result.items.find(i => i.key === 'required_doc_types');
  assert.equal(check.done, false);
  assert.ok(/tax return/.test(check.hint), 'hint should name the missing doc');
});

test('required_doc_types passes when all 4 types present', () => {
  const c = emptyCase({ documents: fullDocSet() });
  const result = computeCompleteness(c);
  assert.equal(result.items.find(i => i.key === 'required_doc_types').done, true);
});

// ─────────────────────────────────────────────────────────────
// Review flags
// ─────────────────────────────────────────────────────────────

test('review_flags passes when no flags exist', () => {
  const c = computeCompleteness(emptyCase({ flags: [] }));
  assert.equal(c.items.find(i => i.key === 'review_flags').done, true);
});

test('review_flags fails when any flag is unresolved', () => {
  const c = computeCompleteness(emptyCase({ flags: [{ resolved: 1 }, { resolved: 0 }] }));
  const item = c.items.find(i => i.key === 'review_flags');
  assert.equal(item.done, false);
  assert.ok(/1 open/.test(item.hint));
});

test('review_flags passes when all flags resolved', () => {
  const c = computeCompleteness(emptyCase({ flags: [{ resolved: 1 }, { resolved: 1 }] }));
  assert.equal(c.items.find(i => i.key === 'review_flags').done, true);
});

// ─────────────────────────────────────────────────────────────
// End-to-end readiness
// ─────────────────────────────────────────────────────────────

test('ready to file: all required boxes ticked, score is 100 or near', () => {
  const c = computeCompleteness(emptyCase({
    chapter: 7,
    debtors: fullDebtor(),
    income: [{ source: 'Employment' }],
    expenses: [{ category: 'rent' }, { category: 'food' }],
    creditors: [{ name: 'Capital One' }],
    assets: [{ description: 'Car' }],
    documents: fullDocSet(),
    flags: [],
  }));
  assert.equal(c.readyToFile, true);
  assert.equal(c.score, 100);
  assert.equal(c.missing.length, 0);
});

test('score is proportional — partially complete case is between 0 and 100', () => {
  const c = computeCompleteness(emptyCase({
    debtors: fullDebtor(),
    income: [{ source: 'Employment' }],
    // missing expenses, creditors, docs
  }));
  assert.ok(c.score > 0 && c.score < 100, `expected middling score, got ${c.score}`);
  assert.equal(c.readyToFile, false);
});

test('completenessScore is a shorthand for compute().score', () => {
  const stub = emptyCase({ debtors: fullDebtor() });
  assert.equal(completenessScore(stub), computeCompleteness(stub).score);
});
