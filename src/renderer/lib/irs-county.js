// County-keyed IRS Local Standards lookup.
//
// The county tables ship in data/irs-standards-2026Q2.json. ZIP→county
// FIPS resolution is in zip-to-county.js. This module is intentionally
// pure — give it a FIPS code and it returns a structured citation.

import data from '../../../data/irs-standards-2026Q2.json';

/**
 * Look up housing & utilities allowance for a county.
 * Falls back to state-level if the county isn't in the table.
 *
 * @param {string} countyFips  e.g. '13_021' (Bleckley County, GA)
 * @param {number} householdSize
 * @returns {{ amount, scope, county_name?, state_code?, effective_date, source_url, note? } | null}
 */
export function getCountyHousingUtility(countyFips, householdSize) {
  if (!countyFips) return null;
  const idx = Math.max(0, Math.min(4, (householdSize || 1) - 1));
  const entry = data.housing_utilities.by_county[countyFips];
  if (entry) {
    return {
      amount: entry.amounts[idx],
      scope: 'county',
      county_fips: countyFips,
      county_name: entry.name,
      household_size: householdSize,
      effective_date: data.effective_date,
      source_url: data.source_url,
    };
  }
  // Fall back to state by parsing the FIPS prefix
  const stateFips = countyFips.split('_')[0];
  const stateCode = fipsToStateCode(stateFips);
  if (!stateCode) return null;
  const fallback = data.housing_utilities.by_state_fallback[stateCode];
  if (!fallback) return null;
  return {
    amount: fallback[idx],
    scope: 'state-fallback',
    state_code: stateCode,
    household_size: householdSize,
    effective_date: data.effective_date,
    source_url: data.source_url,
    note: `County ${countyFips} not in table; using state-level fallback for ${stateCode}.`,
  };
}

export function getOperatingCostByState(stateCode, vehicleCount) {
  if (vehicleCount === 0) {
    return {
      amount: data.transportation.public_transportation,
      scope: 'national',
      tableName: 'transport_public',
      effective_date: data.effective_date,
    };
  }
  const region = data.state_to_region[stateCode] || 'South';
  const perVehicle = data.transportation.operating_per_vehicle_by_region[region]
    || data.transportation.operating_per_vehicle_by_region.South;
  return {
    amount: perVehicle * Math.min(vehicleCount, 2),
    scope: 'region',
    region,
    tableName: 'transport_operating',
    effective_date: data.effective_date,
  };
}

export function getOwnershipCost(vehicleCount) {
  if (vehicleCount === 0) return { amount: 0, scope: 'n/a' };
  return {
    amount: data.transportation.ownership_per_vehicle * Math.min(vehicleCount, 2),
    scope: 'national',
    tableName: 'transport_ownership',
    effective_date: data.effective_date,
  };
}

export function getEffectiveDate() {
  return data.effective_date;
}

export function getDataAge() {
  const ms = Date.now() - new Date(data.effective_date).getTime();
  return ms / (1000 * 60 * 60 * 24);  // age in days
}

// FIPS state-code map (54 entries — 50 states + DC, AS, GU, PR, VI but we
// only ship the 50 + DC for means-test purposes).
const FIPS_TO_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY',
};

function fipsToStateCode(fips2) {
  return FIPS_TO_STATE[fips2] || null;
}
