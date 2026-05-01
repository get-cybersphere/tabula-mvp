// Form B 106D — Schedule D: Creditors Who Have Claims Secured by Property.
// 186 fields, 3 pages. The form has 5 creditor slots in Part 1 plus
// "Notify others" entries in Part 2.
//
// Each Part 1 slot has:
//   - Creditors Name + Street + (3 undefined fields likely city/state/zip
//     and account number — we map to street + city/state/zip when we can
//     infer from the creditor's stored address)
//   - Date debt was incurred
//   - Account number (last 4 typically)
//   - "1" / "2" / "3" / "4" → amount of claim, value of property, etc.
//   - Contingent / Unliquidated / Disputed checkboxes
//   - Lien type checkbox: agreement (mortgage/secured), statutory,
//     judgment, or other
//
// We pull from the creditors table where schedule = 'D'.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function suffixFor(i) {
  return i === 0 ? '' : `_${i + 1}`;
}

function lienCheckboxFor(debtType) {
  const t = String(debtType || '').toLowerCase();
  if (/mortgage|home|real|second/.test(t)) return 'An agreement you made such as mortgage or secured';
  if (/auto|car|vehicle|truck/.test(t)) return 'An agreement you made such as mortgage or secured';
  if (/tax|statutory/.test(t)) return 'Statutory lien such as tax lien mechanics lien';
  if (/judgment/.test(t)) return 'Judgment lien from a lawsuit';
  return 'An agreement you made such as mortgage or secured';
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const secured = data.creditorBuckets?.secured || [];
  if (secured.length === 0) {
    track(setCheck(form, 'check1', true), 'check1'); // "No, no secured claims"
    gaps.push({ field: 'Secured creditors', reason: 'No secured creditors recorded. If the debtor owes mortgage / auto loan / lien, add to Schedule D.' });
    return { formCode: 'B106D', label: 'Schedule D — Secured Claims', mapped, total: 186, gaps };
  }

  // Up to 5 creditor slots in Part 1.
  const slots = secured.slice(0, 5);
  for (let i = 0; i < slots.length; i++) {
    const c = slots[i];
    const sfx = suffixFor(i);

    // Name + street
    track(setText(form, `Creditors Name${sfx}`, c.name), `Creditors Name${sfx}`);
    track(setText(form, `Street${sfx}`, c.address || ''), `Street${sfx}`);
    // Account number
    const acctField = i === 0 ? 'account number' : `account number ${i + 1}`;
    track(setText(form, acctField, c.accountLast4 ? `****${c.accountLast4}` : ''), acctField);
    // Lien type checkbox
    track(setCheck(form, lienCheckboxFor(c.type) + sfx, true), lienCheckboxFor(c.type) + sfx);
    // Contingent / Unliquidated / Disputed
    if (c.isContingent) track(setCheck(form, `Contingent${sfx}`, true), `Contingent${sfx}`);
    if (c.isDisputed)   track(setCheck(form, `Disputed${sfx}`, true),   `Disputed${sfx}`);

    // The form's "1" / "2" / "3" / "4" fields are the claim amount,
    // value of property, unsecured portion, etc. We map "1" to claim amount
    // since that's the only number we have stored for this creditor.
    const oneField = i === 0 ? '1' : `1_${i + 1}`;
    track(setText(form, oneField, fmt(c.claim || 0)), oneField);
    // Collateral description gets noted via gap if present (no obvious
    // dedicated field beyond "Other" — attorney usually writes it on
    // the form).
    if (c.collateral) {
      gaps.push({
        field: `Slot ${i + 1} collateral`,
        reason: `Collateral description "${c.collateral}" — write on form near creditor row (no AcroForm field for it on this revision)`,
      });
    }
  }
  if (secured.length > 5) {
    gaps.push({
      field: 'Secured creditor slot 6+',
      reason: `${secured.length - 5} additional secured creditors — attach Part 1 continuation page`,
    });
  }

  return {
    formCode: 'B106D',
    label: 'Schedule D — Secured Claims',
    mapped,
    total: 186,
    gaps,
  };
}

module.exports = { map };
