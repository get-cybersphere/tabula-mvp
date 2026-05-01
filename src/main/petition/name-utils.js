// Name + address parsing helpers.
//
// Tabula stores names as first_name / last_name only, but US Courts forms
// expect first / middle / last / suffix. We heuristic-split when a middle
// name is present in first_name (e.g., "Mary Anne") and detect common
// suffixes from the tail of last_name.

const SUFFIXES = new Set(['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V']);

function splitName(first, last) {
  const out = { first: '', middle: '', last: '', suffix: '' };
  if (first) {
    const parts = String(first).trim().split(/\s+/);
    out.first = parts[0] || '';
    if (parts.length > 1) out.middle = parts.slice(1).join(' ');
  }
  if (last) {
    const parts = String(last).trim().split(/\s+/);
    if (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) {
      out.suffix = parts.pop();
    }
    out.last = parts.join(' ');
  }
  return out;
}

function fullName(d) {
  if (!d) return '';
  const parts = [d.first_name, d.last_name].filter(Boolean);
  return parts.join(' ').trim();
}

// Split a single line "123 Main St Apt 4B" into address line 1 / 2 by
// splitting at the apartment / unit / suite prefix.
function splitStreet(street) {
  if (!street) return { line1: '', line2: '' };
  const s = String(street).trim();
  const match = s.match(/^(.*?)\s+(Apt|Apartment|Unit|Suite|Ste|#)\s*(.*)$/i);
  if (match) return { line1: match[1].trim(), line2: `${match[2]} ${match[3]}`.trim() };
  return { line1: s, line2: '' };
}

module.exports = { splitName, fullName, splitStreet };
