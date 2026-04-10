// 2024 Census Bureau Median Family Income by State and Household Size
// Source: U.S. Census Bureau / U.S. Trustee Program
// These figures are used for the Chapter 7 means test (11 U.S.C. § 707(b))
// Effective for cases filed on or after November 1, 2024
//
// Household sizes 1-4 are from published data.
// For household sizes > 4, add $9,900 per additional person (per UST guidance).

const ADDITIONAL_PERSON = 9900;

// Annual median income by state, indexed by household size [1, 2, 3, 4]
const MEDIAN_INCOME_DATA = {
  AL: [52807, 64243, 71168, 82820],
  AK: [73386, 92057, 100988, 109879],
  AZ: [55685, 72063, 78975, 89014],
  AR: [47884, 60254, 66069, 77249],
  CA: [67170, 88535, 96571, 108738],
  CO: [67764, 89987, 99127, 110555],
  CT: [70888, 95827, 108024, 124367],
  DE: [61225, 80140, 90553, 101133],
  FL: [55320, 70652, 76897, 87519],
  GA: [55377, 72217, 79503, 90853],
  HI: [68166, 90780, 99023, 108820],
  ID: [55120, 69467, 73843, 82764],
  IL: [61653, 80490, 91146, 104001],
  IN: [54284, 68825, 77245, 89582],
  IA: [56704, 72932, 83079, 96001],
  KS: [56872, 74075, 83505, 95822],
  KY: [50291, 63831, 71803, 84192],
  LA: [48917, 64001, 71295, 82540],
  ME: [56498, 72025, 82704, 95104],
  MD: [72680, 97478, 111361, 127280],
  MA: [72505, 99320, 114614, 134176],
  MI: [55625, 71330, 81073, 95163],
  MN: [63727, 85039, 98771, 113399],
  MS: [44895, 57885, 63234, 74279],
  MO: [53577, 68797, 78104, 91273],
  MT: [55833, 70784, 79228, 91027],
  NE: [58025, 75421, 86120, 98835],
  NV: [56755, 70841, 77028, 86068],
  NH: [68713, 90820, 105082, 120580],
  NJ: [72472, 97825, 113259, 131545],
  NM: [48635, 62474, 66790, 76055],
  NY: [63404, 84290, 95690, 110445],
  NC: [53890, 69285, 76798, 88683],
  ND: [62121, 80957, 92517, 104910],
  OH: [54440, 69748, 80208, 93824],
  OK: [51613, 66099, 73053, 84780],
  OR: [60302, 77690, 86260, 97123],
  PA: [58745, 76280, 88506, 103361],
  RI: [63130, 83415, 96570, 112815],
  SC: [51413, 65770, 73074, 84735],
  SD: [56578, 72874, 83560, 96192],
  TN: [52413, 66630, 74180, 86628],
  TX: [56785, 72985, 79840, 90795],
  UT: [62010, 78420, 83855, 92820],
  VT: [60295, 78053, 90762, 106150],
  VA: [66490, 89580, 102180, 117680],
  WA: [68310, 90310, 100485, 113560],
  WV: [46420, 57925, 65275, 76310],
  WI: [58120, 75280, 87130, 101525],
  WY: [60380, 77540, 85940, 97680],
  DC: [79210, 110275, 124580, 140390],
};

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

export function getMedianIncome(stateCode, householdSize) {
  const data = MEDIAN_INCOME_DATA[stateCode];
  if (!data) return null;
  const size = Math.max(1, householdSize);
  if (size <= 4) {
    return data[size - 1];
  }
  return data[3] + (size - 4) * ADDITIONAL_PERSON;
}

export function getStateName(code) {
  return STATE_NAMES[code] || code;
}

export function getAllStates() {
  return Object.entries(STATE_NAMES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
