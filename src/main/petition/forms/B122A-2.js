// Form B 122A-2 — Chapter 7 Means Test Calculation.
// 136 fields, 9 pages. Heavy "undefined_N" naming — coverage modest.
//
// The underlying means-test engine (lib/means-test.js) does the math; this
// mapper fills the cleanly-named header + vehicle slots, and surfaces a
// targeted gap that points the attorney to the Means Test tab where the
// calculation is already visible and accurate.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

function parseVehicleDesc(desc) {
  if (!desc) return null;
  const m = String(desc).match(/(\b(?:19|20)\d{2}\b)\s+([A-Za-z]+)\s+([A-Za-z0-9\- ]+?)(?=\s*(?:VIN|,|—|-|$))/);
  if (m) return { year: m[1], make: m[2], model: m[3].trim() };
  return null;
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // Vehicle slots (Q33 vehicle ownership / operation expense). Form has
  // "Describe Vehicle 1 1" / "Describe Vehicle 1 2" / "Describe Vehicle 2 1"
  // / "Describe Vehicle 2 2" — likely "1" = Make/Model, "2" = Year/mileage.
  const vehicles = (data.assets || []).filter(a => /vehicle|car|auto/.test(String(a.category || '').toLowerCase()));
  for (let i = 0; i < Math.min(vehicles.length, 2); i++) {
    const v = vehicles[i];
    const parsed = parseVehicleDesc(v.description);
    if (parsed) {
      track(setText(form, `Describe Vehicle ${i + 1} 1`, `${parsed.make} ${parsed.model}`), `Describe Vehicle ${i + 1} 1`);
      track(setText(form, `Describe Vehicle ${i + 1} 2`, parsed.year), `Describe Vehicle ${i + 1} 2`);
    } else {
      track(setText(form, `Describe Vehicle ${i + 1} 1`, v.description || ''), `Describe Vehicle ${i + 1} 1`);
    }
  }

  // The means-test calculation itself involves:
  //   - 6-month CMI annualized
  //   - applicable IRS Local + National Standards
  //   - Specific monthly deductions (taxes, insurance, secured debt, etc.)
  //   - Unsecured priority debt monthly average
  //   - 60-month chapter 13 disposable income equivalent
  //
  // Tabula's lib/means-test.js engine produces the answer. The form is
  // basically a transcription of that engine's output. Without confident
  // field-name mapping for the 50+ "undefined_N" fields, the high-leverage
  // gap is to point the attorney at the engine output.
  gaps.push({
    field: 'Means test computation lines',
    reason: 'The Means Test tab in Tabula runs the full § 707(b) calculation (CMI, applicable IRS standards, secured-debt deduction, priority debt). Transcribe its output to lines 5-39 on this form. Auto-fill of those specific fields ships in a follow-up.',
  });

  // Final result checkboxes (40 / 42 / 43 check):
  //   40 check = "There is no presumption of abuse" (line 14a result)
  //   42 check = "There is a presumption of abuse" (line 14b result)
  //   43 check = "Income above" (means-test required regardless)
  //
  // These come from the means-test engine; surface as gap so attorney
  // confirms after running the engine.
  gaps.push({
    field: 'Lines 40 / 42 / 43 check',
    reason: 'Final means-test result checkbox: 40=no presumption, 42=presumption, 43=income above median. Engine result on Means Test tab determines which.',
  });

  return {
    formCode: 'B122A-2',
    label: 'Chapter 7 Means Test Calculation',
    mapped,
    total: 136,
    gaps,
  };
}

module.exports = { map };
