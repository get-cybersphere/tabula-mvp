# Means Test v1 — Law-Firm-Ready Design

**Date:** 2026-04-27
**Status:** Proposed
**Owner:** Tabula
**Companion docs:** [`UX-AUDIT.md`](./UX-AUDIT.md) · [`redaction-pipeline.md`](./redaction-pipeline.md) · [`PRODUCT.md`](./PRODUCT.md)

---

## 0. TL;DR

Today the Tabula means test is a workable demo prototype. It produces correct results for stable W-2 single filers and incorrect or silently-incomplete results for irregular-income, multi-job, garnishment, and rural clients — which is roughly 30-40% of the real bankruptcy filer population. A design-partner attorney has explicitly told us they cannot use the current product on a live case without rebuilding the math by hand.

This document specifies the work required to bring the means test to a state where a bankruptcy attorney can rely on it on a live case and survive a U.S. Trustee audit. Six tracks, eight weeks, five verification gates with a real attorney-supplied case file at each gate. The work falls in this priority order, set by design-partner feedback, not by internal preference:

1. Receipt-level CMI from extracted paystubs (fix the most-load-bearing number)
2. County-level IRS Local Standards
3. Deduction coverage of typical Chapter 7 line items + mandatory "unhandled" warnings
4. Provenance graph: every computed number cites its source
5. Unified means test UI flow with refresh-safe state
6. Form B122A-1/B122A-2 PDF export populated from provenance, using un-redacted originals

Existing redaction architecture (pre-API-only, originals preserved) carries through unchanged. A separate set of UX/naming/clutter issues is tracked in `UX-AUDIT.md`; some have been resolved in the current session and some remain.

---

## 1. Background & motivation

### 1.1 What works today (do not regress)

- **Local OCR + visual PII redaction** before any document leaves the machine — `src/main/redaction/` produces a redacted temp copy; the original never moves. SSN, account numbers, phone, email, DOB, debtor name, debtor address all blacked out before the API sees the document.
- **AI-driven extraction** of structured fields from paystubs, bank statements, tax returns via `extractWithClaude` in `src/index.js` (lines 628-679).
- **Per-firm tenant isolation** via `firm_id` column on every case-scoped row.
- **Case completeness panel** — the per-case checklist of "what's still needed for a clean filing." Design-partner feedback identified this as the strongest UX in the app.
- **AI Assistant with full case context** — `ai:chat` handler with client-side text redaction layered on top of LiteLLM Presidio guardrails.
- **`tabula-extract` and `tabula-extract-text` LiteLLM aliases** routing through the proxy when `LITELLM_BASE_URL` is set; direct Anthropic when it isn't.

### 1.2 What does not work today (this doc fixes)

The design-partner attorney's review, summarized:

- **CMI is computed by annualizing the most recent pay rate, not by averaging six months of receipts.** For job-changers, gig workers, or anyone with non-flat income, the resulting CMI is wrong. Statute (11 U.S.C. § 101(10A)) requires actual six-month receipt averaging.
- **IRS Local Standards are state-level (top 10 states) or national fallback.** IRS publishes county-level. A trustee in any non-metro district will catch the discrepancy in seconds.
- **Deduction model handles ~6 of the ~50 line items on Form B122A-2.** Unhandled items are silently skipped, which inflates disposable income and misroutes Chapter-7-eligible filers into Chapter 13.
- **No source-to-line citation.** Every number on screen lives in space; there is no way to point at a CMI value and say "this came from these receipts." A U.S. Trustee audit (≈1 in 250 cases) requires that.
- **Two parallel means test flows** — `/means-test` (upload→extract→review→save) and the in-case Means Test tab — share no code and don't communicate. A user who runs the standalone flow and saves to a case finds the in-case tab empty until they re-run.
- **No B122A export.** Output is a result panel + a `.txt` summary download. Filing-ready forms must be reconstructed in Best Case or another tool.

The above is what makes a design partner say "I'd still have to rebuild the means test by hand, so the tool hasn't saved me anything on the highest-stakes number in the petition."

---

## 2. Goals & non-goals

### 2.1 Goals

- Means test results an attorney can sign their name to on a live Chapter 7 filing, for the typical SMB consumer-bankruptcy case mix (W-2, mixed-employer, garnishment, childcare, secured debt to maintain).
- Auditable trail: every number on the result screen cites its source (paystub PDF page, IRS table version, or manual-entry timestamp).
- B122A-1 and B122A-2 generated as filing-ready PDFs, with un-redacted SSN/DOB/account fields drawn from the local originals.
- One unified means test UX, refresh-safe, bookmarkable.
- Quarterly refresh path for IRS standards and median income tables.

### 2.2 Non-goals (this release)

- Chapter 11 / Subchapter V workflows.
- PACER / CM/ECF e-filing (separate roadmap track).
- Plaid bank-account direct connection (separate roadmap track; the work in this doc is a prerequisite for it).
- Multi-state local rules library beyond IRS Standards.
- Tri-merge credit report ingestion.
- Full SOC 2 / HIPAA compliance certifications.

### 2.3 Out of scope but related

- The cross-cutting UX work (toast system, destructive-action confirmations, terminology unification, ESC-to-close) is documented and in-progress in `UX-AUDIT.md`. P0 items have shipped this session.

---

## 3. Architecture overview

```
                  ┌──────────────────────────────────────────────────────┐
                  │  Tabula desktop app (Electron + React renderer)      │
                  └──────────────────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
  ┌─────────────────────┐   ┌──────────────────────────┐  ┌────────────────────┐
  │  Document upload    │   │  Means test review +     │  │  B122A export      │
  │  (PDF/PNG/JPG)      │   │  manual entry UI         │  │  (filing-ready PDF)│
  └─────────────────────┘   └──────────────────────────┘  └────────────────────┘
              │                           │                           ▲
              ▼                           │                           │
  ┌─────────────────────┐                 │                           │
  │ src/main/redaction/ │                 │                           │
  │  OCR + bbox redact  │                 │                           │
  └─────────────────────┘                 │                           │
              │                           │                           │
              ▼                           │                           │
  ┌─────────────────────┐                 │                           │
  │  Anthropic SDK via  │                 │                           │
  │  LiteLLM proxy      │                 │                           │
  │  (extraction prompt)│                 │                           │
  └─────────────────────┘                 │                           │
              │                           │                           │
              ▼                           ▼                           │
       ┌───────────────────────────────────────────────┐              │
       │  PROVENANCE GRAPH (new)                       │              │
       │  ─────────────────────────────────────────    │              │
       │  income_receipts   tax_withholdings           │              │
       │  manual_entries    irs_standard_refs          │              │
       │  Each row links to source_doc_id + page or    │              │
       │  to a manual entry with user/timestamp.       │              │
       └───────────────────────────────────────────────┘              │
                                  │                                   │
                                  ▼                                   │
                  ┌───────────────────────────────┐                   │
                  │  runMeansTest(provenance)     │                   │
                  │  → { computed, unhandled,     │                   │
                  │      citations }              │───────────────────┘
                  └───────────────────────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │  Audit packet PDF             │
                  │  (every line, every source)   │
                  └───────────────────────────────┘

Originals stay in <storage>/<firmId>/<caseId>/. Redacted copies are
ephemeral, deleted after API call (unless TABULA_KEEP_REDACTED=1).
```

The fundamental shift: **today the means test takes an aggregated `IncomeSource` (employer + monthly amount + frequency) and produces a number. The new design takes a graph of receipts/deductions/IRS-table-references — each carrying its own provenance — and produces a number plus a citation list plus an explicit unhandled-line list.**

---

## 4. Data model changes

### 4.1 New tables

```sql
-- Every paystub line, every wage deposit on a bank statement, every other
-- income receipt the means test must average over the 6-month window.
income_receipts (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES cases(id),
  document_id     TEXT REFERENCES documents(id),         -- null for manual
  source_page     INTEGER,                                -- PDF page
  pay_date        TEXT NOT NULL,                          -- ISO date
  pay_period_start TEXT,
  pay_period_end   TEXT,
  gross_amount    REAL NOT NULL,
  source_label    TEXT,                                   -- employer / source
  income_type     TEXT,                                   -- wages|self_emp|gig|unemp|other
  manual_entry    INTEGER DEFAULT 0,
  entered_by      TEXT,
  entered_at      TEXT,
  notes           TEXT
);

-- Per-receipt mandatory deductions (federal withholding, FICA, Medicare,
-- state withholding, garnishments). These map to specific B122A lines.
tax_withholdings (
  id              TEXT PRIMARY KEY,
  receipt_id      TEXT NOT NULL REFERENCES income_receipts(id),
  withholding_type TEXT NOT NULL,    -- fed_income | fica | medicare | state | local | garnishment | other
  amount          REAL NOT NULL,
  label           TEXT               -- e.g. "GA DHS Garnishment"
);

-- Citations to IRS Local Standards used in a means test calculation.
-- One row per (case, B122A line, table version).
irs_standard_refs (
  id                 TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL REFERENCES cases(id),
  b122a_line         TEXT NOT NULL,         -- e.g. "B122A-2 Line 6"
  table_name         TEXT NOT NULL,         -- "national_standards" | "housing_utilities" | ...
  effective_date     TEXT NOT NULL,         -- ISO date
  county_fips        TEXT,                  -- for county-keyed tables
  state_code         TEXT,
  household_size     INTEGER,
  amount             REAL NOT NULL,
  source_url         TEXT                   -- IRS publication URL
);

-- Manual deduction entries that don't come from extraction.
-- (childcare, court-ordered support, secured debt, etc.)
manual_deductions (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES cases(id),
  b122a_line      TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  monthly_amount  REAL NOT NULL,
  supporting_doc_id TEXT REFERENCES documents(id),
  entered_by      TEXT,
  entered_at      TEXT
);

-- Snapshot of a means test computation for audit. One row per Run.
means_test_runs (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES cases(id),
  run_at          TEXT NOT NULL,
  cmi             REAL,
  median_income   REAL,
  household_size  INTEGER,
  state_code      TEXT,
  county_fips     TEXT,
  result          TEXT,             -- chapter7 | chapter13 | needs_analysis
  computed_json   TEXT,             -- full provenance graph
  unhandled_json  TEXT              -- list of B122A lines not modeled
);
```

### 4.2 Existing table changes

- `documents` — add `effective_date_range_start`, `effective_date_range_end` so a multi-page document covering a known date span can be queried for "all receipts inside the 6-month window."
- `income` (legacy) — keep for backward compatibility, but `runMeansTest` reads from `income_receipts` exclusively. Migration path: existing income rows are imported into `income_receipts` as synthetic single-receipt entries flagged `manual_entry=1`.

### 4.3 Multi-tenant invariant

Every new table carries `firm_id`. The `caseChildRoutes()` factory pattern in `web/src/lib/crud.ts` (web tier) enforces firm isolation by construction. Direct routes that access these tables must filter `WHERE firm_id = session.firmId` — same pattern as today.

---

## 5. Module-by-module changes

### 5.1 Extraction prompts — `src/index.js` `getExtractionPrompt()`

**Current behavior:** asks Claude for a single `grossPay` + `payFrequency` per stub.

**New behavior:** asks Claude to return an array of receipts and a structured deduction list per paystub.

Schema returned by extraction (paystubs):
```json
{
  "type": "paystub",
  "employer": "Magnolia Nursing Home, LLC",
  "pay_period_start": "2026-04-01",
  "pay_period_end":   "2026-04-14",
  "pay_date":         "2026-04-19",
  "gross_pay":        1840.00,
  "withholdings": [
    { "type": "fed_income", "amount": 184.00, "label": "Federal Income Tax" },
    { "type": "fica",       "amount": 114.08, "label": "Social Security" },
    { "type": "medicare",   "amount":  26.68, "label": "Medicare" },
    { "type": "state",      "amount":  82.80, "label": "GA Withholding" },
    { "type": "garnishment","amount": 200.00, "label": "GA DHS Family Support" }
  ],
  "voluntary_deductions": [
    { "type": "401k", "amount": 92.00 },
    { "type": "health_insurance", "amount": 145.00 }
  ],
  "ytd_gross": 18400.00,
  "source_pdf_page": 2,
  "confidence": "high"
}
```

For multi-stub PDFs (a 6-month bundle), the prompt asks for an array of these objects, one per stub, with the page number stamped on each.

Bank statements get a similar treatment — every wage deposit, government benefit deposit, and self-employment receipt becomes a candidate `income_receipt`, with category labels Claude is asked to infer.

**Why this is hard:** Claude is good at this, but only with a strict prompt and explicit examples. We will need a few-shot prompt with 2-3 anonymized real paystubs and 2-3 bank statements as exemplars, plus a JSON schema validator that retries on parse failure.

### 5.2 Means test math — `src/renderer/lib/means-test.js`

**Current `calculateCMI`:**
```js
export function calculateCMI(incomeSources) {
  let totalAnnual = 0;
  for (const src of incomeSources) {
    totalAnnual += annualizeIncome(src.grossAmount, src.frequency);
  }
  return totalAnnual / 12;
}
```

**New `calculateCMI`:**
```js
export function calculateCMI(receipts, filingDate) {
  // Statutory 6-month lookback: the 6 full calendar months before filing.
  // (11 U.S.C. § 101(10A))
  const window = sixMonthWindow(filingDate);
  const inWindow = receipts.filter(r =>
    r.pay_date >= window.start && r.pay_date <= window.end
  );
  const total = inWindow.reduce((s, r) => s + r.gross_amount, 0);
  return {
    cmi: total / 6,
    receiptCount: inWindow.length,
    windowStart: window.start,
    windowEnd: window.end,
    receipts: inWindow,             // for citation
  };
}
```

`runMeansTest` is rewritten to:
1. Take a `provenance` graph (receipts, withholdings, manual deductions, IRS refs) instead of aggregated `incomeSources`.
2. Return a structured result:
```js
{
  cmi: { value, sources: [receipt_id, ...] },
  medianIncome: { value, source: irs_standard_ref_id },
  belowMedian: bool,
  deductions: {
    handled: [{ b122aLine, value, sources: [...] }, ...],
    unhandled: [{ b122aLine, lineLabel, reason }, ...],
  },
  disposableMonthlyIncome: { value, computedFrom: [...] },
  recommendation: 'chapter7' | 'chapter13' | 'needs_analysis',
  warnings: [...],
  thresholds: { lower, upper, effectiveDate },
}
```

Threshold constants (`LOWER_THRESHOLD = 9075`, `UPPER_THRESHOLD = 15150`) move out of code into a versioned JSON file `data/means-test-thresholds.json` with `effective_from` / `effective_to` fields. Startup check warns if data is older than 90 days.

### 5.3 IRS Standards — `src/renderer/lib/irs-standards.js`

**Replaced** with two pieces:

**(a) `data/irs-standards-2026Q2.json`** (or whichever quarter is current):
```json
{
  "effective_date": "2026-04-01",
  "source_url": "https://www.irs.gov/...",
  "national_standards": { "1": 785, "2": 1190, ... },
  "health_care": { "under65": 75, "over65": 153 },
  "housing_utilities": {
    "by_county": {
      "13_021": [1248, 1465, 1465, 1610, 1610],   // Bleckley County, GA
      "13_089": [1798, 2113, 2113, 2324, 2324],   // DeKalb County, GA
      ...
    }
  },
  "transportation": {
    "ownership": [641],
    "operating": {
      "by_msa": { "Atlanta-GA": 295, "Macon-GA": 244, ... },
      "by_region": { "Southeast": 251, ... }
    }
  }
}
```

**(b) ZIP → county FIPS lookup** via the Census Geocoder API (cached locally). New module `src/renderer/lib/zip-to-county.js`. Result is a 5-digit FIPS code we use to key into the JSON tables.

`getAllowedDeductions()` is rewritten to:
1. Resolve the debtor's ZIP to county FIPS.
2. Look up housing/utilities by county FIPS, falling back to state then national average if missing.
3. Look up transportation by MSA, falling back to region.
4. Return each deduction with its source citation embedded.

Data refresh: a Node script `scripts/refresh-irs-standards.js` pulls the latest IRS publication, regenerates the JSON, stamps the new effective date. Manually run quarterly until automated.

### 5.4 Provenance graph — new module `src/renderer/lib/provenance.js`

Defines:
- `Citation` — `{ kind: 'document_page' | 'irs_standard' | 'manual_entry', refId, label }`
- `ProvenanceGraph` — `{ receipts: [], withholdings: [], manualDeductions: [], irsRefs: [] }`
- `loadProvenance(caseId)` — reads from the new tables, returns the graph.
- `formatCitation(citation)` — produces human-readable strings: "Pay stub from Magnolia Nursing Home dated 2026-04-19, PDF page 2."

Everything downstream (means test math, audit packet, B122A export) consumes a `ProvenanceGraph`.

### 5.5 Unified means test UI — `src/renderer/pages/MeansTest.jsx` + `CaseDetail.jsx`

**Current state:** two separate components, two separate flows.

**New state:** one component `<MeansTestWorkspace>` rendered from both routes.
- Standalone route `/means-test` mounts it with no `caseId` and a "Pick or create a case" first step.
- In-case Means Test tab mounts it pre-bound to that case.
- Internal steps become URL segments: `/cases/:id/means-test/upload`, `/.../extract`, `/.../review`, `/.../result`. Refresh-safe.
- A "Resume" banner on case load if there's an in-progress run.

This is the moment we pay down the routing debt — `react-router` is in `package.json` already, just unused. Wiring it in is part of this work; the rest of the app benefits too.

### 5.6 Mandatory unhandled-items warning — UI component

A new `<UnhandledLinesBanner>` rendered at the top of the Result step.

Contract:
- Receives the `unhandled` array from `runMeansTest`.
- Renders a red, sticky banner listing every B122A line we did not model: line number, line label ("Childcare for employment"), reason ("not auto-extracted; manual entry required").
- The Result panel below it is **rendered behind a translucent overlay** until each unhandled line is either filled in (manual entry) or explicitly checked "Not applicable to this client."
- Acknowledgments are persisted to `means_test_runs.unhandled_json` as part of the audit trail.

**Why this matters legally:** the attorney's defense in a malpractice case becomes "I was warned, I either entered the value or marked it not applicable, and the audit log records that." Today's silent omissions provide no such defense.

### 5.7 Audit packet PDF — new endpoint + UI

Endpoint: `meansTest:exportAuditPacket(caseId, runId) → filePath`.

Renders a PDF (using pdf-lib, already a dep) containing:
- Header: case identifier, debtor name, filing district, run timestamp.
- Section 1: CMI calculation. Table of every receipt with date, source, amount. Sum, divide by 6, citation string for each row.
- Section 2: Median income. State, household size, table version, effective date, source URL.
- Section 3: Deductions. For each handled line: B122A line number, label, computed value, citation. For each unhandled line: explicit acknowledgment line ("Marked Not Applicable by [user] at [timestamp]" or "Manual entry: $X with supporting doc [filename]").
- Section 4: Result summary with full reasoning.

This is the artifact the attorney hands a U.S. Trustee on audit. Not a B122A — that's next — but the supporting documentation behind it.

### 5.8 Form B122A-1 / B122A-2 PDF export — new endpoint

Endpoint: `meansTest:exportB122A(caseId, runId) → filePath`.

Implementation: pdf-lib loads the official B122A template (PDF form fields), populates each field from the provenance graph, returns a flattened PDF.

**Critical:** form fields requiring SSN, DOB, account numbers are populated from the **un-redacted originals** stored in `<storage>/<firmId>/<caseId>/` — not from the redacted copies that were sent to the API. The redaction layer is pre-API only; export reads from the source of truth. See §6 for the architectural confirmation.

Initial scope: B122A-1 (Statement of Current Monthly Income) and B122A-2 (Means Test Calculation). B122A-1Supp and Chapter 13 forms (B122C-1, B122C-2) are deferred to v1.1.

---

## 6. Redaction continuity (architectural confirmation)

Design partner asked explicitly: *"the final output I'd file with the court needs the actual SSN and DOB. I need the tool to maintain the secure local copy and reinstate it in the export."*

**The architecture already supports this** and the Form B122A export will not change it. Stating it for the record:

| Step | What touches PII | Where the original lives |
|------|------------------|--------------------------|
| Document upload | none | `<storage>/<firmId>/<caseId>/<timestamp>-<filename>` (original, unmodified) |
| Pre-extraction redaction | `src/main/redaction/redactor.js` writes a *temp copy* with black rectangles drawn over PII regions | original untouched |
| Anthropic API call | redacted temp copy sent | original untouched |
| Post-extraction cleanup | redacted copy deleted (unless `TABULA_KEEP_REDACTED=1`) | original untouched |
| Database storage of extracted values | structured fields stored unredacted (they came back from Claude as JSON, not as the source PDF) | original untouched |
| AI chat | text-redacted copy sent to API; user's original message saved to DB *before* redaction | full conversation history readable in app |
| **Form B122A export (NEW)** | reads from the **original** files in storage to populate SSN/DOB/account fields | — |

The redaction module never modifies originals; it produces ephemeral copies for the API boundary only. This is the existing design and is correct for filing-ready export. No changes required to the redaction module itself for this work.

---

## 7. Sequencing & verification gates

Eight weeks, five sprints, five verification gates. Each gate runs against a real case file from the design-partner attorney, anonymized for the demo file but structurally identical to a live filing.

### Sprint 1 (weeks 1-2) — Extraction depth

Files touched:
- `src/index.js` — `getExtractionPrompt('paystub')`, `getExtractionPrompt('bank_statement')`
- New: `src/main/extraction/schema.js` (JSON schema validator + retry-on-parse-failure)
- DB migration: `income_receipts`, `tax_withholdings` tables
- `src/index.js` `populateCaseFromExtraction` — write receipts to new tables instead of aggregated `income`

**Gate 1:** upload the design partner's anonymized 6-month paystub bundle for the single-mom-with-job-change case. Verify every pay date appears as a row in `income_receipts` with the right gross + the right tax withholding line items + the GA DHS garnishment captured as a `withholding_type='garnishment'` row. False extractions are an attorney-flagged manual review item, not a launch blocker — but >95% accuracy on paystub line extraction is the bar.

### Sprint 2 (week 3) — Math rewrite + unhandled-items mechanism

Files touched:
- `src/renderer/lib/means-test.js` — full rewrite of `calculateCMI`, `runMeansTest`
- `data/means-test-thresholds.json` — versioned constants
- `src/renderer/components/MeansTest/UnhandledLinesBanner.jsx` — new
- `src/renderer/pages/MeansTest.jsx` — wire result step behind unhandled overlay
- DB migration: `manual_deductions`, `means_test_runs` tables

**Gate 2:** run the same case end-to-end. CMI matches the paralegal's hand-computed number to within $1. Unhandled banner fires for childcare, child support, actual taxes withheld, secured debt to maintain. Result panel hidden until each is acknowledged.

### Sprint 3 (week 4) — County IRS + provenance

Files touched:
- `data/irs-standards-2026Q2.json` — generated from latest IRS publication
- `src/renderer/lib/irs-standards.js` — replaced with county-keyed lookup
- `src/renderer/lib/zip-to-county.js` — new, with cached Census Geocoder calls
- `src/renderer/lib/provenance.js` — new
- `runMeansTest` — every computed value now carries a citation
- DB migration: `irs_standard_refs` table
- `scripts/refresh-irs-standards.js` — manual quarterly refresh utility

**Gate 3:** run the same case with debtor ZIP in Bleckley County, GA. Housing deduction matches the IRS county table for the current quarter. Effective date visible on the result screen. Every other deduction line shows its source citation.

### Sprint 4 (weeks 5-6) — Unified UI flow + audit packet export

Files touched:
- `src/renderer/pages/MeansTest.jsx` + `CaseDetail.jsx` — collapsed into one `<MeansTestWorkspace>` component
- `src/renderer/App.jsx` — replaced with `react-router` (resolves the no-routing debt called out in `UX-AUDIT.md`)
- `src/index.js` — new `meansTest:exportAuditPacket` IPC handler
- New: `src/main/exports/audit-packet.js` — pdf-lib generator

**Gate 4:** mid-flow refresh keeps the user where they were. Generate audit packet. Every line traces to either a `document_page` citation, an `irs_standard_refs` row, or a `manual_deductions` row with timestamp. Hand the PDF to the design partner; they confirm it would survive a trustee audit.

### Sprint 5 (weeks 7-8) — Form B122A export

Files touched:
- `src/main/exports/b122a-template.pdf` — official template with form fields
- `src/main/exports/b122a-export.js` — pdf-lib field population from provenance graph
- `src/index.js` — `meansTest:exportB122A` IPC handler
- Tests: a fixture case file with known-correct B122A as ground truth

**Gate 5:** export filing-ready B122A-1 + B122A-2. Every field populated correctly. SSN/DOB/account fields contain real values from the un-redacted originals. Design partner files the form (or a parallel staged version) and confirms it matches what they'd produce by hand.

End of week 8: usable on a live case. Full audit defensibility. The product the design partner has been describing.

---

## 8. Verification & test strategy

### 8.1 Unit tests (Node test runner — already in `test/`)

- `test/means-test/cmi.test.js` — receipt-window math, edge cases (filing on day 1 of month, leap year, gap months).
- `test/means-test/deductions.test.js` — IRS lookup correctness for all 50 states + a sample of counties.
- `test/means-test/provenance.test.js` — citation graph construction, formatCitation strings.
- `test/extraction/schema.test.js` — JSON schema validation on a corpus of redacted sample paystubs.

### 8.2 Integration / fixture tests

- `test/fixtures/cases/` — 5-7 anonymized end-to-end cases from design partner: stable W-2, job-changer, gig worker, garnishment case, self-employed. Each has source PDFs + the known-correct B122A. Test runs the full pipeline and diffs against the known-correct output.

### 8.3 Manual verification checklists

- Per-sprint gate, run with the design partner on Zoom. Doc the result in `docs/gates/sprint-N.md`.

---

## 9. Open questions & risks

1. **Extraction accuracy on mid-quality scans.** Many paystubs from rural employers come through as poorly-scanned PDFs. We'll need a fallback OCR pass + confidence scoring in the extraction prompt. Risk: extra latency / cost. Mitigation: scope tests to confirm acceptable accuracy at >95% on the design partner's actual case file backlog before promising parity.

2. **County FIPS for ambiguous addresses.** Some debtors live in unincorporated areas; ZIPs cross county lines. Census Geocoder returns a primary county but with confidence levels. Risk: wrong county chosen silently. Mitigation: when confidence is below a threshold, surface "Verify county: this ZIP straddles X and Y. Choose:" as a manual selection step.

3. **B122A template versioning.** The official form changes every few years (last major was 2014). Risk: ship today, form revision drops next quarter. Mitigation: template file in `src/main/exports/` is hot-swappable; small migration job rebuilds field mappings.

4. **State-specific means test variants.** Some districts have local form modifications. Risk: B122A-out-of-the-box passes federal but not local. Mitigation: design partner is in GA; local rules check is part of Gate 5.

5. **Refresh cadence for IRS data.** IRS updates happen on no fixed schedule (tied to fiscal years and adjustments). Risk: tool runs with stale data and a trustee challenges the deduction. Mitigation: 90-day staleness warning at app boot; `scripts/refresh-irs-standards.js` documented for the operator.

6. **Capacity to do this in 8 weeks.** This is a real risk. The work above is ~6-8 weeks for a focused two-engineer team, more for a single engineer. Mitigation: gates are real cutoff points — if Gate 2 slips, Gate 3 slips, and we tell the design partner.

---

## 10. What the design partner is paying for

Re-stating what was negotiated in conversation, for the record:

- **$500/month for six months** as a design partner, starting at Sprint 1 kickoff.
- **In exchange:** weekly demo + feedback session against their real anonymized cases, and a firm commitment to ship the items in §7 in the order listed.
- **At month six:** if the math holds for their case mix, they go to standard pricing. If it doesn't, they walk and the relationship is honorably ended.

The standard $3,500/month price is for the product these gates produce, not the product as it exists on day one. Pricing today's product at tomorrow's price is what loses design partners. Pricing it honestly is what earns the next ten.

---

## 11. References

- 11 U.S.C. § 707(b) — Means test statute
- 11 U.S.C. § 101(10A) — CMI definition
- Official Form B122A-1, B122A-2 — current revisions
- IRS Collection Financial Standards — current quarterly tables
- U.S. Trustee Program — Census Bureau Median Family Income Data
- `docs/UX-AUDIT.md` — companion UX issues, mostly orthogonal to this work
- `docs/redaction-pipeline.md` — pre-API redaction architecture
- `docs/PRODUCT.md` — product surface map

---

*End of design. Comments and pushback go in PR review on this file. Track changes via git, not in-doc revision marks.*
