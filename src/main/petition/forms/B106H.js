// Form B 106H — Schedule H: Your Codebtors.
// 150 fields, 2 pages. The form has 11 numbered codebtor slots (3.1 through
// 3.11) plus a Spouse section at the top.
//
// Tabula doesn't currently track codebtors as a first-class entity — they
// live conceptually wherever a creditor was co-signed. We populate what
// we can: the joint debtor (if any) goes in the spouse section, and we
// flag missing codebtors as a gap so the attorney can add them after
// generation.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const d2 = data.debtor2;

  // Spouse section: applies if the case is a joint filing and the debtor
  // lived in a community-property state in the past 8 years. We can fill
  // the spouse name + address from debtor2; the community-property state
  // determination requires attorney review.
  if (d2) {
    track(setText(form, 'Spouse Name', d2.fullName), 'Spouse Name');
    track(setText(form, 'Spouse Street', d2.address.street || ''), 'Spouse Street');
    track(setText(form, 'Spouse City', d2.address.city), 'Spouse City');
    track(setText(form, 'Spouse State', d2.address.state), 'Spouse State');
    track(setText(form, 'Spouse Zip', d2.address.zip), 'Spouse Zip');
    track(setCheck(form, 'check2', true), 'check2');
    gaps.push({
      field: 'Community state',
      reason: 'Confirm whether debtors lived in a community-property state in the last 8 years (AZ, CA, ID, LA, NV, NM, TX, WA, WI, PR)',
    });
  } else {
    track(setCheck(form, 'check1', true), 'check1');
  }

  // Per-creditor codebtors. Tabula doesn't track these separately yet —
  // surface as a gap so attorney adds them post-generation.
  gaps.push({
    field: 'Codebtor 3.1+ slots',
    reason: 'Tabula does not track per-creditor codebtors yet. If anyone (other than spouse) co-signed any debt, add their name + address + which schedule (D/E-F/G) line(s) they relate to.',
  });

  // The "no codebtors" toggle (check1) and "yes" (check3) — we already set
  // check1 above when no joint debtor exists. The codebtor follow-up
  // questions stay blank until the attorney resolves the gap.

  return {
    formCode: 'B106H',
    label: 'Schedule H — Your Codebtors',
    mapped,
    total: 150,
    gaps,
  };
}

module.exports = { map };
