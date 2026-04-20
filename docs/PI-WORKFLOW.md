# Tabula Personal Injury Workflow

*Complete documentation of the PI case management module*

---

## What it does

Tabula's personal injury module turns the document-heavy intake process for a PI case into a structured, AI-assisted workflow. Upload a police report, medical bills, and insurance documents — Claude extracts the data, and the app auto-populates:

- Accident details and liability assessment
- Both insurance carriers (client's + at-fault party's) with coverage limits, adjusters, claim numbers
- Medical provider records with full billing breakdowns and lien tracking
- Case valuation with pain-and-suffering multiplier, comparative fault adjustment, and settlement distribution
- Settlement negotiation log with visual timeline

The same PII redaction pipeline that protects bankruptcy client data runs on PI documents. SSNs, DOBs, account numbers, addresses, and phone numbers are blacked out locally before any document reaches Claude.

---

## The demo flow (5 documents, 5 clicks, no typing)

### Prerequisites

Generate the sample documents:

```bash
node scripts/generate-pi-samples.js
node scripts/generate-pi-extras.js
```

This creates 5 files in `scripts/samples/pi/`:

| File | What it represents |
|------|-------------------|
| `police_report_apd_2026_04821.png` | Austin PD crash report — rear-end collision at Congress & 6th |
| `insurance_declaration_progressive.png` | Client's Progressive auto policy with BI, UM/UIM, MedPay limits |
| `medical_bill_st_davids.png` | St. David's ER — day-of-accident, $9,250 billed, 4 ICD-10 diagnoses |
| `medical_bill_austin_spine.png` | Spine specialist — MRI showing C5-C6 herniation, 2 visits, $1,085 on lien |
| `medical_bill_lonestar_pt.png` | Physical therapy — 6 of 36 visits, $1,910 billed, $11,210 projected total |

### Step 1 — Create the case

Click **+ Create** in the sidebar. Select **Personal Injury** as practice area.

```
First Name:  Maria
Last Name:   Garcia
Phone:       (512) 555-1234
Email:       mgarcia@email.com
Street:      456 Oak Lane
City:        Austin
State:       TX
ZIP:         78702
District:    W.D. Texas
```

Click **Create Case**. The app opens the case detail with PI-specific tabs.

### Step 2 — Upload all 5 documents

Go to the **Documents** tab. Click the upload zone. Navigate to `scripts/samples/pi/`, select all 5 files, click Open.

The app auto-detects document types from filenames:
- `police_report_*` → police report
- `medical_bill_*` → medical bill
- `insurance_declaration_*` → insurance declaration

### Step 3 — Extract each document

Click **Extract Data** on each row. Claude reads the document (through the redaction pipeline) and returns structured JSON. The app auto-populates:

| Document extracted | What gets populated |
|-------------------|-------------------|
| Police report | **Accident & Insurance tab**: accident date (03/15/2026), type (auto), location (Congress & 6th), full narrative description, police report # (APD-2026-04821), weather (clear), at-fault party (John Smith), at-fault insurance (State Farm), citations issued |
| Insurance declaration | **Accident & Insurance tab**: client's carrier (Progressive), policy # (PRG-445821), BI limits ($50K/$100K), UM/UIM ($50K/$100K), MedPay ($10K), PIP ($2,500), claim # (PRG-CL-2026-88192), adjuster (Rebecca Torres), at-fault claim # (SF-2026-331847), at-fault adjuster (Tom Wilson) |
| St. David's ER bill | **Medical Records tab**: provider (St. David's), type (emergency_room), date (03/15/2026), diagnoses (cervical strain, lumbar sprain, concussion, chest contusion — with ICD-10 codes), 7 CPT procedures, $9,250 billed, $6,800 insurance paid, $2,200 lien |
| Austin Spine bill | **Medical Records tab**: provider (Austin Spine & Pain Center), type (orthopedic), 2 visits, MRI findings (C5-C6 herniation, L4-L5 protrusion), $1,085 billed, $1,085 lien |
| PT record | **Medical Records tab**: provider (Lonestar PT), type (physical_therapy), 6 visits completed of 36 authorized, progress notes, functional limitations, $1,910 billed, $11,210 projected total, $1,910 lien |

### Step 4 — Review the populated tabs

Everything is filled in. No manual data entry.

---

## Tab-by-tab reference

### Overview

The overview adapts based on practice type. For PI cases:

**Summary stats row:**
- **Medical Bills** — total billed across all providers (sum of `total_billed` from medical records)
- **Insurance Paid** — total paid by insurance (sum of `total_paid`)
- **Outstanding** — difference between billed and paid
- **Liens** — total medical liens filed

**Client Information card** — name, SSN (masked), DOB, phone, email. Editable inline.

**Address card** — street, city, state, ZIP. Editable inline.

**Deadlines card** — statute of limitations and other PI-relevant deadlines (when implemented).

Note: the **Joint Filing** section and **Petition Readiness** panel are hidden for PI cases — those are bankruptcy-specific.

---

### Accident & Insurance

Two cards side by side, plus a full edit form.

**Accident Details card:**

| Field | Description |
|-------|-------------|
| Accident Date | Date the accident occurred |
| Accident Type | Dropdown: Auto, Truck, Motorcycle, Pedestrian, Slip & Fall, Workplace, Medical Malpractice, Product Liability, Dog Bite, Other |
| Location | Intersection, address, or location description |
| Police Report # | The law enforcement report number |
| Weather Conditions | Weather at the time of accident |
| Comparative Fault % | Client's share of fault (0-100). Matters in modified comparative negligence states like Texas where >50% = no recovery |
| Description | Free-text narrative of how the accident happened |
| Liability Assessment | Attorney's notes on liability strength |

**Insurance Information card** — split into two columns:

*Client's Insurance:*

| Field | Description |
|-------|-------------|
| Company | Client's auto insurance carrier |
| Policy # | Policy number |
| Adjuster | Assigned adjuster name |
| Adjuster Phone | Adjuster direct line |
| Claim # | Claim number for the loss |
| Coverage Limit | Bodily injury limit |

*At-Fault Party Insurance:*

| Field | Description |
|-------|-------------|
| At-Fault Party | Name of the at-fault driver/entity |
| Insurance | At-fault party's carrier |
| Policy Limit | At-fault BI policy limit (the "target" for recovery) |
| UM/UIM | Whether client has uninsured/underinsured motorist coverage and the limit |

**Auto-populated from documents:**
- Police report extraction fills accident details + at-fault party info
- Insurance declaration extraction fills both insurance columns

**Edit mode:** Click "Edit" on either card to open the full form. All fields are editable and saveable.

---

### Medical Records

The central medical tracking hub. Everything PI attorneys need to build the "specials" number for the demand.

**Summary stats at top:**
- Total providers
- Total billed (across all providers)
- Total paid
- Outstanding liens

**Provider table:**

| Column | Description |
|--------|-------------|
| Provider | Hospital, clinic, or doctor name |
| Type | emergency_room, hospital, orthopedic, chiropractor, physical_therapy, neurologist, pain_management, surgeon, imaging, pharmacy, other |
| Visits | Total visit count |
| First Visit | Date of first treatment |
| Last Visit | Date of most recent treatment |
| Billed | Total charges from this provider |
| Lien | Medical lien amount (if filed) |
| Status | ongoing, completed, referred, pending_records |

Each row has Edit and Delete buttons.

**Add/Edit modal:**

Full form for adding or editing a medical provider record:
- Provider name and type
- Treatment description
- First visit / last visit / total visits
- Total billed / total paid
- Lien checkbox + lien amount
- Status (ongoing / completed / referred / pending records)
- Notes (free text for diagnoses, procedures, treatment plans)

**Auto-populated from documents:**
- Each medical bill extraction creates a new provider row with all fields filled. Diagnoses and procedures are combined into the notes field with ICD-10/CPT codes preserved.
- The "has lien" and "lien amount" fields are populated if the medical bill mentions a lien.

---

### Case Valuation

The math engine for PI case value. Pulls data from medical records and accident details to compute a demand-ready number.

**Left column — Damages:**

| Line item | Source |
|-----------|--------|
| Medical Specials | Sum of `total_billed` from all medical records (auto-calculated) |
| Pain & Suffering | Medical specials × multiplier (attorney-controlled dropdown: 1x to 5x) |
| **Gross Case Value** | Medical specials + pain & suffering |
| Comparative Fault reduction | Gross value × comparative fault % from accident details |
| **Net Case Value** | Gross value minus fault reduction |

**Right column — Settlement Distribution:**

| Line item | Calculation |
|-----------|-------------|
| Gross Recovery | Net case value (from left column) |
| Attorney Fee | 33.33% contingency (standard, will be configurable) |
| Estimated Costs | $2,500 placeholder (filing fees, copies, postage — will be editable) |
| Medical Liens | Sum of all lien amounts from medical records |
| **Net to Client** | Gross recovery minus fees, costs, and liens |

**Pain & Suffering multiplier:**

The dropdown offers 1x through 5x in 0.5 increments. This is the attorney's judgment call, not a formula. Rough guidelines:

| Injury severity | Typical multiplier |
|----------------|-------------------|
| Soft tissue, full recovery in weeks | 1x – 1.5x |
| Moderate injury, months of treatment | 2x – 3x |
| Serious injury, surgery, permanent effects | 3x – 4x |
| Catastrophic / TBI / permanent disability | 4x – 5x |

The app doesn't prescribe — the attorney dials it based on their experience and jurisdiction.

**Recovery Analysis card** (appears when at-fault policy limit is known):

Three columns comparing:
- Net Case Value (what the case is worth)
- Max Recovery / Policy Limits (at-fault BI limit + UM/UIM if available)
- Coverage Gap (positive = fully covered, negative = case value exceeds available insurance)

If there's a gap, a warning appears: "Case value exceeds available policy limits. Consider UM/UIM claim, personal assets of at-fault party, or umbrella/excess policies."

This is the data the attorney needs to decide: send a policy-limits demand, pursue UM/UIM, investigate the at-fault party's personal assets, or look for umbrella coverage.

**Example with the Maria Garcia demo case:**

```
Medical Specials:                        $12,245
  St. David's ER:         $9,250
  Austin Spine:            $1,085
  Lonestar PT:             $1,910

Pain & Suffering (3x):                   $36,735

Gross Case Value:                        $48,980
Comparative Fault (0%):                  -$0
Net Case Value:                          $48,980

Settlement Distribution:
  Gross Recovery:                        $48,980
  Attorney Fee (33.33%):                 -$16,327
  Estimated Costs:                       -$2,500
  Medical Liens ($5,195):                -$5,195
  Net to Client:                         $24,958

Recovery Analysis:
  Case Value:              $48,980
  Max Recovery:            $150,000  (State Farm $100K + Progressive UM $50K)
  Coverage:                Fully Covered
```

---

### Settlement Tracker

A chronological log of all negotiation activity on the case.

**Entry types:**
- **Demand** — demand letter sent by the firm
- **Offer** — settlement offer received from insurance
- **Counteroffer** — counter-demand from either side
- **Final Settlement** — agreed settlement amount
- **Mediation Result** — result from a mediation session

**Each entry records:**
- Date
- Type (demand / offer / counter / final / mediation)
- From party (who sent it — "Firm", "State Farm", "Mediator", etc.)
- Amount
- Notes (free text)

**Visual timeline:** entries are displayed as a vertical timeline with colored dots per type. The full negotiation arc is visible at a glance:

```
DEMAND      04/10/2026 — Firm           $55,000
  "Initial demand sent to State Farm via certified mail"

OFFER       04/25/2026 — State Farm     $18,000
  "First offer from adjuster Tom Wilson"

COUNTER     05/02/2026 — Firm           $42,000
  "Counter with supporting medical documentation"
```

**Why this matters for the attorney:** when the adjuster calls with a counter-offer, the attorney opens this tab and sees the full history instantly — what they demanded, what was offered, what they countered with, and when. No digging through email threads.

---

### PI Deadlines

Statute of limitations and procedural deadlines computed from the accident date:

| Deadline | Rule (Texas example) |
|----------|---------------------|
| Statute of Limitations | 2 years from accident date (Tex. Civ. Prac. & Rem. Code § 16.003) |
| Government entity notice | 6 months (Texas Tort Claims Act) |
| UM/UIM filing deadline | Per policy terms, typically 2 years |
| Medical records request | Best practice: within 30 days of retention |
| Demand letter target | Typically 60-90 days before SOL expiry |

Each deadline has a countdown and severity indicator. Overdue deadlines appear in red on the dashboard.

---

### Timeline

Same auto-generated event timeline as bankruptcy cases. Every action on the case produces a timestamped event:

- `pi_details_extracted` — "Police report extracted: APD-2026-04821"
- `insurance_extracted` — "Insurance info extracted: Progressive, BI limit $50,000"
- `medical_record_extracted` — "Medical record extracted: St. David's — $9,250 billed"
- `document_uploaded` — "Uploaded police_report_apd_2026_04821.png"
- `document_extracted` — "Extracted police_report_apd_2026_04821.png"

Visible in the Timeline tab and on the firm-wide Recent Activity feed on the dashboard.

---

### AI Assistant

The slide-out Claude-powered chat panel works for PI cases with full context:

- Knows the accident details, insurance carriers, all medical records, settlement history
- Maintains per-case conversation history

**Example queries:**

- "What's the total medical exposure on this case?"
- "Draft a demand letter summary for State Farm based on the medical specials"
- "What are the strongest liability arguments given the police report?"
- "Is UM/UIM worth pursuing given the policy limits?"
- "Summarize the treatment timeline for the demand package"
- "What's the net to client at a 3x multiplier vs 4x?"
- "What deadlines should I be watching for this case?"

---

## Document types the PI module extracts

| Doc type | Filename triggers | Extraction prompt | Auto-populates |
|----------|-------------------|-------------------|----------------|
| `police_report` | "police", "accident_report", "crash", "incident" | Extracts report #, accident date/time/location/type, narrative, at-fault party, witnesses, citations, injuries, hospital transport | `pi_details` table — accident fields + at-fault party info |
| `medical_bill` | "medical", "hospital", "bill", "invoice", "eob", "treatment" | Extracts provider, type, date, diagnoses (ICD-10), procedures (CPT), billed/paid/outstanding, lien status | `pi_medical_records` table — one row per provider |
| `insurance_declaration` | "insurance", "declaration", "policy", "coverage", "claim" | Extracts carrier, policy #, BI/PD/UM/UIM/MedPay/PIP limits, adjuster, claim # | `pi_details` table — insurance fields |

Each extraction goes through the same redaction pipeline as bankruptcy documents. PII is blacked out locally before Claude sees the document.

---

## Database schema (PI-specific tables)

```sql
-- Accident + insurance details (one row per case)
pi_details (
  case_id, accident_date, accident_type, accident_location,
  accident_description, police_report_number, weather_conditions,
  liability_assessment, comparative_fault_pct,
  insurance_company, insurance_policy_number, insurance_adjuster,
  insurance_adjuster_phone, insurance_claim_number, insurance_coverage_limit,
  at_fault_party, at_fault_insurance, at_fault_policy_limit,
  um_uim_available, um_uim_limit,
  created_at, updated_at
)

-- Medical providers + treatment tracking (N rows per case)
pi_medical_records (
  id, case_id, provider_name, provider_type, treatment_type,
  first_visit, last_visit, total_visits,
  total_billed, total_paid, lien_amount, has_lien,
  status, notes,
  created_at, updated_at
)

-- Settlement negotiation log (N rows per case)
pi_settlements (
  id, case_id, date, type, from_party, amount, notes, created_at
)

-- Statute of limitations tracking
pi_statutes (
  id, case_id, statute_type, jurisdiction, deadline, filed_date, notes, created_at
)
```

---

## What ships today vs. roadmap

### Ships today

- Full PI case creation with practice-type-aware tabs
- Document extraction with PI-specific Claude prompts (police report, medical bill, insurance declaration)
- Auto-population of accident details, insurance info, and medical records from extracted documents
- Medical records tracking with provider table, billing summaries, lien tracking
- Case valuation calculator with pain-and-suffering multiplier, comparative fault, attorney fees, lien deductions, net-to-client
- Recovery analysis comparing case value to available policy limits
- Settlement negotiation log with visual timeline
- AI assistant with full PI case context
- PII redaction on all documents before Claude extraction
- Auto-generated event timeline for all PI case actions
- 5 realistic sample documents for demo and testing

### Roadmap

- **Demand letter generation** — use the AI assistant + case data to produce a formatted demand letter with medical chronology, special damages itemization, and liability argument
- **Lien negotiation tracking** — separate module for negotiating down medical liens (Medicare, Medicaid, health insurance subrogation)
- **Medical chronology builder** — auto-generated timeline of all treatment from medical records
- **Lost wages calculator** — detailed wage loss computation from employment records
- **Property damage module** — vehicle repair estimates, diminished value claims, rental car costs
- **Litigation tracking** — if the case goes to suit: court dates, discovery deadlines, deposition schedules, motion practice
- **Statute of limitations by state** — auto-populated based on accident state + type (currently Texas-centric)
- **Provider portal integration** — auto-request medical records from provider EMR systems
- **Client intake portal** — secure upload link for clients to submit accident photos, insurance cards, medical records directly
- **Multi-plaintiff support** — cases with multiple injured parties from the same accident
