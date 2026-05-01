// Form B 106E/F — Schedule E/F: Creditors Who Have Unsecured Claims.
// 323 fields, 6 pages. Two parts:
//   Part 1: Priority unsecured (taxes, domestic support, certain wages
//           up to $14,425 limit, etc.)
//   Part 2: Non-priority unsecured (credit cards, medical bills, most
//           personal loans, deficiency claims, etc.)
//
// The form has many slots in each part (typically 4 in Part 1, 4 in Part 2
// before continuation pages). We fill from creditors table where
// schedule = 'E' or 'F'.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function suffixFor(i) {
  return i === 0 ? '' : `_${i + 1}`;
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const priority  = data.creditorBuckets?.priority || [];
  const unsecured = data.creditorBuckets?.unsecured || [];

  // ─── Part 1: priority unsecured ──────────────────────────────
  if (priority.length === 0) {
    track(setCheck(form, 'check1', true), 'check1'); // "No, no priority unsecured"
  } else {
    const slots = priority.slice(0, 4);
    for (let i = 0; i < slots.length; i++) {
      const c = slots[i];
      const sfx = suffixFor(i);
      track(setText(form, `Creditors Name${sfx}`, c.name), `Creditors Name${sfx}`);
      track(setText(form, `Street${sfx}`, c.address || ''), `Street${sfx}`);
      // Amount at field "1" / "1_N"
      const amountField = i === 0 ? '1' : `1_${i + 1}`;
      track(setText(form, amountField, fmt(c.claim || 0)), amountField);
      if (c.isContingent) track(setCheck(form, `Contingent${sfx}`, true), `Contingent${sfx}`);
      if (c.isDisputed)   track(setCheck(form, `Disputed${sfx}`, true),   `Disputed${sfx}`);
    }
    if (priority.length > 4) {
      gaps.push({
        field: 'Priority creditor slot 5+',
        reason: `${priority.length - 4} additional priority creditors — continuation page needed`,
      });
    }
  }

  // ─── Part 2: non-priority unsecured ──────────────────────────
  // Field naming for Part 2 typically continues the same "_N" suffix
  // sequence after Part 1's 4 slots — i.e., creditor 5 = suffix _5,
  // creditor 6 = _6, etc. The exact mapping depends on the form
  // revision; this implementation maps Part 2 starting at suffix _5
  // to align with the form's continuation logic.
  if (unsecured.length === 0 && priority.length === 0) {
    // Already set check1 above for the no-creditors path.
  } else if (unsecured.length > 0) {
    const startIdx = Math.max(4, priority.length); // continue past priority slots
    const slots = unsecured.slice(0, 8); // form has roughly 8 Part 2 slots
    for (let i = 0; i < slots.length; i++) {
      const c = slots[i];
      const slotIdx = startIdx + i;
      const sfx = suffixFor(slotIdx);
      track(setText(form, `Creditors Name${sfx}`, c.name), `Creditors Name${sfx}`);
      track(setText(form, `Street${sfx}`, c.address || ''), `Street${sfx}`);
      const amountField = `1_${slotIdx + 1}`;
      track(setText(form, amountField, fmt(c.claim || 0)), amountField);
      if (c.isContingent) track(setCheck(form, `Contingent${sfx}`, true), `Contingent${sfx}`);
      if (c.isDisputed)   track(setCheck(form, `Disputed${sfx}`, true),   `Disputed${sfx}`);
    }
    if (unsecured.length > 8) {
      gaps.push({
        field: 'Unsecured creditor slot 9+',
        reason: `${unsecured.length - 8} additional non-priority unsecured creditors — Part 2 continuation page needed`,
      });
    }
  }

  // Surface a gap encouraging attorney review of priority/non-priority split.
  // Tabula's `schedule` column is a hint; final classification (especially
  // for priority vs non-priority taxes, support, wages) needs attorney eyes.
  if (priority.length === 0 && unsecured.some(c => /tax|support|alimony|wages/i.test(c.type || c.name || ''))) {
    gaps.push({
      field: 'Priority classification',
      reason: 'No creditors marked priority but some look like they could qualify (tax / support / wages). Confirm under § 507(a).',
    });
  }

  return {
    formCode: 'B106EF',
    label: 'Schedule E/F — Unsecured Claims',
    mapped,
    total: 323,
    gaps,
  };
}

module.exports = { map };
