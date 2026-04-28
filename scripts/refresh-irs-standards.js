#!/usr/bin/env node
//
// refresh-irs-standards.js
//
// Operator script run quarterly to refresh data/irs-standards-XXXXQX.json
// against the latest IRS Collection Financial Standards publication.
//
// Sources:
//   - IRS National Standards:        https://www.irs.gov/businesses/small-businesses-self-employed/national-standards-food-clothing-and-other-items
//   - IRS Local Standards (housing): https://www.irs.gov/businesses/small-businesses-self-employed/local-standards-housing-and-utilities
//   - IRS Local Standards (transp):  https://www.irs.gov/businesses/small-businesses-self-employed/local-standards-transportation
//   - U.S. Trustee thresholds:       https://www.justice.gov/ust/means-testing
//
// USAGE:
//   node scripts/refresh-irs-standards.js
//
// What this script does today:
//   1. Reads the current data/irs-standards-*.json
//   2. Reports its effective_date and how many days stale it is
//   3. Prints a checklist of pages to re-scrape and where each value
//      lives in the JSON
//   4. Bumps a placeholder filename for the next quarter
//
// What this script does NOT do (yet):
//   - Auto-scrape the IRS pages. The IRS publishes these as HTML tables
//     that change layout periodically; an automated scraper without
//     verification is more dangerous than a manual checklist. When we
//     ship a verified scraper, the human-in-the-loop checklist becomes
//     a verification step instead of the whole job.

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.startsWith('irs-standards-') && f.endsWith('.json'));
if (files.length === 0) {
  console.error('No data/irs-standards-*.json found.');
  process.exit(1);
}
files.sort();
const latest = files[files.length - 1];
const latestPath = path.join(dataDir, latest);
const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

const ageDays = Math.floor((Date.now() - new Date(data.effective_date).getTime()) / (1000 * 60 * 60 * 24));

console.log('━━━ IRS Standards Refresh Checklist ━━━');
console.log('Current file       :', latest);
console.log('Effective date     :', data.effective_date);
console.log('Next refresh due   :', data.next_refresh_due || 'unknown');
console.log('Age (days)         :', ageDays);
console.log('');

if (ageDays > 90) {
  console.log('⚠️  Data is more than 90 days old. Refresh recommended.');
}

console.log('');
console.log('Operator steps:');
console.log('1. Open the IRS pages listed at the top of this file.');
console.log('2. For each table below, copy the new values into a new');
console.log('   data/irs-standards-YYYYQQ.json (next quarter).');
console.log('3. Verify the U.S. Trustee thresholds page for any');
console.log('   adjustment to the $9,075 / $15,150 disposable-income');
console.log('   thresholds (rare — every 3 years).');
console.log('4. Run `node --test test/means-test/*.test.js`.');
console.log('5. Update the seed gates in docs/MEANS-TEST-V1-DESIGN.md.');
console.log('');

console.log('Tables to refresh:');
console.log('  national_standards.{1,2,3,4}                — National Standards');
console.log('  health_care.{under_65, over_65}             — Out-of-pocket health care');
console.log('  housing_utilities.by_county                 — county-level table');
console.log('  housing_utilities.by_state_fallback         — state-level table');
console.log('  transportation.ownership_per_vehicle        — ownership cost');
console.log('  transportation.operating_per_vehicle_by_region — operating costs');
console.log('  transportation.public_transportation        — non-vehicle households');
console.log('');

console.log('After refresh, also rerun:');
console.log('  node test/means-test/*.test.js              — math regression');
console.log('  npm run build:renderer                       — bundle includes new JSON');
console.log('');
console.log('Done.');
