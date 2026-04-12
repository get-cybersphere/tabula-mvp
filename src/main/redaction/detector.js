// PII detection rules.
// Pure functions — given text (and optional debtor context), returns matches.
//
// Each match: { type, value, start, end }
// where start/end are character offsets into the input text.
//
// Design notes:
// - Phone regex is intentionally tight. A loose \d{10} pattern would match
//   SSNs, employee IDs, and some dollar figures, which would black out the
//   extraction payload. We require a canonical separator format.
// - SSN has two forms: hyphenated (very distinctive) and label-anchored
//   9-digit. We never match bare 9-digit runs because they collide with
//   tax IDs, routing numbers, and sometimes account numbers.
// - Overlap dedup prefers the longer match at the same start position so
//   labeled forms ("SSN: 123-45-6789") beat bare forms that only see the
//   9 digits.

const PATTERNS = [
  // SSN — hyphenated is distinctive; avoid colliding with ITIN (starts with 9).
  {
    type: 'ssn',
    regex: /\b(?!9)\d{3}-\d{2}-\d{4}\b/g,
  },
  // SSN — label-anchored 9-digit
  {
    type: 'ssn',
    regex: /(?:ssn|social\s*security(?:\s*(?:no|number|#))?)[^\d]{0,20}(\d{9})\b/gi,
    captureGroup: 1,
  },
  // ITIN — 9xx-xx-xxxx
  {
    type: 'itin',
    regex: /\b9\d{2}-\d{2}-\d{4}\b/g,
  },
  // DOB — date preceded by label
  {
    type: 'dob',
    regex: /(?:dob|date\s*of\s*birth|birth\s*date|born)[^\d]{0,12}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
    captureGroup: 1,
  },
  // Phone — require one of the canonical US formats:
  //   (555) 123-4567   555-123-4567   555.123.4567   555 123 4567
  // Does NOT match 10 consecutive digits or hyphen-separated non-phone numbers.
  {
    type: 'phone',
    regex: /(?:\(\d{3}\)\s?|\b\d{3}[.\s-])\d{3}[.\s-]\d{4}\b/g,
  },
  // Email
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // Full account number (8-17 digits) preceded by "Account" / "Acct".
  // Last-4 references (4 digits) stay visible — they are already partial
  // and Claude needs them to label rows.
  {
    type: 'account',
    regex: /(?:account(?:\s*(?:no|number|#))?|acct(?:\s*(?:no|number|#))?)\s*:?\s*(\d{8,17})\b/gi,
    captureGroup: 1,
  },
  // Routing number — 9 digits preceded by "Routing" / "ABA" / "RTN"
  {
    type: 'routing',
    regex: /(?:routing|aba|rtn)(?:\s*(?:no|number|#))?\s*:?\s*(\d{9})\b/gi,
    captureGroup: 1,
  },
  // Driver's license — label-anchored
  {
    type: 'drivers_license',
    regex: /(?:driver'?s?\s*license|dl\s*(?:no|number|#)?)\s*:?\s*([A-Z0-9]{5,20})\b/gi,
    captureGroup: 1,
  },
];

/**
 * Detect PII in a block of text.
 * @param {string} text
 * @param {object} [context] - optional debtor-specific PII
 * @param {string} context.firstName
 * @param {string} context.lastName
 * @param {string} context.street
 * @returns {Array<{type, value, start, end}>}
 */
function detectPII(text, context = {}) {
  if (!text) return [];
  const matches = [];

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      let value, start, end;
      if (pattern.captureGroup != null) {
        value = m[pattern.captureGroup];
        if (!value) continue;
        // Find the group's position within the overall match — m.indices would be
        // cleaner but requires the 'd' flag. indexOf within the match is safe.
        const groupOffsetInMatch = m[0].indexOf(value);
        start = m.index + (groupOffsetInMatch >= 0 ? groupOffsetInMatch : 0);
        end = start + value.length;
      } else {
        value = m[0];
        start = m.index;
        end = start + value.length;
      }
      matches.push({ type: pattern.type, value, start, end });
    }
  }

  // Debtor name. Match any subsequence of first/middle/last, allowing middle
  // initial or middle name between first and last. Matches both "John Smith"
  // and "John Q. Smith" and the "Smith, John" reverse form.
  if (context.firstName || context.lastName) {
    const first = context.firstName ? escapeRegex(context.firstName) : null;
    const last = context.lastName ? escapeRegex(context.lastName) : null;
    const alternatives = [];
    if (first && last) {
      // first [middle]? last   (middle is one word or initial with optional dot)
      alternatives.push(`${first}(?:\\s+[A-Z][a-z]*\\.?)?\\s+${last}`);
      alternatives.push(`${last},\\s*${first}`);
    } else if (first) {
      alternatives.push(first);
    } else {
      alternatives.push(last);
    }
    const nameRegex = new RegExp(`\\b(?:${alternatives.join('|')})\\b`, 'gi');
    let m;
    while ((m = nameRegex.exec(text)) !== null) {
      matches.push({
        type: 'debtor_name',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  if (context.street) {
    const streetRegex = new RegExp(`\\b${escapeRegex(context.street)}\\b`, 'gi');
    let m;
    while ((m = streetRegex.exec(text)) !== null) {
      matches.push({
        type: 'debtor_address',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  return dedupeOverlaps(matches);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Remove overlapping matches. When two matches overlap, keep the earlier one
// and, in case of a tie on start, the longer one. This ensures a labeled form
// ("SSN: 123-45-6789" captured as the 9 digits) is kept when the same span is
// also matched by a shorter pattern.
function dedupeOverlaps(matches) {
  if (matches.length <= 1) return matches.slice();
  const sorted = matches.slice().sort(
    (a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start)
  );
  const result = [];
  for (const m of sorted) {
    const last = result[result.length - 1];
    if (!last || m.start >= last.end) {
      result.push(m);
    }
    // else: m overlaps with last. Since sorted preferred longer-on-tie, `last`
    // is at least as long — drop m.
  }
  return result;
}

module.exports = { detectPII, dedupeOverlaps };
