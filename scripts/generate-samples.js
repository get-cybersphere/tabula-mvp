#!/usr/bin/env node
//
// Generate sample paystub / bank statement / tax return PDFs for demo
// and testing. Writes three PDFs to scripts/samples/.
//
// Usage:
//   node scripts/generate-samples.js
//
// These docs intentionally include obvious PII (SSN, DOB, account #,
// phone, email, address) so you can verify the redaction pipeline
// catches it via `scripts/verify-redaction.js`.

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('canvas');

const OUT_DIR = path.join(__dirname, 'samples');

// ─── Paystub ─────────────────────────────────────────────────
const paystubText = `ACME INDUSTRIES LLC
1234 Industrial Parkway
Austin, TX 78701
Phone: (512) 555-0100


EMPLOYEE PAYSTUB                          Pay Period: 03/01/2026 - 03/15/2026

Employee:       John Q. Doe
Employee ID:    EMP-40821
SSN:            123-45-6789
Date of Birth:  04/15/1985
Address:        742 Evergreen Terrace, Austin, TX 78702
Phone:          (512) 555-1234
Email:          jdoe@example.com

Pay Frequency:  Biweekly


EARNINGS                                  CURRENT         YTD
Regular Pay                               2,109.00        12,654.00
Overtime                                  0.00            487.50


DEDUCTIONS
Federal Income Tax                        253.08          1,518.48
Social Security                           130.76          784.56
Medicare                                  30.58           183.48
Health Insurance                          187.50          1,125.00
401(k) Contribution                       105.45          632.70


NET PAY:                                  $1,401.63
YTD NET PAY:                              $8,409.78


Direct Deposit
Chase Checking ****4821
Account Number: 123456789012
Routing:        021000021`;

// ─── Bank statement ──────────────────────────────────────────
const bankStatementText = `CHASE BANK
Statement for: John Q. Doe
Account:       Chase Checking ****4821
Full Account Number: 123456789012
Statement Period: 03/01/2026 - 03/31/2026


SUMMARY
Opening Balance:                          $1,847.22
Total Deposits:                           $4,218.00
Total Withdrawals:                        $5,141.77
Closing Balance:                          $923.45


MONTHLY RECURRING EXPENSES

Rent - Oak Ridge Apartments               $1,450.00
Electric - Austin Energy                  $127.00
Water - City of Austin                    $60.00
Internet - Spectrum                       $75.00
Gas - H-E-B Fuel                          $156.00
Groceries - H-E-B / Whole Foods           $412.00
Auto Insurance - Progressive              $145.00
Health Insurance - Aetna                  $80.00
Netflix                                   $15.49
Spotify                                   $11.99
Gym - Planet Fitness                      $22.00
Car Payment - Wells Fargo Auto            $385.00


Account holder contact:
Phone: (512) 555-1234
Email: jdoe@example.com`;

// ─── Tax return ──────────────────────────────────────────────
const taxReturnText = `FORM 1040 - U.S. Individual Income Tax Return
Tax Year: 2025


Taxpayer Information
Name:           John Q. Doe
SSN:            123-45-6789
Date of Birth:  04/15/1985
Address:        742 Evergreen Terrace, Austin, TX 78702
Phone:          (512) 555-1234
Filing Status:  Single
Dependents:     1


INCOME
Wages (Line 1a)                           $50,616.00
Interest Income (Line 2b)                 $42.00
Total Income                              $50,658.00
Adjusted Gross Income (AGI)               $50,658.00


DEDUCTIONS
Standard Deduction                        $15,700.00
Taxable Income                            $34,958.00


TAX
Total Tax                                 $4,007.00
Federal Tax Withheld                      $3,518.48
Refund (Line 34)                          $-488.52`;

/**
 * Render plain text as a PNG that looks like a scanned document.
 * PNG avoids the pdf-lib / pdfjs-dist Courier font issue we hit when
 * generating fake PDFs on Node, and the redaction pipeline handles
 * images natively (no PDF rasterization step).
 */
async function writePng(text, filename) {
  const width = 850;
  const fontSize = 13;
  const lineHeight = 18;
  const marginX = 60;
  const marginY = 60;
  const lines = text.split('\n');
  const height = marginY * 2 + lines.length * lineHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Black monospace text — easy for Tesseract to OCR
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Courier`;
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, marginX, marginY + i * lineHeight);
  });

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`  ${filename.padEnd(30)} (${(buffer.length / 1024).toFixed(1)} KB) → ${outPath}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Generating sample documents...\n');
  await writePng(paystubText, 'sample_paystub.png');
  await writePng(bankStatementText, 'sample_bank_statement.png');
  await writePng(taxReturnText, 'sample_tax_return.png');

  console.log(`\nDone. Three PNGs written to ${OUT_DIR}/`);
  console.log('\nNext steps:');
  console.log('  1. Test redaction WITHOUT calling Claude:');
  console.log('     node scripts/verify-redaction.js scripts/samples/sample_paystub.png "John Doe" "742 Evergreen Terrace"');
  console.log('  2. Run the full pipeline in the Electron app:');
  console.log('     Upload any of these images from a case and click Extract.');
}

main().catch(err => {
  console.error('Error generating samples:', err);
  process.exit(1);
});
