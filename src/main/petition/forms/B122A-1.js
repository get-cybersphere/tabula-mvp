// Form B 122A-1 — Chapter 7 Statement of Your Current Monthly Income.
// 60 fields, 2 pages. Heavy "undefined_N" field naming — our coverage is
// modest. We fill the header + clearly-named fields and surface gaps for
// the rest, since the underlying means-test calculation (lib/means-test.js)
// is independently visible on the Means Test tab.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // Filing status checkboxes (Check 1-4 are the four marital/filing-status
  // options). We default to "not married" if no joint filer; "married
  // filing jointly with non-filing spouse exclusion election" needs
  // attorney input.
  if (data.isJoint) {
    // Married, filing jointly. We don't know if they're electing the
    // non-filing-spouse exclusion (Check 3 or Check 4) — surface as gap.
    gaps.push({
      field: 'Filing status (Check 1-4)',
      reason: 'Joint filing detected — choose between "married filing jointly with both incomes counted" (Check 4) vs "non-filing-spouse exclusion" (Check 3) per § 707(b)(2)(A)(i)',
    });
  } else {
    track(setCheck(form, 'Check 1', true), 'Check 1');
  }

  // Number in household
  // Tabula doesn't track dependents yet — surface as gap.
  gaps.push({
    field: 'Number in household',
    reason: 'Household size needs to come from debtor interview (Tabula does not yet model dependents). Required for median-income comparison.',
  });

  // Monthly income (Lines 2-10): We have totals from Schedule I but the
  // form's specific "undefined_N" field names map to specific income types
  // (gross wages, business income, rental, interest, retirement, support,
  // unemployment, other income, etc.). Without per-line audit we can't
  // confidently set those — surface as a gap referring to the means-test
  // calculation already shown in Tabula.
  if (data.computed?.householdGross > 0) {
    gaps.push({
      field: 'Lines 2-10 (monthly income breakdown)',
      reason: `Total gross monthly income $${fmt(data.computed.householdGross)} per Schedule I. The means-test engine (Means Test tab) computes the 6-month average ("CMI") which goes here. Confirm each line item from extracted paystubs / 1099s.`,
    });
  }

  // Date fields — leave for signature
  // 14a/14b checkboxes — these are the abuse-presumption flags; the
  // means-test engine determines this. We default neither (attorney sets).
  gaps.push({
    field: '14a/14b abuse-presumption check',
    reason: 'Run means test (Means Test tab) → if CMI x 12 > applicable median, presumption of abuse arises (Check 14b); else Check 14a.',
  });

  return {
    formCode: 'B122A-1',
    label: 'Chapter 7 Statement of Current Monthly Income',
    mapped,
    total: 60,
    gaps,
  };
}

module.exports = { map };
