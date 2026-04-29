// Chapter 7 Means Test — v1 (provenance-graph design)
//
// 11 U.S.C. § 707(b)(2) — the means test.
// 11 U.S.C. § 101(10A)  — Current Monthly Income (CMI) is the average
//                          monthly income received during the SIX FULL
//                          CALENDAR MONTHS before filing.
//
// This module is pure: data in → data out. No DB, no API, no side effects.
// All inputs come from the provenance graph (see ./provenance.js).

import { getMedianIncome } from './median-income.js';
import { getAllowedDeductions } from './irs-standards.js';
import thresholds from '../../../data/means-test-thresholds.json';

const LOWER_THRESHOLD = thresholds.lower_threshold_60mo;
const UPPER_THRESHOLD = thresholds.upper_threshold_60mo;
const THRESHOLD_EFFECTIVE_FROM = thresholds.effective_from;
const THRESHOLD_EFFECTIVE_TO   = thresholds.effective_to;

// B122A-2 line numbers we model today. Anything not in this set must be
// surfaced via `unhandled` so the attorney sees what's not modeled.
export const HANDLED_LINES = new Set([
  'B122A-2 Line 6',   // National Standards
  'B122A-2 Line 7',   // Out-of-Pocket Health Care
  'B122A-2 Line 8',   // Housing & Utilities (county)
  'B122A-2 Line 9',   // Housing & Utilities adjustment (skipped — non-mortgage)
  'B122A-2 Line 12',  // Vehicle ownership
  'B122A-2 Line 13',  // Vehicle operating
  'B122A-2 Line 33a', // Avg monthly secured debt payment
  'B122A-2 Line 35',  // Priority debt
]);

export const UNHANDLED_LINES = [
  // Each entry: { line, label, reason } — surfaced to the user.
  { line: 'B122A-2 Line 16',  label: 'Taxes — actual withholding',          reason: 'Auto-extract from paystubs (rolling out)' },
  { line: 'B122A-2 Line 17',  label: 'Mandatory payroll deductions',         reason: 'Manual entry required (union dues, 401(k) loan repayment)' },
  { line: 'B122A-2 Line 18',  label: 'Life insurance for non-debtor dep.',   reason: 'Manual entry required' },
  { line: 'B122A-2 Line 19',  label: 'Court-ordered payments',               reason: 'Manual entry required (alimony, family support actually paid)' },
  { line: 'B122A-2 Line 20',  label: 'Education for employment',              reason: 'Manual entry required' },
  { line: 'B122A-2 Line 21',  label: 'Childcare for employment',              reason: 'Manual entry required' },
  { line: 'B122A-2 Line 22',  label: 'Additional health care above standard', reason: 'Manual entry required' },
  { line: 'B122A-2 Line 23',  label: 'Telecommunications',                    reason: 'Manual entry required' },
  { line: 'B122A-2 Line 25',  label: 'Health insurance / disability / HSA',   reason: 'Manual entry required' },
  { line: 'B122A-2 Line 26',  label: 'Continued contributions to dependents', reason: 'Manual entry required' },
  { line: 'B122A-2 Line 27',  label: 'Charitable contributions',              reason: 'Manual entry required' },
  { line: 'B122A-2 Line 33b', label: 'Secured debt arrears (60-mo avg)',      reason: 'Manual entry required if applicable' },
];

/**
 * Statutory 6-month window: the six full calendar months ending the month
 * before the filing date.
 *
 * Example: filing on 2026-04-15  →  window = 2025-10-01 .. 2026-03-31
 */
export function sixMonthWindow(filingDate) {
  const f = new Date(filingDate);
  if (isNaN(f)) return null;
  const end = new Date(f.getFullYear(), f.getMonth(), 0); // last day of prev month
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/**
 * Calculate CMI from receipts within the 6-month window.
 * Sum every receipt's gross_amount, divide by 6.
 *
 * @param {Array} receipts — each { id, pay_date, gross_amount, ... }
 * @param {string} filingDate — ISO date; defaults to today
 */
export function calculateCMI(receipts, filingDate = new Date().toISOString().slice(0, 10)) {
  const window = sixMonthWindow(filingDate);
  if (!window) {
    return { cmi: 0, receipts: [], windowStart: null, windowEnd: null, receiptCount: 0 };
  }
  const inWindow = (receipts || []).filter(r =>
    r && r.pay_date && r.pay_date >= window.start && r.pay_date <= window.end
  );
  const total = inWindow.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  return {
    cmi: total / 6,
    receiptCount: inWindow.length,
    windowStart: window.start,
    windowEnd: window.end,
    receipts: inWindow,
  };
}

/**
 * Run the full Chapter 7 means test against a provenance graph.
 *
 * Input shape (all optional, sensible defaults):
 *   {
 *     receipts: [{ id, pay_date, gross_amount, ... }],
 *     manualDeductions: [{ b122a_line, monthly_amount }],
 *     filingDate: 'YYYY-MM-DD',
 *     stateCode: 'GA',
 *     countyFips: '13_021',
 *     householdSize: 2,
 *     vehicleCount: 1,
 *     over65Count: 0,
 *     monthlySecuredDebt: 0,
 *     monthlyPriorityDebt: 0,
 *   }
 *
 * Output:
 *   {
 *     cmi, annualIncome, medianIncome, belowMedian,
 *     deductions, disposableMonthlyIncome, disposable60Month,
 *     recommendation, confidence, explanation, warnings,
 *     thresholds: { lower, upper, effectiveFrom, effectiveTo },
 *     unhandled: [{ line, label, reason, value? }],   // mandatory-review list
 *     citations: { cmi: [receipt_id, ...], median: '...', deductions: { line: source } }
 *   }
 */
export function runMeansTest(input = {}) {
  const {
    receipts: providedReceipts,
    incomeSources, // legacy callers
    manualDeductions = [],
    filingDate = new Date().toISOString().slice(0, 10),
    stateCode = 'TX',
    countyFips = null,
    householdSize = 1,
    vehicleCount = 1,
    over65Count = 0,
    monthlySecuredDebt = 0,
    monthlyPriorityDebt = 0,
  } = input;

  // Legacy path: caller passed aggregated incomeSources instead of receipts.
  // Synthesize 6 monthly receipts so the rest of the pipeline still runs.
  // The result is identical to the old approximation; the new code path
  // (real receipts) is what unlocks correct results for irregular income.
  let receipts = providedReceipts;
  if ((!receipts || receipts.length === 0) && Array.isArray(incomeSources) && incomeSources.length > 0) {
    receipts = synthesizeReceiptsFromIncomeSources(incomeSources, filingDate);
  }
  receipts = receipts || [];

  // Sum manual deductions by line
  const manualByLine = {};
  for (const d of manualDeductions) {
    if (!d || !d.b122a_line) continue;
    manualByLine[d.b122a_line] = (manualByLine[d.b122a_line] || 0) + (Number(d.monthly_amount) || 0);
  }

  // ─── Step 1: CMI from 6-month receipt window ─────────────────
  const cmiResult = calculateCMI(receipts, filingDate);
  const annualIncome = cmiResult.cmi * 12;
  const medianIncome = getMedianIncome(stateCode, householdSize);
  const belowMedian = annualIncome <= medianIncome;

  const result = {
    cmi: cmiResult.cmi,
    cmiWindow: { start: cmiResult.windowStart, end: cmiResult.windowEnd, receiptCount: cmiResult.receiptCount },
    annualIncome,
    medianIncome,
    belowMedian,
    difference: medianIncome - annualIncome,
    deductions: null,
    disposableMonthlyIncome: null,
    disposable60Month: null,
    recommendation: null,
    confidence: null,
    explanation: [],
    warnings: [],
    thresholds: {
      lower: LOWER_THRESHOLD,
      upper: UPPER_THRESHOLD,
      effectiveFrom: THRESHOLD_EFFECTIVE_FROM,
      effectiveTo: THRESHOLD_EFFECTIVE_TO,
    },
    citations: {
      cmi: cmiResult.receipts.map(r => r.id).filter(Boolean),
      cmiSourceCount: cmiResult.receiptCount,
    },
    unhandled: [],
  };

  // Always surface the unhandled-line list. Caller decides which to mark
  // "Not applicable" vs which require manual_deductions input.
  result.unhandled = UNHANDLED_LINES.map(u => {
    const filledValue = manualByLine[u.line];
    return {
      ...u,
      value: filledValue ?? null,
      handled: filledValue != null,
    };
  });

  // Stale-data warning if thresholds JSON is older than 12 months
  if (THRESHOLD_EFFECTIVE_FROM) {
    const ageMs = Date.now() - new Date(THRESHOLD_EFFECTIVE_FROM).getTime();
    if (ageMs > 365 * 24 * 60 * 60 * 1000) {
      result.warnings.push(
        `Disposable-income thresholds are dated ${THRESHOLD_EFFECTIVE_FROM}. Verify against the current U.S. Trustee Program tables before filing.`
      );
    }
  }

  // ─── Step 2: below median → Ch 7, no abuse presumption ────────
  if (belowMedian) {
    result.recommendation = 'chapter7';
    result.confidence = 'high';
    result.explanation = [
      `CMI of ${fmt(cmiResult.cmi)}/mo (${cmiResult.receiptCount} receipts in 6-mo window) annualizes to ${fmt(annualIncome)}.`,
      `${stateCode} median for household of ${householdSize}: ${fmt(medianIncome)}.`,
      'Below median — no presumption of abuse. Chapter 7 is available.',
    ];
    if (medianIncome - annualIncome < medianIncome * 0.1) {
      result.warnings.push('Income is within 10% of the median — small income swings could change eligibility.');
    }
    return result;
  }

  // ─── Step 3: above median → compute disposable income ─────────
  const allowed = getAllowedDeductions({
    householdSize,
    stateCode,
    countyFips,
    vehicleCount,
    over65Count,
    actualSecuredDebt: monthlySecuredDebt,
    priorityDebt: monthlyPriorityDebt,
  });
  result.deductions = allowed;
  result.citations.deductions = allowed.citations || {};

  // Add manual deductions to total
  const manualTotal = Object.values(manualByLine).reduce((s, v) => s + v, 0);
  const totalDeductions = (allowed.total || 0) + manualTotal;
  result.deductions.manualTotal = manualTotal;
  result.deductions.grandTotal = totalDeductions;

  const dmi = cmiResult.cmi - totalDeductions;
  result.disposableMonthlyIncome = dmi;
  result.disposable60Month = dmi * 60;

  if (dmi * 60 < LOWER_THRESHOLD) {
    result.recommendation = 'chapter7';
    result.confidence = 'high';
    result.explanation = [
      `CMI of ${fmt(cmiResult.cmi)}/mo annualizes to ${fmt(annualIncome)}, exceeding the ${stateCode} median of ${fmt(medianIncome)}.`,
      `Allowed deductions ${fmt(totalDeductions)}/mo → DMI of ${fmt(dmi)}/mo.`,
      `60-month DMI: ${fmt(dmi * 60)} — below ${fmt(LOWER_THRESHOLD)} threshold. No presumption of abuse.`,
    ];
  } else if (dmi * 60 > UPPER_THRESHOLD) {
    result.recommendation = 'chapter13';
    result.confidence = 'high';
    result.explanation = [
      `CMI of ${fmt(cmiResult.cmi)}/mo annualizes to ${fmt(annualIncome)}, exceeding the ${stateCode} median of ${fmt(medianIncome)}.`,
      `Allowed deductions ${fmt(totalDeductions)}/mo → DMI of ${fmt(dmi)}/mo.`,
      `60-month DMI: ${fmt(dmi * 60)} — exceeds ${fmt(UPPER_THRESHOLD)} threshold. Presumption of abuse arises; Chapter 13 likely path.`,
    ];
  } else {
    result.recommendation = 'needs_analysis';
    result.confidence = 'medium';
    result.explanation = [
      `CMI of ${fmt(cmiResult.cmi)}/mo annualizes to ${fmt(annualIncome)}, exceeding the ${stateCode} median of ${fmt(medianIncome)}.`,
      `60-month DMI of ${fmt(dmi * 60)} falls between ${fmt(LOWER_THRESHOLD)} and ${fmt(UPPER_THRESHOLD)}.`,
      'Additional analysis required — abuse presumption may or may not apply depending on specific deductions.',
    ];
  }

  if (Math.abs(dmi * 60 - LOWER_THRESHOLD) < 1500) {
    result.warnings.push('60-month DMI is within $1,500 of the lower threshold — small deduction changes could flip the result.');
  }
  if (Math.abs(dmi * 60 - UPPER_THRESHOLD) < 1500) {
    result.warnings.push('60-month DMI is within $1,500 of the upper threshold — small deduction changes could flip the result.');
  }

  // Tell the user when we've left common money on the table
  const unhandledCount = result.unhandled.filter(u => !u.handled).length;
  if (unhandledCount > 0 && result.recommendation !== 'chapter7') {
    result.warnings.push(
      `${unhandledCount} B122A-2 deduction line(s) not modeled and not manually entered. ` +
      `Disposable income may be overstated; verify before filing.`
    );
  }

  return result;
}

/**
 * Annualize income based on pay frequency. Kept for the legacy MeansTest
 * UI flow that still operates on aggregated income sources.
 */
export function annualizeIncome(amount, frequency) {
  switch (frequency) {
    case 'weekly':      return amount * 52;
    case 'biweekly':    return amount * 26;
    case 'semimonthly': return amount * 24;
    case 'monthly':     return amount * 12;
    case 'annual':      return amount;
    default:            return amount * 12;
  }
}

/**
 * Compare CMI to state median — kept for legacy UI compatibility.
 */
export function compareToMedian(incomeSources, stateCode, householdSize, filingDate) {
  // If callers pass receipts (have pay_date), use receipt-window CMI.
  // If they pass legacy income sources (have grossAmount + frequency),
  // approximate CMI as before (this is the wrong-for-irregular-income shortcut).
  const looksLikeReceipts = Array.isArray(incomeSources) && incomeSources[0] && incomeSources[0].pay_date;
  let cmi;
  if (looksLikeReceipts) {
    cmi = calculateCMI(incomeSources, filingDate || new Date().toISOString().slice(0, 10)).cmi;
  } else {
    let totalAnnual = 0;
    for (const src of incomeSources || []) {
      totalAnnual += annualizeIncome(src.grossAmount || 0, src.frequency || 'monthly');
    }
    cmi = totalAnnual / 12;
  }
  const annualIncome = cmi * 12;
  const medianIncome = getMedianIncome(stateCode, householdSize);
  return {
    cmi,
    annualIncome,
    medianIncome,
    difference: medianIncome - annualIncome,
    belowMedian: annualIncome <= medianIncome,
  };
}

function synthesizeReceiptsFromIncomeSources(sources, filingDate) {
  const window = sixMonthWindow(filingDate);
  if (!window) return [];
  const winStart = new Date(window.start);
  const receipts = [];
  for (const src of sources) {
    const monthly = annualizeIncome(src.grossAmount || 0, src.frequency || 'monthly') / 12;
    for (let m = 0; m < 6; m++) {
      const d = new Date(winStart.getFullYear(), winStart.getMonth() + m, 15);
      receipts.push({
        id: `synthetic_${src.employer || 'src'}_${m}`,
        pay_date: d.toISOString().slice(0, 10),
        gross_amount: monthly,
        source_label: src.employer || 'Income source',
        synthetic: true,
      });
    }
  }
  return receipts;
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}

/**
 * Aggregate extracted data from a list of documents into income sources +
 * monthly expenses. Used by the LEGACY standalone Means Test wizard.
 *
 * Receipt-level data (the new shape) flows directly into income_receipts
 * via populateCaseFromExtraction in the main process.
 */
export function aggregateExtractedData(documents) {
  const incomeSources = [];
  const expenses = {
    rent: 0, utilities: 0, groceries: 0, gas: 0, insurance: 0,
    carPayment: 0, subscriptions: 0, other: 0,
  };
  let dependents = null;

  for (const doc of documents || []) {
    const d = doc.extracted || {};
    if (d.type === 'paystub' && Array.isArray(d.stubs) && d.stubs.length > 0) {
      // New per-receipt shape
      const totalGross = d.stubs.reduce((s, x) => s + (Number(x.gross_pay) || 0), 0);
      const stubs = d.stubs.length;
      // Avg per stub × frequency-implied multiplier; without explicit
      // frequency we estimate by spacing between pay dates.
      const sortedStubs = d.stubs
        .filter(s => s.pay_date)
        .sort((a, b) => a.pay_date.localeCompare(b.pay_date));
      let monthlyEstimate = 0;
      if (sortedStubs.length >= 2) {
        const first = new Date(sortedStubs[0].pay_date);
        const last  = new Date(sortedStubs[sortedStubs.length - 1].pay_date);
        const months = Math.max(1, ((last - first) / (1000 * 60 * 60 * 24 * 30.437)));
        monthlyEstimate = totalGross / months;
      } else {
        monthlyEstimate = totalGross / Math.max(stubs, 1);
      }
      incomeSources.push({
        employer: d.stubs[0].employer || 'Employment',
        grossAmount: monthlyEstimate,
        frequency: 'monthly',
      });
    } else if (d.type === 'paystub') {
      // Legacy shape
      const freq = (d.payFrequency || 'biweekly').toLowerCase();
      incomeSources.push({
        employer: d.employer || 'Employment',
        grossAmount: Number(d.grossPay) || 0,
        frequency: freq,
      });
    } else if (d.type === 'bank_statement') {
      const m = d.monthlyExpenses || {};
      for (const k of Object.keys(expenses)) expenses[k] += Number(m[k] || 0);
    } else if (d.type === 'tax_return') {
      if (d.dependents != null) dependents = d.dependents;
    }
  }

  return { incomeSources, expenses, dependents };
}
