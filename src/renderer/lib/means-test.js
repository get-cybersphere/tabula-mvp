// Chapter 7 Means Test Calculator
// Implements the simplified means test per 11 U.S.C. § 707(b)(2)
//
// All functions are pure — no API or side-effect dependencies.

import { getMedianIncome } from './median-income.js';
import { getAllowedDeductions } from './irs-standards.js';

// Thresholds for the disposable income test (60-month period)
const LOWER_THRESHOLD = 9075;   // If DMI * 60 < this → Chapter 7 eligible
const UPPER_THRESHOLD = 15150;  // If DMI * 60 > this → Chapter 13 presumed

/**
 * Annualize income based on pay frequency.
 */
export function annualizeIncome(amount, frequency) {
  switch (frequency) {
    case 'weekly':     return amount * 52;
    case 'biweekly':   return amount * 26;
    case 'semimonthly': return amount * 24;
    case 'monthly':    return amount * 12;
    case 'annual':     return amount;
    default:           return amount * 12;
  }
}

/**
 * Calculate current monthly income (CMI) from all income sources.
 * CMI is the average monthly income over the 6-month period before filing.
 * For simplicity, we annualize the most recent pay data and divide by 12.
 */
export function calculateCMI(incomeSources) {
  let totalAnnual = 0;
  for (const src of incomeSources) {
    totalAnnual += annualizeIncome(src.grossAmount || 0, src.frequency || 'monthly');
  }
  return totalAnnual / 12;
}

/**
 * Step 1: Compare annualized income to state median.
 * Returns { belowMedian, annualIncome, medianIncome, difference }
 */
export function compareToMedian(incomeSources, stateCode, householdSize) {
  const cmi = calculateCMI(incomeSources);
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

/**
 * Step 2 & 3: Full means test calculation.
 * If below median → Chapter 7 eligible (no abuse presumption).
 * If above median → calculate disposable income and determine eligibility.
 */
export function runMeansTest({
  incomeSources = [],
  stateCode = 'TX',
  householdSize = 1,
  vehicleCount = 1,
  over65Count = 0,
  monthlySecuredDebt = 0,
  monthlyPriorityDebt = 0,
  extractedExpenses = {},
}) {
  const medianComparison = compareToMedian(incomeSources, stateCode, householdSize);

  const result = {
    ...medianComparison,
    step: 1,
    recommendation: null,
    confidence: null,
    explanation: [],
    warnings: [],
    deductions: null,
    disposableMonthlyIncome: null,
    disposable60Month: null,
  };

  // Step 1: Below median → Chapter 7 eligible
  if (medianComparison.belowMedian) {
    result.recommendation = 'chapter7';
    result.confidence = 'high';
    result.explanation = [
      `Annual income of ${fmt(medianComparison.annualIncome)} is below the ${stateCode} median of ${fmt(medianComparison.medianIncome)} for a household of ${householdSize}.`,
      'No presumption of abuse. Chapter 7 is available.',
    ];

    // Warn if close to median (within 10%)
    const margin = medianComparison.medianIncome * 0.1;
    if (medianComparison.difference < margin) {
      result.warnings.push(
        `Income is within 10% of the median threshold. A small income increase could change eligibility.`
      );
    }

    return result;
  }

  // Steps 2-3: Above median — calculate disposable income
  result.step = 2;

  const deductions = getAllowedDeductions({
    householdSize,
    stateCode,
    vehicleCount,
    over65Count,
    actualSecuredDebt: monthlySecuredDebt,
    priorityDebt: monthlyPriorityDebt,
  });

  result.deductions = deductions;

  const dmi = medianComparison.cmi - deductions.total;
  result.disposableMonthlyIncome = dmi;
  result.disposable60Month = dmi * 60;

  if (dmi * 60 < LOWER_THRESHOLD) {
    result.recommendation = 'chapter7';
    result.confidence = 'high';
    result.explanation = [
      `Annual income of ${fmt(medianComparison.annualIncome)} exceeds the ${stateCode} median of ${fmt(medianComparison.medianIncome)}.`,
      `However, after allowed deductions of ${fmt(deductions.total)}/month, disposable monthly income is ${fmt(dmi)}.`,
      `Over 60 months: ${fmt(dmi * 60)}, which is below the ${fmt(LOWER_THRESHOLD)} threshold.`,
      'No presumption of abuse. Chapter 7 is available.',
    ];
  } else if (dmi * 60 > UPPER_THRESHOLD) {
    result.recommendation = 'chapter13';
    result.confidence = 'high';
    result.explanation = [
      `Annual income of ${fmt(medianComparison.annualIncome)} exceeds the ${stateCode} median of ${fmt(medianComparison.medianIncome)}.`,
      `After allowed deductions of ${fmt(deductions.total)}/month, disposable monthly income is ${fmt(dmi)}.`,
      `Over 60 months: ${fmt(dmi * 60)}, which exceeds the ${fmt(UPPER_THRESHOLD)} threshold.`,
      'Presumption of abuse arises. Chapter 13 is the likely path.',
    ];
  } else {
    result.recommendation = 'needs_analysis';
    result.confidence = 'medium';
    result.explanation = [
      `Annual income of ${fmt(medianComparison.annualIncome)} exceeds the ${stateCode} median of ${fmt(medianComparison.medianIncome)}.`,
      `After allowed deductions of ${fmt(deductions.total)}/month, disposable monthly income is ${fmt(dmi)}.`,
      `Over 60 months: ${fmt(dmi * 60)}, which falls between ${fmt(LOWER_THRESHOLD)} and ${fmt(UPPER_THRESHOLD)}.`,
      'Additional analysis is needed — the presumption of abuse may or may not apply depending on specific circumstances.',
    ];
  }

  // Warnings
  if (Math.abs(dmi * 60 - LOWER_THRESHOLD) < 1500) {
    result.warnings.push('Disposable income is very close to the lower threshold. Small changes in deductions could affect the result.');
  }
  if (Math.abs(dmi * 60 - UPPER_THRESHOLD) < 1500) {
    result.warnings.push('Disposable income is very close to the upper threshold. Small changes in deductions could affect the result.');
  }
  if (monthlySecuredDebt === 0 && Object.keys(extractedExpenses).length > 0) {
    const possibleSecured = (extractedExpenses.rent || 0) + (extractedExpenses.carPayment || 0);
    if (possibleSecured > 0) {
      result.warnings.push(`Detected possible secured debt payments of ${fmt(possibleSecured)}/month from extracted data. Verify secured debt amounts.`);
    }
  }

  return result;
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/**
 * Aggregate extracted data from multiple documents into a unified financial picture.
 */
export function aggregateExtractedData(documents) {
  const result = {
    incomeSources: [],
    expenses: {},
    totalMonthlyIncome: 0,
    totalMonthlyExpenses: 0,
    filingStatus: null,
    dependents: null,
    annualGrossIncome: null,
  };

  for (const doc of documents) {
    if (!doc.extractedData) continue;
    const data = doc.extractedData;

    switch (data.type) {
      case 'paystub': {
        const existing = result.incomeSources.find(s => s.employer === data.employer);
        if (!existing) {
          result.incomeSources.push({
            employer: data.employer || 'Unknown Employer',
            grossAmount: data.grossPay || 0,
            netAmount: data.netPay || 0,
            frequency: data.payFrequency || 'biweekly',
            deductions: {
              federalTax: data.federalTax || 0,
              stateTax: data.stateTax || 0,
              socialSecurity: data.socialSecurity || 0,
              medicare: data.medicare || 0,
              healthInsurance: data.healthInsurance || 0,
              retirement: data.retirement401k || 0,
            },
          });
        }
        break;
      }
      case 'tax_return': {
        result.filingStatus = data.filingStatus;
        result.dependents = data.dependents;
        result.annualGrossIncome = data.totalIncome || data.wagesIncome;
        if (!result.incomeSources.length && data.wagesIncome) {
          result.incomeSources.push({
            employer: 'Per Tax Return',
            grossAmount: data.wagesIncome / 12,
            netAmount: (data.wagesIncome - (data.totalTax || 0)) / 12,
            frequency: 'monthly',
            deductions: {},
          });
        }
        break;
      }
      case 'bank_statement': {
        if (data.monthlyExpenses) {
          for (const [category, amount] of Object.entries(data.monthlyExpenses)) {
            result.expenses[category] = (result.expenses[category] || 0) + amount;
          }
        }
        break;
      }
    }
  }

  // Calculate totals
  for (const src of result.incomeSources) {
    const annual = annualizeIncome(src.grossAmount, src.frequency);
    result.totalMonthlyIncome += annual / 12;
  }
  result.totalMonthlyExpenses = Object.values(result.expenses).reduce((a, b) => a + b, 0);

  return result;
}
