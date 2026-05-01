// Form B 101 — Voluntary Petition for Individuals Filing for Bankruptcy.
// 159 fields across 9 pages. The petition itself.
//
// We map confidently: identity (names, SSN), address, district, contact info,
// attorney info if known. We deliberately DO NOT auto-check the chapter
// checkbox or debt-type checkbox without an explicit signal — picking the
// wrong box on a petition is a bigger error than leaving it blank for the
// attorney to pick. Those become review-flag gaps instead.

const { setText, setCheck, setDropdown } = require('../pdf-utils');
const { fillHeader } = require('./_common');

function map(form, data) {
  const gaps = [];
  let mapped = 0;
  const track = (ok, name, gap) => { if (ok) mapped++; else if (gap) gaps.push({ field: name, reason: gap }); };

  const headerStats = fillHeader(form, data);
  mapped += headerStats.hits;

  const d1 = data.debtor1 || {};
  const d2 = data.debtor2 || null;

  // ─── Part 1 — Identify yourself ───────────────────────────────
  // Debtor 1 — name
  track(setText(form, 'Debtor1.First name', d1.first), 'Debtor1.First name',
        d1.first ? null : 'Primary debtor first name missing');
  track(setText(form, 'Debtor1.Middle name', d1.middle), 'Debtor1.Middle name', null);
  track(setText(form, 'Debtor1.Last name', d1.last), 'Debtor1.Last name',
        d1.last ? null : 'Primary debtor last name missing');
  track(setText(form, 'Debtor1.Suffix Sr Jr II III', d1.suffix), 'Debtor1.Suffix Sr Jr II III', null);

  // Debtor 1 — SSN (full 9 digits)
  if (d1.ssn) {
    const digits = d1.ssn.replace(/\D/g, '');
    track(setText(form, 'Debtor1.SSNum', digits), 'Debtor1.SSNum');
  } else {
    gaps.push({ field: 'Debtor1.SSNum', reason: 'Debtor SSN required for petition' });
  }

  // Debtor 1 — current address
  track(setText(form, 'Debtor1.Street', d1.address.line1), 'Debtor1.Street',
        d1.address.line1 ? null : 'Debtor street address missing');
  track(setText(form, 'Debtor1.Street1', d1.address.line2), 'Debtor1.Street1', null);
  track(setText(form, 'Debtor1.City', d1.address.city), 'Debtor1.City',
        d1.address.city ? null : 'Debtor city missing');
  track(setText(form, 'Debtor1.State', d1.address.state), 'Debtor1.State',
        d1.address.state ? null : 'Debtor state missing (required for venue)');
  track(setText(form, 'Debtor1.ZIP Code', d1.address.zip), 'Debtor1.ZIP Code',
        d1.address.zip ? null : 'Debtor ZIP missing');
  track(setText(form, 'Debtor1.County', d1.address.county), 'Debtor1.County',
        d1.address.county ? null : 'County not stored — needed for venue determination');

  // Debtor 1 — contact
  track(setText(form, 'Debtor1.Contact phone_2', d1.phone), 'Debtor1.Contact phone_2', null);
  track(setText(form, 'Debtor1.Cell phone', d1.phone), 'Debtor1.Cell phone', null);
  track(setText(form, 'Debtor1.Email address_2', d1.email), 'Debtor1.Email address_2',
        d1.email ? null : 'Debtor email missing — required for ECF notifications');

  // Debtor 1 — name lines (redacted "Name" + signature). Typed name on
  // signature line; the literal "/s/" goes there at sign time.
  track(setText(form, 'Debtor1.Name', d1.fullName), 'Debtor1.Name');

  // ─── Debtor 2 (joint filer) ──────────────────────────────────
  if (d2) {
    track(setText(form, 'Debtor2.First name', d2.first), 'Debtor2.First name');
    track(setText(form, 'Debtor2.Middle name_2', d2.middle), 'Debtor2.Middle name_2');
    track(setText(form, 'Debtor2.Last name', d2.last), 'Debtor2.Last name');
    if (d2.ssn) {
      const digits = d2.ssn.replace(/\D/g, '');
      track(setText(form, 'Debtor2 SSNum', digits), 'Debtor2 SSNum');
    }
    track(setText(form, 'Debtor2.Street', d2.address.line1), 'Debtor2.Street');
    track(setText(form, 'Debtor2.Street2', d2.address.line2), 'Debtor2.Street2');
    track(setText(form, 'Debtor2.City', d2.address.city), 'Debtor2.City');
    track(setText(form, 'Debtor2.State', d2.address.state), 'Debtor2.State');
    track(setText(form, 'Debtor2.ZIP', d2.address.zip), 'Debtor2.ZIP');
    track(setText(form, 'Debtor2.Contact phone', d2.phone), 'Debtor2.Contact phone');
    track(setText(form, 'Debtor2.Cell phone', d2.phone), 'Debtor2.Cell phone');
    track(setText(form, 'Debtor2.Email address', d2.email), 'Debtor2.Email address');
  }

  // ─── Sign / dates ─────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US');
  track(setText(form, 'Executed on', today), 'Executed on');
  track(setText(form, 'Debtor1.Date signed', today), 'Debtor1.Date signed');
  if (d2) {
    track(setText(form, 'Debtor2.Executed on', today), 'Debtor2.Executed on');
    track(setText(form, 'Debtor2.Date signed', today), 'Debtor2.Date signed');
  }

  // ─── Critical attorney decisions — flagged, not auto-filled ──────
  //
  // The chapter / debt-type / fee-payment checkboxes are NOT auto-checked
  // because picking the wrong one is more harmful than leaving them for
  // the attorney to verify. Instead each becomes an explicit gap.
  gaps.push({
    field: 'Chapter selection (Check Box 16-17)',
    reason: `Confirm chapter ${data.case.chapter} on the form — auto-check disabled to prevent miscoding`,
  });
  gaps.push({
    field: 'Type of debts (consumer vs business)',
    reason: 'Confirm debt-type checkbox: primarily consumer debts vs primarily business debts',
  });
  gaps.push({
    field: 'Filing fee payment (Check Box 16A or installment/waiver)',
    reason: 'Confirm filing fee method: paid in full at filing, installments, or fee waiver request',
  });
  gaps.push({
    field: 'Prior bankruptcy cases (last 8 years)',
    reason: 'Confirm with debtor whether they have filed bankruptcy in the last 8 years',
  });
  gaps.push({
    field: 'Pending bankruptcy by spouse/affiliate',
    reason: 'Confirm whether any related party has a pending bankruptcy case',
  });
  gaps.push({
    field: 'Rental residence + eviction status',
    reason: "If renting, complete eviction-related questions and Form 101A/101B if applicable",
  });

  if (!data.case.districtMatched) {
    gaps.push({
      field: 'Bankruptcy District Information',
      reason: `District "${data.case.districtRaw}" couldn't be matched to an official district name — manually select on form`,
    });
  }

  return {
    formCode: 'B101',
    label: 'Voluntary Petition for Individuals',
    mapped,
    total: 159,
    gaps,
  };
}

module.exports = { map };
