// Means Test Audit Packet — the artifact you hand to a U.S. Trustee.
//
// Renders a multi-page PDF showing every line of the means test
// computation, every receipt that contributed to CMI, every IRS Local
// Standard reference (with effective date and scope), and every manual
// deduction (with timestamp + supporting doc reference).
//
// Inputs come from a means_test_runs row (computed_json + unhandled_json)
// plus the live receipts/manual_deductions/IRS refs tables. The output is
// a PDF Buffer; the IPC handler writes it to a chosen path on disk.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const M = 50;       // page margin
const PAGE_W = 612; // letter
const PAGE_H = 792;

async function generateAuditPacket({
  caseId,
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
  const unhandled = JSON.parse(run.unhandled_json || '[]');

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const ctx = { pdf, page, y, font, fontBold, fontMono };

  // ─── Header ────────────────────────────────────────────────
  drawTitle(ctx, 'Means Test — Audit Packet');
  drawSubhead(ctx, 'For U.S. Trustee review per 11 U.S.C. § 707(b)(2)');
  ctx.y -= 6;
  drawKV(ctx, 'Debtor',        `${debtor?.first_name || ''} ${debtor?.last_name || ''}`.trim() || '—');
  drawKV(ctx, 'Case ID',       caseId);
  drawKV(ctx, 'District',      caseData?.district || '—');
  drawKV(ctx, 'Filed',         caseData?.filed_at || 'not filed');
  drawKV(ctx, 'Run timestamp', run.run_at);
  drawKV(ctx, 'Result',        labelForResult(run.result));
  ctx.y -= 8;
  drawHR(ctx);

  // ─── Section 1: CMI ────────────────────────────────────────
  drawSection(ctx, '1. Current Monthly Income (CMI) — 11 U.S.C. § 101(10A)');
  drawText(ctx, `Window: ${computed.cmiWindow?.start || '?'} to ${computed.cmiWindow?.end || '?'} (six full calendar months ending the month before filing).`);
  drawText(ctx, `Receipts in window: ${computed.cmiWindow?.receiptCount || receipts.length}`);
  drawText(ctx, `Sum of gross_amount: ${fmtMoney(sumReceipts(receipts) * 1)} ÷ 6 = CMI of ${fmtMoney(computed.cmi)}/mo`);
  ctx.y -= 4;
  drawTableHeader(ctx, ['Pay date', 'Source', 'PDF page', 'Gross']);
  for (const r of receipts) {
    ensureRoom(ctx, 16);
    drawTableRow(ctx, [
      r.pay_date || '—',
      truncate(r.source_label || r.document_filename || '—', 30),
      r.source_page != null ? String(r.source_page) : '—',
      fmtMoney(r.gross_amount),
    ]);
  }
  ctx.y -= 6;
  drawHR(ctx);

  // ─── Section 2: Median income ──────────────────────────────
  drawSection(ctx, '2. State Median Income — § 707(b)(7)');
  drawKV(ctx, 'State',            run.state_code || '—');
  drawKV(ctx, 'Household size',   String(run.household_size || '—'));
  drawKV(ctx, 'Median income',    fmtMoney(run.median_income));
  drawKV(ctx, 'Annualized CMI',   fmtMoney((run.cmi || 0) * 12));
  drawKV(ctx, 'Above/below',      computed.belowMedian ? 'BELOW (no abuse presumption)' : 'ABOVE (DMI test required)');
  ctx.y -= 4;
  drawHR(ctx);

  // ─── Section 3: Allowed deductions ─────────────────────────
  drawSection(ctx, '3. Allowed Deductions — § 707(b)(2)(A)(ii)');
  if (computed.deductions) {
    const d = computed.deductions;
    drawKV(ctx, 'National Standards',     fmtMoney(d.nationalStandards));
    drawKV(ctx, 'Out-of-pocket healthcare', fmtMoney(d.healthCare));
    drawKV(ctx, 'Housing & utilities',     fmtMoney(d.housingUtilities) + (d.housingScope ? `  (${d.housingScope})` : ''));
    drawKV(ctx, 'Transportation',          fmtMoney(d.transportation));
    drawKV(ctx, 'Secured debt (avg)',      fmtMoney(d.securedDebt));
    drawKV(ctx, 'Priority debt',           fmtMoney(d.priorityDebt));
    drawKV(ctx, 'Manual deductions total', fmtMoney(d.manualTotal || 0));
    drawKV(ctx, 'TOTAL',                   fmtMoney(d.grandTotal ?? d.total));
  } else {
    drawText(ctx, '— Below median; deductions not computed.');
  }
  ctx.y -= 6;

  // ─── 3a. IRS standards citations ───────────────────────────
  drawSection(ctx, '3a. IRS Local & National Standards — sources');
  if (computed.deductions?.citations) {
    for (const [line, ref] of Object.entries(computed.deductions.citations)) {
      ensureRoom(ctx, 18);
      const tag = `${line}  (${ref.tableName || '?'})`;
      const summary = ref.scope === 'county'         ? `county ${ref.county_fips} (${ref.county_name || '?'})` :
                      ref.scope === 'state-fallback' ? `state ${ref.state_code} (county not in table)` :
                      ref.scope === 'state'          ? `state ${ref.state_code}` :
                      ref.scope === 'region'         ? `Census region ${ref.region}` :
                      ref.scope === 'national'       ? 'national' :
                      ref.manual                     ? 'attorney-entered' :
                                                       'unspecified';
      drawText(ctx, `${tag}: ${fmtMoney(ref.amount)} — ${summary}, household ${ref.household_size || '—'}, effective ${ref.effective_date || '?'}`);
      if (ref.note) drawText(ctx, `  note: ${ref.note}`, { color: rgb(0.5, 0.5, 0.5) });
    }
  }
  ctx.y -= 6;
  drawHR(ctx);

  // ─── Section 4: Manual deductions ──────────────────────────
  drawSection(ctx, '4. Manual Deductions');
  if (manualDeductions.length === 0) {
    drawText(ctx, '— None entered.');
  } else {
    drawTableHeader(ctx, ['Line', 'Category', 'Amount', 'Entered']);
    for (const d of manualDeductions) {
      ensureRoom(ctx, 16);
      drawTableRow(ctx, [
        d.b122a_line,
        truncate(d.category || '', 24),
        fmtMoney(d.monthly_amount),
        truncate(`${d.entered_by || '?'} @ ${(d.entered_at || '').slice(0, 10)}`, 22),
      ]);
      if (d.description) {
        ensureRoom(ctx, 14);
        drawText(ctx, `   ${d.description}`, { color: rgb(0.4, 0.4, 0.4) });
      }
    }
  }
  ctx.y -= 6;

  // ─── Section 5: Unhandled lines ────────────────────────────
  drawSection(ctx, '5. Unmodeled B122A-2 Lines (review acknowledgments)');
  if (unhandled.length === 0) {
    drawText(ctx, '— All B122A-2 deduction lines either modeled or manually entered.');
  } else {
    drawText(ctx, 'These lines are not auto-modeled and were either manually entered (see §4) or marked Not Applicable by the attorney during review:');
    for (const u of unhandled) {
      ensureRoom(ctx, 14);
      const status = u.handled ? `entered: ${fmtMoney(u.value)}` : (u.acknowledged ? 'marked Not Applicable' : 'UNRESOLVED');
      drawText(ctx, `${u.line}  ${u.label}  —  ${status}`);
    }
  }
  ctx.y -= 6;
  drawHR(ctx);

  // ─── Section 6: Result + reasoning ─────────────────────────
  drawSection(ctx, '6. Result & Reasoning');
  drawKV(ctx, 'Recommendation',         labelForResult(run.result));
  drawKV(ctx, 'Confidence',             computed.confidence || '—');
  drawKV(ctx, 'Disposable monthly inc.', fmtMoney(computed.disposableMonthlyIncome));
  drawKV(ctx, '60-month DMI',            fmtMoney(computed.disposable60Month));
  drawKV(ctx, 'Lower threshold',         fmtMoney(computed.thresholds?.lower));
  drawKV(ctx, 'Upper threshold',         fmtMoney(computed.thresholds?.upper));
  drawKV(ctx, 'Thresholds effective',    `${computed.thresholds?.effectiveFrom || '?'} → ${computed.thresholds?.effectiveTo || '?'}`);
  ctx.y -= 4;
  for (const line of (computed.explanation || [])) {
    ensureRoom(ctx, 14);
    drawText(ctx, `• ${line}`);
  }
  if ((computed.warnings || []).length > 0) {
    ctx.y -= 4;
    drawSection(ctx, 'Warnings');
    for (const w of computed.warnings) {
      ensureRoom(ctx, 14);
      drawText(ctx, `⚠ ${w}`, { color: rgb(0.7, 0.2, 0.1) });
    }
  }

  // Footer
  ctx.y -= 8;
  drawText(ctx, '— end of packet —', { color: rgb(0.6, 0.6, 0.6), align: 'center' });

  return Buffer.from(await pdf.save());
}

// ─── PDF helpers ───────────────────────────────────────────
function ensureRoom(ctx, h = 14) {
  if (ctx.y - h > M) return;
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M;
}

function drawTitle(ctx, text) {
  ensureRoom(ctx, 28);
  ctx.page.drawText(text, { x: M, y: ctx.y - 18, size: 18, font: ctx.fontBold });
  ctx.y -= 26;
}
function drawSubhead(ctx, text) {
  ensureRoom(ctx, 16);
  ctx.page.drawText(text, { x: M, y: ctx.y - 12, size: 10, font: ctx.font, color: rgb(0.4, 0.4, 0.4) });
  ctx.y -= 16;
}
function drawSection(ctx, text) {
  ensureRoom(ctx, 22);
  ctx.page.drawText(text, { x: M, y: ctx.y - 14, size: 12, font: ctx.fontBold });
  ctx.y -= 20;
}
function drawText(ctx, text, opts = {}) {
  ensureRoom(ctx, 14);
  const lines = wrap(text, 90);
  for (const ln of lines) {
    ensureRoom(ctx, 14);
    ctx.page.drawText(ln, {
      x: opts.align === 'center' ? (PAGE_W / 2 - (ln.length * 2.6)) : M,
      y: ctx.y - 11, size: 10, font: ctx.font, color: opts.color || rgb(0, 0, 0),
    });
    ctx.y -= 13;
  }
}
function drawKV(ctx, key, value) {
  ensureRoom(ctx, 14);
  ctx.page.drawText(key, { x: M, y: ctx.y - 11, size: 10, font: ctx.fontBold });
  ctx.page.drawText(String(value ?? ''), { x: M + 160, y: ctx.y - 11, size: 10, font: ctx.fontMono });
  ctx.y -= 14;
}
function drawHR(ctx) {
  ensureRoom(ctx, 14);
  ctx.page.drawLine({
    start: { x: M, y: ctx.y - 4 }, end: { x: PAGE_W - M, y: ctx.y - 4 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
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
  ctx.page.drawLine({
    start: { x: M, y: ctx.y - 1 }, end: { x: PAGE_W - M, y: ctx.y - 1 },
    thickness: 0.3, color: rgb(0.7, 0.7, 0.7),
  });
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

// ─── Pure helpers ──────────────────────────────────────────
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}
function sumReceipts(rs) { return (rs || []).reduce((s, r) => s + (Number(r.gross_amount) || 0), 0); }
function labelForResult(r) {
  return r === 'chapter7' ? 'Chapter 7 Eligible'
    : r === 'chapter13' ? 'Chapter 13 Recommended'
    : r === 'needs_analysis' ? 'Additional Analysis Needed'
    : (r || '—');
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

module.exports = { generateAuditPacket };
