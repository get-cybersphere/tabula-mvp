// End-to-end smoke test for the petition engine without Electron and
// without better-sqlite3 (which is compiled for Electron's Node).
//
// We hand-build the same case-data shape that data-collector produces and
// drive the mappers + packet-builder directly. This still validates:
// - Each mapper's field-set logic (real PDFs, real AcroForm fields)
// - Output file naming + manifest shape
// - The headerOnly path for unmapped forms
//
//   node scripts/smoke-petition.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PDFDocument } = require('pdf-lib');

const { listForms } = require('../src/main/petition/registry');
const { fillHeader } = require('../src/main/petition/forms/_common');

const TEMPLATE_DIR = path.join(__dirname, '..', 'src', 'main', 'petition', 'forms', 'templates');

// Synthetic case data in the post-collector shape.
const _baseCreditors = null; // overwritten below

const data = {
  case: {
    id: 'test-case',
    caseNumber: '',
    chapter: 7,
    district: 'Eastern District of New York',
    districtRaw: 'EDNY',
    districtMatched: true,
    status: 'intake',
    practiceType: 'bankruptcy',
    filedAt: null,
  },
  debtor1: {
    id: 'd1', is_joint: false,
    first: 'Maria', middle: 'Elena', last: 'Vasquez', suffix: '', fullName: 'Maria Elena Vasquez',
    ssn: '123-45-6789', ssnLast4: '6789', dob: '1986-04-22',
    address: { line1: '413 Linden Blvd', line2: 'Apt 2C', street: '413 Linden Blvd Apt 2C', city: 'Brooklyn', state: 'NY', zip: '11203', county: 'Kings' },
    phone: '(718) 555-0142', email: 'maria.vasquez@example.com',
  },
  debtor2: null,
  isJoint: false,
  income1: [{ id: 'i1', source: 'Administrative assistant', employer_name: 'Mercy Hospital', gross_monthly: 4218.00, net_monthly: 3214.50, pay_frequency: 'biweekly' }],
  income2: [],
  expenses: [
    { id: 'e1', category: 'Rent', monthly_amount: 1450.00 },
    { id: 'e2', category: 'Utilities', monthly_amount: 187.00 },
    { id: 'e3', category: 'Phone', monthly_amount: 95.00 },
    { id: 'e4', category: 'Internet/Cable', monthly_amount: 79.00 },
    { id: 'e5', category: 'Food/Groceries', monthly_amount: 412.00 },
    { id: 'e6', category: 'Childcare', monthly_amount: 360.00 },
    { id: 'e7', category: 'Transportation', monthly_amount: 156.00 },
    { id: 'e8', category: 'Medical', monthly_amount: 88.00 },
    { id: 'e9', category: 'Auto insurance', monthly_amount: 215.00 },
    { id: 'e10', category: 'Vehicle loan', monthly_amount: 287.00 },
    { id: 'e11', category: 'Charitable', monthly_amount: 50.00 },
    { id: 'e12', category: 'Other', monthly_amount: 65.00 },
  ],
  expensesByCategory: {},
  assets: [
    { id: 'a1', schedule: 'A', category: 'real_estate', description: 'Primary residence — 413 Linden Blvd Apt 2C, Brooklyn, NY 11203', current_value: 285000 },
    { id: 'a2', schedule: 'B', category: 'vehicle',     description: '2019 Honda Civic VIN ...8829, ~78k mi', current_value: 13500 },
    { id: 'a3', schedule: 'B', category: 'cash',        description: 'Cash on hand', current_value: 145 },
    { id: 'a4', schedule: 'B', category: 'bank_account', description: 'Chase Checking ...4821', current_value: 247 },
    { id: 'a5', schedule: 'B', category: 'bank_account', description: 'Chase Savings ...4822', current_value: 1820 },
    { id: 'a6', schedule: 'B', category: 'household',   description: 'Furniture, kitchenware, bedroom set', current_value: 2400 },
    { id: 'a7', schedule: 'B', category: 'electronics', description: 'TV, laptop, smartphone', current_value: 1800 },
    { id: 'a8', schedule: 'B', category: 'jewelry',     description: 'Wedding ring, watch', current_value: 950 },
    { id: 'a9', schedule: 'B', category: 'clothing',    description: 'Personal clothing', current_value: 600 },
    { id: 'a10', schedule: 'B', category: 'retirement', description: 'Mercy Hospital 401k', current_value: 18400 },
  ],
  creditors: [
    { id: 'c1', name: 'Wells Fargo Home Mortgage', address: 'PO Box 14411, Des Moines, IA 50306', accountLast4: '8829', schedule: 'D', type: 'mortgage', claim: 245000, collateral: 'Primary residence', isContingent: false, isDisputed: false },
    { id: 'c2', name: 'Capital One',               address: 'PO Box 30285, Salt Lake City, UT 84130', accountLast4: '3847', schedule: 'F', type: 'credit_card', claim: 4230, collateral: '', isContingent: false, isDisputed: false },
    { id: 'c3', name: 'Discover Financial',        address: 'PO Box 30421, Salt Lake City, UT 84130', accountLast4: '9912', schedule: 'F', type: 'credit_card', claim: 7845, collateral: '', isContingent: false, isDisputed: false },
    { id: 'c4', name: 'Wells Fargo Auto',          address: 'PO Box 25341, Santa Fe, NM',             accountLast4: '7743', schedule: 'D', type: 'auto_loan', claim: 12400, collateral: '2019 Honda Civic', isContingent: false, isDisputed: false },
    { id: 'c5', name: 'Navient',                   address: 'PO Box 9555, Wilkes-Barre, PA',          accountLast4: '3390', schedule: 'F', type: 'student_loan', claim: 24500, collateral: '', isContingent: false, isDisputed: false },
    { id: 'c6', name: 'NY State Tax Department',   address: 'WA Harriman Campus, Albany, NY',         accountLast4: '',     schedule: 'E', type: 'tax', claim: 1200, collateral: '', isContingent: false, isDisputed: false },
  ],
  creditorBuckets: {
    secured:   [],  // populated below from creditors
    priority:  [],
    unsecured: [],
  },
  documents: [
    { id: 'doc1', doc_type: 'lease', extracted_data: JSON.stringify({
      type: 'lease', leaseCategory: 'residential',
      lessor: 'Brooklyn Heights Realty LLC',
      lessee: 'Maria Vasquez',
      leasedItem: 'Apt 2C',
      leasedItemAddress: '413 Linden Blvd Apt 2C, Brooklyn, NY 11203',
      monthlyRent: 1450,
      isInDefault: false,
    })},
  ],
  computed: {
    grossMonthly1: 4218.00,
    grossMonthly2: 0,
    netMonthly1: 3214.50,
    netMonthly2: 0,
    householdGross: 4218.00,
    householdNet: 3214.50,
    totalExpenses: 3444.00,
    monthlyNet: -229.50,
    totalSecuredClaims: 12400.00,
    totalPriorityClaims: 0,
    totalUnsecuredClaims: 39995.00,
    totalRealProperty: 0,
    totalPersonalProperty: 16147.00,
    totalAssets: 16147.00,
    totalDebt: 52395.00,
  },
};

// Bucket creditors by schedule (data-collector does this in production).
data.creditorBuckets.secured   = data.creditors.filter(c => c.schedule === 'D');
data.creditorBuckets.priority  = data.creditors.filter(c => c.schedule === 'E');
data.creditorBuckets.unsecured = data.creditors.filter(c => c.schedule === 'F');

function loadMapper(name) {
  if (!name) return null;
  return require(`../src/main/petition/forms/${name}.js`);
}

(async () => {
  console.log(`▶ Synthetic case: ${data.debtor1.fullName} (Ch. ${data.case.chapter}, ${data.case.district})\n`);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabula-petition-smoke-'));
  console.log(`Output: ${outDir}\n`);

  let totalMapped = 0;
  let totalFields = 0;
  const allGaps = [];

  for (const meta of listForms({ chapter: 7 })) {
    const tplPath = path.join(TEMPLATE_DIR, `${meta.code}.pdf`);
    const bytes = fs.readFileSync(tplPath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();

    let result;
    const mapperMod = loadMapper(meta.mapper);
    if (mapperMod && typeof mapperMod.map === 'function') {
      result = mapperMod.map(form, data);
    } else {
      const stats = fillHeader(form, data);
      result = {
        formCode: meta.code,
        label: meta.label,
        mapped: stats.hits,
        total: form.getFields().length,
        gaps: [{ field: '(form-specific mapping)', reason: 'header-only' }],
      };
    }

    form.updateFieldAppearances();
    const out = await doc.save({ updateFieldAppearances: false });
    const outFile = `${String(meta.order).padStart(2, '0')}-${meta.code}.pdf`;
    fs.writeFileSync(path.join(outDir, outFile), Buffer.from(out));

    const pct = result.total > 0 ? Math.round((result.mapped / result.total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    const tag = !mapperMod ? ' [hdr-only]' : '';
    console.log(`  ${meta.code.padEnd(10)} ${bar} ${String(pct).padStart(3)}%  ${String(result.mapped).padStart(3)}/${String(result.total).padEnd(3)}${tag}  ${meta.label}`);

    totalMapped += result.mapped;
    totalFields += result.total;
    for (const g of (result.gaps || [])) allGaps.push({ form: meta.code, ...g });
  }

  console.log(`\n▶ Total: ${totalMapped} / ${totalFields} fields mapped (${Math.round(100 * totalMapped / totalFields)}%)`);
  console.log(`▶ ${allGaps.length} gaps surfaced as review flags`);

  console.log('\nFirst 10 gaps:');
  for (const g of allGaps.slice(0, 10)) {
    console.log(`  [${g.form}] ${g.field}`);
    console.log(`    → ${g.reason}`);
  }

  console.log(`\nFiles written to: ${outDir}`);
})();
