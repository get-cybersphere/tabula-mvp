// Form B 106A/B — Schedule A/B: Property.
// 368 fields across 10 pages. The biggest single petition form.
//
// We map the cleanly-named fields and leave the ~70 "undefined_N" fields
// blank for the attorney. Even partial coverage takes B106A/B from <1%
// auto-fill to ~20-30% on a typical case — every value here is one less
// field the attorney has to retype from data Tabula already has.
//
// Strategy:
//   - Real estate slots 1-3 (Q1-3): city/state/zip/county + property type
//     checkboxes. Source: assets where schedule = 'A' or category looks
//     like real estate.
//   - Vehicle slots 1-2 (Q4): Make / Model / Year / mileage. Source:
//     assets where category = 'vehicle'. We parse the description for
//     "YEAR MAKE MODEL" patterns.
//   - Personal items (Q6-13): one summary description + amount per line,
//     bucketed by asset category. We sum values within each category.
//   - Cash (Q16): total of cash-category assets.
//   - Bank accounts (Q17.1-17.9): one slot per bank_account asset.
//   - Yes/no checkboxes (check 6, check 11, etc.): set to "yes" when we
//     have data for that line, "no" otherwise. The form's instruction is
//     "check yes if you own [X]" — auto-checking saves the attorney from
//     manually marking each row.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');
const { fmt } = require('../currency');

const PROPERTY_TYPE_TO_CHECKBOX = {
  single_family: 'Singlefamily home',
  singlefamily: 'Singlefamily home',
  duplex: 'Duplex or multiunit building',
  multiunit: 'Duplex or multiunit building',
  condo: 'Condominium or cooperative',
  condominium: 'Condominium or cooperative',
  cooperative: 'Condominium or cooperative',
  manufactured: 'Manufactured or mobile home',
  mobile: 'Manufactured or mobile home',
  land: 'Land',
  investment: 'Investment property',
  timeshare: 'Timeshare',
  other: 'Other',
};

// Match a description for "YEAR MAKE MODEL"
function parseVehicleDesc(desc) {
  if (!desc) return null;
  const m = String(desc).match(/(\b(?:19|20)\d{2}\b)\s+([A-Za-z]+)\s+([A-Za-z0-9\- ]+?)(?=\s*(?:VIN|,|—|-|$))/);
  if (!m) {
    // Looser: just YEAR + 2 words
    const m2 = String(desc).match(/(\b(?:19|20)\d{2}\b)\s+(\S+)\s+(\S+)/);
    if (m2) return { year: m2[1], make: m2[2], model: m2[3] };
    return null;
  }
  return { year: m[1], make: m[2], model: m[3].trim() };
}

function categoryForAsset(a) {
  return String(a.category || '').toLowerCase().replace(/[\s-]+/g, '_');
}

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // Bucket assets by their bankruptcy schedule + category.
  const assets = data.assets || [];
  const realEstate = assets.filter(a => a.schedule === 'A' || /real_estate|real estate|property|land/.test(categoryForAsset(a)));
  const vehicles = assets.filter(a => /vehicle|car|truck|auto/.test(categoryForAsset(a)));
  const cashAssets = assets.filter(a => /^cash$/.test(categoryForAsset(a)));
  const bankAccounts = assets.filter(a => /bank_account|checking|savings|account/.test(categoryForAsset(a)));
  const lifeInsurance = assets.filter(a => /life_insurance|life/.test(categoryForAsset(a)));
  const retirement = assets.filter(a => /retirement|401k|ira|pension|keogh/.test(categoryForAsset(a)));
  const householdGoods = assets.filter(a => /household|furniture|furnishings/.test(categoryForAsset(a)));
  const electronics = assets.filter(a => /electronic|computer|tv|phone/.test(categoryForAsset(a)));
  const jewelry = assets.filter(a => /jewelry|watch/.test(categoryForAsset(a)));
  const firearms = assets.filter(a => /firearm|gun|weapon/.test(categoryForAsset(a)));
  const clothing = assets.filter(a => /cloth|apparel/.test(categoryForAsset(a)));
  const sportsHobby = assets.filter(a => /sport|hobby|equipment/.test(categoryForAsset(a)));
  const collectibles = assets.filter(a => /collect|art|antique/.test(categoryForAsset(a)));

  // ─── Real estate slots 1-3 (Q1-3) ───────────────────────────
  // Each slot has the same field-name pattern with a "_N" suffix on the
  // 2nd and 3rd. The first slot has bare names; slot 2 uses "_2"; slot 3
  // uses "_3". Property type checkboxes follow the same convention.
  const realEstateSlots = realEstate.slice(0, 3);
  for (let i = 0; i < realEstateSlots.length; i++) {
    const a = realEstateSlots[i];
    const sfx = i === 0 ? '' : `_${i + 1}`;
    // Address — we may not have city/state/zip on the asset row directly;
    // fall back to the debtor's address for the primary residence.
    const isPrimary = i === 0 && /residence|primary|home/i.test(a.description || '');
    const addr = isPrimary && data.debtor1?.address ? data.debtor1.address : null;

    const cityField  = `City${sfx}`;
    const stateField = `State${sfx}`;
    const zipField   = `ZIP Code${sfx}`;
    const countyField = `County${sfx}`;

    // Try parsing city/state/zip out of the description if we don't have
    // a direct address. Looks for "..., NY 11203" style suffixes.
    let city = '', state = '', zip = '', county = '';
    if (addr) {
      city = addr.city; state = addr.state; zip = addr.zip; county = addr.county || '';
    } else {
      const desc = a.description || '';
      const m = desc.match(/,\s*([A-Z][A-Za-z .'-]{2,30}),\s*([A-Z]{2})\s+(\d{5})/);
      if (m) { city = m[1]; state = m[2]; zip = m[3]; }
    }
    track(setText(form, cityField, city),  cityField,  city ? null : `Real-estate slot ${i + 1}: city missing — set on the asset row or in case address`);
    track(setText(form, stateField, state), stateField, null);
    track(setText(form, zipField, zip),     zipField,   null);
    track(setText(form, countyField, county), countyField, county ? null : `Real-estate slot ${i + 1}: county missing — needed for venue`);

    // Property type checkbox
    const cat = categoryForAsset(a);
    const typeBox = PROPERTY_TYPE_TO_CHECKBOX[cat] ||
      (a.description && /condo/i.test(a.description) ? PROPERTY_TYPE_TO_CHECKBOX.condo : null) ||
      PROPERTY_TYPE_TO_CHECKBOX.single_family;
    track(setCheck(form, typeBox + sfx, true), typeBox + sfx);
  }
  if (realEstate.length > 3) {
    gaps.push({ field: 'Real estate slot 4+', reason: `${realEstate.length - 3} additional real-estate properties — Schedule A/B has 3 slots, attach a continuation page` });
  }

  // ─── Vehicles Q4 (cars/trucks/vans/SUVs) ─────────────────────
  // The form has "Make" / "Model" / "Year" for slot 1 and "Make_2" /
  // "Model_2" / "Year_2" for slot 2. Approximate mileage_2 / _3 / _4
  // suggests up to ~4 mileage slots — we fill what we can.
  for (let i = 0; i < Math.min(vehicles.length, 2); i++) {
    const v = vehicles[i];
    const parsed = parseVehicleDesc(v.description);
    const sfx = i === 0 ? '' : `_${i + 1}`;
    if (parsed) {
      track(setText(form, `Make${sfx}`,  parsed.make),  `Make${sfx}`);
      track(setText(form, `Model${sfx}`, parsed.model), `Model${sfx}`);
      track(setText(form, `Year${sfx}`,  parsed.year),  `Year${sfx}`);
    } else {
      gaps.push({ field: `Make${sfx}`, reason: `Could not parse YEAR MAKE MODEL from "${v.description || ''}"` });
    }
  }
  if (vehicles.length > 2) {
    gaps.push({ field: 'Vehicle slot 3+', reason: `${vehicles.length - 2} additional vehicles — fill on continuation slots manually` });
  }

  // ─── Q16: Cash ───────────────────────────────────────────────
  const totalCash = cashAssets.reduce((s, a) => s + Number(a.current_value || 0), 0);
  if (totalCash > 0) {
    track(setText(form, '16 Cash amount', fmt(totalCash)), '16 Cash amount');
    track(setCheck(form, 'Check 16', true), 'Check 16');
  } else {
    track(setCheck(form, 'Check 16', false), 'Check 16');
  }

  // ─── Q17: Bank / financial accounts (up to 9 slots) ──────────
  const bankSlots = bankAccounts.slice(0, 9);
  for (let i = 0; i < bankSlots.length; i++) {
    const slot = i + 1;
    const a = bankSlots[i];
    // First 5 are checking-style; 6-9 are "other financial account"
    const isOther = slot >= 6;
    const nameField = isOther
      ? (slot === 5 ? '17.5 Certificates of deposit account' : `17.${slot} Other financial account`)
      : `17.${slot} Checking account`;
    const amtField = isOther
      ? (slot === 5 ? '17.5 Certificates of deposit amount' : `17.${slot} Other financial amount`)
      : `17.${slot} Checking amount`;
    track(setText(form, nameField, a.description || ''), nameField);
    track(setText(form, amtField, fmt(Number(a.current_value || 0))), amtField);
  }
  if (bankAccounts.length > 0) track(setCheck(form, 'Check 17', true), 'Check 17');

  // ─── Q21 retirement: 401k, pension, IRA, etc. ────────────────
  // Match by category AND description so a generic category="retirement"
  // with description="401k" still slots correctly.
  for (let i = 0; i < Math.min(retirement.length, 7); i++) {
    const a = retirement[i];
    const sigil = (categoryForAsset(a) + ' ' + (a.description || '')).toLowerCase();
    let nameField, amtField;
    if (/401/.test(sigil))           { nameField = '21.1 401k or similar plan'; amtField = '21.1 401k or similar plan amount'; }
    else if (/pension/.test(sigil))  { nameField = '21.2 Pension plan';         amtField = '21.2 Pension plan amount'; }
    else if (/\bira\b/.test(sigil))  { nameField = '21.3 IRA';                  amtField = '21.3 IRA amount'; }
    else if (/keogh/.test(sigil))    { nameField = '21.5 Keogh';                amtField = '21.5 Keogh amount'; }
    else                              { nameField = '21.4 Retirement account';  amtField = '21.4 Retirement account amount'; }
    track(setText(form, nameField, a.description || ''), nameField);
    track(setText(form, amtField, fmt(Number(a.current_value || 0))), amtField);
  }
  if (retirement.length > 0) track(setCheck(form, 'check 21', true), 'check 21');

  // ─── Personal items Q6-Q13 (description + amount per line) ──
  const lineSpec = [
    { line: '6',  bucket: householdGoods, label: 'Household goods and furnishings' },
    { line: '7',  bucket: electronics,    label: 'Electronics' },
    { line: '8',  bucket: collectibles,   label: 'Collectibles of value' },
    { line: '9',  bucket: sportsHobby,    label: 'Equipment for sports and hobbies' },
    { line: '10', bucket: firearms,       label: 'Firearms' },
    { line: '11', bucket: clothing,       label: 'Clothes' },
    { line: '12', bucket: jewelry,        label: 'Jewelry' },
  ];
  for (const spec of lineSpec) {
    const items = spec.bucket;
    const total = items.reduce((s, a) => s + Number(a.current_value || 0), 0);
    if (items.length === 0) {
      track(setCheck(form, `${spec.line} check`, false), `${spec.line} check`);
      continue;
    }
    track(setCheck(form, `${spec.line} check`, true), `${spec.line} check`);
    const desc = items.length === 1
      ? items[0].description
      : `${items.length} items: ${items.slice(0, 3).map(x => x.description).filter(Boolean).join(', ')}${items.length > 3 ? '…' : ''}`;
    track(setText(form, `${spec.line} description`,        desc),       `${spec.line} description`);
    track(setText(form, `${spec.line} description amount`, fmt(total)), `${spec.line} description amount`);
  }

  // Q14 — non-farm animals — typically empty, default unchecked
  track(setCheck(form, 'check 13', false), 'check 13');
  // Q15 — any other personal/household items not described above. Catch-all.
  const usedAssets = new Set([
    ...realEstate, ...vehicles, ...cashAssets, ...bankAccounts, ...lifeInsurance,
    ...retirement, ...householdGoods, ...electronics, ...jewelry, ...firearms,
    ...clothing, ...sportsHobby, ...collectibles,
  ].map(a => a.id));
  const otherPersonal = assets.filter(a =>
    a.schedule === 'B' && !usedAssets.has(a.id)
  );
  if (otherPersonal.length > 0) {
    const total = otherPersonal.reduce((s, a) => s + Number(a.current_value || 0), 0);
    track(setText(form, '14 description', otherPersonal.slice(0, 3).map(a => a.description).filter(Boolean).join(', ')), '14 description');
    track(setText(form, '14 description amount', fmt(total)), '14 description amount');
    track(setCheck(form, 'check 14', true), 'check 14');
    track(setText(form, '15 amount', fmt(total)), '15 amount');
  } else {
    track(setCheck(form, 'check 14', false), 'check 14');
  }

  // Surface a clear gap if the case has assets we couldn't categorize
  const orphans = otherPersonal.filter(a => !a.description);
  if (orphans.length > 0) {
    gaps.push({ field: 'Q15', reason: `${orphans.length} asset row(s) lack a description — bucketed into Q14 "other personal property"` });
  }

  if (assets.length === 0) {
    gaps.push({ field: '(all sections)', reason: 'No assets recorded — Schedule A/B will be largely empty. Confirm with debtor before filing.' });
  }

  return {
    formCode: 'B106AB',
    label: 'Schedule A/B — Property',
    mapped,
    total: 368,
    gaps,
  };
}

module.exports = { map };
