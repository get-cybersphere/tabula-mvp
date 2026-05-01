// Form B106 Declaration — Declaration About an Individual Debtor's Schedules.
// 15 fields. Just header + signature lines.

const { setText, setDropdown } = require('../pdf-utils');
const { fillHeader } = require('./_common');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // Signature lines are intentionally left blank — the attorney prints +
  // signs. We don't auto-populate a signature image. We DO set the
  // "Executed on" date to today's date as a sensible default; the
  // attorney can overwrite at sign time.
  const today = new Date().toLocaleDateString('en-US');
  track(setText(form, 'Executed on', today), 'Executed on');
  track(setText(form, 'Debtor2.Executed on', data.isJoint ? today : ''), 'Debtor2.Executed on');

  // The "amended" check — leave unchecked for original filings.

  return {
    formCode: 'B106Dec',
    label: 'Declaration About Schedules',
    mapped,
    total: 15,
    gaps,
  };
}

module.exports = { map };
