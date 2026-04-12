const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectPII, dedupeOverlaps } = require('../../src/main/redaction/detector');

// Helpers
const types = (matches) => matches.map(m => m.type).sort();
const values = (matches) => matches.map(m => m.value);
const has = (matches, type, value) =>
  matches.some(m => m.type === type && m.value === value);

// ─────────────────────────────────────────────────────────────
// SSN detection
// ─────────────────────────────────────────────────────────────

test('detects hyphenated SSN', () => {
  const text = 'Employee SSN 123-45-6789 on file';
  const hits = detectPII(text);
  assert.ok(has(hits, 'ssn', '123-45-6789'), 'should find SSN');
});

test('does NOT match ITIN as SSN (ITIN starts with 9)', () => {
  const text = 'ITIN 912-34-5678';
  const hits = detectPII(text);
  assert.equal(hits.filter(h => h.type === 'ssn').length, 0, 'should not classify ITIN as SSN');
  assert.ok(has(hits, 'itin', '912-34-5678'), 'should find ITIN');
});

test('detects label-anchored 9-digit SSN without hyphens', () => {
  const text = 'Social Security Number: 123456789';
  const hits = detectPII(text);
  assert.ok(has(hits, 'ssn', '123456789'), 'should find bare SSN when labeled');
});

test('does NOT match bare 9-digit runs without label', () => {
  // Could be a routing number, tax ID, etc.
  const text = 'Order confirmation 123456789';
  const hits = detectPII(text);
  assert.equal(hits.filter(h => h.type === 'ssn').length, 0, 'bare digits are not SSN');
});

// ─────────────────────────────────────────────────────────────
// Phone detection — critical regression tests
// ─────────────────────────────────────────────────────────────

test('detects phone in canonical formats', () => {
  for (const phone of ['(555) 123-4567', '555-123-4567', '555.123.4567', '555 123 4567']) {
    const hits = detectPII(`Call me at ${phone} today`);
    assert.ok(
      hits.some(h => h.type === 'phone'),
      `should match phone format: ${phone}`
    );
  }
});

test('REGRESSION: phone regex does NOT match a hyphenated SSN', () => {
  // The original implementation would match 123-45-6789 as a phone
  // because 3/2/4 digit groups can look like 3/3/4 after grouping.
  const text = 'SSN: 123-45-6789';
  const hits = detectPII(text);
  assert.equal(
    hits.filter(h => h.type === 'phone').length,
    0,
    'SSN must not be classified as phone'
  );
});

test('REGRESSION: phone regex does NOT match long digit runs without separators', () => {
  // Employee IDs, barcodes, etc.
  const text = 'Employee ID 5551234567 on payroll';
  const hits = detectPII(text);
  assert.equal(
    hits.filter(h => h.type === 'phone').length,
    0,
    'bare 10 digits must not be classified as phone'
  );
});

test('REGRESSION: phone regex does NOT match dollar figures', () => {
  const text = 'Total YTD: $15,234.56 Federal Tax: 5551.23';
  const hits = detectPII(text);
  assert.equal(
    hits.filter(h => h.type === 'phone').length,
    0,
    'dollar amounts must not be classified as phone'
  );
});

// ─────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────

test('detects email address', () => {
  const text = 'Contact: john.doe+test@example.co.uk';
  const hits = detectPII(text);
  assert.ok(has(hits, 'email', 'john.doe+test@example.co.uk'));
});

// ─────────────────────────────────────────────────────────────
// DOB
// ─────────────────────────────────────────────────────────────

test('detects DOB when labeled', () => {
  const cases = [
    'DOB: 04/15/1980',
    'Date of Birth: 4-15-80',
    'Born 04/15/1980',
  ];
  for (const t of cases) {
    const hits = detectPII(t);
    assert.ok(
      hits.some(h => h.type === 'dob'),
      `should find DOB in: ${t}`
    );
  }
});

test('does NOT match unlabeled dates as DOB (pay period dates must pass through)', () => {
  const text = 'Pay Period: 03/01/2026 - 03/15/2026';
  const hits = detectPII(text);
  assert.equal(hits.filter(h => h.type === 'dob').length, 0, 'pay period dates are not DOB');
});

// ─────────────────────────────────────────────────────────────
// Account / Routing
// ─────────────────────────────────────────────────────────────

test('detects full account number when labeled', () => {
  const text = 'Account Number: 123456789012';
  const hits = detectPII(text);
  assert.ok(has(hits, 'account', '123456789012'));
});

test('does NOT redact last-4 account references', () => {
  const text = 'Account ****4821 statement';
  const hits = detectPII(text);
  assert.equal(hits.filter(h => h.type === 'account').length, 0, 'last-4 must stay visible');
});

test('detects routing number when labeled', () => {
  const text = 'Routing: 021000021';
  const hits = detectPII(text);
  assert.ok(has(hits, 'routing', '021000021'));
});

// ─────────────────────────────────────────────────────────────
// Debtor name — middle name / initial handling
// ─────────────────────────────────────────────────────────────

test('detects debtor full name', () => {
  const text = 'Employee: John Doe';
  const hits = detectPII(text, { firstName: 'John', lastName: 'Doe' });
  assert.ok(has(hits, 'debtor_name', 'John Doe'));
});

test('detects debtor name with middle name', () => {
  const text = 'Payroll for John Quincy Doe';
  const hits = detectPII(text, { firstName: 'John', lastName: 'Doe' });
  assert.ok(
    hits.some(h => h.type === 'debtor_name' && /Quincy/.test(h.value)),
    'should match full name with middle name'
  );
});

test('detects debtor name with middle initial (with period)', () => {
  const text = 'John Q. Doe, employee';
  const hits = detectPII(text, { firstName: 'John', lastName: 'Doe' });
  assert.ok(
    hits.some(h => h.type === 'debtor_name' && /Q\./.test(h.value)),
    'should match name with middle initial'
  );
});

test('detects debtor name in reverse form', () => {
  const text = 'Name: Doe, John';
  const hits = detectPII(text, { firstName: 'John', lastName: 'Doe' });
  assert.ok(has(hits, 'debtor_name', 'Doe, John'));
});

test('handles regex metacharacters in debtor name safely', () => {
  // Should not throw and should match exactly
  const text = 'Employee: John O.Brien';
  const hits = detectPII(text, { firstName: 'John', lastName: 'O.Brien' });
  assert.ok(
    hits.some(h => h.type === 'debtor_name'),
    'debtor name with special chars should match safely'
  );
});

// ─────────────────────────────────────────────────────────────
// Overlap dedup
// ─────────────────────────────────────────────────────────────

test('dedupeOverlaps keeps longer match at same start', () => {
  const matches = [
    { type: 'short', value: 'abc', start: 10, end: 13 },
    { type: 'long', value: 'abcdef', start: 10, end: 16 },
  ];
  const result = dedupeOverlaps(matches);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'long');
});

test('dedupeOverlaps keeps both when non-overlapping', () => {
  const matches = [
    { type: 'a', value: 'abc', start: 0, end: 3 },
    { type: 'b', value: 'xyz', start: 10, end: 13 },
  ];
  const result = dedupeOverlaps(matches);
  assert.equal(result.length, 2);
});

test('dedupeOverlaps handles empty input', () => {
  assert.deepEqual(dedupeOverlaps([]), []);
});

// ─────────────────────────────────────────────────────────────
// Financial data should NEVER be redacted
// ─────────────────────────────────────────────────────────────

test('does NOT redact dollar amounts', () => {
  const text = `
    Gross Pay: $2,109.00
    Federal Tax: $253.08
    Social Security: $130.76
    Medicare: $30.58
    Net Pay: $1,401.63
    YTD Gross: $12,654.00
  `;
  const hits = detectPII(text);
  // No matches should contain dollar figures
  for (const h of hits) {
    assert.ok(
      !/\$/.test(h.value) && !/^\d+[,.]\d+$/.test(h.value),
      `dollar amount leaked into detection: ${h.type} = ${h.value}`
    );
  }
});

test('does NOT redact employer names', () => {
  const text = 'Employer: Acme Industries LLC';
  const hits = detectPII(text);
  assert.equal(hits.length, 0, 'plain employer names should pass through');
});

// ─────────────────────────────────────────────────────────────
// End-to-end paystub fixture
// ─────────────────────────────────────────────────────────────

test('E2E paystub: catches PII, preserves financials', () => {
  const paystub = `
    EMPLOYEE PAYSTUB
    Employer: Acme Industries LLC
    Employee: John Q. Doe
    SSN: 123-45-6789
    Phone: (512) 555-1234
    Email: jdoe@example.com

    Pay Period: 03/01/2026 - 03/15/2026
    Pay Frequency: Biweekly

    Gross Pay: $2,109.00
    Federal Tax: $253.08
    Social Security: $130.76
    Net Pay: $1,401.63
  `;
  const hits = detectPII(paystub, { firstName: 'John', lastName: 'Doe' });
  const kinds = new Set(hits.map(h => h.type));

  assert.ok(kinds.has('ssn'), 'SSN detected');
  assert.ok(kinds.has('phone'), 'Phone detected');
  assert.ok(kinds.has('email'), 'Email detected');
  assert.ok(kinds.has('debtor_name'), 'Debtor name detected');

  // Financials preserved
  for (const h of hits) {
    assert.ok(
      !/2,?109|253\.08|130\.76|1,?401\.63/.test(h.value),
      `financial figure leaked: ${h.value}`
    );
    assert.ok(
      !/Acme/.test(h.value),
      `employer name leaked: ${h.value}`
    );
  }
});
