const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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
  `);

  seedDemoData();
}

function seedDemoData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM cases').get();
  if (count.c > 0) return;

  const { v4: uuid } = require('uuid');
  const now = new Date().toISOString();

  const cases = [
    { id: uuid(), status: 'intake', chapter: 7, district: 'E.D. Texas', name: ['Marcus', 'Johnson'], created: '2026-04-01' },
    { id: uuid(), status: 'in_progress', chapter: 7, district: 'S.D. Florida', name: ['Sarah', 'Chen'], created: '2026-03-28' },
    { id: uuid(), status: 'in_progress', chapter: 13, district: 'N.D. Ohio', name: ['Robert', 'Williams'], created: '2026-03-25' },
    { id: uuid(), status: 'ready', chapter: 7, district: 'W.D. Washington', name: ['Maria', 'Garcia'], created: '2026-03-20' },
    { id: uuid(), status: 'filed', chapter: 7, district: 'C.D. California', name: ['James', 'Thompson'], created: '2026-03-10' },
    { id: uuid(), status: 'intake', chapter: 7, district: 'M.D. Tennessee', name: ['Linda', 'Davis'], created: '2026-04-05' },
    { id: uuid(), status: 'in_progress', chapter: 7, district: 'E.D. Texas', name: ['David', 'Martinez'], created: '2026-03-30' },
  ];

  const insertCase = db.prepare('INSERT INTO cases (id, status, chapter, district, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertDebtor = db.prepare('INSERT INTO debtors (id, case_id, first_name, last_name, address_state, address_city) VALUES (?, ?, ?, ?, ?, ?)');

  const states = { 'E.D. Texas': 'TX', 'S.D. Florida': 'FL', 'N.D. Ohio': 'OH', 'W.D. Washington': 'WA', 'C.D. California': 'CA', 'M.D. Tennessee': 'TN' };
  const cities = { TX: 'Houston', FL: 'Miami', OH: 'Cleveland', WA: 'Seattle', CA: 'Los Angeles', TN: 'Nashville' };

  for (const c of cases) {
    const st = states[c.district] || 'TX';
    insertCase.run(c.id, c.status, c.chapter, c.district, c.created + 'T00:00:00Z', now);
    insertDebtor.run(uuid(), c.id, c.name[0], c.name[1], st, cities[st] || 'Dallas');
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────
function registerIPC() {
  // Cases
  ipcMain.handle('cases:list', (_, filters) => {
    let query = `
      SELECT c.*, d.first_name, d.last_name, d.address_state
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
    return db.prepare(query).all(...params);
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
    return c;
  });

  ipcMain.handle('cases:create', (_, data) => {
    const { v4: uuid } = require('uuid');
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO cases (id, chapter, district, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, data.chapter || 7, data.district || '', 'intake', now, now);
    if (data.debtor) {
      db.prepare('INSERT INTO debtors (id, case_id, first_name, last_name, ssn, dob, address_street, address_city, address_state, address_zip, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuid(), id, data.debtor.firstName, data.debtor.lastName, data.debtor.ssn || '', data.debtor.dob || '',
        data.debtor.street || '', data.debtor.city || '', data.debtor.state || '', data.debtor.zip || '',
        data.debtor.phone || '', data.debtor.email || ''
      );
    }
    return { id };
  });

  ipcMain.handle('cases:update', (_, id, data) => {
    const now = new Date().toISOString();
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (['status', 'chapter', 'district', 'case_number'].includes(key)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);
    db.prepare(`UPDATE cases SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return { success: true };
  });

  ipcMain.handle('cases:delete', (_, id) => {
    db.prepare('DELETE FROM cases WHERE id = ?').run(id);
    return { success: true };
  });

  // Creditors
  ipcMain.handle('creditors:list', (_, caseId) => {
    return db.prepare('SELECT * FROM creditors WHERE case_id = ? ORDER BY schedule, name').all(caseId);
  });

  ipcMain.handle('creditors:upsert', (_, caseId, creditor) => {
    const { v4: uuid } = require('uuid');
    const id = creditor.id || uuid();
    db.prepare(`INSERT OR REPLACE INTO creditors (id, case_id, name, address, account_number, debt_type, schedule, amount_claimed, collateral_description, is_disputed, is_contingent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, caseId, creditor.name, creditor.address || '', creditor.accountNumber || '', creditor.debtType, creditor.schedule,
      creditor.amountClaimed || 0, creditor.collateralDescription || '', creditor.isDisputed ? 1 : 0, creditor.isContingent ? 1 : 0
    );
    return { id };
  });

  // Income
  ipcMain.handle('income:upsert', (_, caseId, inc) => {
    const { v4: uuid } = require('uuid');
    const id = inc.id || uuid();
    db.prepare('INSERT OR REPLACE INTO income (id, case_id, source, employer_name, gross_monthly, net_monthly, pay_frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, caseId, inc.source, inc.employerName || '', inc.grossMonthly || 0, inc.netMonthly || 0, inc.payFrequency || 'monthly'
    );
    return { id };
  });

  // Expenses
  ipcMain.handle('expenses:upsert', (_, caseId, exp) => {
    const { v4: uuid } = require('uuid');
    const id = exp.id || uuid();
    db.prepare('INSERT OR REPLACE INTO expenses (id, case_id, category, description, monthly_amount) VALUES (?, ?, ?, ?, ?)').run(
      id, caseId, exp.category, exp.description || '', exp.monthlyAmount || 0
    );
    return { id };
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
      docs.push({ id, filename, docType });
    }
    return docs;
  });

  ipcMain.handle('documents:list', (_, caseId) => {
    return db.prepare('SELECT * FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC').all(caseId);
  });

  ipcMain.handle('documents:extract', (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return null;
    const extracted = mockExtract(doc.doc_type, doc.filename);
    db.prepare('UPDATE documents SET extracted_data = ? WHERE id = ?').run(JSON.stringify(extracted), docId);
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
    return { id };
  });

  ipcMain.handle('review-flags:resolve', (_, id) => {
    db.prepare('UPDATE review_flags SET resolved = 1 WHERE id = ?').run(id);
    return { success: true };
  });

  // Stats for dashboard
  ipcMain.handle('stats:overview', () => {
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM cases').get().c,
      intake: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'intake'").get().c,
      inProgress: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'in_progress'").get().c,
      ready: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'ready'").get().c,
      filed: db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'filed'").get().c,
    };
  });
}

function guessDocType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('w2') || lower.includes('w-2')) return 'tax_return';
  if (lower.includes('tax') || lower.includes('1040')) return 'tax_return';
  if (lower.includes('pay') || lower.includes('stub') || lower.includes('earnings')) return 'pay_stub';
  if (lower.includes('bank') || lower.includes('statement') || lower.includes('chase') || lower.includes('wells') || lower.includes('boa')) return 'bank_statement';
  if (lower.includes('credit') || lower.includes('equifax') || lower.includes('experian') || lower.includes('transunion')) return 'credit_report';
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
