// Maps Tabula's free-text `cases.district` to the official Bankruptcy
// District Information dropdown values used on every petition form.
//
// The dropdown holds 95 entries with names like "Eastern District of New
// York". Users may have typed "EDNY", "E.D.N.Y.", "ed of new york" etc.
// We do a forgiving match: normalize → exact → substring → fuzzy.

const OFFICIAL_DISTRICTS = [
  'Middle District of Alabama',
  'Northern District of Alabama',
  'Southern District of Alabama',
  'District of Alaska',
  'District of Arizona',
  'Eastern and Western District of Arkansas',
  'Central District of California',
  'Eastern District of California',
  'Northern District of California',
  'Southern District of California',
  'District of Colorado',
  'District of Connecticut',
  'District of Columbia',
  'District of Delaware',
  'Middle District of Florida',
  'Northern District of Florida',
  'Southern District of Florida',
  'Middle District of Georgia',
  'Northern District of Georgia',
  'Southern District of Georgia',
  'District of Guam',
  'District of Hawaii',
  'District of Idaho',
  'Central District of Illinois',
  'Northern District of Illinois',
  'Southern District of Illinois',
  'Northern District of Indiana',
  'Southern District of Indiana',
  'Northern District of Iowa',
  'Southern District of Iowa',
  'District of Kansas',
  'Eastern District of Kentucky',
  'Western District of Kentucky',
  'Eastern District of Louisiana',
  'Middle District of Louisiana',
  'Western District of Louisiana',
  'District of Maine',
  'District of Maryland',
  'District of Massachusetts',
  'District of Montana',
  'Eastern District of Michigan',
  'Western District of Michigan',
  'District of Minnesota',
  'Northern District of Mississippi',
  'Southern District of Mississippi',
  'Eastern District of Missouri',
  'Western District of Missouri',
  'District of Nebraska',
  'District of Nevada',
  'District of New Hampshire',
  'District of New Jersey',
  'District of New Mexico',
  'Eastern District of New York',
  'Northern District of New York',
  'Southern District of New York',
  'Western District of New York',
  'Eastern District of North Carolina',
  'Middle District of North Carolina',
  'Western District of North Carolina',
  'District of North Dakota',
  'District of Northern Mariana Islands',
  'Northern District of Ohio',
  'Southern District of Ohio',
  'Eastern District of Oklahoma',
  'Northern District of Oklahoma',
  'Western District of Oklahoma',
  'District of Oregon',
  'Eastern District of Pennsylvania',
  'Middle District of Pennsylvania',
  'Western District of Pennsylvania',
  'District of Puerto Rico',
  'District of Rhode Island',
  'District of South Carolina',
  'District of South Dakota',
  'Eastern District of Tennessee',
  'Middle District of Tennessee',
  'Western District of Tennessee',
  'Eastern District of Texas',
  'Northern District of Texas',
  'Southern District of Texas',
  'Western District of Texas',
  'District of Utah',
  'District of Vermont',
  'District of Virgin Islands',
  'Eastern District of Virginia',
  'Western District of Virginia',
  'Eastern District of Washington',
  'Western District of Washington',
  'Northern District of West Virginia',
  'Southern District of West Virginia',
  'Eastern District of Wisconsin',
  'Western District of Wisconsin',
  'District of Wyoming',
];

const ABBREVIATION_MAP = {
  EDNY: 'Eastern District of New York',
  SDNY: 'Southern District of New York',
  NDNY: 'Northern District of New York',
  WDNY: 'Western District of New York',
  EDPA: 'Eastern District of Pennsylvania',
  MDPA: 'Middle District of Pennsylvania',
  WDPA: 'Western District of Pennsylvania',
  CDCA: 'Central District of California',
  NDCA: 'Northern District of California',
  SDCA: 'Southern District of California',
  EDCA: 'Eastern District of California',
  NDIL: 'Northern District of Illinois',
  CDIL: 'Central District of Illinois',
  SDIL: 'Southern District of Illinois',
  NDTX: 'Northern District of Texas',
  SDTX: 'Southern District of Texas',
  EDTX: 'Eastern District of Texas',
  WDTX: 'Western District of Texas',
  NDFL: 'Northern District of Florida',
  MDFL: 'Middle District of Florida',
  SDFL: 'Southern District of Florida',
};

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s.,_/-]+/g, ' ')
    .trim();
}

function matchDistrict(input) {
  if (!input) return null;
  const cleaned = String(input).trim();

  // Exact dropdown value
  if (OFFICIAL_DISTRICTS.includes(cleaned)) return cleaned;

  // Common abbreviations
  const abbrev = ABBREVIATION_MAP[cleaned.toUpperCase().replace(/[^A-Z]/g, '')];
  if (abbrev) return abbrev;

  const norm = normalize(cleaned);

  // Normalized exact
  for (const d of OFFICIAL_DISTRICTS) {
    if (normalize(d) === norm) return d;
  }

  // Substring
  for (const d of OFFICIAL_DISTRICTS) {
    if (normalize(d).includes(norm) || norm.includes(normalize(d))) return d;
  }

  return null;
}

module.exports = { matchDistrict, OFFICIAL_DISTRICTS };
