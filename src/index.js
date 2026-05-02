const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    backgroundColor: '#f6f4f0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
};

// ─── Database Setup ───────────────────────────────────────────
const Database = require('better-sqlite3');
const dbPath = path.join(app.getPath('userData'), 'tabula.db');
let db;

function initDatabase() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      case_number TEXT,
      status TEXT NOT NULL DEFAULT 'intake',
      chapter INTEGER NOT NULL DEFAULT 7,
      district TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debtors (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      is_joint INTEGER NOT NULL DEFAULT 0,
      first_name TEXT,
      last_name TEXT,
      ssn TEXT,
      dob TEXT,
      address_street TEXT,
      address_city TEXT,
      address_state TEXT,
      address_zip TEXT,
      phone TEXT,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS income (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      debtor_id TEXT REFERENCES debtors(id),
      source TEXT,
      employer_name TEXT,
      gross_monthly REAL,
      net_monthly REAL,
      pay_frequency TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT,
      monthly_amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      schedule TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      current_value REAL,
      exemption_statute TEXT,
      exemption_amount REAL
    );

    CREATE TABLE IF NOT EXISTS creditors (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      account_number TEXT,
      debt_type TEXT NOT NULL,
      schedule TEXT NOT NULL,
      amount_claimed REAL,
      collateral_description TEXT,
      is_disputed INTEGER DEFAULT 0,
      is_contingent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      doc_type TEXT,
      extracted_data TEXT,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_flags (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      field_path TEXT,
      note TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Every meaningful state change on a case becomes a timeline event.
    -- Drives the "what happened when" per-case view and the firm-wide
    -- recent activity feed. metadata is a JSON blob, type-specific.
    CREATE TABLE IF NOT EXISTS case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_case_events_case_time
      ON case_events(case_id, occurred_at DESC);
  `);

  // Lightweight migration for the filing date. Must be out-of-exec because
  // SQLite doesn't support IF NOT EXISTS on ADD COLUMN.
  const caseCols = db.prepare("PRAGMA table_info(cases)").all().map(c => c.name);
  if (!caseCols.includes('filed_at')) {
    db.prepare("ALTER TABLE cases ADD COLUMN filed_at TEXT").run();
  }

  // Multi-practice upgrade: add practice_type to cases
  if (!caseCols.includes('practice_type')) {
    db.prepare("ALTER TABLE cases ADD COLUMN practice_type TEXT NOT NULL DEFAULT 'bankruptcy'").run();
  }

  // Case notes table — persistent notes/memos per case
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_notes (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT DEFAULT 'attorney',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // AI conversations table — stores AI assistant chat history per case
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conv_case ON ai_conversations(case_id, created_at);
  `);

  // Practice analytics table — revenue + time tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_analytics (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      fee_amount REAL DEFAULT 0,
      fee_type TEXT DEFAULT 'flat',
      hours_logged REAL DEFAULT 0,
      filed_date TEXT,
      closed_date TEXT,
      outcome TEXT
    );
  `);

  // Case templates table — reusable case templates
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_templates (
      id TEXT PRIMARY KEY,
      practice_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      template_data TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // PI case details (accident info, insurance, liability)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pi_case_details (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
      accident_date TEXT,
      accident_type TEXT,
      accident_location TEXT,
      accident_description TEXT,
      police_report_number TEXT,
      weather_conditions TEXT,
      liability_assessment TEXT,
      comparative_fault_pct REAL DEFAULT 0,
      insurance_company TEXT,
      insurance_policy_number TEXT,
      insurance_adjuster TEXT,
      insurance_adjuster_phone TEXT,
      insurance_claim_number TEXT,
      insurance_coverage_limit REAL,
      at_fault_party TEXT,
      at_fault_insurance TEXT,
      at_fault_policy_limit REAL,
      um_uim_available INTEGER DEFAULT 0,
      um_uim_limit REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Medical records / treatment tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS pi_medical_records (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      provider_name TEXT NOT NULL,
      provider_type TEXT,
      treatment_type TEXT,
      first_visit TEXT,
      last_visit TEXT,
      total_visits INTEGER DEFAULT 0,
      total_billed REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      lien_amount REAL DEFAULT 0,
      has_lien INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ongoing',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Settlement negotiations log
  db.exec(`
    CREATE TABLE IF NOT EXISTS pi_settlements (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      from_party TEXT,
      amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Statute of limitations tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS pi_statutes (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      statute_type TEXT NOT NULL,
      jurisdiction TEXT,
      deadline TEXT NOT NULL,
      filed_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Petition / filing-packet generation tables. Owned by the petition
  // module so its schema lives next to the code that uses it.
  require('./main/petition').installSchema(db);

  // Bank statement intelligence findings. Same pattern.
  require('./main/bank-intel').installSchema(db);

  seedDemoData();
}

// ─── Timeline event helper ───────────────────────────────────
// Centralized event writer so every mutation uses the same shape and we
// can audit/change the event stream in one place.
function logCaseEvent(caseId, eventType, description, metadata = null, occurredAt = null) {
  if (!db || !caseId) return;
  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO case_events (id, case_id, event_type, description, metadata, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), caseId, eventType, description,
      metadata ? JSON.stringify(metadata) : null,
      occurredAt || now, now
    );
  } catch (err) {
    console.error('[timeline] failed to log event:', eventType, err.message);
  }
}

function seedDemoData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM cases').get();
  if (count.c > 0) return;

  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString();
  const today = new Date();
  const daysAgo = (n) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  // Demo cases with varied filing states so deadlines/timeline have data to show.
  // "James Thompson" is fleshed out as the demo narrative — filed 10 days ago,
  // 341 meeting scheduled, full financial picture — so the demo attorney can
  // click in and see the entire readiness + deadline + timeline story.
  const cases = [
    { id: uuid(), status: 'intake', chapter: 7, district: 'E.D. Texas', name: ['Marcus', 'Johnson'], created: daysAgo(12) },
    { id: uuid(), status: 'in_progress', chapter: 7, district: 'S.D. Florida', name: ['Sarah', 'Chen'], created: daysAgo(16) },
    { id: uuid(), status: 'in_progress', chapter: 13, district: 'N.D. Ohio', name: ['Robert', 'Williams'], created: daysAgo(19), filed_at: daysAgo(5) },
    { id: uuid(), status: 'ready', chapter: 7, district: 'W.D. Washington', name: ['Maria', 'Garcia'], created: daysAgo(24) },
    { id: uuid(), status: 'filed', chapter: 7, district: 'C.D. California', name: ['James', 'Thompson'], created: daysAgo(34), filed_at: daysAgo(10), rich: true },
    { id: uuid(), status: 'intake', chapter: 7, district: 'M.D. Tennessee', name: ['Linda', 'Davis'], created: daysAgo(8) },
    { id: uuid(), status: 'in_progress', chapter: 7, district: 'E.D. Texas', name: ['David', 'Martinez'], created: daysAgo(14) },
  ];

  const insertCase = db.prepare(
    'INSERT INTO cases (id, status, chapter, district, filed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertDebtor = db.prepare(
    'INSERT INTO debtors (id, case_id, first_name, last_name, ssn, dob, address_street, address_city, address_state, address_zip, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const states = { 'E.D. Texas': 'TX', 'S.D. Florida': 'FL', 'N.D. Ohio': 'OH', 'W.D. Washington': 'WA', 'C.D. California': 'CA', 'M.D. Tennessee': 'TN' };
  const cities = { TX: 'Houston', FL: 'Miami', OH: 'Cleveland', WA: 'Seattle', CA: 'Los Angeles', TN: 'Nashville' };

  for (const c of cases) {
    const st = states[c.district] || 'TX';
    insertCase.run(c.id, c.status, c.chapter, c.district, c.filed_at || null, c.created, now);
    insertDebtor.run(
      uuid(), c.id, c.name[0], c.name[1],
      '123-45-6789', '1985-04-15',
      `${100 + Math.floor(Math.random() * 900)} Main St`,
      cities[st] || 'Dallas', st, '78701',
      '(512) 555-0100', `${c.name[0].toLowerCase()}@example.com`
    );

    // Log a baseline case_created timeline event so every seed case has at
    // least one event (relative to its created_at date).
    logCaseEvent(c.id, 'case_created', `Case created for ${c.name[0]} ${c.name[1]}`,
      { chapter: c.chapter, district: c.district }, c.created);

    if (c.filed_at) {
      logCaseEvent(c.id, 'case_filed', 'Petition filed', { filed_at: c.filed_at }, c.filed_at);
    }

    // Rich demo case: populate income/expenses/creditors + a fuller event stream.
    if (c.rich) {
      const incomeId = uuid();
      db.prepare('INSERT INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        incomeId, c.id, 'Employment', 'Acme Industries LLC', 4567.00, 3038.50, 'biweekly'
      );
      logCaseEvent(c.id, 'income_added', 'Income added: Acme Industries LLC ($4,567/mo gross)',
        { income_id: incomeId, gross_monthly: 4567 }, daysAgo(28));

      for (const e of [
        ['rent', 'Rent / Mortgage', 1450],
        ['utilities', 'Electric, water, gas', 187],
        ['food', 'Groceries', 412],
        ['transportation', 'Gas', 156],
        ['insurance', 'Auto + health insurance', 225],
      ]) {
        const eid = uuid();
        db.prepare('INSERT INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
          eid, c.id, e[0], e[1], e[2]
        );
      }
      logCaseEvent(c.id, 'expense_added', 'Expenses populated from bank statement (5 categories)',
        { source: 'extraction' }, daysAgo(26));

      for (const cr of [
        { name: 'Capital One', amt: 4230, type: 'credit_card', sch: 'F' },
        { name: 'Discover Financial', amt: 7845, type: 'credit_card', sch: 'F' },
        { name: 'Wells Fargo Auto', amt: 12400, type: 'auto_loan', sch: 'D' },
        { name: 'Navient', amt: 24500, type: 'student_loan', sch: 'E' },
      ]) {
        const crid = uuid();
        db.prepare('INSERT INTO creditors (id, case_id, name, debt_type, schedule, amount_claimed) VALUES (?, ?, ?, ?, ?, ?)').run(
          crid, c.id, cr.name, cr.type, cr.sch, cr.amt
        );
        logCaseEvent(c.id, 'creditor_added', `Creditor added: ${cr.name} ($${cr.amt.toLocaleString()})`,
          { creditor_id: crid, amount: cr.amt, schedule: cr.sch }, daysAgo(25));
      }

      // A couple of fake document events to make the timeline feel alive
      logCaseEvent(c.id, 'document_uploaded', 'Uploaded march_paystub.pdf (pay stub)',
        { doc_type: 'pay_stub' }, daysAgo(29));
      logCaseEvent(c.id, 'document_extracted', 'Extracted march_paystub.pdf',
        { mock: false, redaction_count: 4 }, daysAgo(29));
      logCaseEvent(c.id, 'document_uploaded', 'Uploaded chase_statement_mar.pdf (bank statement)',
        { doc_type: 'bank_statement' }, daysAgo(27));
      logCaseEvent(c.id, 'document_extracted', 'Extracted chase_statement_mar.pdf',
        { mock: false, redaction_count: 6 }, daysAgo(27));

      // Seed a synthetic bank-statement extraction with realistic
      // transactions so the Insights tab demos meaningfully on first run.
      // Mix of categories: insider, preference, discretionary, undisclosed.
      const dateBefore = (n) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const seededTxns = [
        // Mortgage (business — should NOT flag as insider; but $1450 to "Wells Fargo" matching creditor IS preference if recent)
        { date: dateBefore(30),  merchant: 'WELLS FARGO HOME MORTGAGE',     amount: -1450.00, type: 'debit' },
        { date: dateBefore(60),  merchant: 'WELLS FARGO HOME MORTGAGE',     amount: -1450.00, type: 'debit' },
        // Insider risk: recurring transfer to individual
        { date: dateBefore(15),  merchant: 'ZELLE TO TERESA THOMPSON',      amount: -2400.00, type: 'debit' },
        { date: dateBefore(45),  merchant: 'ZELLE TO TERESA THOMPSON',      amount: -2400.00, type: 'debit' },
        { date: dateBefore(75),  merchant: 'ZELLE TO TERESA THOMPSON',      amount: -2400.00, type: 'debit' },
        // Single large transfer to individual
        { date: dateBefore(40),  merchant: 'JAMES O\'BRIEN',                amount: -3500.00, type: 'debit' },
        // Discretionary: private school
        { date: dateBefore(8),   merchant: 'BROOKLYN MONTESSORI ACADEMY',   amount: -1100.00, type: 'debit' },
        { date: dateBefore(38),  merchant: 'BROOKLYN MONTESSORI ACADEMY',   amount: -1100.00, type: 'debit' },
        { date: dateBefore(68),  merchant: 'BROOKLYN MONTESSORI ACADEMY',   amount: -1100.00, type: 'debit' },
        // Discretionary: travel sports
        { date: dateBefore(20),  merchant: 'NEW YORK ELITE SOCCER CLUB',    amount: -420.00,  type: 'debit' },
        // Discretionary: hotel + airline
        { date: dateBefore(22),  merchant: 'MARRIOTT BOSTON',               amount: -487.50,  type: 'debit' },
        { date: dateBefore(22),  merchant: 'DELTA AIR LINES',               amount: -340.00,  type: 'debit' },
        // Subscription pile
        { date: dateBefore(11),  merchant: 'NETFLIX',                       amount: -19.99,   type: 'debit' },
        { date: dateBefore(41),  merchant: 'NETFLIX',                       amount: -19.99,   type: 'debit' },
        { date: dateBefore(11),  merchant: 'SPOTIFY USA',                   amount: -10.99,   type: 'debit' },
        { date: dateBefore(41),  merchant: 'SPOTIFY USA',                   amount: -10.99,   type: 'debit' },
        { date: dateBefore(13),  merchant: 'EQUINOX FITNESS',               amount: -245.00,  type: 'debit' },
        { date: dateBefore(43),  merchant: 'EQUINOX FITNESS',               amount: -245.00,  type: 'debit' },
        // Preference-period transfer to creditor
        { date: dateBefore(45),  merchant: 'CAPITAL ONE PMT',               amount: -1200.00, type: 'debit' },
        // Undisclosed income from a payer not on Schedule I
        { date: dateBefore(20),  merchant: 'SIDESTREAM CONSULTING LLC',     amount: 1800.00,  type: 'credit' },
        { date: dateBefore(50),  merchant: 'SIDESTREAM CONSULTING LLC',     amount: 1800.00,  type: 'credit' },
        { date: dateBefore(80),  merchant: 'SIDESTREAM CONSULTING LLC',     amount: 1800.00,  type: 'credit' },
        // Declared employer paystubs
        { date: dateBefore(2),   merchant: 'ACME INDUSTRIES PAYROLL',       amount: 1519.25,  type: 'credit' },
        { date: dateBefore(16),  merchant: 'ACME INDUSTRIES PAYROLL',       amount: 1519.25,  type: 'credit' },
        { date: dateBefore(30),  merchant: 'ACME INDUSTRIES PAYROLL',       amount: 1519.25,  type: 'credit' },
        // Gambling activity
        { date: dateBefore(60),  merchant: 'DRAFTKINGS DEPOSIT',            amount: -200.00,  type: 'debit' },
        { date: dateBefore(64),  merchant: 'FANDUEL DEPOSIT',               amount: -150.00,  type: 'debit' },
      ];
      const docId = uuid();
      const docPath = path.join(app.getPath('userData'), 'documents', c.id, `${docId}_chase_statement_full_year.pdf`);
      // We don't write a real PDF — the seed just fills the metadata so the
      // analyzer has transactions to chew on.
      const seededExtraction = {
        type: 'bank_statement',
        bank: 'Chase',
        accountType: 'Checking',
        accountLast4: '4821',
        statementPeriod: '12 months',
        transactions: seededTxns,
      };
      db.prepare('INSERT INTO documents (id, case_id, filename, file_path, doc_type, extracted_data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        docId, c.id, 'chase_statement_full_year.pdf', docPath, 'bank_statement',
        JSON.stringify(seededExtraction), daysAgo(27)
      );

      // Run the bank-intel analyzer once now so the demo case opens with
      // populated findings on first launch.
      try {
        require('./main/bank-intel').analyzeCase(db, c.id);
      } catch (err) {
        console.error('[seed] bank-intel analyze failed:', err.message);
      }
    }
  }
}

// ─── Means Test: Anthropic Extraction (via LiteLLM proxy + local redaction) ──
const Anthropic = require('@anthropic-ai/sdk').default;
const { redactForExtraction, cleanup: redactionCleanup, redactText } = require('./main/redaction');

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  // If LITELLM_BASE_URL is set, route through the proxy for audit logging
  // and defense-in-depth PII masking. Otherwise call Anthropic directly.
  const baseURL = process.env.LITELLM_BASE_URL || process.env.ANTHROPIC_BASE_URL;
  const opts = { apiKey };
  if (baseURL) opts.baseURL = baseURL;
  return new Anthropic(opts);
}

// Look up debtor context for a document's case — used to detect debtor-specific PII
function getDebtorContextForDoc(docId) {
  const row = db.prepare(`
    SELECT d.first_name, d.last_name, d.address_street, d.address_city
    FROM documents doc
    JOIN debtors d ON d.case_id = doc.case_id AND d.is_joint = 0
    WHERE doc.id = ?
    LIMIT 1
  `).get(docId);
  if (!row) return {};
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    street: row.address_street,
    city: row.address_city,
  };
}

function getExtractionPrompt(docCategory) {
  const baseInstruction = `You are a financial document extraction assistant for bankruptcy case preparation.
Extract ALL financial data from this document into structured JSON.
Be precise with numbers — do not round. If a value is unclear, include it with a "confidence": "low" flag.
Return ONLY valid JSON, no markdown fences or explanation.`;

  switch (docCategory) {
    case 'paystub':
      return `${baseInstruction}

Extract from this paystub:
{
  "type": "paystub",
  "employer": "employer name",
  "payPeriod": "MM/DD/YYYY - MM/DD/YYYY",
  "payFrequency": "weekly|biweekly|semimonthly|monthly",
  "grossPay": 0.00,
  "federalTax": 0.00,
  "stateTax": 0.00,
  "socialSecurity": 0.00,
  "medicare": 0.00,
  "healthInsurance": 0.00,
  "retirement401k": 0.00,
  "otherDeductions": 0.00,
  "garnishments": 0.00,
  "netPay": 0.00,
  "ytdGross": 0.00,
  "ytdNet": 0.00
}`;

    case 'bank_statement':
      return `${baseInstruction}

Extract from this bank statement. Include the FULL transaction list — every
posted line item — under the "transactions" array. The downstream bank-
intelligence analyzer needs transaction-level data to flag insider
payments, preference-period transfers, and discretionary spend.

Each transaction:
  - amount: NEGATIVE for outflows (debits, payments, withdrawals, transfers
            out), POSITIVE for inflows (deposits, credits, transfers in)
  - date: MM/DD/YYYY (use the posted date; if only one date is shown use it)
  - merchant: payee name AS PRINTED on the statement (don't clean it up —
              the analyzer needs the raw form to detect ZELLE TO X, ACH
              prefixes, etc.)
  - type: "debit" | "credit" | "transfer" | "fee" | "interest" | "atm"

If the document is short (one-page summary only) and no transaction list
is visible, return an empty transactions array — DON'T fabricate.

{
  "type": "bank_statement",
  "bank": "bank name",
  "accountType": "Checking|Savings",
  "accountLast4": "1234",
  "statementPeriod": "MM/DD/YYYY - MM/DD/YYYY",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "totalDeposits": 0.00,
  "totalWithdrawals": 0.00,
  "monthlyExpenses": {
    "rent": 0.00,
    "utilities": 0.00,
    "groceries": 0.00,
    "gas": 0.00,
    "insurance": 0.00,
    "carPayment": 0.00,
    "subscriptions": 0.00,
    "other": 0.00
  },
  "recurringPayments": [
    { "payee": "name", "amount": 0.00, "frequency": "monthly" }
  ],
  "transactions": [
    { "date": "MM/DD/YYYY", "merchant": "RAW PAYEE NAME", "amount": -123.45, "type": "debit" }
  ]
}`;

    case 'tax_return':
      return `${baseInstruction}

Extract from this tax return:
{
  "type": "tax_return",
  "filingStatus": "Single|Married Filing Jointly|Married Filing Separately|Head of Household",
  "taxYear": 2024,
  "wagesIncome": 0.00,
  "interestIncome": 0.00,
  "businessIncome": 0.00,
  "otherIncome": 0.00,
  "totalIncome": 0.00,
  "agi": 0.00,
  "standardDeduction": 0.00,
  "itemizedDeductions": 0.00,
  "taxableIncome": 0.00,
  "totalTax": 0.00,
  "dependents": 0
}`;

    case 'police_report':
      return `You are a legal document extraction assistant for personal injury case preparation.
Extract ALL relevant information from this police/accident report into structured JSON.
Be precise with names, dates, and descriptions. If a value is unclear, include it with a "confidence": "low" flag.
Return ONLY valid JSON, no markdown fences or explanation.

Extract from this police/accident report:
{
  "type": "police_report",
  "reportNumber": "report/case number",
  "reportDate": "MM/DD/YYYY",
  "accidentDate": "MM/DD/YYYY",
  "accidentTime": "HH:MM AM/PM",
  "accidentLocation": "full intersection or address",
  "accidentType": "auto|truck|motorcycle|pedestrian|slip_fall|workplace|other",
  "weatherConditions": "clear|rain|snow|fog|other",
  "roadConditions": "dry|wet|icy|other",
  "description": "narrative description of how the accident occurred",
  "atFaultParty": "name of at-fault driver/party",
  "atFaultVehicle": "year make model",
  "atFaultInsurance": "insurance company name",
  "atFaultPolicyNumber": "policy number if visible",
  "clientVehicle": "year make model of client vehicle",
  "injuries": ["list of injuries noted in report"],
  "witnesses": [{"name": "witness name", "phone": "phone if listed"}],
  "citations": ["any traffic citations issued"],
  "ambulance": true,
  "hospitalTransport": "hospital name if transported"
}`;

    case 'medical_bill':
      return `You are a legal document extraction assistant for personal injury case preparation.
Extract ALL billing and treatment information from this medical bill/record into structured JSON.
Be precise with dollar amounts — do not round. If a value is unclear, include it with a "confidence": "low" flag.
Return ONLY valid JSON, no markdown fences or explanation.

Extract from this medical bill or record:
{
  "type": "medical_bill",
  "providerName": "hospital/clinic/doctor name",
  "providerType": "emergency_room|hospital|specialist|physical_therapy|imaging|pharmacy|other",
  "patientName": "patient name",
  "dateOfService": "MM/DD/YYYY",
  "lastVisitDate": "MM/DD/YYYY if different from first",
  "totalVisits": 1,
  "diagnosis": ["list of diagnoses / ICD codes if visible"],
  "procedures": ["list of procedures / CPT codes if visible"],
  "treatmentDescription": "description of treatment provided",
  "totalBilled": 0.00,
  "insurancePaid": 0.00,
  "patientPaid": 0.00,
  "outstandingBalance": 0.00,
  "hasLien": false,
  "lienAmount": 0.00,
  "notes": "any important observations"
}`;

    case 'insurance_declaration':
      return `You are a legal document extraction assistant for personal injury case preparation.
Extract ALL insurance policy information from this document into structured JSON.
Return ONLY valid JSON, no markdown fences or explanation.

Extract from this insurance document:
{
  "type": "insurance_declaration",
  "insuranceCompany": "company name",
  "policyNumber": "policy number",
  "policyholderName": "name on policy",
  "effectiveDates": "MM/DD/YYYY - MM/DD/YYYY",
  "coverageType": "auto|homeowners|umbrella|commercial|other",
  "bodilyInjuryLimit": 0.00,
  "propertyDamageLimit": 0.00,
  "umUimLimit": 0.00,
  "medPayLimit": 0.00,
  "pipLimit": 0.00,
  "adjusterName": "adjuster name if listed",
  "adjusterPhone": "phone if listed",
  "claimNumber": "claim number if listed",
  "notes": "any important observations about coverage"
}`;

    case '1099':
      return `${baseInstruction}

This is a Form 1099 (any variant: NEC, MISC, INT, DIV, R, G, etc.).
Identify the variant and extract the income figures.

{
  "type": "1099",
  "variant": "NEC|MISC|INT|DIV|R|G|K|S|other",
  "taxYear": 2024,
  "payerName": "name of payer (the business that issued the 1099)",
  "payerTIN": "payer TIN if visible (otherwise empty string)",
  "recipientName": "recipient (debtor) name",
  "recipientTIN": "recipient TIN if visible",
  "totalIncome": 0.00,
  "incomeBreakdown": {
    "nonemployeeCompensation": 0.00,
    "rents": 0.00,
    "royalties": 0.00,
    "otherIncome": 0.00,
    "interestIncome": 0.00,
    "ordinaryDividends": 0.00,
    "qualifiedDividends": 0.00,
    "grossDistribution": 0.00,
    "taxableAmount": 0.00,
    "federalTaxWithheld": 0.00,
    "stateTaxWithheld": 0.00
  },
  "isAnnual": true,
  "notes": "anything unusual"
}`;

    case 'mortgage_statement':
      return `${baseInstruction}

This is a monthly mortgage statement (or similar — home equity, second mortgage, escrow notice).

{
  "type": "mortgage_statement",
  "lenderName": "lender / loan servicer name",
  "lenderAddress": "lender mailing address",
  "loanNumber": "loan or account number",
  "borrowerName": "borrower(s) on the loan",
  "propertyAddress": "secured property full address (street, city, state, zip)",
  "statementDate": "MM/DD/YYYY",
  "principalBalance": 0.00,
  "totalAmountDue": 0.00,
  "regularMonthlyPayment": 0.00,
  "principalAndInterest": 0.00,
  "escrowAmount": 0.00,
  "lateFees": 0.00,
  "pastDueAmount": 0.00,
  "interestRate": 0.0,
  "isCurrent": true,
  "isInForbearance": false,
  "notes": "loan modification, default notice, anything material"
}`;

    case 'insurance_policy':
      return `${baseInstruction}

This is an insurance declaration page or premium notice — ANY type
(auto, homeowners/renters, life, health, umbrella, vehicle service contract).

{
  "type": "insurance_policy",
  "coverageType": "auto|homeowners|renters|life|health|umbrella|other",
  "carrier": "insurance company name",
  "policyNumber": "policy number",
  "policyholderName": "named insured",
  "effectiveDates": "MM/DD/YYYY - MM/DD/YYYY",
  "monthlyPremium": 0.00,
  "annualPremium": 0.00,
  "deductible": 0.00,
  "coverageDetails": {
    "bodilyInjuryLimit": 0.00,
    "propertyDamageLimit": 0.00,
    "umUimLimit": 0.00,
    "comprehensiveLimit": 0.00,
    "collisionLimit": 0.00,
    "dwellingLimit": 0.00,
    "personalPropertyLimit": 0.00,
    "deathBenefit": 0.00,
    "cashValue": 0.00
  },
  "coveredItem": "vehicle year/make/model OR property address OR insured name",
  "isWholeLife": false,
  "notes": "anything unusual about the coverage"
}`;

    case 'credit_counseling_certificate':
      return `${baseInstruction}

This is a pre-bankruptcy credit counseling certificate (required under 11 USC 109(h)).

{
  "type": "credit_counseling_certificate",
  "agencyName": "approved credit counseling agency name",
  "certificateNumber": "certificate number",
  "debtorName": "debtor name on certificate",
  "completionDate": "MM/DD/YYYY",
  "expirationDate": "MM/DD/YYYY",
  "courseType": "pre-filing|post-filing",
  "approvedByEOUST": true,
  "notes": "anything about the format of the certificate"
}`;

    case 'deed':
      return `${baseInstruction}

This is a real-property deed (warranty deed, quitclaim deed, grant deed, trust deed).
Extract grantor / grantee / property + recording info for Schedule A/B real-estate population.

{
  "type": "deed",
  "deedType": "warranty|quitclaim|grant|special_warranty|trust|other",
  "grantor": "person/entity transferring the property (seller)",
  "grantee": "person/entity receiving the property (buyer / current owner)",
  "executionDate": "MM/DD/YYYY",
  "recordingDate": "MM/DD/YYYY",
  "recordingCounty": "county where recorded",
  "recordingState": "state",
  "instrumentNumber": "doc/instrument/recording number",
  "bookPage": "book/volume + page if shown",
  "parcelId": "APN / parcel / property identification number",
  "propertyAddress": "full street, city, state, zip",
  "propertyCity": "city",
  "propertyState": "state",
  "propertyZip": "zip",
  "propertyCounty": "county",
  "propertyType": "single_family|duplex|condo|manufactured|land|investment|timeshare|other",
  "legalDescription": "the legal description text (lot/block/subdivision)",
  "consideration": 0.00,
  "notes": "anything material — easements, covenants, deed restrictions"
}`;

    case 'lease':
      return `${baseInstruction}

This is a lease agreement (residential, commercial, equipment, vehicle).
The data populates Schedule G (executory contracts) when the B106G mapper ships;
for now it persists on the document for later use.

{
  "type": "lease",
  "leaseCategory": "residential|commercial|equipment|vehicle|storage|other",
  "lessor": "landlord / lessor name and address",
  "lessee": "tenant / lessee name (the debtor or co-debtor)",
  "leasedItem": "property address, equipment description, or vehicle year/make/model",
  "leasedItemAddress": "full address if real property",
  "executionDate": "MM/DD/YYYY",
  "termStart": "MM/DD/YYYY",
  "termEnd": "MM/DD/YYYY",
  "monthlyRent": 0.00,
  "securityDeposit": 0.00,
  "isMonthToMonth": false,
  "renewalOption": "describe any auto-renewal or option to extend",
  "isInDefault": false,
  "amountInDefault": 0.00,
  "notes": "anything material — option to purchase, sublet rights, default notices"
}`;

    case 'car_title':
      return `${baseInstruction}

This is a vehicle certificate of title (or similar registration document).
Populates Schedule A/B vehicle row.

{
  "type": "car_title",
  "vehicleYear": "YYYY",
  "vehicleMake": "make (Honda, Ford, etc.)",
  "vehicleModel": "model",
  "vin": "VIN — 17 chars typically",
  "registeredOwner": "owner name as on title",
  "coOwner": "second owner if joint title",
  "lienHolder": "lien-holder name (lender) — empty if title is clean",
  "lienHolderAddress": "lien-holder address",
  "approximateMileage": 0,
  "titleNumber": "title control number",
  "titleState": "state of title",
  "titleIssueDate": "MM/DD/YYYY",
  "isLienReleased": false,
  "isSalvage": false,
  "notes": "anything material — branded title, repossession status, etc."
}`;

    case 'appraisal':
      return `${baseInstruction}

This is an appraisal report — real estate, jewelry, vehicle, business equipment, art.
Populates / updates an asset's current value.

{
  "type": "appraisal",
  "appraisedItemType": "real_estate|vehicle|jewelry|art|business_equipment|household|other",
  "appraisedItemDescription": "what was appraised — full description",
  "appraisedItemAddress": "address if real property",
  "appraiserName": "appraiser name",
  "appraiserCredentials": "license/cert number, designation",
  "appraiserCompany": "appraisal company name",
  "appraisalDate": "MM/DD/YYYY",
  "effectiveDate": "MM/DD/YYYY (date the value applies to)",
  "appraisedValue": 0.00,
  "valuationMethod": "comparable_sales|cost_approach|income_approach|replacement_cost|other",
  "purpose": "purpose of appraisal — bankruptcy, refinance, estate, insurance",
  "notes": "anything material — condition notes, insured-value vs market-value distinction"
}`;

    default:
      // Smart classifier-extractor: when we don't know the doc type by
      // filename, ask Claude to identify AND extract in one call. Cheaper
      // than running classify-then-extract round-trip. Claude returns one
      // of the known `type` values which our auto-populate code routes on.
      return `${baseInstruction}

Identify which kind of document this is, then extract its fields.

The "type" must be one of:
- "paystub"                          (employee wage stub)
- "tax_return"                       (1040 / state return)
- "bank_statement"                   (any account statement)
- "credit_report"                    (Equifax / Experian / TransUnion)
- "1099"                             (any 1099 variant)
- "mortgage_statement"               (monthly mortgage / escrow / HELOC)
- "insurance_policy"                 (auto, home, life, health declaration)
- "credit_counseling_certificate"    (pre-bankruptcy 109(h) certificate)
- "deed"                             (warranty / quitclaim / grant deed)
- "lease"                            (residential / commercial / equipment lease)
- "car_title"                        (vehicle certificate of title)
- "appraisal"                        (real-estate / jewelry / vehicle / business appraisal)
- "police_report" | "medical_bill"   (PI documents)
- "insurance_declaration"            (PI auto coverage declaration)
- "other"                            (none of the above)

Then add the fields appropriate for that type. The schemas are:

paystub: { type, employer, payPeriod, payFrequency, grossPay, federalTax, stateTax, socialSecurity, medicare, healthInsurance, retirement401k, otherDeductions, garnishments, netPay, ytdGross, ytdNet }
tax_return: { type, filingStatus, taxYear, wagesIncome, interestIncome, businessIncome, otherIncome, totalIncome, agi, standardDeduction, itemizedDeductions, taxableIncome, totalTax, dependents }
bank_statement: { type, bank, accountType, accountLast4, statementPeriod, openingBalance, closingBalance, totalDeposits, totalWithdrawals, monthlyExpenses: { rent, utilities, groceries, gas, insurance, carPayment, subscriptions, other }, recurringPayments: [{ payee, amount, frequency }] }
credit_report: { type, bureau, pullDate, creditScore, accounts: [{ creditor, accountNum, balance, status, type, collateral }] }
1099: { type, variant, taxYear, payerName, recipientName, totalIncome, incomeBreakdown: { ... }, isAnnual, notes }
mortgage_statement: { type, lenderName, loanNumber, propertyAddress, principalBalance, regularMonthlyPayment, principalAndInterest, escrowAmount, isCurrent, notes }
insurance_policy: { type, coverageType, carrier, policyNumber, monthlyPremium, annualPremium, coverageDetails: { ... }, coveredItem, notes }
credit_counseling_certificate: { type, agencyName, certificateNumber, debtorName, completionDate, courseType, approvedByEOUST, notes }
deed: { type, deedType, grantor, grantee, recordingDate, recordingCounty, instrumentNumber, parcelId, propertyAddress, propertyCity, propertyState, propertyZip, propertyCounty, propertyType, consideration, notes }
lease: { type, leaseCategory, lessor, lessee, leasedItem, leasedItemAddress, termStart, termEnd, monthlyRent, securityDeposit, isMonthToMonth, isInDefault, amountInDefault, notes }
car_title: { type, vehicleYear, vehicleMake, vehicleModel, vin, registeredOwner, lienHolder, lienHolderAddress, approximateMileage, titleNumber, titleState, isLienReleased, notes }
appraisal: { type, appraisedItemType, appraisedItemDescription, appraisedItemAddress, appraiserName, appraisalDate, appraisedValue, valuationMethod, notes }
other: { type: "other", documentCategory, financialData, notes }

Return ONLY valid JSON, no markdown fences.`;
  }
}

async function extractWithClaude(filePath, docCategory, debtorContext = {}) {
  const client = getAnthropicClient();

  // Step 1: Local OCR + visual PII redaction.
  // Produces a temporary file where SSNs, account numbers, DOBs, phones,
  // emails, debtor names, and addresses are blacked out.
  const { redactedPath, detections } = await redactForExtraction(filePath, debtorContext);

  if (detections.length > 0) {
    console.log(`[redaction] ${detections.length} PII region(s) redacted before API call:`,
      detections.map(d => d.type).join(', '));
  }

  try {
    const fileBuffer = fs.readFileSync(redactedPath);
    const base64Data = fileBuffer.toString('base64');
    const ext = path.extname(redactedPath).toLowerCase();

    let mediaType = 'application/pdf';
    if (ext === '.png') mediaType = 'image/png';
    else if (['.jpg', '.jpeg'].includes(ext)) mediaType = 'image/jpeg';

    const isPdf = ext === '.pdf';

    const content = [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
      { type: 'text', text: getExtractionPrompt(docCategory) },
    ];

    const response = await client.messages.create({
      // When going through LiteLLM, this maps to the "tabula-extract" model in config.yaml
      model: process.env.LITELLM_BASE_URL ? 'tabula-extract' : 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '{}';
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    parsed._redactionCount = detections.length;
    parsed._redactedFilePath = process.env.TABULA_KEEP_REDACTED === '1' ? redactedPath : null;
    return parsed;
  } finally {
    if (process.env.TABULA_KEEP_REDACTED === '1') {
      console.log('[redaction] KEEPING redacted file for inspection:', redactedPath);
    } else {
      redactionCleanup(redactedPath);
    }
  }
}

// Friendly one-line summary for toast notifications. Tells the attorney
// what just got extracted and how that translates to case data.
function summarizeExtraction(docType, e) {
  if (!e) return 'Document extracted.';
  const fmt$ = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  switch (docType || e.type) {
    case 'pay_stub':
    case 'paystub':
      return `Pay stub from ${e.employer || 'employer'} — ${fmt$(e.grossPay)} gross, ${fmt$(e.netPay)} net (${e.payFrequency || 'per period'})`;
    case 'bank_statement': {
      const expCount = Object.values(e.monthlyExpenses || {}).filter(v => Number(v) > 0).length;
      return `Bank statement from ${e.bank || 'bank'} — ${expCount} expense ${expCount === 1 ? 'category' : 'categories'} captured`;
    }
    case 'tax_return':
      return `Tax return ${e.taxYear || ''} — AGI ${fmt$(e.agi)}, ${e.dependents || 0} dependent${e.dependents === 1 ? '' : 's'}`;
    case 'credit_report': {
      const n = (e.accounts || []).length;
      return `Credit report from ${e.bureau || 'bureau'} — ${n} creditor${n === 1 ? '' : 's'} added`;
    }
    case '1099':
      return `1099-${e.variant || ''} from ${e.payerName || 'payer'} — ${fmt$(e.totalIncome)} ${e.taxYear ? '(tax year ' + e.taxYear + ')' : 'annual'}`;
    case 'mortgage_statement':
      return `Mortgage statement from ${e.lenderName || 'lender'} — ${fmt$(e.regularMonthlyPayment)}/mo, ${fmt$(e.principalBalance)} balance`;
    case 'insurance_policy': {
      const t = (e.coverageType || 'policy').replace(/_/g, ' ');
      const m = Number(e.monthlyPremium || (e.annualPremium ? e.annualPremium / 12 : 0));
      return `${t.charAt(0).toUpperCase() + t.slice(1)} policy from ${e.carrier || 'carrier'} — ${fmt$(m)}/mo premium`;
    }
    case 'credit_counseling_certificate':
      return `Credit counseling certificate filed (109(h) prerequisite) — ${e.agencyName || 'agency'}`;
    case 'deed':
      return `Deed extracted — ${e.propertyAddress || 'property'}${e.consideration ? ', ' + fmt$(e.consideration) : ''}, recorded ${e.recordingDate || 'unknown'}`;
    case 'lease': {
      const m = Number(e.monthlyRent || 0);
      return `Lease extracted — ${e.leaseCategory || 'lease'} from ${e.lessor || 'lessor'}${m > 0 ? `, ${fmt$(m)}/mo` : ''}`;
    }
    case 'car_title':
      return `Vehicle title — ${[e.vehicleYear, e.vehicleMake, e.vehicleModel].filter(Boolean).join(' ') || 'vehicle'}${e.lienHolder ? `, lien: ${e.lienHolder}` : ''}`;
    case 'appraisal':
      return `Appraisal — ${e.appraisedItemDescription || e.appraisedItemType || 'item'} valued at ${fmt$(e.appraisedValue)}`;
    case 'police_report':
      return `Police report — ${e.accidentType || 'accident'} on ${e.accidentDate || 'date'}, ${e.atFaultParty || 'at-fault party'}`;
    case 'medical_bill':
      return `Medical bill from ${e.providerName || 'provider'} — ${fmt$(e.totalBilled)} billed${e.hasLien ? ', lien attached' : ''}`;
    case 'insurance_declaration':
      return `Insurance declaration from ${e.insuranceCompany || 'carrier'} — BI limit ${fmt$(e.bodilyInjuryLimit)}`;
    default:
      return e.documentCategory || 'Document extracted.';
  }
}

// What case-detail tab should the attorney click through to after extraction?
function tabForDocType(docType) {
  switch (docType) {
    case 'pay_stub':
    case '1099':
    case 'tax_return':
      return 'overview';
    case 'bank_statement':
    case 'mortgage_statement':
    case 'insurance_policy':
      return 'overview';
    case 'credit_report':
    case 'credit_counseling_certificate':
      return 'creditors';
    case 'police_report':
    case 'medical_bill':
    case 'insurance_declaration':
      return 'overview';
    default:
      return 'documents';
  }
}

// ─── Auto-populate case data from extraction ─────────────────
function populateCaseFromExtraction(caseId, docType, extracted) {
  const { v4: uuid } = require('uuid');

  if (docType === 'pay_stub' || extracted.type === 'paystub') {
    // Convert gross pay to monthly based on frequency
    const freq = (extracted.payFrequency || 'biweekly').toLowerCase();
    const multipliers = { weekly: 4.33, biweekly: 2.167, semimonthly: 2, monthly: 1, annual: 1/12 };
    const mult = multipliers[freq] || 1;
    const grossMonthly = (extracted.grossPay || 0) * mult;
    const netMonthly = (extracted.netPay || 0) * mult;

    db.prepare('INSERT INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      uuid(), caseId, 'Employment', extracted.employer || 'Unknown Employer',
      Math.round(grossMonthly * 100) / 100, Math.round(netMonthly * 100) / 100, freq
    );
  }

  if (docType === 'bank_statement' || extracted.type === 'bank_statement') {
    const expenses = extracted.monthlyExpenses || {};
    for (const [category, amount] of Object.entries(expenses)) {
      if (amount && amount > 0) {
        db.prepare('INSERT INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
          uuid(), caseId, category, `From ${extracted.bank || 'bank'} statement`, amount
        );
      }
    }
  }

  if (docType === 'credit_report' || extracted.type === 'credit_report') {
    const accounts = extracted.accounts || [];
    for (const acct of accounts) {
      // Infer schedule from account type
      let schedule = 'F'; // default nonpriority unsecured
      let debtType = 'other';
      const type = (acct.type || '').toLowerCase();
      if (type.includes('auto') || type.includes('car')) { schedule = 'D'; debtType = 'auto_loan'; }
      else if (type.includes('mortgage') || type.includes('home')) { schedule = 'D'; debtType = 'mortgage'; }
      else if (type.includes('student')) { schedule = 'E'; debtType = 'student_loan'; }
      else if (type.includes('credit card')) { debtType = 'credit_card'; }
      else if (type.includes('store')) { debtType = 'credit_card'; }
      else if (type.includes('purchased') || type.includes('collection')) { debtType = 'collections'; }

      db.prepare('INSERT INTO creditors (id, case_id, name, account_number, debt_type, schedule, amount_claimed, is_disputed, is_contingent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId, acct.creditor || 'Unknown', acct.accountNum || '',
        debtType, schedule, acct.balance || 0, 0, 0
      );
    }
  }

  // ─── 1099: convert annual to monthly, log as income ─────────
  if (docType === '1099' || extracted.type === '1099') {
    const annual = Number(extracted.totalIncome || 0);
    const monthly = annual > 0 ? Math.round((annual / 12) * 100) / 100 : 0;
    const variant = (extracted.variant || '').toUpperCase();
    const label =
      variant === 'NEC' ? 'Self-employment (1099-NEC)' :
      variant === 'MISC' ? '1099-MISC income' :
      variant === 'INT' ? '1099-INT interest' :
      variant === 'DIV' ? '1099-DIV dividends' :
      variant === 'R' ? '1099-R retirement distribution' :
      `1099-${variant || 'income'}`;
    if (monthly > 0) {
      db.prepare('INSERT INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId, label, extracted.payerName || 'Unknown payer',
        monthly, monthly, 'annual'
      );
    }
  }

  // ─── Mortgage statement: monthly expense + secured creditor ─
  if (docType === 'mortgage_statement' || extracted.type === 'mortgage_statement') {
    const monthly = Number(extracted.regularMonthlyPayment || 0);
    if (monthly > 0) {
      db.prepare('INSERT INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
        uuid(), caseId, 'Rent/Mortgage',
        `${extracted.lenderName || 'Mortgage'}${extracted.loanNumber ? ' acct *' + String(extracted.loanNumber).slice(-4) : ''}`,
        monthly
      );
    }
    if (Number(extracted.principalBalance || 0) > 0) {
      db.prepare('INSERT INTO creditors (id, case_id, name, address, account_number, debt_type, schedule, amount_claimed, collateral_description, is_disputed, is_contingent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId,
        extracted.lenderName || 'Mortgage holder',
        extracted.lenderAddress || '',
        extracted.loanNumber || '',
        'mortgage', 'D',
        Number(extracted.principalBalance || 0),
        extracted.propertyAddress || 'Real property — see Schedule A/B',
        0, 0
      );
    }
    // Real-property asset row tied to the property described on the statement.
    if (extracted.propertyAddress) {
      db.prepare('INSERT INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId, 'A', 'real_estate',
        `Residence — ${extracted.propertyAddress}`,
        0, '', 0
      );
    }
  }

  // ─── Insurance policy: monthly premium expense + life cash value asset
  if (docType === 'insurance_policy' || extracted.type === 'insurance_policy') {
    const monthlyPremium = Number(
      extracted.monthlyPremium ||
      (extracted.annualPremium ? extracted.annualPremium / 12 : 0)
    );
    const ct = (extracted.coverageType || 'other').toLowerCase();
    if (monthlyPremium > 0) {
      const category =
        ct === 'auto' ? 'Auto insurance' :
        ct === 'homeowners' || ct === 'renters' ? 'Property insurance' :
        ct === 'life' ? 'Life insurance' :
        ct === 'health' ? 'Health insurance' : 'Insurance';
      db.prepare('INSERT INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
        uuid(), caseId, category,
        `${extracted.carrier || 'Carrier'}${extracted.policyNumber ? ' #' + String(extracted.policyNumber).slice(-6) : ''}${extracted.coveredItem ? ' — ' + extracted.coveredItem : ''}`,
        Math.round(monthlyPremium * 100) / 100
      );
    }
    // Cash-value life policies become Schedule A/B personal-property assets.
    const cashValue = Number(extracted.coverageDetails?.cashValue || 0);
    if (ct === 'life' && cashValue > 0) {
      db.prepare('INSERT INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId, 'B', 'life_insurance',
        `${extracted.carrier || 'Life insurance'} policy ${extracted.policyNumber || ''} — cash value`.trim(),
        cashValue, '', 0
      );
    }
  }

  // ─── Credit counseling certificate: log event, no DB rows ───
  // The cert itself isn't case data, but its presence is a 109(h) prerequisite.
  // We log a strong event so the timeline / completeness check picks it up,
  // and stash a flag in case_events metadata so the petition module can see it.
  if (docType === 'credit_counseling_certificate' || extracted.type === 'credit_counseling_certificate') {
    logCaseEvent(caseId, 'credit_counseling_completed',
      `Credit counseling certificate on file — ${extracted.agencyName || 'agency'}, completed ${extracted.completionDate || 'date unknown'}`,
      {
        agency: extracted.agencyName,
        certificate_number: extracted.certificateNumber,
        completion_date: extracted.completionDate,
        course_type: extracted.courseType || 'pre-filing',
      }
    );
  }

  // ─── Deed: Schedule A real-estate asset row ─────────────────
  if (docType === 'deed' || extracted.type === 'deed') {
    const description = [
      extracted.propertyAddress || extracted.legalDescription || 'Real property',
      extracted.parcelId ? `Parcel ${extracted.parcelId}` : null,
      extracted.recordingDate ? `Recorded ${extracted.recordingDate}` : null,
    ].filter(Boolean).join(' — ');
    db.prepare('INSERT INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      uuid(), caseId, 'A', 'real_estate', description,
      Number(extracted.consideration || 0), '', 0
    );
  }

  // ─── Lease: no asset row (Schedule G); the document's
  // extracted_data carries the full lease info for the
  // future B106G mapper. We log a timeline event so the
  // attorney sees the lease is on file. ─────────────────────
  if (docType === 'lease' || extracted.type === 'lease') {
    const item = extracted.leasedItemAddress || extracted.leasedItem || 'leased item';
    logCaseEvent(caseId, 'lease_extracted',
      `Lease extracted: ${extracted.lessor || 'lessor'} → ${item}, $${(extracted.monthlyRent || 0).toLocaleString()}/mo`,
      {
        lessor: extracted.lessor,
        leased_item: item,
        monthly_rent: extracted.monthlyRent,
        category: extracted.leaseCategory,
        in_default: !!extracted.isInDefault,
      }
    );
    // Lease payments also become a Schedule J expense if not already present.
    if (Number(extracted.monthlyRent || 0) > 0) {
      db.prepare('INSERT INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
        uuid(), caseId, 'Rent/Mortgage',
        `Lease — ${extracted.lessor || 'lessor'} (${item})`,
        Number(extracted.monthlyRent)
      );
    }
  }

  // ─── Car title: Schedule B vehicle asset row ────────────────
  if (docType === 'car_title' || extracted.type === 'car_title') {
    const description = [
      extracted.vehicleYear, extracted.vehicleMake, extracted.vehicleModel,
    ].filter(Boolean).join(' ') || 'Vehicle';
    const detail = extracted.vin ? `${description} VIN ${String(extracted.vin).slice(-6)}` :
      `${description}${extracted.approximateMileage ? `, ~${Number(extracted.approximateMileage).toLocaleString()} mi` : ''}`;
    db.prepare('INSERT INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      uuid(), caseId, 'B', 'vehicle', detail, 0, '', 0
    );
    // If a lien-holder is named on the title, that's a secured creditor.
    if (extracted.lienHolder && !extracted.isLienReleased) {
      db.prepare('INSERT INTO creditors (id, case_id, name, address, debt_type, schedule, amount_claimed, collateral_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), caseId, extracted.lienHolder, extracted.lienHolderAddress || '',
        'auto_loan', 'D', 0, description
      );
    }
  }

  // ─── Appraisal: update an existing asset's value if we can
  // match on description, otherwise add a new asset row. ──────
  if (docType === 'appraisal' || extracted.type === 'appraisal') {
    const value = Number(extracted.appraisedValue || 0);
    if (value > 0) {
      const desc = (extracted.appraisedItemDescription || '').toLowerCase();
      const addr = (extracted.appraisedItemAddress || '').toLowerCase();
      // Try to find an existing asset whose description overlaps.
      const candidates = db.prepare('SELECT id, description FROM assets WHERE case_id = ?').all(caseId);
      const match = candidates.find(a => {
        const adesc = (a.description || '').toLowerCase();
        if (!adesc) return false;
        if (desc && adesc.includes(desc.slice(0, 20))) return true;
        if (addr && adesc.includes(addr.slice(0, 20))) return true;
        return false;
      });
      if (match) {
        db.prepare('UPDATE assets SET current_value = ? WHERE id = ?').run(value, match.id);
      } else {
        const schedule = (extracted.appraisedItemType === 'real_estate') ? 'A' : 'B';
        const category = extracted.appraisedItemType || 'other';
        db.prepare('INSERT INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          uuid(), caseId, schedule, category,
          `${extracted.appraisedItemDescription || 'Appraised item'} — appraised ${extracted.appraisalDate || ''}`.trim(),
          value, '', 0
        );
      }
    }
  }
}

// ─── PI Auto-populate from extraction ─────────────────────────
function populatePICaseFromExtraction(caseId, docType, extracted) {
  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString();

  if (docType === 'police_report' || extracted.type === 'police_report') {
    // Upsert pi_details with accident info from the police report
    const existing = db.prepare('SELECT case_id FROM pi_case_details WHERE case_id = ?').get(caseId);
    if (existing) {
      db.prepare(`UPDATE pi_case_details SET
        accident_date = COALESCE(?, accident_date),
        accident_type = COALESCE(?, accident_type),
        accident_location = COALESCE(?, accident_location),
        accident_description = COALESCE(?, accident_description),
        police_report_number = COALESCE(?, police_report_number),
        weather_conditions = COALESCE(?, weather_conditions),
        at_fault_party = COALESCE(?, at_fault_party),
        at_fault_insurance = COALESCE(?, at_fault_insurance),
        updated_at = ?
        WHERE case_id = ?`).run(
        extracted.accidentDate || null,
        extracted.accidentType || null,
        extracted.accidentLocation || null,
        extracted.description || null,
        extracted.reportNumber || null,
        extracted.weatherConditions || null,
        extracted.atFaultParty || null,
        extracted.atFaultInsurance || null,
        now, caseId
      );
    } else {
      db.prepare(`INSERT INTO pi_case_details (case_id, accident_date, accident_type, accident_location,
        accident_description, police_report_number, weather_conditions, at_fault_party, at_fault_insurance,
        created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        caseId,
        extracted.accidentDate || '', extracted.accidentType || 'auto',
        extracted.accidentLocation || '', extracted.description || '',
        extracted.reportNumber || '', extracted.weatherConditions || '',
        extracted.atFaultParty || '', extracted.atFaultInsurance || '',
        now, now
      );
    }
    logCaseEvent(caseId, 'pi_details_extracted',
      `Police report extracted: ${extracted.reportNumber || 'report'}, accident ${extracted.accidentDate || 'date unknown'}`,
      { report_number: extracted.reportNumber, accident_type: extracted.accidentType }
    );
  }

  if (docType === 'medical_bill' || extracted.type === 'medical_bill') {
    const id = uuid();
    db.prepare(`INSERT INTO pi_medical_records (id, case_id, provider_name, provider_type,
      treatment_type, first_visit, last_visit, total_visits, total_billed, total_paid,
      lien_amount, has_lien, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId,
      extracted.providerName || 'Unknown Provider',
      extracted.providerType || 'other',
      extracted.treatmentDescription || '',
      extracted.dateOfService || '',
      extracted.lastVisitDate || extracted.dateOfService || '',
      extracted.totalVisits || 1,
      extracted.totalBilled || 0,
      (extracted.insurancePaid || 0) + (extracted.patientPaid || 0),
      extracted.lienAmount || 0,
      extracted.hasLien ? 1 : 0,
      'ongoing',
      [
        ...(extracted.diagnosis || []).map(d => `Dx: ${d}`),
        ...(extracted.procedures || []).map(p => `Proc: ${p}`),
        extracted.notes || '',
      ].filter(Boolean).join('; '),
      now, now
    );
    logCaseEvent(caseId, 'medical_record_extracted',
      `Medical record extracted: ${extracted.providerName || 'provider'} — $${(extracted.totalBilled || 0).toLocaleString()} billed`,
      { provider: extracted.providerName, billed: extracted.totalBilled }
    );
  }

  if (docType === 'insurance_declaration' || extracted.type === 'insurance_declaration') {
    const existing = db.prepare('SELECT case_id FROM pi_case_details WHERE case_id = ?').get(caseId);
    if (existing) {
      db.prepare(`UPDATE pi_case_details SET
        insurance_company = COALESCE(?, insurance_company),
        insurance_policy_number = COALESCE(?, insurance_policy_number),
        insurance_adjuster = COALESCE(?, insurance_adjuster),
        insurance_adjuster_phone = COALESCE(?, insurance_adjuster_phone),
        insurance_claim_number = COALESCE(?, insurance_claim_number),
        insurance_coverage_limit = COALESCE(?, insurance_coverage_limit),
        um_uim_available = CASE WHEN ? > 0 THEN 1 ELSE um_uim_available END,
        um_uim_limit = COALESCE(?, um_uim_limit),
        updated_at = ?
        WHERE case_id = ?`).run(
        extracted.insuranceCompany || null,
        extracted.policyNumber || null,
        extracted.adjusterName || null,
        extracted.adjusterPhone || null,
        extracted.claimNumber || null,
        extracted.bodilyInjuryLimit || null,
        extracted.umUimLimit || 0,
        extracted.umUimLimit || null,
        now, caseId
      );
    } else {
      db.prepare(`INSERT INTO pi_case_details (case_id, insurance_company, insurance_policy_number,
        insurance_adjuster, insurance_adjuster_phone, insurance_claim_number, insurance_coverage_limit,
        um_uim_available, um_uim_limit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        caseId,
        extracted.insuranceCompany || '', extracted.policyNumber || '',
        extracted.adjusterName || '', extracted.adjusterPhone || '',
        extracted.claimNumber || '', extracted.bodilyInjuryLimit || 0,
        extracted.umUimLimit ? 1 : 0, extracted.umUimLimit || 0,
        now, now
      );
    }
    logCaseEvent(caseId, 'insurance_extracted',
      `Insurance info extracted: ${extracted.insuranceCompany || 'carrier'}, BI limit $${(extracted.bodilyInjuryLimit || 0).toLocaleString()}`,
      { carrier: extracted.insuranceCompany, bi_limit: extracted.bodilyInjuryLimit }
    );
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────
function registerIPC() {
  // Cases
  ipcMain.handle('cases:list', (_, filters) => {
    // Pull all fields needed for completeness scoring in a single query.
    // Correlated subqueries keep this O(N_cases) — fine for a practice of
    // hundreds of cases, and avoids N+1 round-trips from the renderer.
    let query = `
      SELECT
        c.*,
        d.id as debtor_id,
        d.first_name, d.last_name, d.ssn, d.dob,
        d.address_street, d.address_city, d.address_state, d.address_zip,
        (SELECT COUNT(*) FROM income     WHERE case_id = c.id) AS income_count,
        (SELECT COUNT(*) FROM expenses   WHERE case_id = c.id) AS expense_count,
        (SELECT COUNT(*) FROM creditors  WHERE case_id = c.id) AS creditor_count,
        (SELECT COUNT(*) FROM assets     WHERE case_id = c.id) AS asset_count,
        (SELECT COUNT(*) FROM documents  WHERE case_id = c.id) AS doc_count,
        (SELECT GROUP_CONCAT(DISTINCT doc_type) FROM documents WHERE case_id = c.id) AS doc_types,
        (SELECT COUNT(*) FROM review_flags WHERE case_id = c.id AND resolved = 0) AS open_flags,
        (SELECT COUNT(*) FROM review_flags WHERE case_id = c.id) AS total_flags
      FROM cases c
      LEFT JOIN debtors d ON d.case_id = c.id AND d.is_joint = 0
    `;
    const conditions = [];
    const params = [];
    if (filters?.status && filters.status !== 'all') {
      conditions.push('c.status = ?');
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push("(d.first_name || ' ' || d.last_name LIKE ?)");
      params.push(`%${filters.search}%`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY c.created_at DESC';

    const { computeCompleteness } = require('./renderer/lib/case-completeness');
    const rows = db.prepare(query).all(...params);

    // Enrich each row with a completeness score derived from the pure
    // computeCompleteness() function so dashboard, case detail, and any
    // future consumer all see the same score.
    return rows.map(row => {
      const docTypes = row.doc_types ? row.doc_types.split(',') : [];
      const stubCase = {
        chapter: row.chapter,
        debtors: row.debtor_id ? [{
          is_joint: 0,
          first_name: row.first_name,
          last_name: row.last_name,
          ssn: row.ssn,
          dob: row.dob,
          address_street: row.address_street,
          address_city: row.address_city,
          address_state: row.address_state,
          address_zip: row.address_zip,
        }] : [],
        income:    new Array(row.income_count || 0).fill({}),
        expenses:  new Array(row.expense_count || 0).fill({}),
        creditors: new Array(row.creditor_count || 0).fill({}),
        assets:    new Array(row.asset_count || 0).fill({}),
        documents: docTypes.map(t => ({ doc_type: t })),
        flags: [
          ...new Array(row.open_flags || 0).fill({ resolved: 0 }),
          ...new Array((row.total_flags || 0) - (row.open_flags || 0)).fill({ resolved: 1 }),
        ],
      };
      const completeness = computeCompleteness(stubCase);
      return {
        ...row,
        completeness: completeness.score,
        ready_to_file: completeness.readyToFile,
        missing_count: completeness.missing.length,
      };
    });
  });

  ipcMain.handle('cases:get', (_, id) => {
    const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
    if (!c) return null;
    c.debtors = db.prepare('SELECT * FROM debtors WHERE case_id = ?').all(id);
    c.income = db.prepare('SELECT * FROM income WHERE case_id = ?').all(id);
    c.expenses = db.prepare('SELECT * FROM expenses WHERE case_id = ?').all(id);
    c.assets = db.prepare('SELECT * FROM assets WHERE case_id = ?').all(id);
    c.creditors = db.prepare('SELECT * FROM creditors WHERE case_id = ?').all(id);
    c.documents = db.prepare('SELECT * FROM documents WHERE case_id = ?').all(id);
    c.flags = db.prepare('SELECT * FROM review_flags WHERE case_id = ?').all(id);
    // PI-specific data
    if (c.practice_type === 'personal_injury') {
      c.piDetails = db.prepare('SELECT * FROM pi_case_details WHERE case_id = ?').get(id) || null;
      c.medicalRecords = db.prepare('SELECT * FROM pi_medical_records WHERE case_id = ? ORDER BY first_visit DESC').all(id);
      c.settlements = db.prepare('SELECT * FROM pi_settlements WHERE case_id = ? ORDER BY date DESC').all(id);
      c.statutes = db.prepare('SELECT * FROM pi_statutes WHERE case_id = ? ORDER BY deadline ASC').all(id);
    }
    return c;
  });

  ipcMain.handle('cases:create', (_, data) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO cases (id, chapter, district, practice_type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, data.chapter || 7, data.district || '', data.practiceType || 'bankruptcy', 'intake', now, now);
    if (data.debtor) {
      db.prepare('INSERT INTO debtors (id, case_id, first_name, last_name, ssn, dob, address_street, address_city, address_state, address_zip, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), id, data.debtor.firstName, data.debtor.lastName, data.debtor.ssn || '', data.debtor.dob || '',
        data.debtor.street || '', data.debtor.city || '', data.debtor.state || '', data.debtor.zip || '',
        data.debtor.phone || '', data.debtor.email || ''
      );
    }
    const debtorName = data.debtor ? `${data.debtor.firstName || ''} ${data.debtor.lastName || ''}`.trim() : 'New case';
    logCaseEvent(id, 'case_created', `Case created for ${debtorName || 'new debtor'}`, {
      chapter: data.chapter || 7,
      district: data.district,
    });
    return { id };
  });

  ipcMain.handle('cases:update', (_, id, data) => {
    const now = new Date().toISOString();
    // Snapshot the current row so we know what changed for the timeline event.
    const prior = db.prepare('SELECT status, chapter, district FROM cases WHERE id = ?').get(id);

    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (['status', 'chapter', 'district', 'case_number'].includes(key)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    // Set filed_at automatically when transitioning to 'filed' status.
    if (data.status === 'filed' && prior && prior.status !== 'filed') {
      fields.push('filed_at = ?');
      params.push(now);
    }
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);
    db.prepare(`UPDATE cases SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    // Timeline: record status transitions separately from other updates so
    // downstream consumers (dashboard "recent activity", deadline engine)
    // can filter on the event_type cleanly.
    if (data.status && prior && prior.status !== data.status) {
      if (data.status === 'filed') {
        logCaseEvent(id, 'case_filed', 'Petition filed', { filed_at: now });
      } else {
        logCaseEvent(id, 'status_changed',
          `Status changed: ${prior.status} → ${data.status}`,
          { from: prior.status, to: data.status }
        );
      }
    }
    return { success: true };
  });

  ipcMain.handle('cases:delete', (_, id) => {
    db.prepare('DELETE FROM cases WHERE id = ?').run(id);
    return { success: true };
  });

  // Debtors
  ipcMain.handle('debtors:upsert', (_, caseId, debtor) => {
    const { v4: uuid } = require('uuid');
    const id = debtor.id || uuid();
    db.prepare(`INSERT OR REPLACE INTO debtors (id, case_id, is_joint, first_name, last_name, ssn, dob, address_street, address_city, address_state, address_zip, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, debtor.isJoint ? 1 : 0,
      debtor.firstName || '', debtor.lastName || '', debtor.ssn || '', debtor.dob || '',
      debtor.street || '', debtor.city || '', debtor.state || '', debtor.zip || '',
      debtor.phone || '', debtor.email || ''
    );
    return { id };
  });

  ipcMain.handle('debtors:delete', (_, id) => {
    db.prepare('DELETE FROM debtors WHERE id = ? AND is_joint = 1').run(id);
    return { success: true };
  });

  // Creditors
  ipcMain.handle('creditors:list', (_, caseId) => {
    return db.prepare('SELECT * FROM creditors WHERE case_id = ? ORDER BY schedule, name').all(caseId);
  });

  ipcMain.handle('creditors:upsert', (_, caseId, creditor) => {
    const { v4: uuid } = require('uuid');
    const id = creditor.id || uuid();
    const isNew = !creditor.id;
    db.prepare(`INSERT OR REPLACE INTO creditors (id, case_id, name, address, account_number, debt_type, schedule, amount_claimed, collateral_description, is_disputed, is_contingent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, creditor.name, creditor.address || '', creditor.accountNumber || '', creditor.debtType, creditor.schedule,
      creditor.amountClaimed || 0, creditor.collateralDescription || '', creditor.isDisputed ? 1 : 0, creditor.isContingent ? 1 : 0
    );
    if (isNew) {
      logCaseEvent(caseId, 'creditor_added',
        `Creditor added: ${creditor.name} ($${(creditor.amountClaimed || 0).toLocaleString()})`,
        { creditor_id: id, amount: creditor.amountClaimed || 0, schedule: creditor.schedule }
      );
    }
    return { id };
  });

  // Income
  ipcMain.handle('income:upsert', (_, caseId, inc) => {
    const { v4: uuid } = require('uuid');
    const id = inc.id || uuid();
    const isNew = !inc.id;
    db.prepare('INSERT OR REPLACE INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, caseId, inc.source, inc.employerName || '', inc.grossMonthly || 0, inc.netMonthly || 0, inc.payFrequency || 'monthly'
    );
    if (isNew) {
      logCaseEvent(caseId, 'income_added',
        `Income added: ${inc.employerName || inc.source} ($${(inc.grossMonthly || 0).toLocaleString()}/mo gross)`,
        { income_id: id, gross_monthly: inc.grossMonthly || 0 }
      );
    }
    return { id };
  });

  ipcMain.handle('income:delete', (_, id) => {
    db.prepare('DELETE FROM income WHERE id = ?').run(id);
    return { success: true };
  });

  // Expenses
  ipcMain.handle('expenses:upsert', (_, caseId, exp) => {
    const { v4: uuid } = require('uuid');
    const id = exp.id || uuid();
    const isNew = !exp.id;
    db.prepare('INSERT OR REPLACE INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
      id, caseId, exp.category, exp.description || '', exp.monthlyAmount || 0
    );
    if (isNew) {
      logCaseEvent(caseId, 'expense_added',
        `Expense added: ${exp.category} ($${(exp.monthlyAmount || 0).toLocaleString()}/mo)`,
        { expense_id: id, amount: exp.monthlyAmount || 0, category: exp.category }
      );
    }
    return { id };
  });

  ipcMain.handle('expenses:delete', (_, id) => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return { success: true };
  });

  // Assets
  ipcMain.handle('assets:upsert', (_, caseId, asset) => {
    const { v4: uuid } = require('uuid');
    const id = asset.id || uuid();
    db.prepare('INSERT OR REPLACE INTO assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, caseId, asset.schedule, asset.category, asset.description, asset.currentValue || 0, asset.exemptionStatute || '', asset.exemptionAmount || 0
    );
    return { id };
  });

  // Documents
  ipcMain.handle('documents:upload', async (_, caseId) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'csv'] }]
    });
    if (result.canceled) return [];
    const { v4: uuid } = require('uuid');
    const docs = [];
    const docsDir = path.join(app.getPath('userData'), 'documents', caseId);
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    for (const filePath of result.filePaths) {
      const id = uuid();
      const filename = path.basename(filePath);
      const destPath = path.join(docsDir, `${id}_${filename}`);
      fs.copyFileSync(filePath, destPath);
      const docType = guessDocType(filename);
      db.prepare('INSERT INTO documents (id, case_id, filename, file_path, doc_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, caseId, filename, destPath, docType, new Date().toISOString());
      logCaseEvent(caseId, 'document_uploaded',
        `Uploaded ${filename} (${(docType || 'other').replace('_', ' ')})`,
        { document_id: id, filename, doc_type: docType }
      );
      docs.push({ id, filename, docType });
    }
    return docs;
  });

  ipcMain.handle('documents:list', (_, caseId) => {
    return db.prepare('SELECT * FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC').all(caseId);
  });

  // Drag-drop multi-file processing.
  // The renderer sends absolute paths (Electron exposes file.path on dropped
  // File objects). For each file we: copy → classify by filename → insert
  // documents row → run extractWithClaude → populate case → emit progress.
  // Progress events stream back via webContents.send so the UI can toast each
  // success and refresh case state in real time.
  ipcMain.handle('documents:processFiles', async (_, caseId, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return { processed: 0, failed: 0 };
    const { v4: uuid } = require('uuid');
    const win = mainWindow;
    const send = (payload) => { try { win?.webContents?.send('documents:progress', payload); } catch {} };

    // Filter to file paths that exist + are not directories.
    const validPaths = filePaths.filter(p => {
      try {
        const s = fs.statSync(p);
        return s.isFile();
      } catch { return false; }
    });

    const docsDir = path.join(app.getPath('userData'), 'documents', caseId);
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    send({ stage: 'start', caseId, total: validPaths.length });

    let processed = 0, failed = 0;
    for (let i = 0; i < validPaths.length; i++) {
      const filePath = validPaths[i];
      const filename = path.basename(filePath);
      const ext = path.extname(filename).toLowerCase();
      // Only process supported extensions.
      if (!['.pdf', '.png', '.jpg', '.jpeg', '.csv'].includes(ext)) {
        failed++;
        send({ stage: 'error', index: i, total: validPaths.length, filename, error: `unsupported file type: ${ext || '(none)'}` });
        continue;
      }

      try {
        const id = uuid();
        const destPath = path.join(docsDir, `${id}_${filename}`);
        fs.copyFileSync(filePath, destPath);
        const docType = guessDocType(filename);
        const now = new Date().toISOString();
        db.prepare('INSERT INTO documents (id, case_id, filename, file_path, doc_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, caseId, filename, destPath, docType, now);
        logCaseEvent(caseId, 'document_uploaded',
          `Uploaded ${filename} (${(docType || 'other').replace('_', ' ')})`,
          { document_id: id, filename, doc_type: docType }
        );

        send({ stage: 'extracting', index: i, total: validPaths.length, filename, docType, docId: id });

        // Reuse the same extraction path as documents:extract.
        const categoryMap = {
          'pay_stub': 'paystub', 'tax_return': 'tax_return', 'bank_statement': 'bank_statement',
          'credit_report': 'other', '1099': '1099', 'mortgage_statement': 'mortgage_statement',
          'insurance_policy': 'insurance_policy', 'credit_counseling_certificate': 'credit_counseling_certificate',
          'police_report': 'police_report', 'medical_bill': 'medical_bill',
          'insurance_declaration': 'insurance_declaration', 'other': 'other',
        };
        const category = categoryMap[docType] || 'other';
        const debtorContext = getDebtorContextForDoc(id);

        let extracted;
        try {
          extracted = await extractWithClaude(destPath, category, debtorContext);
        } catch (err) {
          console.error('Claude extraction failed, using mock:', err.message);
          extracted = mockExtract(docType, filename);
          extracted._mock = true;
        }

        db.prepare('UPDATE documents SET extracted_data = ? WHERE id = ?').run(JSON.stringify(extracted), id);

        // If Claude classified it differently than our filename guess, update
        // the doc_type to match so case data goes to the right place.
        const claudeType = extracted.type;
        const claudeToDocType = {
          paystub: 'pay_stub', tax_return: 'tax_return', bank_statement: 'bank_statement',
          credit_report: 'credit_report', '1099': '1099', mortgage_statement: 'mortgage_statement',
          insurance_policy: 'insurance_policy', credit_counseling_certificate: 'credit_counseling_certificate',
          deed: 'deed', lease: 'lease', car_title: 'car_title', appraisal: 'appraisal',
          police_report: 'police_report', medical_bill: 'medical_bill',
          insurance_declaration: 'insurance_declaration',
        };
        const reclassified = claudeToDocType[claudeType];
        const finalDocType = reclassified && reclassified !== docType ? reclassified : docType;
        if (reclassified && reclassified !== docType) {
          db.prepare('UPDATE documents SET doc_type = ? WHERE id = ?').run(finalDocType, id);
        }

        populateCaseFromExtraction(caseId, finalDocType, extracted);
        populatePICaseFromExtraction(caseId, finalDocType, extracted);

        // Refresh bank intel when a statement lands.
        if (finalDocType === 'bank_statement' && Array.isArray(extracted.transactions) && extracted.transactions.length) {
          try {
            require('./main/bank-intel').analyzeCase(db, caseId);
          } catch (err) {
            console.error('[bank-intel] analyze failed:', err.message);
          }
        }

        logCaseEvent(caseId, 'document_extracted',
          `Extracted ${filename}${extracted._mock ? ' (mock)' : ''}`,
          { document_id: id, mock: !!extracted._mock, redaction_count: extracted._redactionCount || 0 }
        );

        const summary = summarizeExtraction(finalDocType, extracted);
        processed++;
        send({
          stage: 'done',
          index: i,
          total: validPaths.length,
          filename,
          docType: finalDocType,
          docId: id,
          summary,
          mock: !!extracted._mock,
          reclassified: reclassified && reclassified !== docType ? { from: docType, to: finalDocType } : null,
        });
      } catch (err) {
        failed++;
        console.error('processFiles failed for', filename, err);
        send({ stage: 'error', index: i, total: validPaths.length, filename, error: err.message });
      }
    }

    send({ stage: 'complete', caseId, total: validPaths.length, processed, failed });
    return { processed, failed };
  });

  // Delete a document — used when a drag-drop classifies wrong and the
  // attorney wants to remove the row + populated data is regenerated by
  // re-uploading. Only deletes the documents row + file; populated case
  // data (income, expenses, etc.) is left in place since other docs may
  // have contributed to the same rows.
  ipcMain.handle('documents:delete', (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return { success: false, reason: 'not found' };
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try { fs.unlinkSync(doc.file_path); } catch {}
    }
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
    return { success: true };
  });

  ipcMain.handle('documents:extract', async (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return null;

    const categoryMap = {
      // Bankruptcy
      'pay_stub': 'paystub',
      'tax_return': 'tax_return',
      'bank_statement': 'bank_statement',
      'credit_report': 'other',
      '1099': '1099',
      'mortgage_statement': 'mortgage_statement',
      'insurance_policy': 'insurance_policy',
      'credit_counseling_certificate': 'credit_counseling_certificate',
      'deed': 'deed',
      'lease': 'lease',
      'car_title': 'car_title',
      'appraisal': 'appraisal',
      // PI
      'police_report': 'police_report',
      'medical_bill': 'medical_bill',
      'insurance_declaration': 'insurance_declaration',
      'other': 'other',
    };
    const category = categoryMap[doc.doc_type] || 'other';

    const debtorContext = getDebtorContextForDoc(docId);

    let extracted;
    try {
      extracted = await extractWithClaude(doc.file_path, category, debtorContext);
    } catch (err) {
      console.error('Claude extraction failed, using mock:', err.message);
      extracted = mockExtract(doc.doc_type, doc.filename);
      extracted._mock = true;
    }

    db.prepare('UPDATE documents SET extracted_data = ? WHERE id = ?').run(JSON.stringify(extracted), docId);

    // Auto-populate case financial data from extraction
    // Auto-populate: run both bankruptcy and PI population functions.
    // Each one checks the doc type and only acts on relevant documents.
    populateCaseFromExtraction(doc.case_id, doc.doc_type, extracted);
    populatePICaseFromExtraction(doc.case_id, doc.doc_type, extracted);

    // Auto-run bank intelligence whenever a bank statement lands so
    // findings refresh without the attorney clicking re-analyze.
    if ((doc.doc_type === 'bank_statement' || extracted.type === 'bank_statement') && Array.isArray(extracted.transactions) && extracted.transactions.length) {
      try {
        require('./main/bank-intel').analyzeCase(db, doc.case_id);
      } catch (err) {
        console.error('[bank-intel] analyze failed:', err.message);
      }
    }

    logCaseEvent(doc.case_id, 'document_extracted',
      `Extracted ${doc.filename}${extracted._mock ? ' (mock)' : ''}`,
      { document_id: docId, mock: !!extracted._mock, redaction_count: extracted._redactionCount || 0 }
    );

    return extracted;
  });

  // Review flags
  ipcMain.handle('review-flags:list', (_, caseId) => {
    return db.prepare('SELECT * FROM review_flags WHERE case_id = ? ORDER BY created_at DESC').all(caseId);
  });

  ipcMain.handle('review-flags:create', (_, flag) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    db.prepare('INSERT INTO review_flags (id, case_id, section, field_path, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, flag.caseId, flag.section, flag.fieldPath || '', flag.note, new Date().toISOString());
    logCaseEvent(flag.caseId, 'review_flag_created',
      `Review flag added: ${flag.note}`,
      { flag_id: id, section: flag.section }
    );
    return { id };
  });

  ipcMain.handle('review-flags:resolve', (_, id) => {
    const flag = db.prepare('SELECT case_id, note FROM review_flags WHERE id = ?').get(id);
    db.prepare('UPDATE review_flags SET resolved = 1 WHERE id = ?').run(id);
    if (flag) {
      logCaseEvent(flag.case_id, 'review_flag_resolved',
        `Review flag resolved: ${flag.note}`,
        { flag_id: id }
      );
    }
    return { success: true };
  });

  // ─── Means Test ──────────────────────────────────────────────
  // Upload files for means test (returns file metadata, no DB storage)
  ipcMain.handle('means-test:upload-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }],
    });
    if (result.canceled) return [];
    return result.filePaths.map((fp) => ({
      path: fp,
      name: path.basename(fp),
      size: fs.statSync(fp).size,
      ext: path.extname(fp).toLowerCase(),
    }));
  });

  // Extract data from a single file using Claude (standalone means test, no case context)
  ipcMain.handle('means-test:extract', async (_, filePath, docCategory) => {
    // Standalone means test: no debtor context available, so debtor-specific PII
    // (names, addresses) won't be redacted — only pattern-based PII (SSN, account, etc.)
    return extractWithClaude(filePath, docCategory, {});
  });

  // Check if API key is configured
  ipcMain.handle('means-test:check-api-key', () => {
    return !!process.env.ANTHROPIC_API_KEY;
  });

  // ─── Timeline / Events ──────────────────────────────────────
  ipcMain.handle('events:list', (_, caseId) => {
    return db.prepare(`
      SELECT id, event_type, description, metadata, occurred_at
      FROM case_events
      WHERE case_id = ?
      ORDER BY occurred_at DESC
    `).all(caseId).map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));
  });

  // Firm-wide recent activity feed for the dashboard.
  ipcMain.handle('events:recent', (_, limit = 20) => {
    return db.prepare(`
      SELECT
        e.id, e.event_type, e.description, e.occurred_at,
        e.case_id,
        d.first_name, d.last_name,
        c.chapter, c.status
      FROM case_events e
      JOIN cases c ON c.id = e.case_id
      LEFT JOIN debtors d ON d.case_id = e.case_id AND d.is_joint = 0
      ORDER BY e.occurred_at DESC
      LIMIT ?
    `).all(limit);
  });

  // Stats for dashboard
  ipcMain.handle('stats:overview', () => {
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM cases').get().c,
      intake: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'intake'").get().c,
      inProgress: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'in_progress'").get().c,
      ready: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'ready'").get().c,
      filed: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'filed'").get().c,
      byPractice: db.prepare("SELECT practice_type, COUNT(*) as count FROM cases GROUP BY practice_type").all(),
    };
  });

  // ─── Case Notes CRUD ──────────────────────────────────────────
  ipcMain.handle('notes:list', (_, caseId) => {
    return db.prepare('SELECT * FROM case_notes WHERE case_id = ? ORDER BY created_at DESC').all(caseId);
  });

  ipcMain.handle('notes:create', (_, caseId, content) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO case_notes (id, case_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, caseId, content, now, now);
    logCaseEvent(caseId, 'note_added', 'Note added to case', { note_id: id });
    return { id };
  });

  ipcMain.handle('notes:update', (_, id, content) => {
    db.prepare('UPDATE case_notes SET content = ?, updated_at = ? WHERE id = ?').run(content, new Date().toISOString(), id);
    return { success: true };
  });

  ipcMain.handle('notes:delete', (_, id) => {
    db.prepare('DELETE FROM case_notes WHERE id = ?').run(id);
    return { success: true };
  });

  // ─── AI Case Assistant ─────────────────────────────────────────
  ipcMain.handle('ai:chat', async (_, caseId, userMessage) => {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();

    // Save user message
    db.prepare('INSERT INTO ai_conversations (id, case_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), caseId, 'user', userMessage, now);

    // Build case context
    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    const debtors = db.prepare('SELECT first_name, last_name, address_state, address_city FROM debtors WHERE case_id = ?').all(caseId);
    const creditors = db.prepare('SELECT name, debt_type, schedule, amount_claimed FROM creditors WHERE case_id = ?').all(caseId);
    const income = db.prepare('SELECT source, employer_name, gross_monthly, net_monthly FROM income WHERE case_id = ?').all(caseId);
    const expenses = db.prepare('SELECT category, description, monthly_amount FROM expenses WHERE case_id = ?').all(caseId);
    const assets = db.prepare('SELECT category, description, current_value, exemption_statute FROM assets WHERE case_id = ?').all(caseId);
    const notes = db.prepare('SELECT content FROM case_notes WHERE case_id = ? ORDER BY created_at DESC LIMIT 10').all(caseId);
    const history = db.prepare('SELECT role, content FROM ai_conversations WHERE case_id = ? ORDER BY created_at DESC LIMIT 20').all(caseId).reverse();

    // "What changed since last conversation" — find events after the last AI message
    const lastAiMsg = db.prepare('SELECT created_at FROM ai_conversations WHERE case_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1').get(caseId, 'assistant');
    let changesSummary = '';
    if (lastAiMsg) {
      const recentEvents = db.prepare('SELECT description FROM case_events WHERE case_id = ? AND occurred_at > ? ORDER BY occurred_at ASC LIMIT 10').all(caseId, lastAiMsg.created_at);
      if (recentEvents.length > 0) {
        changesSummary = `\n\nCHANGES SINCE LAST CONVERSATION:\n${recentEvents.map(e => `- ${e.description}`).join('\n')}`;
      }
    }

    const totalDebt = creditors.reduce((s, c) => s + (c.amount_claimed || 0), 0);
    const totalMonthlyIncome = income.reduce((s, i) => s + (i.gross_monthly || 0), 0);
    const totalMonthlyExpenses = expenses.reduce((s, e) => s + (e.monthly_amount || 0), 0);

    const practiceType = caseData?.practice_type || 'bankruptcy';

    let systemPrompt;
    if (practiceType === 'bankruptcy') {
      systemPrompt = `You are Tabula AI, a legal assistant specialized in consumer bankruptcy law. You are helping an attorney with a Chapter ${caseData?.chapter || 7} bankruptcy case.

CASE CONTEXT:
- Debtor: ${debtors.map(d => `${d.first_name} ${d.last_name} (${d.address_city}, ${d.address_state})`).join('; ') || 'Not set'}
- Chapter: ${caseData?.chapter || 7}
- District: ${caseData?.district || 'Not set'}
- Status: ${caseData?.status || 'intake'}
- Total Debt: $${totalDebt.toLocaleString()}
- Monthly Income: $${totalMonthlyIncome.toLocaleString()} gross
- Monthly Expenses: $${totalMonthlyExpenses.toLocaleString()}
- Disposable Income: $${(totalMonthlyIncome - totalMonthlyExpenses).toLocaleString()}/mo
- Creditors (${creditors.length}): ${creditors.map(c => `${c.name} ($${(c.amount_claimed||0).toLocaleString()}, Sch ${c.schedule})`).join(', ') || 'None'}
- Assets: ${assets.map(a => `${a.description} ($${(a.current_value||0).toLocaleString()})`).join(', ') || 'None'}
${notes.length > 0 ? `\nATTORNEY NOTES:\n${notes.map(n => `- ${n.content}`).join('\n')}` : ''}

You can help with:
1. Means test analysis and Chapter 7 vs 13 recommendations
2. Exemption planning (state-specific exemption statutes)
3. Identifying potential issues (fraudulent transfers, preference payments, non-dischargeable debts)
4. Creditor matrix review and schedule assignments
5. Filing strategy and timeline
6. Drafting attorney notes and memos

Be concise, specific to THIS case, and cite relevant bankruptcy code sections when applicable. If you identify a risk, flag it clearly.${changesSummary}`;
    } else if (practiceType === 'personal_injury') {
      const piDetails = db.prepare('SELECT * FROM pi_case_details WHERE case_id = ?').get(caseId);
      const medRecords = db.prepare('SELECT * FROM pi_medical_records WHERE case_id = ?').all(caseId);
      const settlements = db.prepare('SELECT * FROM pi_settlements WHERE case_id = ? ORDER BY date DESC').all(caseId);
      const statutes = db.prepare('SELECT * FROM pi_statutes WHERE case_id = ?').all(caseId);

      const totalMedBilled = medRecords.reduce((s, r) => s + (r.total_billed || 0), 0);
      const totalLiens = medRecords.filter(r => r.has_lien).reduce((s, r) => s + (r.lien_amount || 0), 0);

      systemPrompt = `You are Tabula AI, a legal assistant specialized in personal injury law. You are helping an attorney with a PI case.

CASE CONTEXT:
- Client: ${debtors.map(d => `${d.first_name} ${d.last_name} (${d.address_city}, ${d.address_state})`).join('; ') || 'Not set'}
- Status: ${caseData?.status || 'intake'}
- District: ${caseData?.district || 'Not set'}
${piDetails ? `
ACCIDENT DETAILS:
- Date: ${piDetails.accident_date || 'Not set'}
- Type: ${piDetails.accident_type || 'Not set'}
- Location: ${piDetails.accident_location || 'Not set'}
- Liability: ${piDetails.liability_assessment || 'Not assessed'}
- Comparative Fault: ${piDetails.comparative_fault_pct || 0}%
- At-Fault Party: ${piDetails.at_fault_party || 'Unknown'}

INSURANCE:
- Client Insurance: ${piDetails.insurance_company || 'Not set'} (Limit: $${(piDetails.insurance_coverage_limit || 0).toLocaleString()})
- At-Fault Insurance: ${piDetails.at_fault_insurance || 'Not set'} (Limit: $${(piDetails.at_fault_policy_limit || 0).toLocaleString()})
- UM/UIM: ${piDetails.um_uim_available ? `Available ($${(piDetails.um_uim_limit || 0).toLocaleString()})` : 'Not available'}
` : ''}
MEDICAL TREATMENT (${medRecords.length} providers):
- Total Billed: $${totalMedBilled.toLocaleString()}
- Outstanding Liens: $${totalLiens.toLocaleString()}
${medRecords.map(r => `- ${r.provider_name} (${r.provider_type || 'Unknown'}): $${(r.total_billed || 0).toLocaleString()} billed, ${r.total_visits || 0} visits, ${r.status}`).join('\n')}

${settlements.length > 0 ? `SETTLEMENT HISTORY:\n${settlements.map(s => `- ${s.date}: ${s.type} - $${(s.amount || 0).toLocaleString()} from ${s.from_party || 'unknown'}`).join('\n')}` : ''}

${statutes.length > 0 ? `DEADLINES:\n${statutes.map(s => `- ${s.statute_type}: ${s.deadline}${s.filed_date ? ' (FILED)' : ''}`).join('\n')}` : ''}
${notes.length > 0 ? `\nATTORNEY NOTES:\n${notes.map(n => `- ${n.content}`).join('\n')}` : ''}

You can help with:
1. Case valuation and settlement range analysis (using medical specials multiplier method)
2. Demand letter drafting with itemized damages
3. Medical record analysis and treatment gap identification
4. Liability analysis and comparative fault assessment
5. Lien identification, verification, and resolution strategies
6. Discovery planning and interrogatory preparation
7. Statute of limitations tracking and compliance
8. Insurance coverage analysis (stacking, UM/UIM, excess)
9. Settlement distribution calculations (fees, costs, liens, net to client)

Be concise, specific to THIS case, and cite relevant case law or statutes when applicable.${changesSummary}`;
    } else {
      systemPrompt = `You are Tabula AI, a legal assistant helping an attorney with a case.

CASE CONTEXT:
- Client: ${debtors.map(d => `${d.first_name} ${d.last_name}`).join('; ') || 'Not set'}
- Status: ${caseData?.status || 'intake'}
- District: ${caseData?.district || 'Not set'}
${notes.length > 0 ? `\nATTORNEY NOTES:\n${notes.map(n => `- ${n.content}`).join('\n')}` : ''}

Be concise, specific to THIS case, and help the attorney with analysis, drafting, research, and strategy.${changesSummary}`;
    }

    try {
      const client = getAnthropicClient();

      // Defense-in-depth: scrub SSN/account/phone/email/DOB/ITIN/routing/DL
      // out of user-typed text before it leaves the renderer. The LiteLLM
      // proxy's Presidio guardrail is the second line; this is the first.
      const debtorContext = {
        firstName: debtors[0]?.first_name,
        lastName: debtors[0]?.last_name,
        street: debtors[0]?.address_street,
      };
      let totalRedactions = 0;
      const messages = history.map(h => {
        if (h.role !== 'user') return { role: h.role, content: h.content };
        const { text, detections } = redactText(h.content, debtorContext);
        totalRedactions += detections.length;
        return { role: 'user', content: text };
      });
      const { text: redactedUser, detections: userDetections } = redactText(userMessage, debtorContext);
      totalRedactions += userDetections.length;
      messages.push({ role: 'user', content: redactedUser });

      if (totalRedactions > 0) {
        console.log(`[redaction] chat: ${totalRedactions} PII region(s) scrubbed before API call`);
      }

      const response = await client.messages.create({
        // Text-only LiteLLM alias (lower max_tokens, same upstream model).
        // Falls back to a direct Anthropic model id when the proxy is off.
        model: process.env.LITELLM_BASE_URL ? 'tabula-extract-text' : 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });

      const assistantMessage = response.content.find(b => b.type === 'text')?.text || 'I could not generate a response.';

      // Save assistant response
      db.prepare('INSERT INTO ai_conversations (id, case_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), caseId, 'assistant', assistantMessage, new Date().toISOString());

      return { message: assistantMessage, redactionCount: totalRedactions };
    } catch (err) {
      console.error('AI chat error:', err.message);
      return { message: `I'm unable to connect to the AI service right now. Error: ${err.message}`, error: true };
    }
  });

  ipcMain.handle('ai:history', (_, caseId) => {
    return db.prepare('SELECT role, content, created_at FROM ai_conversations WHERE case_id = ? ORDER BY created_at ASC').all(caseId);
  });

  ipcMain.handle('ai:clear', (_, caseId) => {
    db.prepare('DELETE FROM ai_conversations WHERE case_id = ?').run(caseId);
    return { success: true };
  });

  // ─── Practice Analytics ────────────────────────────────────────
  ipcMain.handle('analytics:upsert', (_, caseId, data) => {
    const { v4: uuid } = require('uuid');
    const existing = db.prepare('SELECT id FROM practice_analytics WHERE case_id = ?').get(caseId);
    const id = existing?.id || uuid();
    db.prepare(`INSERT OR REPLACE INTO practice_analytics (id, case_id, fee_amount, fee_type, hours_logged, filed_date, closed_date, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, data.feeAmount || 0, data.feeType || 'flat', data.hoursLogged || 0, data.filedDate || null, data.closedDate || null, data.outcome || null
    );
    return { id };
  });

  ipcMain.handle('analytics:get', (_, caseId) => {
    return db.prepare('SELECT * FROM practice_analytics WHERE case_id = ?').get(caseId) || null;
  });

  ipcMain.handle('analytics:firm-overview', () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    return {
      totalRevenue: db.prepare('SELECT COALESCE(SUM(fee_amount), 0) as total FROM practice_analytics').get().total,
      thisMonthRevenue: db.prepare("SELECT COALESCE(SUM(fee_amount), 0) as total FROM practice_analytics pa JOIN cases c ON c.id = pa.case_id WHERE c.created_at LIKE ?").get(`${thisMonth}%`).total,
      lastMonthRevenue: db.prepare("SELECT COALESCE(SUM(fee_amount), 0) as total FROM practice_analytics pa JOIN cases c ON c.id = pa.case_id WHERE c.created_at LIKE ?").get(`${lastMonthStr}%`).total,
      avgFee: db.prepare('SELECT COALESCE(AVG(fee_amount), 0) as avg FROM practice_analytics WHERE fee_amount > 0').get().avg,
      totalHours: db.prepare('SELECT COALESCE(SUM(hours_logged), 0) as total FROM practice_analytics').get().total,
      casesByPractice: db.prepare("SELECT practice_type, COUNT(*) as count FROM cases GROUP BY practice_type").all(),
      casesByMonth: db.prepare(`
        SELECT
          substr(created_at, 1, 7) as month,
          COUNT(*) as count,
          COALESCE(SUM(pa.fee_amount), 0) as revenue
        FROM cases c
        LEFT JOIN practice_analytics pa ON pa.case_id = c.id
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `).all(),
      casesByStatus: db.prepare("SELECT status, COUNT(*) as count FROM cases GROUP BY status").all(),
    };
  });

  // ─── Case Templates ────────────────────────────────────────────
  ipcMain.handle('templates:list', (_, practiceType) => {
    if (practiceType) {
      return db.prepare('SELECT * FROM case_templates WHERE practice_type = ? ORDER BY name').all(practiceType);
    }
    return db.prepare('SELECT * FROM case_templates ORDER BY practice_type, name').all();
  });

  ipcMain.handle('templates:create', (_, template) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    db.prepare('INSERT INTO case_templates (id, practice_type, name, description, template_data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, template.practiceType, template.name, template.description || '', JSON.stringify(template.data || {}), new Date().toISOString()
    );
    return { id };
  });

  // ─── PI Case Details ────────────────────────────────────────────
  ipcMain.handle('pi:details:get', (_, caseId) => {
    return db.prepare('SELECT * FROM pi_case_details WHERE case_id = ?').get(caseId) || null;
  });

  ipcMain.handle('pi:details:upsert', (_, caseId, data) => {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id, created_at FROM pi_case_details WHERE case_id = ?').get(caseId);
    const id = existing?.id || uuid();
    db.prepare(`INSERT OR REPLACE INTO pi_case_details (
      id, case_id, accident_date, accident_type, accident_location, accident_description,
      police_report_number, weather_conditions, liability_assessment, comparative_fault_pct,
      insurance_company, insurance_policy_number, insurance_adjuster, insurance_adjuster_phone,
      insurance_claim_number, insurance_coverage_limit, at_fault_party, at_fault_insurance,
      at_fault_policy_limit, um_uim_available, um_uim_limit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, data.accidentDate || null, data.accidentType || null, data.accidentLocation || null,
      data.accidentDescription || null, data.policeReportNumber || null, data.weatherConditions || null,
      data.liabilityAssessment || null, data.comparativeFaultPct || 0,
      data.insuranceCompany || null, data.insurancePolicyNumber || null,
      data.insuranceAdjuster || null, data.insuranceAdjusterPhone || null,
      data.insuranceClaimNumber || null, data.insuranceCoverageLimit || null,
      data.atFaultParty || null, data.atFaultInsurance || null, data.atFaultPolicyLimit || null,
      data.umUimAvailable ? 1 : 0, data.umUimLimit || null,
      existing ? existing.created_at || now : now, now
    );
    logCaseEvent(caseId, 'pi_details_updated', 'PI case details updated', { accident_type: data.accidentType });
    return { id };
  });

  // ─── PI Medical Records ─────────────────────────────────────────
  ipcMain.handle('pi:medical:list', (_, caseId) => {
    return db.prepare('SELECT * FROM pi_medical_records WHERE case_id = ? ORDER BY first_visit DESC').all(caseId);
  });

  ipcMain.handle('pi:medical:upsert', (_, caseId, record) => {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();
    const id = record.id || uuid();
    const isNew = !record.id;
    db.prepare(`INSERT OR REPLACE INTO pi_medical_records (
      id, case_id, provider_name, provider_type, treatment_type,
      first_visit, last_visit, total_visits, total_billed, total_paid,
      lien_amount, has_lien, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, record.providerName, record.providerType || null, record.treatmentType || null,
      record.firstVisit || null, record.lastVisit || null, record.totalVisits || 0,
      record.totalBilled || 0, record.totalPaid || 0,
      record.lienAmount || 0, record.hasLien ? 1 : 0, record.status || 'ongoing',
      record.notes || null, isNew ? now : (record.created_at || now), now
    );
    if (isNew) {
      logCaseEvent(caseId, 'medical_record_added', `Medical provider added: ${record.providerName}`,
        { provider: record.providerName, billed: record.totalBilled });
    }
    return { id };
  });

  ipcMain.handle('pi:medical:delete', (_, id) => {
    db.prepare('DELETE FROM pi_medical_records WHERE id = ?').run(id);
    return { success: true };
  });

  // ─── PI Settlements ─────────────────────────────────────────────
  ipcMain.handle('pi:settlements:list', (_, caseId) => {
    return db.prepare('SELECT * FROM pi_settlements WHERE case_id = ? ORDER BY date DESC').all(caseId);
  });

  ipcMain.handle('pi:settlements:create', (_, caseId, data) => {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();
    const id = uuid();
    db.prepare('INSERT INTO pi_settlements (id, case_id, date, type, from_party, amount, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, caseId, data.date, data.type, data.fromParty || null, data.amount, data.notes || null, now
    );
    logCaseEvent(caseId, 'settlement_entry', `${data.type}: $${(data.amount || 0).toLocaleString()} from ${data.fromParty || 'unknown'}`,
      { type: data.type, amount: data.amount });
    return { id };
  });

  ipcMain.handle('pi:settlements:delete', (_, id) => {
    db.prepare('DELETE FROM pi_settlements WHERE id = ?').run(id);
    return { success: true };
  });

  // ─── PI Statutes ────────────────────────────────────────────────
  ipcMain.handle('pi:statutes:list', (_, caseId) => {
    return db.prepare('SELECT * FROM pi_statutes WHERE case_id = ? ORDER BY deadline ASC').all(caseId);
  });

  ipcMain.handle('pi:statutes:upsert', (_, caseId, data) => {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();
    const id = data.id || uuid();
    db.prepare('INSERT OR REPLACE INTO pi_statutes (id, case_id, statute_type, jurisdiction, deadline, filed_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, caseId, data.statuteType, data.jurisdiction || null, data.deadline, data.filedDate || null, data.notes || null, now
    );
    return { id };
  });

  ipcMain.handle('pi:statutes:delete', (_, id) => {
    db.prepare('DELETE FROM pi_statutes WHERE id = ?').run(id);
    return { success: true };
  });

  // Petition / filing-packet generation handlers.
  require('./main/petition').registerIPC({ ipcMain, db, app, logCaseEvent });

  // Bank intelligence handlers.
  require('./main/bank-intel').registerIPC({ ipcMain, db, logCaseEvent });
}

function guessDocType(filename) {
  const lower = filename.toLowerCase();
  // Bankruptcy doc types — order matters: more specific patterns first.
  if (lower.includes('1099')) return '1099';
  if (lower.includes('w2') || lower.includes('w-2')) return 'tax_return';
  if (lower.includes('tax') || lower.includes('1040')) return 'tax_return';
  if (lower.includes('pay') || lower.includes('stub') || lower.includes('earnings')) return 'pay_stub';
  if (
    lower.includes('mortgage') || lower.includes('escrow') || lower.includes('heloc') ||
    lower.includes('home loan') || lower.includes('homeloan')
  ) return 'mortgage_statement';
  if (lower.includes('credit') && (lower.includes('counsel') || lower.includes('certificate') || lower.includes('109h'))) {
    return 'credit_counseling_certificate';
  }
  if (lower.includes('bank') || lower.includes('statement') || lower.includes('chase') || lower.includes('wells') || lower.includes('boa')) return 'bank_statement';
  if (lower.includes('credit') || lower.includes('equifax') || lower.includes('experian') || lower.includes('transunion')) return 'credit_report';
  if (
    lower.includes('deed') || lower.includes('warranty') || lower.includes('quitclaim') ||
    lower.includes('grant_deed') || lower.includes('granddeed')
  ) return 'deed';
  if (
    lower.includes('lease') || lower.includes('rental_agreement') || lower.includes('rentalagreement') ||
    lower.includes('tenancy')
  ) return 'lease';
  if (
    lower.includes('title') || lower.includes('vin') || lower.includes('certificate of title') ||
    lower.includes('vehicle_reg') || lower.includes('car_title')
  ) return 'car_title';
  if (
    lower.includes('appraisal') || lower.includes('valuation_report') ||
    lower.includes('bpo') || lower.includes('cma')
  ) return 'appraisal';
  // PI doc types
  if (lower.includes('police') || lower.includes('accident_report') || lower.includes('crash') || lower.includes('incident')) return 'police_report';
  if (lower.includes('medical') || lower.includes('hospital') || lower.includes('bill') || lower.includes('invoice') || lower.includes('eob') || lower.includes('treatment')) return 'medical_bill';
  // Insurance: prefer the bankruptcy-flavored insurance_policy unless this
  // is clearly a PI auto-coverage declaration.
  if (lower.includes('insurance') || lower.includes('policy')) {
    if (lower.includes('auto') || lower.includes('liability') || lower.includes('claim')) return 'insurance_declaration';
    return 'insurance_policy';
  }
  if (lower.includes('declaration') || lower.includes('coverage')) return 'insurance_declaration';
  return 'other';
}

function mockExtract(docType, filename) {
  switch (docType) {
    case 'pay_stub':
      return {
        type: 'pay_stub', employer: 'Acme Industries LLC', payPeriod: '03/01/2026 - 03/15/2026',
        grossPay: 2109.00, federalTax: 253.08, stateTax: 0, socialSecurity: 130.76,
        medicare: 30.58, healthInsurance: 187.50, retirement401k: 105.45, netPay: 1401.63,
        ytdGross: 12654.00, payFrequency: 'biweekly'
      };
    case 'tax_return':
      return {
        type: 'tax_return', filingStatus: 'Single', taxYear: 2025,
        wagesIncome: 50616.00, interestIncome: 42.00, totalIncome: 50658.00,
        agi: 50658.00, standardDeduction: 15700.00, taxableIncome: 34958.00,
        totalTax: 4007.00, dependents: 1
      };
    case 'bank_statement':
      return {
        type: 'bank_statement', bank: 'Chase', accountType: 'Checking',
        accountLast4: '4821', statementPeriod: '03/01/2026 - 03/31/2026',
        openingBalance: 1847.22, closingBalance: 923.45,
        totalDeposits: 4218.00, totalWithdrawals: 5141.77,
        monthlyExpenses: { rent: 1450, utilities: 187, groceries: 412, gas: 156, insurance: 225, subscriptions: 87 }
      };
    case 'credit_report':
      return {
        type: 'credit_report', bureau: 'Equifax', pullDate: '2026-04-09',
        creditScore: 512,
        accounts: [
          { creditor: 'Capital One', accountNum: '****3847', balance: 4230.00, status: 'Collections', type: 'Credit Card' },
          { creditor: 'Discover Financial', accountNum: '****9912', balance: 7845.00, status: '90+ Days Late', type: 'Credit Card' },
          { creditor: 'Synchrony Bank', accountNum: '****2201', balance: 2100.00, status: 'Collections', type: 'Store Card' },
          { creditor: 'LVNV Funding', accountNum: '****5567', balance: 3420.00, status: 'Collections', type: 'Purchased Debt' },
          { creditor: 'Midland Credit Mgmt', accountNum: '****8834', balance: 1890.00, status: 'Collections', type: 'Purchased Debt' },
          { creditor: 'Portfolio Recovery', accountNum: '****1122', balance: 5670.00, status: 'Collections', type: 'Purchased Debt' },
          { creditor: 'Wells Fargo Auto', accountNum: '****7743', balance: 12400.00, status: 'Current', type: 'Auto Loan', collateral: '2019 Honda Civic' },
          { creditor: 'Navient', accountNum: '****3390', balance: 24500.00, status: 'Deferred', type: 'Student Loan' },
        ]
      };
    default:
      return { type: 'unknown', note: 'Document type not recognized. Please classify manually.' };
  }
}

// ─── Menu ─────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Tabula',
      submenu: [
        { role: 'about', label: 'About Tabula' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Tabula' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Tabula' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Case', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('navigate', '/cases/new') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' }, { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ────────────────────────────────────────────
app.setName('Tabula');

app.whenReady().then(() => {
  initDatabase();
  registerIPC();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  try {
    const { shutdown } = require('./main/redaction');
    await shutdown();
  } catch {}
});
