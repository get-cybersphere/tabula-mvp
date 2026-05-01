// Universal header / footer filler.
//
// Every B-series form has a common header at the top of every page:
//   "Debtor 1" / "Debtor 2" / "Case number" / "District" dropdown.
// pdf-lib flattens those repeating fields under a single AcroForm name on
// most templates, so a single setText() call fills every page.
//
// The helper also uses the "Check if this is an amended filing" checkbox
// when applicable (we leave it unchecked by default for original filings;
// future hook lets the UI tag a packet as 'amended').

const { setText, setDropdown, setCheck } = require('../pdf-utils');

function fillHeader(form, data, opts = {}) {
  const d1 = data.debtor1 || {};
  const d2 = data.debtor2 || null;
  const caseNumber = data.case.caseNumber || '';
  const district = data.case.district || '';
  const stats = { hits: 0, attempts: 0 };

  const tries = [
    ['Debtor 1', d1.fullName],
    ['Debtor 2', d2 ? d2.fullName : ''],
    ['Case number', caseNumber],
    ['Case number1', caseNumber],
    ['Case number_2', caseNumber],
    ['Case number_3', caseNumber],
    ['Case number if known_3', caseNumber],
    ['Case number if known_4', caseNumber],
  ];
  for (const [name, value] of tries) {
    stats.attempts++;
    if (setText(form, name, value)) stats.hits++;
  }

  // Bankruptcy district dropdown — appears on B101, B121, B122A-2, B106I,
  // B106Dec. setDropdown() returns false silently if the field doesn't
  // exist on this form so it's safe to call unconditionally.
  if (district) {
    stats.attempts++;
    if (setDropdown(form, 'Bankruptcy District Information', district)) stats.hits++;
  }

  // Amended filing checkbox — most schedules carry this but B101 doesn't.
  // Default unchecked; mappers may override per packet `opts.amended`.
  if (opts.amended) {
    setCheck(form, 'Check if this is an', true);
  }

  return stats;
}

module.exports = { fillHeader };
