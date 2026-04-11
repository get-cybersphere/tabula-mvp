# Implementation Plan: Closing v1 Gaps

**Date:** 2026-04-10  
**Scope:** 4 issues blocking end-to-end flow completeness

---

## 1. Extraction → Means Test Gap

**Problem:** The standalone `MeansTest.jsx` page and the case detail `MeansTestTab` are disconnected. Documents extracted in the case detail view don't feed into the means test calculation. The MeansTestTab uses a hardcoded national median ($59,580) and only displays raw income/expense rows from the DB — it never calls `runMeansTest()` from `means-test.js`.

**Changes Required:**

### 1a. Wire extracted data into case income/expenses (main process)

**File:** `src/index.js`

In the `documents:extract` IPC handler (line 449), after extraction completes:

- Parse the extracted JSON based on `doc.doc_type`
- For `pay_stub` extractions: auto-create/update an `income` row for the case
  - Map `employer` → `employer_name`, `grossPay` → `gross_monthly` (adjusted by `payFrequency`), `netPay` → `net_monthly`
  - Use `payFrequency` to convert to monthly: weekly ×4.33, biweekly ×2.167, semimonthly ×2, monthly ×1
- For `bank_statement` extractions: auto-create `expenses` rows for the case
  - Iterate `monthlyExpenses` object, create one `expenses` row per category (rent, utilities, groceries, gas, insurance, carPayment, subscriptions, other)
- For `credit_report` extractions: auto-create `creditors` rows for the case
  - Map each account in `accounts[]` to a creditor row with name, account number, amount (balance), debt type, and schedule (infer from type: Auto Loan→D, Student Loan→E, Credit Card/Collections→F)

### 1b. Replace simplified MeansTestTab with real calculation

**File:** `src/renderer/pages/CaseDetail.jsx`, `MeansTestTab` function (line 450)

- Import `runMeansTest` and `getAllStates` from the lib files (same imports `MeansTest.jsx` uses)
- Use the debtor's `address_state` to determine state code
- Calculate `householdSize` from dependents (default 1 if unknown; allow user override via input)
- Call `runMeansTest()` with the case's income sources and expense data
- Display the recommendation, confidence, explanation, and math breakdown — reuse the same layout as `ReviewStep` in `MeansTest.jsx`
- Add a "Run Means Test" button that triggers the calculation (rather than running on every render), so the user can adjust parameters first
- Show the full deductions table when above median

### 1c. Add "Save to Case" from standalone Means Test

**File:** `src/renderer/pages/MeansTest.jsx`, `ReviewStep` component (line 364)

- Add a "Save to Case" button that lets the user pick an existing case (dropdown of cases from `window.tabula.cases.list()`)
- On save, call `window.tabula.income.upsert()` for each income source and `window.tabula.expenses.upsert()` for each expense — writing the reviewed/edited data back to the case DB

**New IPC needed:** None — `income:upsert` and `expenses:upsert` already exist.

---

## 2. Real Extraction in Case Detail (Replace Mock)

**Problem:** The `documents:extract` handler (line 449-455 of `src/index.js`) calls `mockExtract()` which returns hardcoded data. The real Claude API extraction (`extractWithClaude()`) is only used by the `means-test:extract` handler.

**Changes Required:**

**File:** `src/index.js`

Replace the `documents:extract` handler:

```
Current (line 449-455):
  ipcMain.handle('documents:extract', (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return null;
    const extracted = mockExtract(doc.doc_type, doc.filename);
    ...
  });

New:
  ipcMain.handle('documents:extract', async (_, docId) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return null;

    // Map DB doc_type names to extraction prompt categories
    const categoryMap = {
      'pay_stub': 'paystub',
      'tax_return': 'tax_return',
      'bank_statement': 'bank_statement',
      'credit_report': 'other',
      'other': 'other'
    };
    const category = categoryMap[doc.doc_type] || 'other';

    let extracted;
    try {
      extracted = await extractWithClaude(doc.file_path, category);
    } catch (err) {
      // Fall back to mock if API key missing or API fails
      console.error('Claude extraction failed, using mock:', err.message);
      extracted = mockExtract(doc.doc_type, doc.filename);
      extracted._mock = true;
    }

    db.prepare('UPDATE documents SET extracted_data = ? WHERE id = ?')
      .run(JSON.stringify(extracted), docId);

    // Auto-populate case financial data (from gap #1a)
    // ... income/expense/creditor creation logic here ...

    return extracted;
  });
```

**Key decisions:**
- Make the handler `async` (it's currently sync)
- Fall back to mock data if the API key is missing or the call fails, so the app remains demo-able without an API key
- Tag mock results with `_mock: true` so the UI can show a warning badge

**File:** `src/renderer/pages/CaseDetail.jsx`, `DocumentsTab`

- Add extraction status feedback: show a spinner on the "Extract Data" button while extracting
- After extraction, show a toast/badge if mock data was used (`_mock` flag)
- The `handleExtract` function (line 45) needs to handle the async nature — add loading state per document

---

## 3. Income/Expense Editing in Case Detail

**Problem:** The DB has `income` and `expenses` tables with full CRUD via IPC (`income:upsert`, `expenses:upsert`), and the preload exposes them. But the case detail UI only displays income/expense data read-only — there are no forms to add or edit entries.

**Changes Required:**

### 3a. Add Income form to MeansTestTab

**File:** `src/renderer/pages/CaseDetail.jsx`, `MeansTestTab` function

Add an "Add Income Source" button and inline form (same pattern as the creditor form in `CreditorsTab`):

**Form fields:**
- Source (text) — e.g., "Employment", "Self-employment", "Social Security"
- Employer Name (text)
- Gross Monthly (number)
- Net Monthly (number)
- Pay Frequency (select: weekly, biweekly, semimonthly, monthly)

**On submit:** Call `window.tabula.income.upsert(caseId, { source, employerName, grossMonthly, netMonthly, payFrequency })` then `onRefresh()`

**Display changes:**
- Add edit/delete buttons to each income row in the income list
- For edit: populate the form with existing values, call upsert with existing ID
- For delete: need a new IPC handler (see below)

### 3b. Add Expense form to MeansTestTab

**Form fields:**
- Category (select: housing, utilities, food, transportation, healthcare, insurance, childcare, education, clothing, personal_care, entertainment, charitable, other)
- Description (text)
- Monthly Amount (number)

**On submit:** Call `window.tabula.expenses.upsert(caseId, { category, description, monthlyAmount })` then `onRefresh()`

### 3c. Add delete handlers

**File:** `src/index.js` — add two new IPC handlers:

```
ipcMain.handle('income:delete', (_, id) => {
  db.prepare('DELETE FROM income WHERE id = ?').run(id);
  return { success: true };
});

ipcMain.handle('expenses:delete', (_, id) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { success: true };
});
```

**File:** `src/preload.js` — expose them:

```
income: {
  upsert: ...,
  delete: (id) => ipcRenderer.invoke('income:delete', id),
},
expenses: {
  upsert: ...,
  delete: (id) => ipcRenderer.invoke('expenses:delete', id),
},
```

### 3d. Update the MeansTestTab signature

Currently `MeansTestTab` receives `{ caseData }`. It needs `{ caseData, caseId, onRefresh }` to call IPC and reload after mutations. Update the parent render call at line 140 to pass these props.

---

## 4. Joint Debtor Support

**Problem:** The `debtors` table has `is_joint INTEGER NOT NULL DEFAULT 0` and supports multiple debtors per case. But the UI only reads `caseData.debtors?.[0]` and has no way to add a second debtor.

**Changes Required:**

### 4a. Add joint debtor toggle and form

**File:** `src/renderer/pages/CaseDetail.jsx`, `OverviewTab`

- Below the existing "Debtor Information" card, add a "Joint Filing" section
- Show a toggle/checkbox: "Joint filing (married couple)"
- If toggled on and no joint debtor exists, show an inline form with the same fields as the primary debtor (first name, last name, SSN, DOB, phone, email, address)
- If a joint debtor already exists (`caseData.debtors.find(d => d.is_joint === 1)`), show their info in a second card
- Allow editing both debtors inline

### 4b. Add debtor upsert IPC handler

**File:** `src/index.js` — add:

```
ipcMain.handle('debtors:upsert', (_, caseId, debtor) => {
  const { v4: uuid } = require('uuid');
  const id = debtor.id || uuid();
  db.prepare(`INSERT OR REPLACE INTO debtors 
    (id, case_id, is_joint, first_name, last_name, ssn, dob, 
     address_street, address_city, address_state, address_zip, phone, email) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, caseId, debtor.isJoint ? 1 : 0,
    debtor.firstName, debtor.lastName, debtor.ssn || '', debtor.dob || '',
    debtor.street || '', debtor.city || '', debtor.state || '', debtor.zip || '',
    debtor.phone || '', debtor.email || ''
  );
  return { id };
});

ipcMain.handle('debtors:delete', (_, id) => {
  db.prepare('DELETE FROM debtors WHERE id = ? AND is_joint = 1').run(id);
  return { success: true };
});
```

Note: The delete handler only allows deleting joint debtors (safety guard).

### 4c. Expose in preload

**File:** `src/preload.js` — add:

```
debtors: {
  upsert: (caseId, debtor) => ipcRenderer.invoke('debtors:upsert', caseId, debtor),
  delete: (id) => ipcRenderer.invoke('debtors:delete', id),
},
```

### 4d. Update OverviewTab signature

`OverviewTab` currently receives `{ caseData, debtor }`. Change to `{ caseData, debtor, caseId, onRefresh }` and update the render call at line 137.

### 4e. Update means test for joint income

When running the means test in the case detail, if there's a joint debtor, the household size should default to 2 (minimum). Income from both debtors should be aggregated. The `income` table already has a `debtor_id` foreign key, so income can be attributed to either debtor.

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/index.js` | Replace mock extraction with Claude API call (fallback to mock). Add auto-population of income/expenses/creditors from extracted data. Add `debtors:upsert`, `debtors:delete`, `income:delete`, `expenses:delete` IPC handlers. |
| `src/preload.js` | Expose `debtors.upsert`, `debtors.delete`, `income.delete`, `expenses.delete`. |
| `src/renderer/pages/CaseDetail.jsx` | Rewrite `MeansTestTab` to use real `runMeansTest()` with editable income/expense forms. Add joint debtor UI to `OverviewTab`. Add extraction loading states to `DocumentsTab`. Pass `caseId` and `onRefresh` to tabs that need them. |
| `src/renderer/pages/MeansTest.jsx` | Add "Save to Case" button in `ReviewStep` to persist reviewed data back to a case. |

## Implementation Order

1. **Issue #2 first** (mock → real extraction) — it's a single function change in `src/index.js` and unblocks everything else
2. **Issue #1a** (auto-populate from extraction) — add the mapping logic right after extraction
3. **Issue #3** (income/expense forms) — straightforward UI, follows the creditor form pattern already in the codebase
4. **Issue #1b** (real means test in case detail) — depends on income/expense data being populated
5. **Issue #4** (joint debtor) — independent, can be done in parallel with #3
6. **Issue #1c** (save to case from standalone) — nice-to-have, lowest priority
