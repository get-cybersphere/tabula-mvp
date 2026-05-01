// Heuristics for "is this transaction payee an individual or a business?"
//
// The legal value comes from flagging payments to INDIVIDUALS. A regular
// $2,400/mo to Wells Fargo is a normal mortgage. A regular $2,400/mo to
// "Maria Vasquez" is potentially an insider-relative preference under
// 11 USC § 547(b) (look-back: 1 year for insiders, 90 days for others).
//
// We never claim certainty. Our job is to flag for attorney review.
// False positives are tolerable — false negatives miss a trustee-clawback
// risk. So we err toward "looks like an individual" when ambiguous.

// Common business / institutional tokens that, when present, almost
// always mean the payee is NOT an individual.
const BUSINESS_TOKENS = new Set([
  // Corporate suffixes
  'inc', 'inc.', 'incorporated', 'llc', 'l.l.c.', 'ltd', 'limited',
  'corp', 'corp.', 'corporation', 'co', 'co.', 'company', 'plc',
  'lp', 'l.p.', 'llp', 'l.l.p.', 'pllc', 'professional',
  // Banking + finance
  'bank', 'credit', 'union', 'savings', 'fcu', 'cu', 'financial',
  'capital', 'mortgage', 'lending', 'loan', 'auto', 'finance',
  'visa', 'mastercard', 'amex', 'discover', 'chase', 'wells',
  'citibank', 'citi', 'usaa', 'pnc', 'truist', 'regions', 'navy',
  // Utilities + services
  'utility', 'utilities', 'energy', 'power', 'electric', 'gas',
  'water', 'sewer', 'verizon', 'at&t', 'att', 'tmobile', 'sprint',
  'comcast', 'xfinity', 'spectrum', 'cox', 'directv', 'dish',
  // Insurance
  'insurance', 'mutual', 'allstate', 'geico', 'progressive', 'farmers',
  'liberty', 'statefarm', 'aetna', 'cigna', 'humana', 'kaiser',
  'anthem', 'bcbs',
  // Retail / commerce
  'walmart', 'target', 'costco', 'amazon', 'kroger', 'safeway',
  'cvs', 'walgreens', 'home', 'depot', 'lowes', 'macys', 'best buy',
  'restaurant', 'cafe', 'pizza', 'mcdonalds', 'starbucks', 'subway',
  // Government / institutions
  'irs', 'treasury', 'dmv', 'court', 'usps', 'fedex', 'ups',
  'university', 'college', 'school', 'academy', 'preparatory', 'prep',
  'montessori', 'hospital', 'clinic', 'medical', 'church', 'fund',
  'foundation', 'institute', 'club', 'league', 'team', 'tournament',
  'association', 'society', 'studios', 'studio', 'salon', 'fitness',
  'gym',
  // Tech / SaaS
  'apple', 'google', 'microsoft', 'netflix', 'spotify', 'hulu',
  'paypal', 'venmo', 'zelle', 'stripe', 'square',
]);

const INDIVIDUAL_TITLES = new Set(['mr', 'mrs', 'ms', 'dr', 'jr', 'sr']);

const ALL_CAPS_OR_ACRONYM = /^[A-Z][A-Z0-9 .&']{1,}$/;

// Strong signal: text matches "Firstname Lastname" with optional middle.
// We require alpha-only tokens to avoid matching transaction codes like
// "ACH 1234 SMITH AUTO".
const FIRST_LAST_RE = /^[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}(\s+[A-Z][a-z]{1,15})?$/;
const FIRST_INITIAL_LAST_RE = /^[A-Z]\.?\s+[A-Z][a-z]{1,15}$/;

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[,&]/g, ' ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Returns one of: 'individual' | 'business' | 'unknown'
function classifyPayee(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return 'unknown';

  // Common transaction prefixes are strong "business" signals (ACH, EFT,
  // PAYPAL TRANSFER, ZELLE TO X).
  if (/^(ach|eft|wire|debit|credit|atm|pos|chk|check)\b/i.test(name)) {
    // Strip the prefix and try again. "ZELLE TO MARIA VASQUEZ" should
    // still match individual.
    const stripped = name
      .replace(/^(ach|eft|wire|debit|credit|atm|pos|chk|check)[\s:#-]*/i, '')
      .replace(/\b(payment|transfer|to|from|ref|memo|web id)[\s:#-]*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (stripped && stripped !== name) return classifyPayee(stripped);
  }
  // Zelle / Venmo / CashApp transfers are HEAVY individual-payment signals
  if (/\b(zelle|venmo|cashapp|cash app|paypal transfer)\b/i.test(name)) {
    // The payee is whatever comes after — most banks include "ZELLE TO MARIA V"
    return 'individual';
  }

  const tokens = tokenize(name);
  for (const t of tokens) {
    if (BUSINESS_TOKENS.has(t)) return 'business';
  }

  // Title prefix is strong individual signal.
  if (tokens[0] && INDIVIDUAL_TITLES.has(tokens[0])) return 'individual';

  // Title-cased "Firstname Lastname" — strong individual signal.
  if (FIRST_LAST_RE.test(name) || FIRST_INITIAL_LAST_RE.test(name)) {
    return 'individual';
  }

  // ALL CAPS short string with no business tokens — bank statements often
  // print payees as "MARIA VASQUEZ" or "WELLS FARGO BK". We already
  // matched business tokens above; if none, all-caps is still a weak
  // individual signal especially for 2 tokens.
  if (ALL_CAPS_OR_ACRONYM.test(name)) {
    if (tokens.length === 2 || tokens.length === 3) {
      // 2-3 token all-caps with no business words — likely individual
      return 'individual';
    }
  }

  return 'unknown';
}

module.exports = { classifyPayee };
