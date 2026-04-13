const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDeadlines, computeUpcomingDeadlines, addDays } = require('../../src/renderer/lib/deadlines');

const FILED = '2026-04-01T00:00:00.000Z';
const NOW = '2026-04-13T00:00:00.000Z'; // 12 days after filing

// ─────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────

test('returns empty array for case without filed_at', () => {
  assert.deepEqual(computeDeadlines({ chapter: 7, status: 'in_progress' }), []);
});

test('returns empty array for null case', () => {
  assert.deepEqual(computeDeadlines(null), []);
});

// ─────────────────────────────────────────────────────────────
// Chapter 7 deadlines
// ─────────────────────────────────────────────────────────────

test('chapter 7: generates 341 meeting, objection deadline, discharge, financial course', () => {
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, NOW);
  const keys = deadlines.map(d => d.key);
  assert.ok(keys.includes('341_meeting'));
  assert.ok(keys.includes('objection_deadline'));
  assert.ok(keys.includes('expected_discharge'));
  assert.ok(keys.includes('financial_mgmt_course'));
});

test('chapter 7: 341 meeting window is 21-40 days after filing', () => {
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, NOW);
  const meeting = deadlines.find(d => d.key === '341_meeting');
  assert.equal(meeting.date, addDays(FILED, 21));
  assert.equal(meeting.rangeEnd, addDays(FILED, 40));
});

test('chapter 7: objection deadline is 60 days after 341 window ends', () => {
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, NOW);
  const objection = deadlines.find(d => d.key === 'objection_deadline');
  assert.equal(objection.date, addDays(addDays(FILED, 40), 60));
});

// ─────────────────────────────────────────────────────────────
// Chapter 13 deadlines
// ─────────────────────────────────────────────────────────────

test('chapter 13: includes plan confirmation and first plan payment, excludes objection/discharge', () => {
  const deadlines = computeDeadlines({ chapter: 13, status: 'filed', filed_at: FILED }, NOW);
  const keys = deadlines.map(d => d.key);
  assert.ok(keys.includes('plan_confirmation'));
  assert.ok(keys.includes('first_plan_payment'));
  assert.ok(!keys.includes('objection_deadline'), 'Ch13 has no creditor objection-to-discharge');
  assert.ok(!keys.includes('expected_discharge'), 'Ch13 discharge is post plan completion');
});

test('chapter 13: plan confirmation hearing is 45 days after filing (§ 1324)', () => {
  const deadlines = computeDeadlines({ chapter: 13, status: 'filed', filed_at: FILED }, NOW);
  const plan = deadlines.find(d => d.key === 'plan_confirmation');
  assert.equal(plan.date, addDays(FILED, 45));
});

test('chapter 13: first plan payment due 30 days after filing (§ 1326)', () => {
  const deadlines = computeDeadlines({ chapter: 13, status: 'filed', filed_at: FILED }, NOW);
  const payment = deadlines.find(d => d.key === 'first_plan_payment');
  assert.equal(payment.date, addDays(FILED, 30));
});

test('chapter 13: 341 window stretches to +50 days (vs ch7 +40)', () => {
  const deadlines = computeDeadlines({ chapter: 13, status: 'filed', filed_at: FILED }, NOW);
  const meeting = deadlines.find(d => d.key === '341_meeting');
  assert.equal(meeting.rangeEnd, addDays(FILED, 50));
});

// ─────────────────────────────────────────────────────────────
// Status annotation
// ─────────────────────────────────────────────────────────────

test('deadline status is "upcoming" for future dates', () => {
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, NOW);
  const objection = deadlines.find(d => d.key === 'objection_deadline');
  assert.equal(objection.status, 'upcoming');
  assert.ok(objection.daysFromNow > 0);
});

test('deadline status is "upcoming" when inside a range (341 window open)', () => {
  // now = filed + 30, which is inside the 21-40 day 341 window
  const now = addDays(FILED, 30);
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, now);
  const meeting = deadlines.find(d => d.key === '341_meeting');
  assert.equal(meeting.status, 'upcoming');
});

test('deadline status is "past" when both date and rangeEnd have passed', () => {
  const now = addDays(FILED, 100); // past everything
  const deadlines = computeDeadlines({ chapter: 7, status: 'filed', filed_at: FILED }, now);
  const meeting = deadlines.find(d => d.key === '341_meeting');
  assert.equal(meeting.status, 'past');
});

test('deadlines for discharged case are "completed"', () => {
  const deadlines = computeDeadlines({ chapter: 7, status: 'discharged', filed_at: FILED }, NOW);
  for (const d of deadlines) {
    assert.equal(d.status, 'completed');
  }
});

// ─────────────────────────────────────────────────────────────
// Firm-wide aggregation
// ─────────────────────────────────────────────────────────────

test('computeUpcomingDeadlines: skips cases without filed_at', () => {
  const cases = [
    { id: 'a', chapter: 7, status: 'intake' },  // no filed_at
    { id: 'b', chapter: 7, status: 'filed', filed_at: FILED, first_name: 'John', last_name: 'Doe' },
  ];
  const out = computeUpcomingDeadlines(cases, NOW);
  assert.ok(out.every(d => d.case_id === 'b'));
});

test('computeUpcomingDeadlines: sorts ascending by date and adds debtor name', () => {
  const cases = [
    { id: 'a', chapter: 7, status: 'filed', filed_at: addDays(FILED, -10), first_name: 'Alice', last_name: 'A' },
    { id: 'b', chapter: 13, status: 'filed', filed_at: addDays(FILED, 10), first_name: 'Bob', last_name: 'B' },
  ];
  const out = computeUpcomingDeadlines(cases, NOW);
  for (let i = 1; i < out.length; i++) {
    assert.ok(new Date(out[i - 1].date) <= new Date(out[i].date));
  }
  assert.ok(out.every(d => d.debtor_name));
});

test('computeUpcomingDeadlines: respects limit', () => {
  const cases = [
    { id: 'a', chapter: 7, status: 'filed', filed_at: FILED, first_name: 'A', last_name: 'A' },
    { id: 'b', chapter: 13, status: 'filed', filed_at: FILED, first_name: 'B', last_name: 'B' },
  ];
  const out = computeUpcomingDeadlines(cases, NOW, 2);
  assert.equal(out.length, 2);
});
