// IRS Collection Financial Standards used in the Chapter 7 Means Test.
//
// Two layers:
//   - Static module-level constants below (legacy state-level fallback).
//   - data/irs-standards-2026Q2.json + irs-county.js (county-level).
//
// `getAllowedDeductions()` uses the JSON-backed county lookup when a
// `countyFips` is supplied, and falls back to the constants here when
// it isn't (e.g. a debtor whose ZIP didn't resolve).

import {
  getCountyHousingUtility,
  getOperatingCostByState,
  getOwnershipCost,
  getEffectiveDate,
} from './irs-county.js';

// ─── National Standards ──────────────────────────────────────────
// Monthly allowance for food, clothing & services, housekeeping supplies,
// personal care products & services, and miscellaneous
// Indexed by household size (1, 2, 3, 4, 5+)
const NATIONAL_STANDARDS = {
  1: 785,
  2: 1190,
  3: 1388,
  4: 1638,
};
// For 5+ persons, add $344 per additional person
const NATIONAL_ADDITIONAL_PERSON = 344;

// Out-of-pocket health care: under 65 / 65 and older (monthly per person)
const HEALTH_CARE = {
  under65: 75,
  over65: 153,
};

// ─── Local Standards: Housing & Utilities ────────────────────────
// Monthly allowance by state for housing + utilities (1 person, 2 person, 3 person, 4 person, 5+ person)
// Top 10 states by population get specific figures; others use national average
const HOUSING_UTILITIES = {
  CA: [2428, 2854, 2854, 3136, 3136],
  TX: [1632, 1918, 1918, 2109, 2109],
  FL: [1781, 2094, 2094, 2302, 2302],
  NY: [2316, 2722, 2722, 2992, 2992],
  PA: [1478, 1737, 1737, 1910, 1910],
  IL: [1589, 1868, 1868, 2054, 2054],
  OH: [1295, 1523, 1523, 1674, 1674],
  GA: [1472, 1731, 1731, 1903, 1903],
  NC: [1389, 1634, 1634, 1796, 1796],
  MI: [1344, 1580, 1580, 1737, 1737],
  // National average for all other states
  _default: [1515, 1781, 1781, 1958, 1958],
};

// ─── Local Standards: Transportation ─────────────────────────────
// Operating costs (per vehicle, monthly)
const TRANSPORTATION_OPERATING = {
  oneVehicle: 273,
  twoVehicles: 273, // per vehicle
};

// Ownership costs (per vehicle, monthly)
const TRANSPORTATION_OWNERSHIP = {
  firstVehicle: 588,
  secondVehicle: 588,
};

// Public transportation (if no vehicle)
const TRANSPORTATION_PUBLIC = 242;

export function getNationalStandard(householdSize) {
  const size = Math.max(1, householdSize);
  if (size <= 4) return NATIONAL_STANDARDS[size];
  return NATIONAL_STANDARDS[4] + (size - 4) * NATIONAL_ADDITIONAL_PERSON;
}

export function getHealthCareAllowance(householdSize, over65Count = 0) {
  const under65 = Math.max(0, householdSize - over65Count);
  return (under65 * HEALTH_CARE.under65) + (over65Count * HEALTH_CARE.over65);
}

export function getHousingUtility(stateCode, householdSize) {
  const data = HOUSING_UTILITIES[stateCode] || HOUSING_UTILITIES._default;
  const idx = Math.min(Math.max(0, householdSize - 1), 4);
  return data[idx];
}

export function getTransportationAllowance(vehicleCount = 1) {
  if (vehicleCount === 0) return TRANSPORTATION_PUBLIC;
  const operating = Math.min(vehicleCount, 2) * TRANSPORTATION_OPERATING.oneVehicle;
  const ownership =
    (vehicleCount >= 1 ? TRANSPORTATION_OWNERSHIP.firstVehicle : 0) +
    (vehicleCount >= 2 ? TRANSPORTATION_OWNERSHIP.secondVehicle : 0);
  return operating + ownership;
}

export function getAllowedDeductions({
  householdSize = 1,
  stateCode = 'TX',
  countyFips = null,         // accepted for forward-compat; Sprint 3 wires county data
  vehicleCount = 1,
  over65Count = 0,
  actualSecuredDebt = 0,
  priorityDebt = 0,
}) {
  // Sprint 3 will route county-keyed lookups through ./irs-county.js. For
  // now we accept the param and pass it into the citation so the audit
  // trail records what the caller asked for, even when the data isn't
  // resolved at county level yet.
  const effectiveDate = getEffectiveDate();
  const citations = {};

  // ─── Housing & utilities (county-preferred, state-fallback) ───
  let housing, housingCitation;
  if (countyFips) {
    const c = getCountyHousingUtility(countyFips, householdSize);
    if (c) {
      housing = c.amount;
      housingCitation = {
        tableName: 'housing_utilities',
        scope: c.scope,
        county_fips: c.county_fips || countyFips,
        county_name: c.county_name,
        state_code: c.state_code || stateCode,
        household_size: householdSize,
        amount: c.amount,
        effective_date: c.effective_date,
        source_url: c.source_url,
        note: c.note,
      };
    }
  }
  if (housing == null) {
    housing = getHousingUtility(stateCode, householdSize);
    housingCitation = {
      tableName: 'housing_utilities',
      scope: 'state',
      state_code: stateCode,
      household_size: householdSize,
      amount: housing,
      effective_date: effectiveDate,
      note: countyFips ? 'County not in table; state-level fallback used.' : 'No county provided; state-level fallback.',
    };
  }
  citations['B122A-2 Line 8'] = housingCitation;

  // ─── Transportation (per-region operating + national ownership) ─
  const op = getOperatingCostByState(stateCode, vehicleCount);
  const own = getOwnershipCost(vehicleCount);
  const transportation = (op.amount || 0) + (own.amount || 0);
  citations['B122A-2 Line 13'] = {
    tableName: op.tableName, scope: op.scope, region: op.region,
    state_code: stateCode, vehicleCount, amount: op.amount, effective_date: op.effective_date,
  };
  if (own.amount > 0) {
    citations['B122A-2 Line 12'] = {
      tableName: own.tableName, scope: own.scope, vehicleCount,
      amount: own.amount, effective_date: own.effective_date,
    };
  }

  // ─── National + health (size-based, no geographic variance) ────
  const national   = getNationalStandard(householdSize);
  const healthCare = getHealthCareAllowance(householdSize, over65Count);
  citations['B122A-2 Line 6'] = {
    tableName: 'national_standards', household_size: householdSize,
    amount: national, effective_date: effectiveDate, scope: 'national',
  };
  citations['B122A-2 Line 7'] = {
    tableName: 'health_care', household_size: householdSize, over65: over65Count,
    amount: healthCare, effective_date: effectiveDate, scope: 'national',
  };
  if (actualSecuredDebt > 0) citations['B122A-2 Line 33a'] = { manual: true, amount: actualSecuredDebt };
  if (priorityDebt     > 0) citations['B122A-2 Line 35']   = { manual: true, amount: priorityDebt };

  return {
    nationalStandards: national,
    healthCare,
    housingUtilities: housing,
    housingScope: housingCitation.scope,
    transportation,
    securedDebt: actualSecuredDebt,
    priorityDebt,
    total: national + healthCare + housing + transportation + actualSecuredDebt + priorityDebt,
    citations,
    effectiveDate,
  };
}
