// Form B 106G — Schedule G: Executory Contracts and Unexpired Leases.
// 99 fields, 2 pages. 13 numbered slots (2.1 through 2.13).
//
// Source: documents where doc_type = 'lease' and extracted_data carries
// lessor / lessee / leasedItem / monthlyRent. The lease extractor (added
// in PR #18) writes that JSON onto the documents row.
//
// The form lists each lease/contract with: company name (lessor), street,
// city, state, zip, contact info (phone), and a description of the
// contract. We fill from extracted_data + flag any lease in default for
// attorney review.

const { setText, setCheck } = require('../pdf-utils');
const { fillHeader } = require('./_common');

function map(form, data, db) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  // Pull all lease extractions from the documents passed in via data.
  // (data-collector hands us data.documents as the documents-table rows
  // for this case.)
  const leaseDocs = (data.documents || []).filter(d => d.doc_type === 'lease');
  const leases = [];
  for (const d of leaseDocs) {
    if (!d.extracted_data) continue;
    try {
      const e = JSON.parse(d.extracted_data);
      if (e && (e.lessor || e.leasedItem)) leases.push(e);
    } catch {}
  }

  if (leases.length === 0) {
    track(setCheck(form, 'check1', true), 'check1'); // "No, you have no executory contracts or leases" toggle
    gaps.push({
      field: 'Lease entries',
      reason: 'No leases extracted yet. If the debtor has any active rental agreement, equipment lease, or other executory contract, drag the lease document onto the case for auto-population.',
    });
    return { formCode: 'B106G', label: 'Schedule G — Executory Contracts and Leases', mapped, total: 99, gaps };
  }

  // Fill up to 13 lease slots (form constraint).
  const slots = leases.slice(0, 13);
  for (let i = 0; i < slots.length; i++) {
    const slot = i + 1;
    const e = slots[i];

    // Parse address from leasedItemAddress when present.
    const fullAddr = e.leasedItemAddress || '';
    const addrMatch = fullAddr.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
    const street = addrMatch ? addrMatch[1].trim() : (e.leasedItem || '');
    const city   = addrMatch ? addrMatch[2].trim() : '';
    const state  = addrMatch ? addrMatch[3] : '';
    const zip    = addrMatch ? addrMatch[4] : '';

    track(setText(form, `Company Name 2.${slot}`, e.lessor || ''), `Company Name 2.${slot}`);
    track(setText(form, `Street 2.${slot}`,       street),         `Street 2.${slot}`);
    track(setText(form, `City 2.${slot}`,         city),           `City 2.${slot}`);
    track(setText(form, `State 2.${slot}`,        state),          `State 2.${slot}`);
    track(setText(form, `Zip 2.${slot}`,          zip),            `Zip 2.${slot}`);
    // Contact info (phone) — extractor doesn't capture phone; leave for attorney
    track(setText(form, `Contact Info 2.${slot}`, ''),              `Contact Info 2.${slot}`);

    if (e.isInDefault) {
      gaps.push({
        field: `Lease 2.${slot}`,
        reason: `Lease with ${e.lessor || 'lessor'} marked as in default ($${(e.amountInDefault || 0).toLocaleString()}). Confirm trustee disclosure under Schedule G + statement of intention regarding assumption / rejection.`,
      });
    }
  }

  if (leases.length > 13) {
    gaps.push({
      field: 'Lease 2.14+',
      reason: `${leases.length - 13} additional leases beyond form's 13 slots — attach a continuation page`,
    });
  }

  return {
    formCode: 'B106G',
    label: 'Schedule G — Executory Contracts and Leases',
    mapped,
    total: 99,
    gaps,
  };
}

module.exports = { map };
