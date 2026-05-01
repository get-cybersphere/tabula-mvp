// Form B 107 — Statement of Financial Affairs (SOFA).
// 535 fields, 12 pages. The biggest form in the packet.
//
// Most of SOFA is narrative + yes/no answers from the debtor interview:
// "Have you filed bankruptcy in the last 8 years?" "Have you transferred
// any property in the last 2 years?" "Lived at any other address?" etc.
// These are NOT inferrable from Tabula data — the attorney walks the
// debtor through the questionnaire.
//
// Our approach: fill the universal header (every page repeats it),
// auto-set "no" on yes/no questions where Tabula data clearly shows no
// activity (e.g., no bank-intel insider findings → no Q7 transfers
// disclosed), and surface gaps directing the attorney to the source data.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // SOFA is mostly attorney-driven from the debtor questionnaire. Surface
  // the high-leverage gaps where Tabula HAS data the attorney should
  // cross-reference, plus a reminder that the rest comes from interview.
  gaps.push({
    field: 'Q1-3: prior names + spouse + addresses (last 3 yrs)',
    reason: 'From debtor interview. Tabula does not yet capture prior addresses or aliases.',
  });

  gaps.push({
    field: 'Q4: gross income for current + 2 prior years',
    reason: 'From tax returns. If multiple years of 1040 PDFs are uploaded, Tabula can extract them — see the Documents tab.',
  });

  // Q6 — payments of $600+ to creditors in 90d before filing.
  // Bank intel preference findings cover this.
  gaps.push({
    field: 'Q6: payments to creditors (90d, $600+)',
    reason: 'See Insights tab → Preference findings. Each finding is a Q6 disclosure candidate.',
  });

  // Q7 — transfers in last 2 years (insider, others).
  gaps.push({
    field: 'Q7: transfers in last 2 years',
    reason: 'See Insights tab → Insider findings. Cross-reference each insider transfer for Q7 disclosure (note: 2-year look-back vs preference 90-day/1-year window).',
  });

  // Q9 — losses from gambling, fire, theft.
  gaps.push({
    field: 'Q9: losses from gambling, fire, theft',
    reason: 'Bank intel may flag gambling activity (DraftKings, FanDuel, etc.). Confirm net losses for SOFA Q9.',
  });

  // Q11 — payments for debt counseling / bankruptcy advice.
  gaps.push({
    field: 'Q11: payments for debt counseling',
    reason: 'Disclose any payment to attorney, debt-relief agency, credit-counseling agency in last year.',
  });

  // Q15-16: prior addresses
  gaps.push({
    field: 'Q15-16: prior addresses (last 3 yrs)',
    reason: 'From debtor interview. If debtor moved in the look-back, list each prior residence.',
  });

  // Q17-18: business operations
  gaps.push({
    field: 'Q17-18: business operations',
    reason: 'If the debtor operated, was a sole proprietor of, or held an interest in a business in the last 4 years, full disclosure required.',
  });

  // Q20-30: tax filings, lawsuits, repossessions, etc.
  gaps.push({
    field: 'Q20-30: lawsuits, garnishments, repossessions, foreclosure, returned property',
    reason: 'Pulls from court records / collections — manual disclosure from interview.',
  });

  return {
    formCode: 'B107',
    label: 'Statement of Financial Affairs',
    mapped,
    total: 535,
    gaps,
  };
}

module.exports = { map };
