# Tabula — Product Documentation

*Last updated: 2026-04-17*

---

## What is Tabula?

Tabula is a privacy-first desktop application for law firms that turns client financial documents into fully-populated case files using AI — with every piece of personally identifiable information redacted locally before anything leaves the attorney's machine.

Currently built for two practice areas:

- **Consumer Bankruptcy** (Chapter 7 and Chapter 13) — petition prep, means test, creditor schedules, statutory deadline tracking
- **Personal Injury** — accident details, medical records, case valuation, settlement tracking, PI-specific deadlines

The app is designed around a single principle: **the AI does the data entry, the attorney verifies the work, and the client's sensitive data never touches a third-party server in raw form.**

---

## Who uses it

| User | What they do with it |
|------|---------------------|
| Solo bankruptcy attorney | Upload paystubs / bank statements / tax returns, get a completed means test + populated schedules in under a minute instead of 3 hours |
| Paralegal at a small firm | Process the document intake pipeline across 30-100 active cases, track what's missing per client, monitor deadlines |
| Personal injury attorney | Track accident details, medical records, case valuation, settlement demands, and statute-of-limitations deadlines |
| Legal aid paralegal (future) | Same as above but for pro bono cases at scale, with grant-compliance reporting |

---

## What the user sees

### The Sidebar

A clean, minimal navigation rail on the left side of the app:

- **Assistant** — a top-level AI chat interface (Harvey-style command center). Provides contextual answers about any case: financials, deadlines, next steps, document status. Maintains per-case conversation history.
- **Vault** — the case list (dashboard), organized by pipeline status. Expandable sub-items filter by Intake, In Progress, Ready to File, Filed.
- **Means Test** — standalone means test tool for quick eligibility screens without creating a full case
- **+ Create** — one-click new case creation

### The Dashboard

The firm-wide command center. Shows:

- **Stats row** — total cases, intake, in progress, ready to file (at-a-glance counts)
- **Upcoming Deadlines panel** — firm-wide statutory deadlines across all filed cases, sorted by date, color-coded by urgency, click-through to the case. Chapter 7: 341 meeting, objection window, expected discharge. Chapter 13: plan confirmation, first payment, 341 meeting.
- **Recent Activity panel** — firm-wide event feed. Every document upload, extraction, creditor addition, status change across every case, in reverse chronological order.
- **Case table** — every case with debtor name, chapter, district, status badge, **completeness %** (color-coded from red to green with missing-item count), and creation date. Click any row to open the case.

### Case Detail — Bankruptcy

Seven tabs per case:

**Overview**
- Financial summary cards: total debt, total assets, monthly income, monthly expenses
- Debtor information (name, SSN masked, DOB, phone, email)
- Address card
- Joint debtor section — add/remove a spouse for joint filings with full form (name, SSN, DOB, phone, email, address)
- Upcoming Deadlines card — statutory deadlines computed from the filing date, with day-countdown and severity coloring
- Petition Readiness panel — 0-100% progress bar driven by 9 weighted checks. A loud "Missing" section that tells you specifically what's needed ("Missing: tax return, credit report"), not just a generic warning. At 100%, flips to a green "Ready to File" badge.

**Timeline**
- Reverse-chronological feed of everything that happened on this case
- Every document upload, extraction, income/expense addition, creditor addition, status change, review flag — all auto-logged
- Color-coded dots by event type (blue for documents, sage for data additions, amber for status changes, accent red for case filed)
- Relative timestamps ("3 days ago", "just now")

**Documents**
- Upload drop zone — supports PDF, PNG, JPG
- Document table with filename, auto-detected type (paystub / bank statement / tax return / credit report), upload timestamp, extraction status
- Extract button per document — triggers the full redaction + Claude extraction pipeline
- Auto-categorizes by filename ("chase_statement_mar.pdf" → bank statement)

**Assets**
- Add real property, personal property, vehicles
- Schedule assignment (A/B), exemption claims (statute + amount)
- Current value tracking

**Creditors**
- Full debtor matrix: creditor name, address, account number, debt type (credit card, auto loan, student loan, mortgage, medical, tax, collections, personal loan), Schedule D/E/F assignment, amount claimed, collateral description, disputed/contingent flags
- Running total of all claimed debt
- Auto-populated from credit report extractions

**Means Test**
- Case parameters at top: state (all 50 + DC from 2024 Census data), household size, vehicle count
- **Run Means Test** button — triggers the real statutory calculation per 11 U.S.C. § 707(b)(2)
- Result card: Chapter 7 Eligible / Chapter 13 Recommended / Needs Analysis, with confidence level
- Full math breakdown: annualized income, state median, gap. If above median: national standards deductions (food/clothing), health care, housing & utilities (state-specific), transportation (by vehicle count), secured debt, priority debt, total deductions, disposable monthly income, 60-month projection
- Editable income sources: add/delete, source type, employer name, gross/net monthly, pay frequency
- Editable monthly expenses: add/delete, 14 categories, description, amount
- Every number is editable. Every calculation shows its work. Nothing is a black box.

**Review**
- Attorney notes for pre-filing review. Each flag has a section tag (debtor info, income, expenses, creditors, assets, means test, general) and a free-text note
- Mark flags as resolved to clear them
- Open flags are counted in the Petition Readiness score

### Case Detail — Personal Injury

Practice-type-aware tab set:

**Overview** — same structure, adapted for PI (no creditor totals, different summary metrics)

**Accident & Insurance** — full accident intake form:
- Accident date, type (auto, slip-and-fall, etc.), location, description
- Police report number, weather conditions
- Liability assessment, comparative fault percentage
- Insurance details: company, policy number, adjuster name/phone, claim number, coverage limit
- At-fault party info, UM/UIM availability

**Medical Records** — track medical providers, treatments, bills, and records:
- Provider name, type, dates of treatment
- Diagnosis, treatment description
- Billing amounts, insurance payments, outstanding balances

**Case Valuation** — settlement analysis:
- Special damages (medical bills, lost wages, property damage)
- General damages (pain and suffering multiplier)
- Demand amount, offer tracking

**Settlement** — track negotiations:
- Demand letters sent, offers received, counter-offers
- Timeline of negotiation events
- Settlement reached: amount, terms, disbursement

**PI Deadlines** — statute of limitations, filing deadlines, treatment windows

### AI Assistant

A slide-out chat panel accessible from any case. Powered by Claude with full case context:

- Knows the case's financial data, creditors, deadlines, practice type, timeline events
- Maintains per-case conversation history
- Can answer questions like "what's missing before we file?", "what are the next deadlines?", "summarize the creditor situation", "what's the strongest argument for Chapter 7 here?"
- Suggested prompts for common queries

### Standalone Means Test

Accessible from the sidebar without opening a case. Three-step wizard:

1. **Upload** — drag and drop or browse for paystubs, bank statements, tax returns
2. **Extract** — Claude reads each document and pulls structured data (with live status indicators per document)
3. **Review** — editable income sources, editable expenses, live means test calculation with full math breakdown, recommendation with confidence

Can save results into an existing case to auto-populate the schedules.

---

## The extraction pipeline (what happens when you click "Extract")

This is the core technology. Five steps, all happening locally or through a controlled proxy:

### Step 1 — Local OCR

Tesseract.js reads the document word-by-word, extracting text with bounding box coordinates for each word. Runs entirely on the attorney's machine. No network call.

### Step 2 — Local PII detection

The OCR text is scanned against a set of pattern rules:

| PII type | Detection method |
|----------|-----------------|
| Social Security Number | Hyphenated format (`XXX-XX-XXXX`, excluding ITINs starting with 9) + label-anchored bare 9-digit |
| ITIN | `9XX-XX-XXXX` format (distinct from SSN) |
| Date of Birth | Date patterns preceded by "DOB", "Date of Birth", "Born" (pay-period dates are NOT flagged) |
| Phone | Canonical US formats only: `(555) 123-4567`, `555-123-4567`, `555.123.4567` (intentionally tight to avoid matching SSNs or dollar amounts) |
| Email | Standard email regex |
| Full account number | 8-17 digits preceded by "Account" or "Acct" (last-4 references stay visible) |
| Routing number | 9 digits preceded by "Routing", "ABA", "RTN" |
| Driver's license | Label-anchored alphanumeric 5-20 chars |
| Debtor name | Lookup against the case's debtor record. Handles middle names, middle initials, reverse "Doe, John" form |
| Debtor address | Street-fragment lookup against the case's debtor record |

**What is explicitly NOT detected (by design):**
- Dollar amounts — they are the extraction payload
- Employer names — needed to label income sources
- Pay period dates — needed for frequency calculation
- Last-4 account references — already partial, safe
- Payee names on expenses — needed for categorization

### Step 3 — Visual redaction

For each detected PII region, the corresponding word bounding boxes from OCR are used to position black rectangles. An SVG overlay is built and composited onto a copy of the document using `sharp` (for images) or rasterized page-by-page using `pdfjs-dist` + `node-canvas` then rebuilt with `pdf-lib` (for PDFs). The original file is never modified. The redacted copy is written to the OS temp directory.

### Step 4 — API call through LiteLLM proxy

Only the redacted copy is sent. The Anthropic SDK is configured with a `baseURL` pointing to a self-hosted LiteLLM proxy on Railway. The Electron app presents a master key (not the real Anthropic API key). The proxy validates the key and relays the request to Anthropic using the real key stored only in the proxy's environment variables. The attorney's machine never holds the real Anthropic API key.

The prompt is document-type-specific:
- **Paystub**: extract employer, pay period, frequency, gross/net pay, all individual deductions, YTD totals
- **Bank statement**: extract account info, opening/closing balance, monthly expenses by category (rent, utilities, groceries, gas, insurance, subscriptions, etc.)
- **Tax return**: extract filing status, dependents, wages, other income, AGI, deductions, total tax
- **Other**: general financial data extraction with auto-classification

### Step 5 — Auto-populate + cleanup

The returned JSON is parsed and, based on document type, automatically creates database rows:
- Paystub → income row with frequency-adjusted monthly amounts
- Bank statement → one expense row per category
- Credit report → one creditor row per account (schedule inferred: auto → D, student → E, credit card → F)

Every auto-population is logged as a timeline event. The temp redacted file is deleted (unless `TABULA_KEEP_REDACTED=1` is set for audit purposes, in which case the path is logged to the console for manual inspection).

---

## The deadline engine

When a case status changes to "Filed", the app auto-sets `filed_at` and computes statutory deadlines:

### Chapter 7

| Deadline | When | Statutory basis |
|----------|------|----------------|
| 341 Meeting of Creditors | 21-40 days after filing | 11 U.S.C. § 341 |
| Creditor Objection to Discharge | 60 days after 341 meeting | Fed. R. Bankr. P. 4004(a) |
| Expected Discharge | 60-90 days after 341 (if no objections) | 11 U.S.C. § 727 |
| Financial Management Course | ~60 days after filing (practical target) | 11 U.S.C. § 727(a)(11) |

### Chapter 13

| Deadline | When | Statutory basis |
|----------|------|----------------|
| 341 Meeting of Creditors | 21-50 days after filing | 11 U.S.C. § 341 |
| Plan Confirmation Hearing | 45 days after filing | 11 U.S.C. § 1324 |
| First Plan Payment | 30 days after filing | 11 U.S.C. § 1326(a)(1) |
| Financial Management Course | ~60 days after filing | 11 U.S.C. § 1328(g) |

Each deadline is annotated with:
- Status: upcoming / overdue / past / completed
- Days from now (negative = past)
- Severity: critical / high / medium / info
- Color-coding in the UI (red for imminent/overdue, amber for upcoming, blue for medium, gray for info)

Deadlines render on both the case's Overview tab and the firm-wide Dashboard panel.

---

## The completeness tracker

Each case gets a **readiness score from 0% to 100%** derived from 9 weighted checks:

| Check | Weight | Required? |
|-------|--------|-----------|
| Debtor identity (name + SSN + DOB) | 10 | Yes |
| Debtor address (street + city + state + zip) | 5 | Yes |
| At least one income source | 10 | Yes |
| Monthly expenses recorded | 8 | Yes |
| Creditor matrix has entries | 10 | Yes |
| Asset schedules | 5 | No |
| Supporting documents uploaded | 8 | Yes |
| All required doc types for the chapter present (paystub, bank statement, tax return, credit report) | 10 | Yes |
| All review flags resolved | 5 | No |

When a required check fails, it appears in a prominent "Missing" list with a specific hint:
- "Missing: tax return, credit report" (not just "documents needed")
- "At least one income source needed for means test"
- "Debtor first name, last name, SSN, and DOB required"

At 100%, the card shows a green "Ready to File" badge.

The dashboard shows the score as a color-coded chip per case, so the attorney can glance across 50 clients and immediately see which cases are blocked and why.

---

## Technical architecture

### Local (attorney's laptop)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Desktop shell | Electron 41 | Cross-platform desktop app (Mac/Windows/Linux) |
| Renderer | React 19 + esbuild | UI layer, single-page app |
| Database | SQLite via better-sqlite3 | All case data stored locally, WAL mode, foreign keys |
| OCR | tesseract.js | Local document text extraction with word bounding boxes |
| Image processing | sharp | SVG overlay compositing for visual redaction |
| PDF processing | pdf-lib + pdfjs-dist + canvas | Rasterize PDFs for OCR, rebuild redacted PDFs |
| LLM SDK | @anthropic-ai/sdk | API calls to Claude (routed through proxy) |
| Styling | CSS custom properties | Design system with ink/paper/cream/sage/accent palette |

### Database schema

```
cases (id, case_number, status, chapter, district, practice_type, filed_at, created_at, updated_at)
  ├── debtors (id, case_id, is_joint, first_name, last_name, ssn, dob, address_*, phone, email)
  ├── income (id, case_id, debtor_id, source, employer_name, gross_monthly, net_monthly, pay_frequency)
  ├── expenses (id, case_id, category, description, monthly_amount)
  ├── assets (id, case_id, schedule, category, description, current_value, exemption_statute, exemption_amount)
  ├── creditors (id, case_id, name, address, account_number, debt_type, schedule, amount_claimed, collateral_description, is_disputed, is_contingent)
  ├── documents (id, case_id, filename, file_path, doc_type, extracted_data, uploaded_at)
  ├── review_flags (id, case_id, section, field_path, note, resolved, created_at)
  └── case_events (id, case_id, event_type, description, metadata, occurred_at, created_at)
```

PI cases add:
```
  ├── pi_details (case_id, accident_date, accident_type, location, police_report, insurance_*, liability_*, ...)
  ├── pi_medical_records (id, case_id, provider, type, dates, diagnosis, treatment, billing)
  ├── pi_valuation (case_id, special_damages, general_damages, demand_amount)
  └── pi_settlement (id, case_id, type, amount, date, terms)
```

### Cloud (LLM proxy only — no case data)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| LLM proxy | LiteLLM on Railway | Routes API calls, validates master key, holds real Anthropic API key |
| Container | Docker (Dockerfile in `litellm/`) | ghcr.io/berriai/litellm base image with custom config.yaml |
| Config | config.yaml | Model routing (tabula-extract → Claude Sonnet 4), master key auth |
| Cost | ~$5/mo | Railway hobby plan |

The proxy is in "relay-only" mode: no database, no virtual keys, no spend tracking, no Presidio guardrails. All of those can be re-enabled by adding a Postgres service to the Railway project and uncommenting config sections.

### Privacy flow diagram

```
Attorney's laptop                       Railway                  Anthropic
─────────────────                       ───────                  ─────────

Original document ────┐
  (real PII)          │
                      ▼
              Local OCR (tesseract.js)
                      │
                      ▼
              PII detection (regex + debtor lookup)
                      │
                      ▼
              Visual redaction (sharp / pdf-lib)
                      │
                      ▼
              Redacted temp copy ─── HTTPS ──▶ LiteLLM ─── HTTPS ──▶ Claude Sonnet 4
              (black boxes over PII)            │  (real key             │
                      │                         │   here only)           │
                      │                         │                        │
                      ▼                         ▼                        ▼
              Delete temp file              Audit log              Extracted JSON
                      ▲                    (when enabled)              │
                      │                                                │
                      └──────────── Extracted JSON ◀───────────────────┘
                                          │
                                          ▼
                                  Auto-populate case DB
                                  + Timeline event logged
```

---

## Testing

**60 automated unit tests** via the built-in `node:test` runner. Zero external test dependencies.

### Redaction tests (30)

- Each PII pattern tested against positive and negative cases
- **Regression tests**: phone regex does NOT match SSNs, does NOT match dollar amounts, does NOT match bare 10-digit employee IDs
- SSN regex excludes ITINs (9xx-xx-xxxx)
- Unlabeled dates (pay periods) are NOT flagged as DOBs
- Debtor name matching with middle names, middle initials, reverse "Doe, John" form
- Overlap dedup prefers longer matches
- End-to-end paystub fixture: verifies all PII caught, all financial figures preserved
- Word-to-bbox mapping: cursor advance past OCR misses, multi-word span handling, approximate entries excluded

### Completeness tests (14)

- Empty case reports not-ready with missing items listed
- Weight ordering: highest-weight missing items appear first
- Optional items (assets, review flags) don't block "ready to file"
- Required doc types per chapter: fails specifically for missing types, names the missing type in the hint
- Full case scores 100% and shows "ready"
- Partial case scores proportionally between 0 and 100

### Deadline tests (14)

- Chapter 7 produces 341 meeting, objection deadline, expected discharge, financial management course
- Chapter 13 produces plan confirmation (45d per § 1324), first plan payment (30d per § 1326)
- Chapter 13 341 window is wider (21-50d vs 21-40d)
- Status annotation: upcoming for future dates, past for expired, completed for discharged cases
- Firm-wide aggregation: skips unfiled cases, sorts ascending, respects limit
- Includes debtor name and chapter in the aggregated output

### Running tests

```bash
npm test
```

All 60 tests run offline in ~150ms. No API keys, no network calls, no Docker.

---

## Demo and development scripts

### Generate sample documents

```bash
node scripts/generate-samples.js
```

Creates three PNG images in `scripts/samples/` with realistic but fake data:
- `sample_paystub.png` — employer, SSN, DOB, phone, email, address, gross/net pay, deductions, YTD, account/routing numbers
- `sample_bank_statement.png` — account details, monthly expenses by category, phone/email
- `sample_tax_return.png` — SSN, DOB, address, income, deductions, tax

All use "John Q. Doe" / SSN "123-45-6789" / address "742 Evergreen Terrace" so the debtor-context redaction can be tested.

### Verify redaction on any document

```bash
node scripts/verify-redaction.js <path-to-file> [debtor-name] [debtor-street]
```

Example:
```bash
node scripts/verify-redaction.js scripts/samples/sample_paystub.png "John Doe" "742 Evergreen Terrace"
```

Output:
```
PII detected: 9

Detections by type:
  phone                2
  debtor_name          1
  ssn                  1
  dob                  1
  debtor_address       1
  email                1
  account              1
  routing              1

To visually inspect:
  open "/var/folders/.../tabula-redacted-XXXX-sample_paystub.png"
```

Open both files side-by-side. The redacted version has black rectangles over PII; financial numbers stay visible.

### Audit what gets sent to Claude at extraction time

Set `TABULA_KEEP_REDACTED=1` in `.env`. Now every extraction in the Electron app logs the path of the exact redacted file sent to Claude:

```
[redaction] KEEPING redacted file for inspection: /var/folders/.../tabula-redacted-XXXX.png
```

Open that file to see what Claude actually received. Remove the env var for production-style cleanup.

---

## Environment configuration

### Local `.env` (attorney's laptop)

```bash
# LiteLLM master key — NOT the real Anthropic key. The Anthropic SDK
# sends this to the proxy, which validates it. The real key only
# lives on Railway.
ANTHROPIC_API_KEY=sk-tabula-prod-<your-master-key>

# Route requests through the self-hosted proxy instead of hitting
# Anthropic directly. Remove to bypass the proxy (local redaction
# still runs regardless).
LITELLM_BASE_URL=https://tabula-mvp-production.up.railway.app

# Set to 1 to keep redacted files in /tmp for audit inspection.
# Remove or set to 0 for production cleanup.
TABULA_KEEP_REDACTED=0
```

### Railway environment variables (LiteLLM proxy)

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...    # real Anthropic key (only place it exists)
LITELLM_MASTER_KEY=sk-tabula-prod-... # shared secret clients authenticate with
```

### Running locally

```bash
git clone https://github.com/get-cybersphere/tabula-mvp.git
cd tabula-mvp
npm install
cp .env.example .env   # fill in the values above
npm run dev             # starts Electron + esbuild watcher
```

### Building desktop installers

```bash
npm run make            # produces .dmg / .exe / .deb / .rpm in out/make/
```

Note: unsigned builds trigger macOS Gatekeeper and Windows SmartScreen warnings. Code signing requires an Apple Developer account ($99/yr) and a Windows EV certificate ($300+/yr).

---

## Repository structure

```
tabula-mvp/
├── src/
│   ├── index.js                        # Electron main process: DB, IPC handlers, extraction pipeline
│   ├── preload.js                      # Context bridge exposing IPC to renderer
│   ├── index.html                      # Shell HTML
│   ├── main/
│   │   └── redaction/
│   │       ├── index.js                # Public API: redactForExtraction(), cleanup(), shutdown()
│   │       ├── detector.js             # PII detection rules (pure functions)
│   │       ├── redactor.js             # Visual redaction (sharp + pdf-lib compositing)
│   │       └── ocr.js                  # Tesseract.js wrapper with word-level bboxes
│   └── renderer/
│       ├── main.jsx                    # React entry point
│       ├── App.jsx                     # Router + layout shell
│       ├── pages/
│       │   ├── Dashboard.jsx           # Firm-wide command center
│       │   ├── CaseDetail.jsx          # Multi-tab case view (bankruptcy + PI)
│       │   ├── NewCase.jsx             # Case creation form
│       │   └── MeansTest.jsx           # Standalone means test wizard
│       ├── components/
│       │   ├── layout/Sidebar.jsx      # App navigation
│       │   └── case/
│       │       ├── AIAssistant.jsx     # Claude-powered case chat
│       │       └── PIWorkflow.jsx      # Personal injury tabs
│       └── lib/
│           ├── means-test.js           # Statutory means test calculation (pure)
│           ├── median-income.js        # 2024 Census state median data
│           ├── irs-standards.js        # IRS expense deduction tables
│           ├── case-completeness.js    # 9-check readiness scoring (pure)
│           └── deadlines.js            # Statutory deadline engine (pure)
├── litellm/
│   ├── Dockerfile                      # LiteLLM proxy container for Railway
│   ├── config.yaml                     # Model routing + auth config
│   ├── docker-compose.yml              # Local dev stack (LiteLLM + Postgres)
│   ├── .env.example                    # Template for proxy env vars
│   └── README.md                       # Deploy + verify instructions
├── test/
│   ├── redaction/
│   │   ├── detector.test.js            # 25 PII detection tests
│   │   └── redactor.test.js            # 5 word-bbox mapping tests
│   ├── completeness/
│   │   └── completeness.test.js        # 14 readiness scoring tests
│   └── deadlines/
│       └── deadlines.test.js           # 14 statutory deadline tests
├── scripts/
│   ├── generate-samples.js             # Create fake paystub/statement/return PNGs
│   └── verify-redaction.js             # Run pipeline on any file, save output for inspection
├── docs/
│   ├── PRODUCT.md                      # This file
│   ├── redaction-pipeline.md           # Architecture doc for the PII redaction flow
│   ├── redaction-proxy-design.md       # Design doc for the original proxy proposal
│   └── implementation-plan-v1-gaps.md  # Plan that drove the v1 feature work
├── .env.example                        # Template for local env vars
├── package.json                        # Dependencies + scripts
└── forge.config.js                     # Electron Forge packaging config
```

---

## What ships today vs. what's on the roadmap

### Ships today

- Full document ingestion + extraction pipeline with local PII redaction
- Bankruptcy: means test, creditors, income/expenses, assets, review flags
- Personal injury: accident details, medical records, valuation, settlement
- AI assistant with per-case context and conversation history
- Completeness tracker with specific missing-item hints
- Auto-generated timeline per case + firm-wide activity feed
- Statutory deadline engine for Chapter 7 and Chapter 13
- Self-hosted LiteLLM proxy on Railway
- 60-test suite
- Demo/audit scripts for sample generation and redaction verification

### Not yet shipped

- PDF output of filled Form 122A / Schedules I, J, D, E, F / the petition itself
- E-filing integration with PACER / CM-ECF
- Client intake portal / per-case upload link
- Web app version
- Multi-tenant auth / team collaboration
- Packaged + code-signed desktop installers
- Virtual per-developer API keys with budget caps on the proxy
- Langfuse audit logging + Presidio guardrails on the proxy
- District-specific local rules and trustee preferences

---

## The pitch in one sentence

Upload your client's financial documents, get a completed means test with every number editable and every calculation shown — and their Social Security number never leaves your laptop.
