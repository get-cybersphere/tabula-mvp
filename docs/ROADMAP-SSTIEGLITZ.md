# Tabula Platform Roadmap — Post-Demo Action Plan

*Based on attorney feedback from Sstieglitz demo, April 2026*

---

## Executive Summary

The demo validated two things: (1) the document ingestion + AI extraction pipeline works and impresses, and (2) the platform needs deeper legal intelligence to be credible for daily use. Three workstreams emerged, prioritized by what closes the deal fastest.

| Priority | Workstream | What it does | Effort | Blocker |
|----------|-----------|-------------|--------|---------|
| **P0** | PI Valuation Intelligence | Comparable verdict ranges + 6 parameters + precedent citations | 2-4 weeks | Verdict data source |
| **P1** | Estate Administration Module | New practice area — probate/intestate workflow + NY court packet auto-fill | 2-3 weeks | Need actual NY court forms |
| **P2** | AI Assistant Memory | Chatbot remembers prior conversations + case context across sessions | 1 week | None |

---

## P0: Personal Injury Valuation Intelligence

### The problem

Current valuation: `medical bills × multiplier = case value`. The attorney's response: *"Based on what? Show me comparable verdicts."*

Without precedent-backed valuation, the PI module is a calculator, not a legal tool. Opposing counsel and insurance adjusters will dismiss a demand that can't cite comparable outcomes.

### What we're building

#### Phase 1 — Smart Valuation UI (1 week, no external dependencies)

Add the 6 parameters Sstieglitz flagged to the Case Valuation tab:

| Parameter | UI element | Why it matters |
|-----------|-----------|---------------|
| **Jurisdiction** | County-level dropdown (not just state) | Travis County TX verdicts are very different from Harris County TX verdicts |
| **Accident type** | Dropdown: auto, truck, motorcycle, pedestrian, slip/fall, workplace, municipal, med mal, product liability | A slip/fall in a grocery store settles completely differently than a highway rear-end |
| **Plaintiff age** | Number input | A 25-year-old with 40 years of earning potential vs a 75-year-old retiree — drastically different future damages |
| **Injury severity** | Scale or dropdown: soft tissue / moderate / serious / severe / catastrophic | Broken arm vs spinal fusion vs TBI — different multiplier ranges, different jury sympathy |
| **Earning potential** | Occupation + annual income fields | A surgeon losing the ability to operate vs a janitor with a back injury — lost income calculations differ by orders of magnitude |
| **Policy limits** | Already in the UI (from insurance tab) | The ceiling on recovery regardless of case value — no point demanding $500K against a $100K policy |

**AI-estimated verdict range:** With these 6 parameters, Claude can produce a directionally accurate range even without a verdict database:

```
Estimated Verdict Range: $45,000 — $120,000

Based on: Travis County, TX | Rear-end auto collision
         | Cervical disc herniation (C5-C6) | Female, age 38
         | Administrative worker ($42K/yr) | Policy limit: $100K

Factors considered:
- Texas modified comparative negligence (0% client fault)
- Herniation cases in central TX typically settle above soft-tissue ranges
- Ongoing treatment projected ($11K PT remaining)
- Policy limit is $100K — case value approaches limit

⚠ AI-estimated range. Verify with jurisdiction-specific verdict research.
```

This is buildable immediately using the AI assistant we already have. It's not citable precedent, but it's informed and transparent about its limitations.

#### Phase 2 — Verdict Database Integration (2-3 weeks + external dependency)

Connect to a real verdict/settlement database so the valuation can cite:

> *"Smith v. Johnson (2024, Travis Co. TX) — rear-end collision, cervical herniation, female plaintiff age 34, $87,500 settlement. Davis v. Allstate (2023, Travis Co. TX) — similar facts, $62,000 verdict."*

**Data source options (ranked by feasibility):**

| Source | Cost | Data quality | API available | Timeline |
|--------|------|-------------|---------------|----------|
| **Claude's training data** | $0 | Directional, not citable | Already integrated | Now |
| **CourtListener** (Free Law Project) | $0 | Opinions yes, verdict $ amounts limited | Yes, REST API | 1 week to integrate |
| **VerdictSearch** (ALM/Law.com) | ~$100-200/mo | Excellent — dedicated verdict/settlement DB | Yes | 2 weeks (need account) |
| **Attorney's existing Westlaw** | $0 to us | Gold standard | Maybe — need to check account tier | Ask Sstieglitz |
| **Westlaw Content API** (own license) | ~$500-1000/mo | Gold standard | Enterprise sales process | 4-8 weeks |
| **State court public records** | $0 | Varies by state, incomplete | Scraping required | 2-3 weeks per state |

**Recommended path:** Start with Claude-estimated ranges (Phase 1, ship this week). Simultaneously ask Sstieglitz if they have Westlaw access we can query through. If yes, integrate through their account. If no, sign up for VerdictSearch as the mid-tier option.

#### Phase 3 — Similarity Scoring Engine (1-2 weeks, after Phase 2)

Once we have a verdict database, build a similarity scorer that ranks comparable cases by how closely they match the current case across the 6 parameters:

```
Similarity Score: 94%  — Garcia v. State Farm (2023, Travis Co.)
  ✓ Same county    ✓ Auto accident    ✓ Cervical herniation
  ✓ Female, age 36 (vs 38)    ~ Similar income ($38K vs $42K)
  Verdict: $72,000

Similarity Score: 87%  — Chen v. Progressive (2024, Williamson Co.)
  ✓ Adjacent county    ✓ Auto accident    ✓ C5-C6 herniation
  ✗ Male, age 29 (vs female 38)    ✓ Similar income
  Settlement: $91,000

Similarity Score: 71%  — Thompson v. GEICO (2023, Harris Co.)
  ✗ Different county    ✓ Auto accident    ✓ Disc herniation
  ✓ Female, age 41    ✗ Higher income ($78K)
  Verdict: $115,000
```

Each factor is weighted. Jurisdiction match is heaviest (same county > same state > different state). The attorney sees exactly why each comparable was selected and can add/remove cases from the comparison set.

---

## P1: Estate Administration Module

### The problem

Estate planning (drafting wills, trusts) is a different workflow from estate administration (handling someone's affairs after death). Sstieglitz says administration is the higher-value, higher-volume need — and it's underserved by existing tools.

### What we're building

A third practice area in Tabula alongside Bankruptcy and Personal Injury.

#### Database schema

```sql
-- Core estate case info
estate_details (
  case_id,
  decedent_first_name, decedent_last_name,
  decedent_ssn, decedent_dob, decedent_dod,       -- date of death
  death_type TEXT,                                  -- 'probate' | 'intestate'
  domicile_county, domicile_state,
  will_date, will_location,                         -- null if intestate
  estimated_estate_value,
  court_file_number,
  created_at, updated_at
)

-- Executor (probate) or Administrator (intestate)
estate_fiduciaries (
  id, case_id,
  role TEXT,                                        -- 'executor' | 'administrator' | 'co-executor'
  first_name, last_name,
  relationship_to_decedent,
  address, phone, email,
  bond_required INTEGER, bond_amount,
  letters_issued_date
)

-- Distributees — closest living relatives (intestate succession)
estate_distributees (
  id, case_id,
  first_name, last_name,
  relationship TEXT,                                -- 'spouse' | 'child' | 'parent' | 'sibling' | 'grandchild' | etc.
  age, is_minor INTEGER,
  address, phone,
  share_percentage,                                 -- intestate share per state law
  notes
)

-- Beneficiaries — named in the will (probate only)
estate_beneficiaries (
  id, case_id,
  first_name, last_name,
  relationship TEXT,
  bequest_description TEXT,                         -- "all real property" | "$50,000" | "residuary estate"
  bequest_type TEXT,                                -- 'specific' | 'general' | 'residuary'
  bequest_value,
  address
)

-- Assets split by type
estate_assets (
  id, case_id,
  asset_type TEXT,                                  -- 'probate' | 'non_probate'
  category TEXT,                                    -- 'real_estate' | 'bank_account' | 'investment' | 'vehicle' |
                                                    --   'life_insurance' | 'retirement' | 'personal_property' | 'business'
  description TEXT,
  institution TEXT,                                 -- bank name, brokerage, insurance company
  account_number TEXT,
  estimated_value,
  beneficiary_designated INTEGER,                   -- 1 = passes outside probate (life insurance, 401k, TOD accounts)
  deed_recorded INTEGER,                            -- for real estate
  notes
)

-- Court filings tracker
estate_filings (
  id, case_id,
  filing_type TEXT,                                 -- 'petition_probate' | 'petition_administration' |
                                                    --   'letters_testamentary' | 'letters_administration' |
                                                    --   'accounting' | 'citation' | 'waiver_citation' |
                                                    --   'affidavit_heirship' | 'renunciation'
  filed_date, due_date,
  court TEXT,
  status TEXT,                                      -- 'draft' | 'filed' | 'granted' | 'rejected'
  notes
)
```

#### UI tabs for estate cases

| Tab | Content |
|-----|---------|
| **Overview** | Decedent info, death type (probate/intestate badge), estate value, fiduciary info, filing status summary |
| **Decedent** | Full decedent profile: name, SSN, DOB, date of death, domicile, will info (if probate) |
| **Fiduciaries** | Executor(s) or Administrator(s) — name, relationship, contact, bond info, letters issued date |
| **Distributees** | Closest living relatives table — relationship, age, share % per intestate succession law. Only shown for intestate cases. |
| **Beneficiaries** | Named will beneficiaries — bequest description, type (specific/general/residuary), value. Only shown for probate cases. |
| **Assets** | Two-section layout: **Probate assets** (pass through the estate) and **Non-probate assets** (pass by beneficiary designation — life insurance, retirement, TOD accounts). Each has category, institution, value, description. |
| **Filings** | Court filing tracker with due dates. Links to auto-filled petition PDFs. |
| **Documents** | Same upload + AI extraction pipeline as bankruptcy/PI |
| **Timeline** | Auto-generated event log |

#### Key workflow distinction: Probate vs Intestate

When creating an estate case, the user selects **death type**:

**Probate (death with will):**
- Shows Beneficiaries tab (named in the will)
- Hides Distributees tab
- Filing type: Petition for Probate
- Fiduciary role: Executor
- Assets: need to distinguish what the will covers vs what passes by designation

**Intestate (death without will):**
- Shows Distributees tab (determined by state succession law)
- Hides Beneficiaries tab
- Filing type: Petition for Administration
- Fiduciary role: Administrator
- Distributee shares auto-calculated per state law (e.g., NY EPTL § 4-1.1)

#### NY Court Packet Auto-Fill

Sstieglitz specifically requested auto-fill for NY Surrogate's Court packets. These are standardized PDF forms:

| Form | Pages | What it captures |
|------|-------|-----------------|
| Petition for Probate (SCPA § 1402) | 4 pages | Decedent info, will details, nominated executor, list of distributees |
| Petition for Administration (SCPA § 1002) | 4 pages | Decedent info, closest relatives, nominated administrator, reason for administration |
| Oath of Executor/Administrator | 1 page | Fiduciary swearing to fulfill duties |
| Designation of Clerk for Service | 1 page | Service address for process |
| Affidavit of Heirship | 2 pages | Family tree establishing who the distributees are |
| Renunciation / Waiver of Citation | 1 page per distributee | Each distributee waiving their right to contest |

Of a 20-page packet, about 7-8 forms are relevant per case. The rest are instructions and copies.

**Implementation:** Use `pdf-lib` (already in deps) to fill the form fields programmatically from the estate_details + estate_distributees + estate_fiduciaries tables. Need the actual blank PDF forms from NY courts (downloadable from nycourts.gov) mapped field-by-field.

#### Document extraction for estate

| Doc type | What Claude extracts | Auto-populates |
|----------|---------------------|----------------|
| Death certificate | Decedent name, SSN, DOB, date of death, cause, domicile | `estate_details` |
| Will | Beneficiaries, bequests, named executor, will date | `estate_beneficiaries` + `estate_fiduciaries` |
| Deed / title | Property description, ownership, recording info | `estate_assets` (real estate) |
| Bank/brokerage statement | Account type, institution, balance, beneficiary designation | `estate_assets` |
| Life insurance policy | Carrier, policy number, face value, named beneficiary | `estate_assets` (non-probate) |
| Retirement account statement | Account type (401k/IRA), balance, beneficiary designation | `estate_assets` (non-probate) |

Same redaction pipeline — SSN, DOB, account numbers blacked out before Claude sees anything.

---

## P2: AI Assistant Memory

### The problem

Currently, the AI assistant's conversation history resets between sessions. The attorney asks "what did we discuss about the lien negotiation last week?" and gets nothing.

### What we're building

| Feature | Implementation |
|---------|---------------|
| **Per-case conversation persistence** | Already partially built — `window.tabula.ai.history(caseId)` exists in the AI assistant component. Need to verify the backend stores and retrieves conversations across app restarts. |
| **Cross-session context** | When the assistant starts a new conversation, inject a summary of prior conversations as system context: "In previous conversations about this case, the attorney discussed: lien negotiation strategy, demand timing, comparative fault concerns." |
| **Case state awareness** | Every time the assistant opens, inject the current case snapshot (latest medical totals, settlement status, deadline proximity) so it doesn't give stale advice. |
| **Suggested follow-ups** | After each response, suggest 2-3 follow-up questions based on what changed since the last conversation: "Since we last spoke, 2 new medical records were added ($3,200). Want me to update the valuation?" |

**Effort:** 1 week. Most of the infrastructure exists (conversation history IPC handlers, case context injection). The gap is persistence across app restarts and the "what changed since last time" logic.

---

## Implementation Timeline

### Week 1 (immediate)

| Day | Task | Deliverable |
|-----|------|-------------|
| Mon-Tue | Add 6 valuation parameters to PI Case Valuation UI | Jurisdiction (county), accident type, plaintiff age, injury severity, earning potential, policy limits all visible and editable |
| Wed | Claude-estimated verdict range based on 6 parameters | AI produces a range + reasoning, labeled as "AI-estimated, verify with case law" |
| Thu-Fri | Estate Administration: DB schema + practice area selector + basic tabs | "Estate Administration" appears in New Case, probate/intestate workflow selector works |

### Week 2

| Day | Task | Deliverable |
|-----|------|-------------|
| Mon-Tue | Estate: fiduciaries, distributees, beneficiaries tabs | Full UI for entering estate participants |
| Wed | Estate: asset inventory (probate vs non-probate split) | Two-panel asset tracking |
| Thu-Fri | Estate: document extraction prompts (death cert, will, deed, insurance) | Upload estate docs → auto-populate case |

### Week 3

| Day | Task | Deliverable |
|-----|------|-------------|
| Mon-Wed | NY court packet auto-fill (pdf-lib) | Download blank forms from nycourts.gov, map fields, generate filled PDFs |
| Thu | AI assistant memory — persistent conversations + case state injection | "What did we discuss last week?" actually works |
| Fri | Integration testing + demo prep | Full walkthrough: create estate case → upload death cert + will → auto-populate → generate NY petition packet |

### Week 4+

| Task | Dependency |
|------|-----------|
| VerdictSearch or Westlaw integration for PI | Account setup + API access |
| Similarity scoring engine | Verdict database access |
| State-specific intestate succession rules (beyond NY) | Legal research |

---

## Open Questions for Sstieglitz

Send these before building to avoid wasted work:

1. **Westlaw access:** Does your firm currently have a Westlaw subscription? If so, what tier? We may be able to integrate through your existing account for verdict searches.

2. **NY court forms:** Can you send us a blank set of the Surrogate's Court petition packets you typically file? We need the actual PDFs to map the form fields for auto-fill. (Or point us to the specific forms on nycourts.gov.)

3. **Intestate succession:** For the distributee share calculation, should we implement NY EPTL § 4-1.1 only, or do you handle estate cases in other states too?

4. **Which death type is more common in your practice?** Probate or intestate? This determines which workflow we polish first.

5. **Non-probate assets:** How much time do you spend tracking beneficiary-designated assets (life insurance, retirement accounts, TOD/POD bank accounts)? Is this a real pain point or mostly handled by the financial institutions directly?

6. **Chatbot memory:** When you say "memory functionality," do you mean: (a) the chatbot remembers what you discussed in prior sessions, or (b) the chatbot remembers your preferences and work style across all cases, or (c) both?

---

## Budget Estimate

| Item | Cost | Recurrence |
|------|------|-----------|
| Development (3 weeks) | Internal | — |
| VerdictSearch API (if chosen) | ~$150/mo | Monthly |
| Railway hosting (LiteLLM proxy) | ~$5/mo | Monthly |
| Anthropic API usage | ~$20-50/mo at current volume | Monthly |
| NY court form PDFs | $0 (public) | One-time |
| Apple Developer cert (for Mac distribution) | $99/yr | Annual |
| Windows EV cert (for Windows distribution) | $300+/yr | Annual |

**Total ongoing cost at current scale: ~$175-205/mo** (excluding code signing certs and development time).
