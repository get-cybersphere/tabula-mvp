// Maps Tabula's free-text `expenses.category` values to Schedule J line
// codes. Tabula stores expenses by category-name, but Schedule J has
// fixed line numbers (4, 6a, 7, 8, 11, 12, 13, etc.). This module is the
// translation layer.
//
// Returns a `{ "4": 1450, "6a": 187, ... }` shape matching Schedule J
// field names. Unmatched categories are bucketed into "19" (Other) and
// reported as gaps so the attorney can re-tag them.

const SCHEDULE_J_RULES = [
  { line: '4', match: /^(rent|mortgage|housing|home loan|principal|residence)/i },
  { line: '4a', match: /(real[- ]?estate tax|property tax|property tax)/i },
  { line: '4b', match: /(property insurance|homeowners insurance|home insurance)/i },
  { line: '4c', match: /(hoa|homeowners.?association|condo fee)/i },
  { line: '4d', match: /(home maintenance|home repair|maintenance)/i },
  { line: '6a', match: /^(utilit|electric|electricity|gas|water|sewer|trash|garbage)/i },
  { line: '6b', match: /^(phone|cell|telephone|wireless|mobile)/i },
  { line: '6c', match: /^(internet|cable|satellite|streaming|netflix|spotify|hulu|tv)/i },
  { line: '7', match: /^(food|groceries|grocery|housekeeping)/i },
  { line: '8', match: /^(childcare|child care|education|school|tuition|daycare)/i },
  { line: '9', match: /^(clothing|laundry|dry cleaning|apparel)/i },
  { line: '10', match: /^(personal care|cosmetics|haircut|salon|toiletries)/i },
  { line: '11', match: /^(medical|dental|doctor|prescription|pharmacy|copay|hospital)/i },
  { line: '12', match: /^(transportation|transit|fuel|gasoline|parking|tolls|car maintenance|auto repair)/i },
  { line: '13', match: /^(entertainment|recreation|sports|hobby|gym|membership)/i },
  { line: '14', match: /^(charitable|donation|religious|tithe|charity)/i },
  { line: '15a', match: /(life insurance)/i },
  { line: '15b', match: /(health insurance)/i },
  { line: '15c', match: /(auto insurance|vehicle insurance|car insurance)/i },
  { line: '15d', match: /^(insurance)/i },
  { line: '16', match: /^(tax)/i },
  { line: '17a', match: /(vehicle loan|car payment|auto loan|car loan)/i },
  { line: '17b', match: /(vehicle loan 2|car payment 2)/i },
  { line: '17c', match: /(installment|loan|credit card payment|other loan)/i },
  { line: '18', match: /^(domestic support|alimony|child support)/i },
  { line: '20a', match: /^(business)/i },
];

function categorize(expense) {
  const cat = String(expense.category || '').trim();
  for (const rule of SCHEDULE_J_RULES) {
    if (rule.match.test(cat)) return rule.line;
  }
  return '19'; // "Other" — flagged for review
}

function bucketExpenses(expenses) {
  const buckets = {};
  const unmatched = [];
  for (const e of expenses || []) {
    const line = categorize(e);
    buckets[line] = (buckets[line] || 0) + Number(e.monthly_amount || 0);
    if (line === '19') unmatched.push(e);
  }
  return { buckets, unmatched };
}

module.exports = { bucketExpenses, SCHEDULE_J_RULES };
