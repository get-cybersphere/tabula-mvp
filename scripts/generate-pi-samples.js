#!/usr/bin/env node
//
// Generate sample PI documents for demo and testing.
// Writes PNGs to scripts/samples/pi/
//
// Usage:
//   node scripts/generate-pi-samples.js

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('canvas');

const OUT_DIR = path.join(__dirname, 'samples', 'pi');

const policeReportText = `AUSTIN POLICE DEPARTMENT
TRAFFIC CRASH REPORT

Report Number: APD-2026-04821
Date of Report: 03/15/2026

CRASH INFORMATION
Date of Crash: 03/15/2026
Time of Crash: 2:47 PM
Location: Congress Ave & E 6th St, Austin, TX 78701
Type: Rear-End Collision

WEATHER/ROAD CONDITIONS
Weather: Clear
Road Surface: Dry
Lighting: Daylight

UNIT 1 (AT-FAULT)
Driver: John Michael Smith
Date of Birth: 08/22/1991
Address: 1847 Riverside Dr, Austin TX 78741
Phone: (512) 555-7788
Driver License: TX DL 38472910
Vehicle: 2022 Ford F-150 (Silver)
License Plate: TX LBR-4821
Insurance: State Farm Policy #SF-9182374
Adjuster: Tom Wilson (512) 555-8900

UNIT 2
Driver: Maria Elena Garcia
Date of Birth: 06/03/1988
Address: 456 Oak Lane, Austin TX 78702
Phone: (512) 555-1234
Driver License: TX DL 29384710
Vehicle: 2020 Toyota Camry (White)
License Plate: TX MKP-2901
Insurance: Progressive Policy #PRG-445821

CRASH NARRATIVE
Unit 1 was traveling northbound on Congress Ave at approximately
35 mph. Unit 2 was stopped at a red traffic signal at the
intersection of Congress Ave and E 6th St. Unit 1 failed to
stop and struck Unit 2 from the rear. Both airbags deployed in
Unit 2. Unit 2 driver complained of neck and back pain.

INJURIES
Unit 1 Driver: No apparent injury
Unit 2 Driver: Possible neck/back injury, cervical strain
  - Transported by EMS (Austin-Travis County EMS Unit 37)
  - Destination: St. David's Medical Center

CITATIONS
Unit 1: Citation #AC-2026-88471
  - Following too closely (TX Trans. Code 545.062)
  - Failure to control speed (TX Trans. Code 545.351)

WITNESSES
1. Robert Chen, (512) 555-3344 - Pedestrian at intersection
2. Diana Reyes, (512) 555-9921 - Driver in adjacent lane

Investigating Officer: Sgt. M. Patterson, Badge #4192
Approved by: Lt. J. Hernandez, Traffic Division`;

const medicalBillText = `ST. DAVID'S MEDICAL CENTER
919 E 32nd St, Austin, TX 78705
Phone: (512) 544-1000

PATIENT STATEMENT

Patient: Maria Elena Garcia
Date of Birth: 06/03/1988
Address: 456 Oak Lane, Austin TX 78702
Account Number: SDM-20260315-4821

Date of Service: 03/15/2026
Admitting Physician: Dr. Sarah Kim, MD

DIAGNOSIS
1. Cervical strain (S13.4XXA)
2. Lumbar sprain (S33.5XXA)
3. Concussion, mild TBI (S06.0X0A)
4. Contusion, chest wall (S20.211A)

PROCEDURES PERFORMED
1. CT Head without contrast (CPT 70450)           $2,100.00
2. CT Cervical Spine (CPT 72125)                  $1,850.00
3. X-Ray Lumbar Spine (CPT 72100)                 $425.00
4. Emergency Department Visit, Level 4 (99284)    $2,800.00
5. Cervical Collar Application                    $175.00
6. IV Pain Management                             $650.00
7. EMS Ambulance Transport                        $1,250.00

CHARGES SUMMARY
Total Charges:                                    $9,250.00
Insurance Payment (Progressive):                  $6,800.00
Patient Co-Pay:                                   $250.00
Outstanding Balance:                              $2,200.00

LIEN STATUS
Medical lien filed: YES
Lien Amount: $2,200.00

Payment is due within 30 days. For billing questions,
contact Patient Financial Services at (512) 544-1100.

FOLLOW-UP ORDERS
- Orthopedic spine consult within 1 week
- Physical therapy evaluation within 2 weeks
- Return to ER if headache worsens, vision changes, or vomiting`;

const insuranceDecText = `PROGRESSIVE INSURANCE
PERSONAL AUTO POLICY DECLARATIONS

Policy Number: PRG-445821
Named Insured: Maria Elena Garcia
Address: 456 Oak Lane, Austin TX 78702

Policy Period: 01/01/2026 - 07/01/2026

COVERED VEHICLE
2020 Toyota Camry LE
VIN: 4T1B11HK5LU123456

COVERAGE SUMMARY

Bodily Injury Liability:
  Each Person:                    $50,000
  Each Accident:                  $100,000

Property Damage Liability:
  Each Accident:                  $50,000

Uninsured Motorist (UM):
  Each Person:                    $50,000
  Each Accident:                  $100,000

Underinsured Motorist (UIM):
  Each Person:                    $50,000
  Each Accident:                  $100,000

Medical Payments (MedPay):
  Each Person:                    $10,000

Personal Injury Protection (PIP):
  Each Person:                    $2,500

Collision Deductible:             $500
Comprehensive Deductible:        $250

CLAIM INFORMATION (added after incident)
Claim Number: PRG-CL-2026-88192
Date of Loss: 03/15/2026
Adjuster: Rebecca Torres
Adjuster Phone: (800) 555-4747
Adjuster Email: r.torres@progressive.com

AT-FAULT PARTY INSURANCE (per police report)
Carrier: State Farm
Policy Number: SF-9182374
Bodily Injury Limit: $100,000 / $300,000
Claim Number: SF-2026-331847
Adjuster: Tom Wilson
Adjuster Phone: (512) 555-8900`;

async function writePng(text, filename) {
  const width = 850;
  const fontSize = 12;
  const lineHeight = 16;
  const marginX = 50;
  const marginY = 50;
  const lines = text.split('\n');
  const height = marginY * 2 + lines.length * lineHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Courier`;
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, marginX, marginY + i * lineHeight);
  });

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`  ${filename.padEnd(40)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Generating sample PI documents...\n');
  await writePng(policeReportText, 'police_report_apd_2026_04821.png');
  await writePng(medicalBillText, 'medical_bill_st_davids.png');
  await writePng(insuranceDecText, 'insurance_declaration_progressive.png');

  console.log(`\nDone. Three PNGs written to ${OUT_DIR}/`);
  console.log('\nDemo flow:');
  console.log('  1. Create a new PI case for Maria Garcia');
  console.log('  2. Go to Documents tab');
  console.log('  3. Upload all 3 files from scripts/samples/pi/');
  console.log('  4. Click Extract on each one');
  console.log('  5. Check Accident & Insurance tab — populated from police report + insurance dec');
  console.log('  6. Check Medical Records tab — populated from medical bill');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
