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

  // ─── Means Test v1: provenance-graph tables ───────────────────
  // Receipt-level income for statutory 6-month CMI averaging.
  // (See docs/MEANS-TEST-V1-DESIGN.md §4.1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_receipts (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      source_page INTEGER,
      pay_date TEXT NOT NULL,
      pay_period_start TEXT,
      pay_period_end TEXT,
      gross_amount REAL NOT NULL,
      source_label TEXT,
      income_type TEXT,
      manual_entry INTEGER NOT NULL DEFAULT 0,
      entered_by TEXT,
      entered_at TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_income_receipts_case_date
      ON income_receipts(case_id, pay_date DESC);

    CREATE TABLE IF NOT EXISTS tax_withholdings (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL REFERENCES income_receipts(id) ON DELETE CASCADE,
      withholding_type TEXT NOT NULL,
      amount REAL NOT NULL,
      label TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_withholdings_receipt
      ON tax_withholdings(receipt_id);

    CREATE TABLE IF NOT EXISTS irs_standard_refs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      b122a_line TEXT NOT NULL,
      table_name TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      county_fips TEXT,
      state_code TEXT,
      household_size INTEGER,
      amount REAL NOT NULL,
      source_url TEXT
    );

    CREATE TABLE IF NOT EXISTS manual_deductions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      b122a_line TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      monthly_amount REAL NOT NULL,
      supporting_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      entered_by TEXT,
      entered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS means_test_runs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      run_at TEXT NOT NULL,
      cmi REAL,
      median_income REAL,
      household_size INTEGER,
      state_code TEXT,
      county_fips TEXT,
      result TEXT,
      computed_json TEXT,
      unhandled_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_means_test_runs_case
      ON means_test_runs(case_id, run_at DESC);
  `);

  // documents: optional date-range columns for "all receipts inside the
  // 6-month window" queries on multi-page bundles.
  const docCols = db.prepare("PRAGMA table_info(documents)").all().map(c => c.name);
  if (!docCols.includes('effective_date_range_start')) {
    db.prepare("ALTER TABLE documents ADD COLUMN effective_date_range_start TEXT").run();
  }
  if (!docCols.includes('effective_date_range_end')) {
    db.prepare("ALTER TABLE documents ADD COLUMN effective_date_range_end TEXT").run();
  }

  // ─── Plaid integration tables ──────────────────────────────────
  // One row per (case, bank-connection). access_token is encrypted
  // at rest via Electron safeStorage (see src/main/plaid/index.js).
  db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      plaid_item_id TEXT NOT NULL,
      access_token_encrypted BLOB NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      cursor TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      consent_at TEXT NOT NULL,
      last_synced_at TEXT,
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_plaid_items_case
      ON plaid_items(case_id, status);

    CREATE TABLE IF NOT EXISTS plaid_accounts (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
      plaid_account_id TEXT NOT NULL UNIQUE,
      name TEXT,
      official_name TEXT,
      type TEXT,
      subtype TEXT,
      mask TEXT,
      current_balance REAL,
      available_balance REAL
    );
    CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item
      ON plaid_accounts(item_id);

    CREATE TABLE IF NOT EXISTS plaid_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES plaid_accounts(id) ON DELETE CASCADE,
      plaid_transaction_id TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      authorized_date TEXT,
      amount REAL NOT NULL,
      iso_currency_code TEXT,
      name TEXT,
      merchant_name TEXT,
      pending INTEGER DEFAULT 0,
      category_primary TEXT,
      category_detailed TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_plaid_txns_account_date
      ON plaid_transactions(account_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_plaid_txns_category
      ON plaid_transactions(category_primary);
  `);

  // Citation columns for accepted Plaid drafts. Both nullable — only
  // populated when the row was accepted from a Plaid draft, not from
  // a paystub PDF or manual entry. The provenance graph reads these
  // to surface plaid_transaction citations alongside document_page
  // and irs_standard.
  const incReceiptCols = db.prepare("PRAGMA table_info(income_receipts)").all().map(c => c.name);
  if (!incReceiptCols.includes('plaid_transaction_id')) {
    db.prepare("ALTER TABLE income_receipts ADD COLUMN plaid_transaction_id TEXT").run();
  }
  const manualDedCols = db.prepare("PRAGMA table_info(manual_deductions)").all().map(c => c.name);
  if (!manualDedCols.includes('source_plaid_transactions')) {
    db.prepare("ALTER TABLE manual_deductions ADD COLUMN source_plaid_transactions TEXT").run();
  }
  if (!manualDedCols.includes('source_count')) {
    db.prepare("ALTER TABLE manual_deductions ADD COLUMN source_count INTEGER DEFAULT 0").run();
  }

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
    }
  }
}

// ─── Means Test: Anthropic Extraction (via LiteLLM proxy + local redaction) ──
const Anthropic = require('@anthropic-ai/sdk').default;
const { redactForExtraction, cleanup: redactionCleanup } = require('./main/redaction');

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

This document may contain ONE OR MULTIPLE paystubs (e.g. a 6-month bundle).
Return an ARRAY of paystub objects, one per pay date detected. Each entry
maps to a single payroll receipt and must include its source PDF page.

For Means Test (11 U.S.C. § 101(10A)) we need every individual receipt with
its pay_date — DO NOT pre-aggregate or annualize.

Format:
{
  "type": "paystub",
  "stubs": [
    {
      "employer": "employer name",
      "pay_period_start": "YYYY-MM-DD",
      "pay_period_end":   "YYYY-MM-DD",
      "pay_date":         "YYYY-MM-DD",
      "pay_frequency":    "weekly|biweekly|semimonthly|monthly",
      "gross_pay":        0.00,
      "net_pay":          0.00,
      "ytd_gross":        0.00,
      "ytd_net":          0.00,
      "source_pdf_page":  1,
      "withholdings": [
        { "type": "fed_income", "amount": 0.00, "label": "Federal Income Tax" },
        { "type": "fica",       "amount": 0.00, "label": "Social Security" },
        { "type": "medicare",   "amount": 0.00, "label": "Medicare" },
        { "type": "state",      "amount": 0.00, "label": "State Withholding" },
        { "type": "local",      "amount": 0.00, "label": "City/Local Tax" },
        { "type": "garnishment","amount": 0.00, "label": "verbatim line label" }
      ],
      "voluntary_deductions": [
        { "type": "401k",            "amount": 0.00 },
        { "type": "health_insurance","amount": 0.00 },
        { "type": "dental",          "amount": 0.00 },
        { "type": "life_insurance",  "amount": 0.00 }
      ],
      "confidence": "high|medium|low"
    }
  ]
}

Rules:
- One object per stub. If the PDF has 12 stubs, return 12 entries.
- Only include withholding/voluntary_deductions lines that actually appear.
- pay_date is REQUIRED. Without it the receipt cannot be used for CMI.
- Use ISO dates (YYYY-MM-DD) — never MM/DD/YYYY.
- "garnishment" type captures court-ordered support, child support, levies.`;

    case 'bank_statement':
      return `${baseInstruction}

Extract from this bank statement:
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

    default:
      return `${baseInstruction}

Extract all financial data you can find. Categorize the document and return structured JSON with:
{
  "type": "other",
  "documentCategory": "description of what this document is",
  "financialData": { ... any relevant financial figures ... },
  "notes": "any important observations"
}`;
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

// ─── Auto-populate case data from extraction ─────────────────
function legacyStubAsReceipt(legacy) {
  // Map the old { grossPay, payFrequency, ... } shape into a single receipt
  // anchored to today so existing tests / fixtures keep passing.
  return {
    employer: legacy.employer || 'Employment',
    pay_date: legacy.payDate || new Date().toISOString().slice(0, 10),
    pay_period_start: null,
    pay_period_end: null,
    pay_frequency: (legacy.payFrequency || 'biweekly').toLowerCase(),
    gross_pay: Number(legacy.grossPay) || 0,
    net_pay:   Number(legacy.netPay)   || 0,
    ytd_gross: Number(legacy.ytdGross) || null,
    source_pdf_page: 1,
    withholdings: [
      legacy.federalTax     != null ? { type: 'fed_income', amount: legacy.federalTax,     label: 'Federal Income Tax' } : null,
      legacy.stateTax       != null ? { type: 'state',      amount: legacy.stateTax,       label: 'State Withholding' } : null,
      legacy.socialSecurity != null ? { type: 'fica',       amount: legacy.socialSecurity, label: 'Social Security' } : null,
      legacy.medicare       != null ? { type: 'medicare',   amount: legacy.medicare,       label: 'Medicare' } : null,
      legacy.garnishments   != null ? { type: 'garnishment',amount: legacy.garnishments,   label: 'Garnishment' } : null,
    ].filter(Boolean),
    voluntary_deductions: [
      legacy.healthInsurance != null ? { type: 'health_insurance', amount: legacy.healthInsurance } : null,
      legacy.retirement401k  != null ? { type: '401k',             amount: legacy.retirement401k } : null,
    ].filter(Boolean),
  };
}

function monthsBetween(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const s = new Date(startISO), e = new Date(endISO);
  if (isNaN(s) || isNaN(e)) return null;
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  return Math.max(1, months);
}

// For paystubs, the new design returns an array of receipts with their
// own withholdings — we write each receipt individually so the means test
// can compute statutory CMI from the 6-month receipt window.
function populateCaseFromExtraction(caseId, docType, extracted, documentId = null) {
  const { v4: uuid } = require('uuid');

  if (docType === 'pay_stub' || extracted.type === 'paystub') {
    // New shape: { type: 'paystub', stubs: [...] }
    // Legacy shape: { type: 'paystub', grossPay, payFrequency, ... }  ← keep working
    const stubs = Array.isArray(extracted.stubs) ? extracted.stubs : [legacyStubAsReceipt(extracted)];
    let earliest = null;
    let latest = null;

    for (const stub of stubs) {
      if (!stub || !stub.pay_date) continue;
      const receiptId = uuid();
      db.prepare(`
        INSERT INTO income_receipts (
          id, case_id, document_id, source_page,
          pay_date, pay_period_start, pay_period_end,
          gross_amount, source_label, income_type,
          manual_entry, entered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        receiptId, caseId, documentId, stub.source_pdf_page || null,
        stub.pay_date, stub.pay_period_start || null, stub.pay_period_end || null,
        Number(stub.gross_pay) || 0,
        stub.employer || 'Employment',
        'wages',
        new Date().toISOString()
      );

      // Withholdings
      const withholdings = [
        ...(stub.withholdings || []),
        ...(stub.voluntary_deductions || []).map(v => ({ ...v, _voluntary: true })),
      ];
      for (const w of withholdings) {
        const amt = Number(w.amount) || 0;
        if (!amt) continue;
        db.prepare(`
          INSERT INTO tax_withholdings (id, receipt_id, withholding_type, amount, label)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuid(), receiptId, w.type || 'other', amt, w.label || null);
      }

      if (!earliest || stub.pay_date < earliest) earliest = stub.pay_date;
      if (!latest   || stub.pay_date > latest)   latest   = stub.pay_date;
    }

    // Stamp the document's effective date range so we can find "all
    // receipts inside the 6-month window" in subsequent queries.
    if (documentId && earliest) {
      db.prepare(`
        UPDATE documents
        SET effective_date_range_start = ?, effective_date_range_end = ?
        WHERE id = ?
      `).run(earliest, latest, documentId);
    }

    // Backward compatibility: keep an aggregated row in `income` so the
    // existing UI continues to render until the unified workspace ships.
    if (stubs.length > 0) {
      const totalGross = stubs.reduce((s, x) => s + (Number(x.gross_pay) || 0), 0);
      const totalNet   = stubs.reduce((s, x) => s + (Number(x.net_pay)   || 0), 0);
      const months = Math.max(1, monthsBetween(earliest, latest) || 1);
      const employer = stubs[0].employer || 'Employment';
      const frequency = stubs[0].pay_frequency || 'biweekly';
      db.prepare(`
        INSERT INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(), caseId, 'Employment', employer,
        Math.round((totalGross / months) * 100) / 100,
        Math.round((totalNet   / months) * 100) / 100,
        frequency
      );
    }
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

  // ─── Means Test v1: provenance-graph IPC ────────────────────
  ipcMain.handle('meansTest:listReceipts', (_, caseId) => {
    const receipts = db.prepare(`
      SELECT r.*, d.filename AS document_filename
      FROM income_receipts r
      LEFT JOIN documents d ON d.id = r.document_id
      WHERE r.case_id = ?
      ORDER BY r.pay_date DESC
    `).all(caseId);
    const ids = receipts.map(r => r.id);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const wh = db.prepare(`
      SELECT * FROM tax_withholdings WHERE receipt_id IN (${placeholders})
    `).all(...ids);
    const byReceipt = new Map();
    for (const w of wh) {
      if (!byReceipt.has(w.receipt_id)) byReceipt.set(w.receipt_id, []);
      byReceipt.get(w.receipt_id).push(w);
    }
    return receipts.map(r => ({ ...r, withholdings: byReceipt.get(r.id) || [] }));
  });

  ipcMain.handle('meansTest:upsertReceipt', (_, caseId, receipt) => {
    const { v4: uuid } = require('uuid');
    const id = receipt.id || uuid();
    db.prepare(`
      INSERT OR REPLACE INTO income_receipts (
        id, case_id, document_id, source_page,
        pay_date, pay_period_start, pay_period_end,
        gross_amount, source_label, income_type,
        manual_entry, entered_by, entered_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, caseId, receipt.document_id || null, receipt.source_page || null,
      receipt.pay_date, receipt.pay_period_start || null, receipt.pay_period_end || null,
      Number(receipt.gross_amount) || 0,
      receipt.source_label || null,
      receipt.income_type || 'wages',
      receipt.manual_entry ? 1 : 0,
      receipt.entered_by || 'attorney',
      new Date().toISOString(),
      receipt.notes || null
    );
    return { id };
  });

  ipcMain.handle('meansTest:deleteReceipt', (_, id) => {
    db.prepare('DELETE FROM income_receipts WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('meansTest:listManualDeductions', (_, caseId) => {
    return db.prepare(`SELECT * FROM manual_deductions WHERE case_id = ? ORDER BY entered_at DESC`).all(caseId);
  });

  ipcMain.handle('meansTest:upsertManualDeduction', (_, caseId, ded) => {
    const { v4: uuid } = require('uuid');
    const id = ded.id || uuid();
    db.prepare(`
      INSERT OR REPLACE INTO manual_deductions (
        id, case_id, b122a_line, category, description,
        monthly_amount, supporting_doc_id, entered_by, entered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, caseId, ded.b122a_line, ded.category,
      ded.description || null,
      Number(ded.monthly_amount) || 0,
      ded.supporting_doc_id || null,
      ded.entered_by || 'attorney',
      new Date().toISOString()
    );
    return { id };
  });

  ipcMain.handle('meansTest:deleteManualDeduction', (_, id) => {
    db.prepare('DELETE FROM manual_deductions WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('meansTest:saveRun', (_, caseId, runData) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    db.prepare(`
      INSERT INTO means_test_runs (
        id, case_id, run_at, cmi, median_income, household_size,
        state_code, county_fips, result, computed_json, unhandled_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, caseId, new Date().toISOString(),
      runData.cmi ?? null, runData.median_income ?? null, runData.household_size ?? null,
      runData.state_code || null, runData.county_fips || null,
      runData.result || null,
      JSON.stringify(runData.computed || {}),
      JSON.stringify(runData.unhandled || [])
    );
    logCaseEvent(caseId, 'means_test_run',
      `Means test computed: ${runData.result || 'pending'}`,
      { run_id: id, cmi: runData.cmi, result: runData.result });
    return { id };
  });

  ipcMain.handle('meansTest:listRuns', (_, caseId) => {
    return db.prepare(`SELECT * FROM means_test_runs WHERE case_id = ? ORDER BY run_at DESC`).all(caseId);
  });

  ipcMain.handle('meansTest:exportAuditPacket', async (_, caseId, runId) => {
    const { generateAuditPacket } = require('./main/exports/audit-packet.js');
    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    const debtor   = db.prepare('SELECT * FROM debtors WHERE case_id = ? AND is_joint = 0 LIMIT 1').get(caseId);
    const run      = runId
      ? db.prepare('SELECT * FROM means_test_runs WHERE id = ?').get(runId)
      : db.prepare('SELECT * FROM means_test_runs WHERE case_id = ? ORDER BY run_at DESC LIMIT 1').get(caseId);
    if (!run) throw new Error('No means test run found for this case. Run a means test first.');

    const receipts = db.prepare(`
      SELECT r.*, d.filename AS document_filename
      FROM income_receipts r
      LEFT JOIN documents d ON d.id = r.document_id
      WHERE r.case_id = ?
      ORDER BY r.pay_date ASC
    `).all(caseId);
    const manualDeductions = db.prepare(`SELECT * FROM manual_deductions WHERE case_id = ?`).all(caseId);

    const buf = await generateAuditPacket({ caseId, caseData, debtor, run, receipts, manualDeductions });

    const { dialog } = require('electron');
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Means Test Audit Packet',
      defaultPath: `audit-packet-${(debtor?.last_name || 'case')}-${run.run_at.slice(0,10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, buf);
    logCaseEvent(caseId, 'audit_packet_exported',
      `Means test audit packet exported`,
      { run_id: run.id, file_path: filePath });
    return { filePath };
  });

  ipcMain.handle('meansTest:exportB122A', async (_, caseId, runId) => {
    const { generateB122A } = require('./main/exports/b122a-export.js');
    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    const debtor   = db.prepare('SELECT * FROM debtors WHERE case_id = ? AND is_joint = 0 LIMIT 1').get(caseId);
    const run      = runId
      ? db.prepare('SELECT * FROM means_test_runs WHERE id = ?').get(runId)
      : db.prepare('SELECT * FROM means_test_runs WHERE case_id = ? ORDER BY run_at DESC LIMIT 1').get(caseId);
    if (!run) throw new Error('No means test run found for this case. Run a means test first.');

    const receipts = db.prepare(`
      SELECT r.*, d.filename AS document_filename
      FROM income_receipts r
      LEFT JOIN documents d ON d.id = r.document_id
      WHERE r.case_id = ?
      ORDER BY r.pay_date ASC
    `).all(caseId);
    const manualDeductions = db.prepare(`SELECT * FROM manual_deductions WHERE case_id = ?`).all(caseId);

    const buf = await generateB122A({ caseData, debtor, run, receipts, manualDeductions });

    const { dialog } = require('electron');
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Form B122A (working copy)',
      defaultPath: `B122A-${(debtor?.last_name || 'case')}-${run.run_at.slice(0,10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, buf);
    logCaseEvent(caseId, 'b122a_exported',
      `Form B122A working copy exported`,
      { run_id: run.id, file_path: filePath });
    return { filePath };
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

  ipcMain.handle('documents:extract', async (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return null;

    const categoryMap = {
      // Bankruptcy
      'pay_stub': 'paystub',
      'tax_return': 'tax_return',
      'bank_statement': 'bank_statement',
      'credit_report': 'other',
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
    populateCaseFromExtraction(doc.case_id, doc.doc_type, extracted, docId);
    populatePICaseFromExtraction(doc.case_id, doc.doc_type, extracted);

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

      const messages = history.map(h => ({ role: h.role, content: h.content }));
      messages.push({ role: 'user', content: userMessage });

      const response = await client.messages.create({
        model: process.env.LITELLM_BASE_URL ? 'tabula-extract' : 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });

      const assistantMessage = response.content.find(b => b.type === 'text')?.text || 'I could not generate a response.';

      // Save assistant response
      db.prepare('INSERT INTO ai_conversations (id, case_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), caseId, 'assistant', assistantMessage, new Date().toISOString());

      return { message: assistantMessage };
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

  // ─── Plaid integration IPC ─────────────────────────────────────
  // The renderer never sees an access_token. Every operation that
  // touches the live Plaid client runs in this process.
  const plaid = require('./main/plaid');

  ipcMain.handle('plaid:isConfigured', () => {
    return { configured: plaid.isConfigured() };
  });

  ipcMain.handle('plaid:createLinkToken', async (_, caseId) => {
    try {
      const link_token = await plaid.createLinkToken({ caseId });
      return { link_token };
    } catch (err) {
      console.error('[plaid] createLinkToken failed:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('plaid:exchangeToken', async (_, caseId, publicToken, metadata) => {
    try {
      const result = await plaid.exchangePublicToken({ db, caseId, publicToken, metadata });
      logCaseEvent(caseId, 'plaid_connected',
        `Connected to ${result.institutionName} (${result.accountCount} account${result.accountCount === 1 ? '' : 's'})`,
        { item_id: result.itemId, institution: result.institutionName });
      return result;
    } catch (err) {
      console.error('[plaid] exchangeToken failed:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('plaid:listForCase', (_, caseId) => {
    return plaid.listForCase({ db, caseId });
  });

  ipcMain.handle('plaid:syncTransactions', async (_, itemRowId) => {
    try {
      const item = db.prepare('SELECT case_id FROM plaid_items WHERE id = ?').get(itemRowId);
      const result = await plaid.syncItemTransactions({ db, itemRowId });
      if (item) {
        logCaseEvent(item.case_id, 'plaid_synced',
          `Plaid sync: +${result.added} added, ${result.modified} modified, ${result.removed} removed`,
          { item_id: itemRowId, ...result });
      }
      return result;
    } catch (err) {
      console.error('[plaid] sync failed:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('plaid:disconnectItem', async (_, itemRowId) => {
    try {
      const item = db.prepare('SELECT case_id, institution_name FROM plaid_items WHERE id = ?').get(itemRowId);
      const result = await plaid.disconnectItem({ db, itemRowId });
      if (item) {
        logCaseEvent(item.case_id, 'plaid_disconnected',
          `Disconnected from ${item.institution_name}`, { item_id: itemRowId });
      }
      return result;
    } catch (err) {
      console.error('[plaid] disconnect failed:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('plaid:detectIncome', (_, caseId, windowStart, windowEnd) => {
    const { detectIncomeReceipts } = require('./main/plaid/income-detector');
    return detectIncomeReceipts({ db, caseId, windowStart, windowEnd });
  });

  ipcMain.handle('plaid:classifyExpenses', (_, caseId, windowStart, windowEnd) => {
    const { classifyExpenses } = require('./main/plaid/expense-classifier');
    return classifyExpenses({ db, caseId, windowStart, windowEnd });
  });
}

function guessDocType(filename) {
  const lower = filename.toLowerCase();
  // Bankruptcy doc types
  if (lower.includes('w2') || lower.includes('w-2')) return 'tax_return';
  if (lower.includes('tax') || lower.includes('1040')) return 'tax_return';
  if (lower.includes('pay') || lower.includes('stub') || lower.includes('earnings')) return 'pay_stub';
  if (lower.includes('bank') || lower.includes('statement') || lower.includes('chase') || lower.includes('wells') || lower.includes('boa')) return 'bank_statement';
  if (lower.includes('credit') || lower.includes('equifax') || lower.includes('experian') || lower.includes('transunion')) return 'credit_report';
  // PI doc types
  if (lower.includes('police') || lower.includes('accident_report') || lower.includes('crash') || lower.includes('incident')) return 'police_report';
  if (lower.includes('medical') || lower.includes('hospital') || lower.includes('bill') || lower.includes('invoice') || lower.includes('eob') || lower.includes('treatment')) return 'medical_bill';
  if (lower.includes('insurance') || lower.includes('declaration') || lower.includes('policy') || lower.includes('coverage') || lower.includes('claim')) return 'insurance_declaration';
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
