// Official Form B122A-1 / B122A-2 export.
//
// What this generates: a multi-page PDF that mirrors the structure and
// line numbering of Official Forms B122A-1 (Statement of Current Monthly
// Income) and B122A-2 (Means Test Calculation), populated from the means
// test run's provenance graph. Field values come from un-redacted
// originals (debtor SSN/DOB/address read from the `debtors` row).
//
// What this is NOT: a court-filing-format facsimile of the official PDF
// templates published by uscourts.gov. The court accepts e-filings of
// the official form filled in via PACER/CM-ECF; this export is the
// firm's working copy with full source citations. To file, transcribe
// the values into the official template (or use a future PACER export).
//
// Why we don't ship the official template directly: AO-published forms
// change every 1-3 years and require careful field-mapping verification
// per release. That work is tracked separately; this export is what the
// design partner can review and verify *today*.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const M = 50;
const PAGE_W = 612;
const PAGE_H = 792;

async function generateB122A({
  caseData,
  debtor,
  run,
  receipts,
  manualDeductions,
}) {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  const computed = JSON.parse(run.computed_json || '{}');

  const ctx = { pdf, page: pdf.addPage([PAGE_W, PAGE_H]), y: PAGE_H - M, font, fontBold, fontMono };

  // ─── B122A-1 ───────────────────────────────────────────────
  drawFormTitle(ctx, 'Official Form 122A-1');
  drawFormSubtitle(ctx, "Chapter 7 Statement of Your Current Monthly Income");
  drawHR(ctx);

  drawSection(ctx, 'Part 1: Identify Yourself');
  drawField(ctx, '1. Debtor 1', `${debtor?.first_name || ''} ${debtor?.last_name || ''}`.trim());
  drawField(ctx, '   SSN (last 4)', debtor?.ssn ? `***-**-${String(debtor.ssn).slice(-4)}` : '—');
  drawField(ctx, '   Date of Birth', debtor?.dob || '—');
  drawField(ctx, '   Mailing address', formatAddress(debtor));
  drawField(ctx, '2. District', caseData?.district || '—');
  drawField(ctx, '3. Case number', caseData?.case_number || '—');
  drawField(ctx, '   Filing date', caseData?.filed_at || 'not yet filed');
  ctx.y -= 4;

  drawSection(ctx, 'Part 2: Calculate Your Current Monthly Income (CMI)');
  const stateCode = run.state_code || debtor?.address_state || '—';
  const householdSize = run.household_size || 1;
  drawField(ctx, '   State of residence',  stateCode);
  drawField(ctx, '   Household size',      String(householdSize));
  drawField(ctx, '   6-month window',      `${computed.cmiWindow?.start || '?'} → ${computed.cmiWindow?.end || '?'}`);
  drawField(ctx, '   Receipts in window',  String(computed.cmiWindow?.receiptCount || receipts.length));

  ctx.y -= 4;
  drawText(ctx, 'Receipt-by-receipt breakdown (used to compute Line 11):', { italic: true });
  drawTableHeader(ctx, ['Pay date', 'Source', 'Provenance', 'Gross']);
  for (const r of receipts) {
    ensureRoom(ctx, 14);
    let provenance;
    if (r.plaid_transaction_id) {
      provenance = `Plaid ${truncate(r.plaid_transaction_id, 12)}`;
    } else if (r.document_filename) {
      provenance = `${truncate(r.document_filename, 16)} p${r.source_page ?? '?'}`;
    } else if (r.manual_entry) {
      provenance = 'manual entry';
    } else {
      provenance = '—';
    }
    drawTableRow(ctx, [
      r.pay_date || '—',
      truncate(r.source_label || r.document_filename || '—', 28),
      provenance,
      fmtMoney(r.gross_amount),
    ]);
  }
  ctx.y -= 6;
  drawField(ctx, '11. Total CMI (sum ÷ 6)', fmtMoney(run.cmi));
  ctx.y -= 4;

  drawSection(ctx, 'Part 3: Determine Whether the Means Test Applies');
  drawField(ctx, '12a. Annualized CMI (line 11 × 12)', fmtMoney((run.cmi || 0) * 12));
  drawField(ctx, '13a. Median family income, ' + stateCode, fmtMoney(run.median_income));
  drawField(ctx, '14.  Result',
    computed.belowMedian
      ? 'Below median — Chapter 7 available; means test calculation NOT required.'
      : 'Above median — complete Form B122A-2.');

  // ─── B122A-2 (only if above median) ────────────────────────
  ensureRoom(ctx, 200);
  ctx.page = pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M;

  drawFormTitle(ctx, 'Official Form 122A-2');
  drawFormSubtitle(ctx, 'Chapter 7 Means Test Calculation');
  drawHR(ctx);

  if (computed.belowMedian) {
    drawText(ctx, 'Skipped — Form B122A-1 Line 14 indicates below-median income; means test calculation not required.', { italic: true, color: rgb(0.4, 0.4, 0.4) });
  } else {
    const d = computed.deductions || {};
    const cite = d.citations || {};

    drawSection(ctx, 'Part 1: Determine Adjusted Income');
    drawField(ctx, ' 1. Current Monthly Income (from B122A-1 line 11)', fmtMoney(run.cmi));
    ctx.y -= 4;

    drawSection(ctx, 'Part 2: Calculate Deductions from Your Income');
    drawCitedField(ctx, ' 6. National Standards (food, clothing, etc.)',     d.nationalStandards, cite['B122A-2 Line 6']);
    drawCitedField(ctx, ' 7. Out-of-pocket health care',                     d.healthCare,        cite['B122A-2 Line 7']);
    drawCitedField(ctx, ' 8. Housing & Utilities',                           d.housingUtilities,  cite['B122A-2 Line 8']);
    drawCitedField(ctx, '12. Vehicle ownership',
      cite['B122A-2 Line 12']?.amount || 0, cite['B122A-2 Line 12']);
    drawCitedField(ctx, '13. Vehicle operating',
      cite['B122A-2 Line 13']?.amount || 0, cite['B122A-2 Line 13']);

    // Manually-entered + Plaid-classified B122A-2 lines, in line-number order.
    if (manualDeductions.length > 0) {
      ctx.y -= 4;
      drawText(ctx, 'Manually-entered & Plaid-classified deduction lines:', { italic: true });
      const sorted = [...manualDeductions].sort((a, b) =>
        String(a.b122a_line || '').localeCompare(String(b.b122a_line || ''), 'en', { numeric: true }));
      for (const md of sorted) {
        ensureRoom(ctx, 14);
        drawField(ctx, `${md.b122a_line}  ${md.category || ''}`,
          fmtMoney(md.monthly_amount));
        const sourceDetail = md.entered_by === 'plaid' && md.source_count
          ? `${md.source_count} Plaid transaction${md.source_count === 1 ? '' : 's'} (accepted ${(md.entered_at || '').slice(0, 10)})`
          : `entered ${(md.entered_at || '').slice(0, 10)} by ${md.entered_by || 'attorney'}`;
        drawText(ctx, `   ${md.description || ''}${md.description ? ' — ' : ''}${sourceDetail}`,
          { color: rgb(0.45, 0.45, 0.45) });
      }
    }

    if (d.securedDebt > 0) drawCitedField(ctx, '33a. Avg monthly secured debt', d.securedDebt, cite['B122A-2 Line 33a']);
    if (d.priorityDebt > 0) drawCitedField(ctx, '35.  Priority debt',           d.priorityDebt, cite['B122A-2 Line 35']);
    ctx.y -= 4;

    drawField(ctx, '36. Total deductions (lines 6-35)', fmtMoney(d.grandTotal ?? d.total));
    ctx.y -= 4;

    drawSection(ctx, 'Part 3: Determine Whether There is a Presumption of Abuse');
    drawField(ctx, '37. Monthly disposable income (line 1 - line 36)', fmtMoney(computed.disposableMonthlyIncome));
    drawField(ctx, '38. 60-month disposable (line 37 × 60)',           fmtMoney(computed.disposable60Month));
    drawField(ctx, '39. Lower threshold',                              fmtMoney(computed.thresholds?.lower));
    drawField(ctx, '40. Upper threshold',                              fmtMoney(computed.thresholds?.upper));
    drawField(ctx, '41. Result',                                       labelForResult(run.result));

    if ((computed.warnings || []).length > 0) {
      ctx.y -= 4;
      drawSection(ctx, 'Warnings');
      for (const w of computed.warnings) {
        ensureRoom(ctx, 14);
        drawText(ctx, `⚠ ${w}`, { color: rgb(0.7, 0.2, 0.1) });
      }
    }
  }

  // Footer
  ctx.y -= 8;
  drawHR(ctx);
  drawText(ctx, `Generated by Tabula on ${new Date().toISOString().slice(0, 19).replace('T', ' ')} — see audit packet for full source citations.`, {
    color: rgb(0.55, 0.55, 0.55),
  });

  return Buffer.from(await pdf.save());
}

// ─── PDF helpers (shared shape with audit-packet) ──────────
function ensureRoom(ctx, h = 14) {
  if (ctx.y - h > M) return;
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M;
}
function drawFormTitle(ctx, t) {
  ensureRoom(ctx, 28);
  ctx.page.drawText(t, { x: M, y: ctx.y - 18, size: 16, font: ctx.fontBold });
  ctx.y -= 24;
}
function drawFormSubtitle(ctx, t) {
  ensureRoom(ctx, 18);
  ctx.page.drawText(t, { x: M, y: ctx.y - 14, size: 11, font: ctx.font, color: rgb(0.3, 0.3, 0.3) });
  ctx.y -= 18;
}
function drawSection(ctx, t) {
  ensureRoom(ctx, 22);
  ctx.page.drawText(t, { x: M, y: ctx.y - 14, size: 11, font: ctx.fontBold });
  ctx.y -= 20;
}
function drawHR(ctx) {
  ensureRoom(ctx, 12);
  ctx.page.drawLine({ start: { x: M, y: ctx.y - 4 }, end: { x: PAGE_W - M, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  ctx.y -= 10;
}
function drawText(ctx, t, opts = {}) {
  ensureRoom(ctx, 14);
  for (const ln of wrap(t, 92)) {
    ensureRoom(ctx, 14);
    ctx.page.drawText(ln, { x: M, y: ctx.y - 11, size: 10, font: opts.italic ? ctx.font : ctx.font, color: opts.color || rgb(0, 0, 0) });
    ctx.y -= 13;
  }
}
function drawField(ctx, label, value) {
  ensureRoom(ctx, 14);
  ctx.page.drawText(label, { x: M, y: ctx.y - 11, size: 10, font: ctx.fontBold });
  ctx.page.drawText(String(value ?? ''), { x: M + 280, y: ctx.y - 11, size: 10, font: ctx.fontMono });
  ctx.y -= 14;
}
function drawCitedField(ctx, label, value, citation) {
  drawField(ctx, label, fmtMoney(value));
  if (!citation) return;
  const tag =
    citation.scope === 'county'         ? `county ${citation.county_fips} (${citation.county_name || '?'})` :
    citation.scope === 'state-fallback' ? `state ${citation.state_code} fallback` :
    citation.scope === 'state'          ? `state ${citation.state_code}` :
    citation.scope === 'region'         ? `region ${citation.region}` :
    citation.scope === 'national'       ? 'national' :
    citation.manual                     ? 'attorney-entered' :
                                          '';
  ctx.y -= 0;
  ctx.page.drawText(`   source: IRS ${citation.tableName || ''} ${tag}, eff. ${citation.effective_date || '?'}`, {
    x: M + 12, y: ctx.y - 9, size: 8, font: ctx.font, color: rgb(0.5, 0.5, 0.5),
  });
  ctx.y -= 12;
}
function drawTableHeader(ctx, cols) {
  ensureRoom(ctx, 16);
  const colW = (PAGE_W - 2 * M) / cols.length;
  cols.forEach((c, i) => {
    ctx.page.drawText(c, { x: M + i * colW, y: ctx.y - 11, size: 9, font: ctx.fontBold });
  });
  ctx.y -= 14;
  ctx.page.drawLine({ start: { x: M, y: ctx.y - 1 }, end: { x: PAGE_W - M, y: ctx.y - 1 }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
  ctx.y -= 4;
}
function drawTableRow(ctx, cols) {
  ensureRoom(ctx, 14);
  const colW = (PAGE_W - 2 * M) / cols.length;
  cols.forEach((c, i) => {
    ctx.page.drawText(String(c), { x: M + i * colW, y: ctx.y - 10, size: 9, font: i === cols.length - 1 ? ctx.fontMono : ctx.font });
  });
  ctx.y -= 13;
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}
function labelForResult(r) {
  return r === 'chapter7' ? 'Chapter 7 Eligible'
    : r === 'chapter13' ? 'Chapter 13 Recommended'
    : r === 'needs_analysis' ? 'Additional Analysis Needed'
    : (r || '—');
}
function formatAddress(d) {
  if (!d) return '—';
  const parts = [d.address_street, d.address_city, d.address_state, d.address_zip].filter(Boolean);
  return parts.length === 0 ? '—' : parts.join(', ');
}
function truncate(s, n) { return s == null ? '—' : (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s)); }
function wrap(text, n) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const out = []; let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > n) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

module.exports = { generateB122A };
