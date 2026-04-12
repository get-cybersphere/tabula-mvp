// PII detection rules.
// Pure functions — given text (and optional debtor context), returns matches.
//
// Each match: { type, value, start, end }
// where start/end are character offsets into the input text.

const PATTERNS = [
  // SSN — both hyphenated and 9-digit-with-context forms.
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: 'ssn',
    // 9 consecutive digits, but only when preceded by SSN label within ~20 chars
    regex: /(?:ssn|social\s*security(?:\s*(?:no|number|#))?)[^\d]{0,20}(\d{9})\b/gi,
    captureGroup: 1,
  },
  // DOB — dates preceded by "DOB", "Date of Birth", "Born"
  {
    type: 'dob',
    regex: /(?:dob|date\s*of\s*birth|born)[^\d]{0,12}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
    captureGroup: 1,
  },
  // Phone — US format
  {
    type: 'phone',
    regex: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  // Email
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // Full account numbers (8-17 digits) preceded by "Account", "Acct"
  // Explicitly excludes last-4 references (4 digits) since those are already partial.
  {
    type: 'account',
    regex: /(?:account(?:\s*(?:no|number|#))?|acct(?:\s*(?:no|number|#))?)\s*:?\s*(\d{8,17})\b/gi,
    captureGroup: 1,
  },
  // Routing numbers — 9 digits preceded by "Routing"
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
  // ITIN — starts with 9, format 9xx-xx-xxxx
  {
    type: 'itin',
    regex: /\b9\d{2}-\d{2}-\d{4}\b/g,
  },
];

/**
 * Detect PII in a block of text.
 * @param {string} text
 * @param {object} [context] - optional debtor context to detect debtor-specific PII
 * @param {string} context.firstName
 * @param {string} context.lastName
 * @param {string} context.street
 * @param {string} context.city
 * @returns {Array<{type, value, start, end}>}
 */
function detectPII(text, context = {}) {
  if (!text) return [];
  const matches = [];

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      // If a capture group was specified, redact just that group's span
      let value, start, end;
      if (pattern.captureGroup != null) {
        value = m[pattern.captureGroup];
        if (!value) continue;
        start = m.index + m[0].indexOf(value);
        end = start + value.length;
      } else {
        value = m[0];
        start = m.index;
        end = start + value.length;
      }
      matches.push({ type: pattern.type, value, start, end });
    }
  }

  // Debtor-specific matches (names, address fragments)
  if (context.firstName || context.lastName) {
    const nameParts = [context.firstName, context.lastName].filter(Boolean);
    if (nameParts.length) {
      // Match full name ("John Doe") and reverse ("Doe, John")
      const nameRegex = new RegExp(
        `\\b(${escapeRegex(nameParts.join(' '))}|${escapeRegex(nameParts.slice().reverse().join(', '))})\\b`,
        'gi'
      );
      let m;
      while ((m = nameRegex.exec(text)) !== null) {
        matches.push({ type: 'debtor_name', value: m[0], start: m.index, end: m.index + m[0].length });
      }
    }
  }

  if (context.street) {
    const streetRegex = new RegExp(`\\b${escapeRegex(context.street)}\\b`, 'gi');
    let m;
    while ((m = streetRegex.exec(text)) !== null) {
      matches.push({ type: 'debtor_address', value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }

  // Deduplicate overlapping matches — prefer longer/earlier ones
  return dedupeOverlaps(matches);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeOverlaps(matches) {
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  }
  return result;
}

module.exports = { detectPII };
