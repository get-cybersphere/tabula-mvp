// Form B121 — Statement About Your Social Security Numbers.
// One page, 27 fields. Fills cleanly from debtor1 + debtor2 SSN.

const { setText, setCheck, setDropdown } = require('../pdf-utils');

function map(form, data) {
  const d1 = data.debtor1 || {};
  const d2 = data.debtor2 || null;

  const gaps = [];
  let mapped = 0;

  function track(ok, name, gapNote) {
    if (ok) { mapped++; return; }
    if (gapNote) gaps.push({ field: name, reason: gapNote });
  }

  // District + case number
  track(setDropdown(form, 'Bankruptcy District Information', data.case.district),
        'Bankruptcy District Information',
        data.case.district ? null : 'Filing district not set on case');
  track(setText(form, 'Case number1', data.case.caseNumber),
        'Case number1',
        data.case.caseNumber ? null : 'No case number assigned yet (assigned by clerk on filing)');

  // Debtor 1 name
  track(setText(form, 'Debtor1.First name', d1.first), 'Debtor1.First name',
        d1.first ? null : 'Debtor first name missing');
  track(setText(form, 'Debtor1.Middle name', d1.middle), 'Debtor1.Middle name', null);
  track(setText(form, 'Debtor1.Last name', d1.last), 'Debtor1.Last name',
        d1.last ? null : 'Debtor last name missing');

  // Debtor 1 SSN — 9 digits split or full string. Form has SSNum + ITINNum
  // + a/b suffixed variants for last-4. We populate all SSN-shaped fields
  // and let the form clip via its mask.
  if (d1.ssn) {
    const digits = d1.ssn.replace(/\D/g, '');
    if (digits.length === 9) {
      // Form has separate "Debtor1a.SSNum" and "Debtor1b.SSNum" — one is
      // for full-SSN debtors, the other for last-4 only. We fill both
      // cautiously: full-SSN form expects all 9, last-4 form clips.
      track(setText(form, 'Debtor1a.SSNum', digits), 'Debtor1a.SSNum');
      track(setText(form, 'Debtor1b.SSNum', digits.slice(-4)), 'Debtor1b.SSNum');
    } else {
      gaps.push({ field: 'Debtor1.SSNum', reason: 'SSN must be 9 digits — got: ' + (digits.length) + ' digits' });
    }
    // Default check the "I have an SSN" box. Box 1 = "I have", Box 2 = "ITIN", etc.
    track(setCheck(form, 'Check Box1', true), 'Check Box1');
  } else {
    gaps.push({ field: 'Debtor1.SSNum', reason: 'Debtor SSN missing — required for filing' });
  }

  // Debtor 2 (joint filer)
  if (d2) {
    track(setText(form, 'Debtor2.First name', d2.first), 'Debtor2.First name',
          d2.first ? null : 'Joint debtor first name missing');
    track(setText(form, 'Debtor2.Middle name_2', d2.middle), 'Debtor2.Middle name_2', null);
    track(setText(form, 'Debtor2.Last name', d2.last), 'Debtor2.Last name',
          d2.last ? null : 'Joint debtor last name missing');
    if (d2.ssn) {
      const digits = d2.ssn.replace(/\D/g, '');
      track(setText(form, 'Debtor2a SSNum', digits), 'Debtor2a SSNum');
      track(setText(form, 'Debtor2b SSNum', digits.slice(-4)), 'Debtor2b SSNum');
      track(setCheck(form, 'Check Box3', true), 'Check Box3');
    }
  }

  // Execution date — leave for attorney signature flow; filing date may
  // not be set yet at petition draft time.

  return {
    formCode: 'B121',
    label: 'Statement About Your Social Security Numbers',
    mapped,
    total: 27,
    gaps,
  };
}

module.exports = { map };
