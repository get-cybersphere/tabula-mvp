#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('canvas');

const OUT_DIR = path.join(__dirname, 'samples', 'pi');

const spineConsultText = `AUSTIN SPINE & PAIN CENTER
4315 James Casey St, Suite 200
Austin, TX 78745
Phone: (512) 555-6100
Fax: (512) 555-6101

PATIENT BILLING STATEMENT

Patient: Maria Elena Garcia
Date of Birth: 06/03/1988
Account Number: ASPC-2026-1847
Referring Physician: Dr. Sarah Kim, MD (St. David's ER)

VISIT 1 - Initial Consultation
Date of Service: 03/22/2026
Provider: Dr. James Patel, MD - Orthopedic Spine Specialist

Chief Complaint: Neck and back pain following MVA on 03/15/2026
History: Patient involved in rear-end collision. Seen at
St. David's ER on date of accident. CT showed no fracture.
Presenting with persistent cervical and lumbar pain, headaches,
and intermittent numbness in left arm.

DIAGNOSIS
1. Cervical disc herniation C5-C6 (M50.122)
2. Lumbar disc protrusion L4-L5 (M51.16)
3. Cervical radiculopathy, left (M54.12)
4. Post-concussion syndrome (F07.81)

IMAGING ORDERED
1. MRI Cervical Spine without contrast
2. MRI Lumbar Spine without contrast
3. EMG/Nerve Conduction Study - upper extremities

TREATMENT PLAN
- Physical therapy 3x/week for 12 weeks
- Cervical epidural steroid injection if PT fails
- Follow-up in 4 weeks with MRI results
- Work restrictions: No lifting > 10 lbs, limited sitting

CHARGES
Office Visit, New Patient Level 4 (99204)     $450.00
X-Ray Review & Consultation                   $175.00
Cervical Collar Fitting                        $85.00
Total Charges:                                 $710.00
Insurance Payment:                             $0.00
Patient Responsibility:                        $710.00

LIEN STATUS
Medical lien filed: YES
Lien Amount: $710.00
Lien filed with: Travis County, TX

VISIT 2 - MRI Review
Date of Service: 04/05/2026
Provider: Dr. James Patel, MD

MRI FINDINGS
Cervical: Broad-based disc herniation at C5-C6 with mild
  central canal stenosis and left foraminal narrowing.
  Moderate neural compression.
Lumbar: Disc protrusion at L4-L5 with annular tear.
  Mild bilateral foraminal narrowing.

REVISED TREATMENT PLAN
- Continue PT 3x/week
- Schedule cervical epidural steroid injection
- Surgical consultation if no improvement in 8 weeks
- Disability: Patient unable to return to work as receptionist

CHARGES
Office Visit, Established Level 3 (99213)     $225.00
MRI Review & Report (separate from imaging)    $150.00
Total Charges:                                 $375.00
Insurance Payment:                             $0.00
Patient Responsibility:                        $375.00

CUMULATIVE TOTAL
Total All Visits:                              $1,085.00
Total Paid:                                    $0.00
Total Outstanding:                             $1,085.00
Total Lien:                                    $1,085.00`;

const ptRecordText = `LONESTAR PHYSICAL THERAPY
2200 S Lamar Blvd, Suite 100
Austin, TX 78704
Phone: (512) 555-2200

TREATMENT SUMMARY & BILLING STATEMENT

Patient: Maria Elena Garcia
Date of Birth: 06/03/1988
Account Number: LSPT-2026-0892
Referring Physician: Dr. James Patel, MD (Austin Spine & Pain)
Authorization: Per medical lien agreement

INJURY: Motor Vehicle Accident - 03/15/2026
DIAGNOSIS:
- Cervical disc herniation C5-C6 (M50.122)
- Lumbar disc protrusion L4-L5 (M51.16)
- Cervical radiculopathy (M54.12)

TREATMENT PERIOD
First Visit: 03/28/2026
Last Visit: 04/11/2026
Total Visits Completed: 6 of 36 authorized
Frequency: 3x per week
Status: Ongoing treatment

TREATMENT PROVIDED
- Manual therapy / spinal mobilization
- Therapeutic exercises (cervical and lumbar stabilization)
- Electrical stimulation (cervical paraspinals)
- Hot/cold therapy
- Posture and ergonomic training
- Home exercise program instruction

PROGRESS NOTES
03/28: Initial eval. Cervical ROM reduced 40%. Lumbar flexion
  limited to 60 degrees. Pain 8/10. Grip strength L hand reduced.
04/04: Slight improvement cervical ROM. Pain 7/10. Patient
  reports difficulty sleeping due to neck pain. Headaches daily.
04/11: Cervical ROM improved 15%. Lumbar flexion 70 degrees.
  Pain 6/10. Left arm numbness persists. Recommended continued
  treatment and potential aquatic therapy addition.

FUNCTIONAL LIMITATIONS
- Cannot sit > 30 minutes (job requires 8hr desk work)
- Cannot lift > 10 lbs
- Difficulty with overhead reaching
- Sleep disruption (avg 4-5 hrs/night due to pain)
- Unable to drive > 20 minutes

CHARGES
Initial Evaluation (97163)                     $275.00
Therapeutic Exercise x5 (97110)                $625.00
Manual Therapy x5 (97140)                      $550.00
Electrical Stimulation x4 (97032)              $280.00
Hot/Cold Therapy x6 (97010)                    $180.00

Total Charges (6 visits):                      $1,910.00
Insurance Payment:                             $0.00
Outstanding Balance:                           $1,910.00

PROJECTED REMAINING TREATMENT
Remaining Visits: 30 (12 weeks x 3/week - 6 completed)
Estimated Cost per Visit: $310.00
Estimated Remaining Cost: $9,300.00
Estimated Total Treatment Cost: $11,210.00

LIEN STATUS
Medical lien filed: YES
Current Lien Amount: $1,910.00
Projected Total Lien: $11,210.00`;

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
  console.log(`  ${filename.padEnd(45)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Generating additional PI documents...\n');
  await writePng(spineConsultText, 'medical_bill_austin_spine.png');
  await writePng(ptRecordText, 'medical_bill_lonestar_pt.png');
  console.log(`\nDone. Added to ${OUT_DIR}/`);
  console.log('\nFull PI demo document set:');
  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  files.forEach(f => console.log(`  ${f}`));
}

main().catch(err => { console.error(err); process.exit(1); });
