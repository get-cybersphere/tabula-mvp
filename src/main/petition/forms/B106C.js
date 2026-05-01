// Form B 106C — Schedule C: The Property You Claim as Exempt.
// 104 fields, 2 pages. Up to 14+ exemption slots.
//
// Each slot has:
//   - description (what's exempt — e.g., "2019 Honda Civic" or "Residence")
//   - undefined / undefined (likely "value of the portion you own" + "amount of exemption you claim")
//   - "Schedule AB" — a back-reference to the line on Schedule A/B where
//     this asset was listed
//
// We populate from assets where exemption_amount > 0.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function suffixFor(i) {
  if (i === 0) return '';
  return `_${i + 1}`;
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const exemptAssets = (data.assets || []).filter(a =>
    a.exemption_statute || Number(a.exemption_amount || 0) > 0
  );

  if (exemptAssets.length === 0) {
    gaps.push({
      field: 'Exemptions',
      reason: 'No exemptions claimed yet. Ensure attorney has selected federal vs state scheme and applied per-asset exemption statutes — without exemptions, all non-exempt property is subject to trustee liquidation in Ch. 7.',
    });
    return { formCode: 'B106C', label: 'Schedule C — Exemptions', mapped, total: 104, gaps };
  }

  // Track which exemption scheme — we don't know without an attorney
  // selection. Default neither checkbox; surface as a gap.
  // check 1 = federal exemptions § 522(b)(2)
  // check 2.1/2.2/2.3 = state exemptions and the various state subsets
  gaps.push({
    field: 'Exemption scheme',
    reason: 'Confirm § 522(b)(2) federal exemptions vs § 522(b)(3) state-and-federal-nonbankruptcy. Choice determines availability of homestead, vehicle, etc.',
  });

  const slots = exemptAssets.slice(0, 14);
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    const sfx = suffixFor(i);

    // Description (the asset label)
    track(setText(form, `description${sfx}`, a.description || ''), `description${sfx}`);
    // Schedule AB back-reference. Tabula doesn't track the line number
    // on Schedule A/B yet, so we use the schedule letter as a hint.
    const scheduleRef = a.schedule === 'A' ? 'A' : 'B';
    track(setText(form, `Schedule AB${sfx}`, scheduleRef), `Schedule AB${sfx}`);

    // The "value of portion you own" and "exemption amount" fields are
    // unfortunately the "undefined_N" / "undefined_M" pattern. We can't
    // confidently target those without form-rendering tests, so we surface
    // the dollar values as part of the description for attorney review.
    if (Number(a.exemption_amount || 0) > 0) {
      gaps.push({
        field: `Exemption ${i + 1} amount`,
        reason: `${a.description || 'asset'}: claiming $${fmt(a.exemption_amount)} under ${a.exemption_statute || '(statute pending)'}. Verify amount on the form (auto-fill of the exemption $ field is a known TODO).`,
      });
    } else if (a.exemption_statute) {
      gaps.push({
        field: `Exemption ${i + 1} amount`,
        reason: `${a.description || 'asset'}: ${a.exemption_statute} statute applied but no amount entered. Add exemption amount.`,
      });
    }
  }

  if (exemptAssets.length > 14) {
    gaps.push({
      field: 'Exemption slot 15+',
      reason: `${exemptAssets.length - 14} additional exempt assets — attach continuation page`,
    });
  }

  return {
    formCode: 'B106C',
    label: 'Schedule C — Exemptions',
    mapped,
    total: 104,
    gaps,
  };
}

module.exports = { map };
