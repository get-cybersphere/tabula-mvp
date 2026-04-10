// Generates minimal but valid test PDFs with realistic financial content.
// Uses raw PDF syntax — no dependencies required.

const fs = require('fs');
const path = require('path');

const outDir = __dirname;

function makePdf(lines, title) {
  // Each line is a string; we render them as a simple text page.
  const fontSize = 11;
  const leading = 15;
  const marginLeft = 50;
  const marginTop = 750;

  // Build the text stream
  let stream = `BT\n/F1 14 Tf\n${marginLeft} ${marginTop + 20} Td\n(${esc(title)}) Tj\n`;
  stream += `/F1 ${fontSize} Tf\n0 -30 Td\n`;
  for (const line of lines) {
    stream += `(${esc(line)}) Tj\n0 -${leading} Td\n`;
  }
  stream += 'ET';

  const streamBytes = Buffer.from(stream, 'latin1');

  const objects = [];
  let objNum = 0;

  const obj = (content) => {
    objNum++;
    objects.push({ num: objNum, content });
    return objNum;
  };

  const catalogNum = obj(''); // placeholder
  const pagesNum = obj('');
  const pageNum = obj('');
  const fontNum = obj('');
  const streamNum = obj('');

  objects[0].content = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objects[1].content = `<< /Type /Pages /Kids [${pageNum} 0 R] /Count 1 >>`;
  objects[2].content = `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Contents ${streamNum} 0 R /Resources << /Font << /F1 ${fontNum} 0 R >> >> >>`;
  objects[3].content = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4].content = `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`;

  // Assemble PDF
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${o.num} 0 obj\n${o.content}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

function esc(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ─── Paystub ─────────────────────────────────────────────────
const paystub = makePdf([
  '========================================',
  'ACME INDUSTRIES LLC',
  '1200 Commerce Blvd, Houston, TX 77002',
  '========================================',
  '',
  'Employee: Marcus T. Johnson          SSN: ***-**-4821',
  'Employee ID: 10482                   Department: Operations',
  '',
  'Pay Period: 03/01/2026 - 03/15/2026',
  'Pay Date: 03/20/2026',
  'Pay Frequency: Biweekly',
  '',
  '--- EARNINGS ---',
  'Regular Hours    80.00 hrs  x  $26.36/hr   =  $2,108.80',
  'Overtime          0.00 hrs  x  $39.54/hr   =      $0.00',
  '                                     Gross Pay:  $2,108.80',
  '',
  '--- DEDUCTIONS ---',
  'Federal Income Tax                           $253.06',
  'State Income Tax                               $0.00',
  'Social Security (OASDI)                      $130.75',
  'Medicare                                      $30.58',
  'Health Insurance (Blue Cross PPO)            $187.50',
  '401(k) Contribution (5%)                     $105.44',
  'Garnishment - Student Loan                     $0.00',
  '                               Total Deductions: $707.33',
  '',
  '                                    NET PAY: $1,401.47',
  '',
  '--- YEAR-TO-DATE ---',
  'YTD Gross:   $12,652.80',
  'YTD Federal Tax: $1,518.36',
  'YTD Net:      $8,408.82',
  '',
  '========================================',
], 'PAY STATEMENT');

// ─── Bank Statement ──────────────────────────────────────────
const bankStatement = makePdf([
  '========================================',
  'CHASE BANK - CHECKING ACCOUNT STATEMENT',
  '========================================',
  '',
  'Account Holder: Marcus T. Johnson',
  'Account Number: ****4821',
  'Statement Period: 03/01/2026 - 03/31/2026',
  '',
  'Opening Balance:              $1,847.22',
  'Closing Balance:                $923.45',
  '',
  'Total Deposits:              $4,218.00',
  'Total Withdrawals:           $5,141.77',
  '',
  '--- DEPOSITS ---',
  '03/06  Direct Deposit - ACME INDUSTRIES    $1,401.47',
  '03/15  Venmo Transfer                        $150.00',
  '03/20  Direct Deposit - ACME INDUSTRIES    $1,401.47',
  '03/25  Tax Refund - IRS                    $1,265.06',
  '',
  '--- RECURRING PAYMENTS ---',
  '03/01  Rent - Oakwood Apartments           $1,450.00',
  '03/03  Geico Auto Insurance                  $225.00',
  '03/05  AT&T Wireless                          $87.42',
  '03/05  Netflix                                $15.99',
  '03/05  Spotify                                $10.99',
  '03/07  TXU Energy                            $142.30',
  '03/07  City of Houston Water                  $44.85',
  '03/10  Wells Fargo Auto Loan - 2019 Civic    $347.00',
  '',
  '--- OTHER TRANSACTIONS ---',
  '03/08  HEB Grocery #1204                      $87.42',
  '03/12  Walmart Supercenter                    $64.20',
  '03/15  Shell Gas Station                      $48.50',
  '03/18  HEB Grocery #1204                      $92.15',
  '03/22  Kroger Fuel Center                     $52.30',
  '03/24  Target                                 $43.80',
  '03/26  HEB Grocery #1204                      $78.55',
  '03/28  Costco Gas                             $55.20',
  '03/30  Amazon.com                             $38.60',
  '',
  'Monthly Summary by Category:',
  '  Rent/Housing:     $1,450.00',
  '  Utilities:          $187.15',
  '  Groceries:          $322.32',
  '  Gas/Fuel:           $156.00',
  '  Insurance:          $225.00',
  '  Auto Loan:          $347.00',
  '  Subscriptions:       $26.98',
  '  Other:               $82.40',
  '',
  '========================================',
], 'ACCOUNT STATEMENT');

// ─── Tax Return ──────────────────────────────────────────────
const taxReturn = makePdf([
  '========================================',
  'FORM 1040 - U.S. INDIVIDUAL INCOME TAX RETURN',
  'Tax Year 2025',
  '========================================',
  '',
  'Name: Marcus T. Johnson',
  'SSN: ***-**-4821',
  'Filing Status: Single',
  '',
  'Address: 4521 Westheimer Rd, Apt 12B',
  '         Houston, TX 77027',
  '',
  '--- INCOME ---',
  'Line 1a  Wages, salaries, tips:            $50,616.00',
  'Line 2b  Taxable interest:                     $42.00',
  'Line 3b  Ordinary dividends:                    $0.00',
  'Line 7   Capital gain or loss:                  $0.00',
  'Line 8   Other income:                          $0.00',
  'Line 9   Total income:                     $50,658.00',
  '',
  '--- ADJUSTMENTS ---',
  'Line 10  Adjustments to income:                 $0.00',
  'Line 11  Adjusted gross income (AGI):      $50,658.00',
  '',
  '--- DEDUCTIONS ---',
  'Line 12  Standard deduction:               $15,700.00',
  'Line 13  Qualified business income ded:         $0.00',
  'Line 15  Taxable income:                   $34,958.00',
  '',
  '--- TAX AND CREDITS ---',
  'Line 16  Tax:                               $4,007.00',
  'Line 19  Child tax credit / other credits:      $0.00',
  'Line 22  Amount of tax after credits:       $4,007.00',
  'Line 24  Total tax:                         $4,007.00',
  '',
  '--- PAYMENTS ---',
  'Line 25a Federal tax withheld (W-2):        $5,272.36',
  'Line 33  Total payments:                    $5,272.36',
  '',
  'Line 34  Overpayment:                       $1,265.36',
  'Line 35a Amount refunded:                   $1,265.36',
  '',
  'Dependents:',
  '  1. Jaylen M. Johnson (son, age 8)  SSN: ***-**-9103',
  '',
  '========================================',
], 'U.S. INCOME TAX RETURN 2025');

// ─── Second Paystub (different employer, for joint/additional income test) ───
const paystub2 = makePdf([
  '========================================',
  'HOUSTON METHODIST HOSPITAL',
  '6565 Fannin St, Houston, TX 77030',
  '========================================',
  '',
  'Employee: Sarah L. Johnson            SSN: ***-**-7712',
  'Employee ID: H-20195                  Department: Nursing',
  '',
  'Pay Period: 03/01/2026 - 03/15/2026',
  'Pay Date: 03/20/2026',
  'Pay Frequency: Biweekly',
  '',
  '--- EARNINGS ---',
  'Regular Hours    80.00 hrs  x  $38.25/hr   =  $3,060.00',
  'Overtime          8.00 hrs  x  $57.38/hr   =    $459.00',
  '                                     Gross Pay:  $3,519.00',
  '',
  '--- DEDUCTIONS ---',
  'Federal Income Tax                           $492.66',
  'State Income Tax                               $0.00',
  'Social Security (OASDI)                      $218.18',
  'Medicare                                      $51.03',
  'Health Insurance (Aetna HMO)                 $245.00',
  '403(b) Contribution (6%)                     $211.14',
  '                               Total Deductions: $1,218.01',
  '',
  '                                    NET PAY: $2,300.99',
  '',
  '--- YEAR-TO-DATE ---',
  'YTD Gross:   $21,114.00',
  'YTD Federal Tax: $2,955.96',
  'YTD Net:     $13,805.94',
  '',
  '========================================',
], 'PAY STATEMENT');

// ─── Write files ─────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'paystub-acme-industries.pdf'), paystub);
fs.writeFileSync(path.join(outDir, 'bank-statement-chase-march-2026.pdf'), bankStatement);
fs.writeFileSync(path.join(outDir, 'tax-return-2025-1040.pdf'), taxReturn);
fs.writeFileSync(path.join(outDir, 'paystub-houston-methodist.pdf'), paystub2);

console.log('Generated 4 test PDFs:');
console.log('  paystub-acme-industries.pdf       — Biweekly, $2,108.80 gross');
console.log('  paystub-houston-methodist.pdf      — Biweekly, $3,519.00 gross (second earner)');
console.log('  bank-statement-chase-march-2026.pdf — Chase checking, March 2026');
console.log('  tax-return-2025-1040.pdf           — 1040, Single, $50,658 income, 1 dependent');
