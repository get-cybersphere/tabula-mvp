// Provenance graph for the means test.
//
// Every computed value in the means test must trace back to either:
//   • a document page (extracted receipt or withholding line),
//   • an IRS Local Standards table version + scope (county/state/national),
//   • or a manual entry (timestamped, by-user).
//
// The Citation type is the unit of provenance. The runMeansTest output
// embeds Citation references; this module is the canonical formatter.

/**
 * @typedef {Object} Citation
 * @property {'document_page'|'irs_standard'|'manual_entry'|'computed'} kind
 * @property {string} [refId]              record id this points to
 * @property {string} [label]              human-readable string
 * @property {object} [meta]               kind-specific metadata
 */

/**
 * Build a Citation for a document-page reference (e.g. a paystub line).
 */
export function docPageCitation({ documentId, documentName, page, label }) {
  return {
    kind: 'document_page',
    refId: documentId,
    label: label || `${documentName || 'document'}, page ${page || '?'}`,
    meta: { documentId, documentName, page },
  };
}

/**
 * Build a Citation for an IRS Local Standard table reference.
 */
export function irsCitation({ tableName, scope, county_fips, state_code, household_size, amount, effective_date, source_url, b122a_line }) {
  const where =
    scope === 'county'        ? `county FIPS ${county_fips}` :
    scope === 'state-fallback'? `state ${state_code} (county not in table)` :
    scope === 'state'         ? `state ${state_code}` :
    scope === 'region'        ? `Census region` :
    scope === 'national'      ? 'national' :
                                'unspecified scope';
  return {
    kind: 'irs_standard',
    label: `${b122a_line || 'IRS Local Standard'}: ${tableName}, ${where}, household of ${household_size || '?'}, $${(amount||0).toLocaleString()}/mo (effective ${effective_date})`,
    meta: { tableName, scope, county_fips, state_code, household_size, amount, effective_date, source_url, b122a_line },
  };
}

/**
 * Build a Citation for a manual entry.
 */
export function manualCitation({ b122a_line, category, description, monthly_amount, entered_by, entered_at, supporting_doc_id }) {
  return {
    kind: 'manual_entry',
    label: `${b122a_line}${category ? ` (${category})` : ''}: $${(monthly_amount||0).toLocaleString()}/mo, entered by ${entered_by || 'attorney'} at ${entered_at || ''}${description ? ` — ${description}` : ''}`,
    meta: { b122a_line, category, description, monthly_amount, entered_by, entered_at, supporting_doc_id },
  };
}

/**
 * Format a Citation for display.
 */
export function formatCitation(c) {
  if (!c) return '';
  return c.label || `[${c.kind}]`;
}

/**
 * Format a list of Citations as a comma-separated string for tight UI cells.
 */
export function formatCitations(list, max = 3) {
  if (!Array.isArray(list) || list.length === 0) return '—';
  const head = list.slice(0, max).map(formatCitation).join('; ');
  const rest = list.length - max;
  return rest > 0 ? `${head} (+${rest} more)` : head;
}

/**
 * Build a complete provenance graph for a case from raw DB rows.
 *
 * Inputs are the raw rows; the returned graph is consumed by
 * runMeansTest, the audit packet exporter, and the B122A exporter.
 */
export function buildProvenanceGraph({ receipts = [], manualDeductions = [], irsRefs = [], debtor = {}, documents = [] }) {
  return {
    receipts: receipts.map(r => ({
      ...r,
      citation: r.document_id
        ? docPageCitation({
            documentId: r.document_id,
            documentName: r.document_filename || documents.find(d => d.id === r.document_id)?.filename,
            page: r.source_page,
            label: `${r.source_label || 'Income source'} — pay date ${r.pay_date}`,
          })
        : manualCitation({
            b122a_line: 'B122A-1 income',
            category: 'income receipt',
            description: r.source_label,
            monthly_amount: r.gross_amount,
            entered_by: r.entered_by,
            entered_at: r.entered_at,
          }),
    })),
    manualDeductions: manualDeductions.map(d => ({
      ...d,
      citation: manualCitation(d),
    })),
    irsRefs: irsRefs.map(ref => ({
      ...ref,
      citation: irsCitation({
        ...ref,
        b122a_line: ref.b122a_line,
      }),
    })),
    debtor,
  };
}
