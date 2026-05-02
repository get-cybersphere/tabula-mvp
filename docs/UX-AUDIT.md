# Tabula — UX Audit & Walkthrough

**Date:** 2026-04-22
**Scope:** Full renderer (Electron + React) — every screen, every button, every inconsistency.
**Method:** Static analysis of `src/renderer/**`, `src/main/**`, `src/preload.js`, and `src/renderer/styles/global.css`. The Electron app was launched (`npm start` succeeded; renderer bundle 954.5kb) but this document is derived from code, not live clickthrough. Line numbers below refer to the source at the time of writing.

---

## 0. TL;DR

Tabula is a single-window Electron app with a fixed left sidebar, a main content area, and an optional right-hand AI panel. There are **7 top-level routes**, **2 parallel case workflows** (Bankruptcy, PI) that share an app shell but diverge in tabs and forms, and **~40+ discrete interactive controls** across those screens. Routing is home-grown state-based routing (no react-router usage), so there is **no browser back button, no URL history, and no deep-linking semantics** beyond what the sidebar and in-app navigation provide.

Top 5 UX smells (detail later):
1. No toast/notification system — silent success, silent failure (form errors log to console).
2. No destructive-action confirmations anywhere (delete creditor, delete joint debtor, remove asset, clear AI chat, etc.).
3. Naming drift — "Vault" vs "Cases", "Debtor" vs "Client", "Practice Type" vs "Case Type".
4. Inconsistent edit affordances — creditors edit inline, medical records open a modal, debtor toggles into an inline edit state, all in the same case.
5. No responsive design — hardcoded widths (sidebar 240px, AI panel 440px); breaks below 1024px.

---

## 1. App Shell & Global Chrome

### 1.1 Entry & bootstrap
- `src/renderer/main.jsx` — mounts React, imports `./styles/global.css`.
- `src/renderer/App.jsx` — home-grown router (lines 11-32). Uses `useState` to track a single `route` string, dispatches to page components based on prefix. `window.tabula.onNavigate()` (lines 36-39) lets the native menu bar push routes.
- `src/index.js` — main process. Opens a `1440×900` window (min `1024×700`), hidden title bar on macOS, loads `src/index.html`.

There is **no react-router**, **no URL bar**, **no history stack**. Every "back" action is a hand-coded `navigate('/')` or similar. This matters because:
- Refresh returns you to the default route, not where you were.
- No deep linking into a specific case tab from outside the app.
- Menu bar ↔ sidebar navigation is the only way to get between top-level screens.

### 1.2 Sidebar — persistent on every screen
File: `src/renderer/components/layout/Sidebar.jsx`. Fixed left, 240px, cream background (`#ece8e1`).

Top-to-bottom:
| Control | Action | Target |
|---|---|---|
| "Tabula" wordmark (serif) | decorative | — |
| **Create** button (icon + label, line 21-27) | `navigate('/cases/new')` | NewCase |
| **Assistant** (bold primary icon) | `navigate('/ai')` | TabulaAI |
| **Vault** (folder) | toggles open/closed; `navigate('/')` | Dashboard |
| ↳ **Intake** + count badge | `navigate('/?filter=intake')` | Dashboard filtered |
| ↳ **In Progress** + count badge | `navigate('/?filter=in_progress')` | Dashboard filtered |
| ↳ **Ready to File** + count badge | `navigate('/?filter=ready')` | Dashboard filtered |
| ↳ **Filed** + count badge | `navigate('/?filter=filed')` | Dashboard filtered |
| **Workflows** (chart icon) | `navigate('/ai?tab=workflows')` | TabulaAI (workflows view) |
| **History** (clock) | `navigate('/analytics')` | Analytics |
| **Library** (book) | `navigate('/means-test')` | MeansTest |
| **Guidance** (doc) | `navigate('/ai?tab=prompts')` | TabulaAI (prompts view) |

**Discrepancy:** "Vault" in the sidebar is called "Cases" on the page header of the destination. "Library" in the sidebar leads to the Means Test, not a document/form library. "Guidance" and "Workflows" both land on `TabulaAI` — same page, different query param — which users will not be able to tell apart until they read the view toggle.

### 1.3 AI Assistant panel — persistent while open on case detail
File: `src/renderer/components/case/AIAssistant.jsx`. Fixed right, 440px wide, only renders when `aiOpen` state is true on CaseDetail.

Structure (top to bottom):
- **Header** (lines 99-126): "Tabula AI" (serif) + "Case Assistant" (small mono). Right-aligned controls: trash icon ("Clear conversation", only visible when messages exist) and × ("Close").
- **Messages area** (lines 129-189):
  - Loading history → "Loading conversation…"
  - Empty → "Ask me anything about this case…" + 4 suggestion buttons that change per practice type:
    - Bankruptcy: "Should this be Chapter 7 or 13?" / "Are there any preference payments?" / "What exemptions apply?" / "Identify non-dischargeable debts"
    - PI: "What is the statute of limitations?" / "Draft a demand letter outline" / "What liens should I look for?" / "Estimate the settlement range"
    - General: "Summarize this case" / "What are the key deadlines?" / "Draft a case memo" / "What issues should I flag?"
  - User message → right-aligned, dark fill, rounded `14px 14px 4px 14px`.
  - Assistant → left-aligned, white with border, rounded `14px 14px 14px 4px`.
  - Errors → red fill.
  - In-flight → italic "Thinking…".
- **Input row** (lines 193-216): single-line text input + send arrow button. Placeholder "Ask about this case…". Enter sends, Shift+Enter newline. Disabled while a request is in flight.

**Discrepancies vs the standalone `/ai` chat:**
- Standalone uses a 3-row textarea ("Ask Tabula anything…") with a big "Ask Tabula" primary button; the in-case assistant uses a single-line input with an arrow icon.
- Standalone shows source connectors (Case Files, PACER, IRS Standards, State Law, Web Search, Westlaw); in-case assistant shows none.
- Standalone uses the label "Analyzing…"; in-case uses "Thinking…".
- Standalone has "New chat"; in-case has a trash icon. Different word, same action.

---

## 2. Screen-by-screen walkthrough

For each screen: what loads, every visible control, what each click does, where the state goes, and what breaks.

### 2.1 Dashboard — `/` (and `/?filter=<status>`)
File: `src/renderer/pages/Dashboard.jsx`.

**On load** runs in parallel (lines 66-78): `window.tabula.cases.list(filters)`, `window.tabula.stats.overview()`, `window.tabula.cases.list()` (unfiltered, for "allCases"), `window.tabula.events.recent(12)`. No loading indicator — the page renders whatever is in state (`cases=[]`, `stats={}`) until data arrives.

**Visible elements:**

1. **Page header** (lines 98-110):
   - Left: "Cases" (serif, 2rem) + "{N} total cases in your workspace"
   - Right: **New Case** button (primary) → `navigate('/cases/new')`
2. **Stats row** (lines 113-130) — 4 cards: Total Cases / Intake (blue) / In Progress (amber) / Ready to File (cream bg, accent text). Not clickable.
3. **Insights panel** (lines 132-306), two columns (60/40):
   - **Upcoming Deadlines** (left, lines 230-273) — up to 8 rows, each: label · debtor+chapter · absolute date · relative ("in 5d"). Left border color-coded (red overdue, amber critical, blue medium, gray low). Clicking a row → `navigate('/cases/{id}')`. Empty state: "No upcoming statutory deadlines. Deadlines appear after a case is filed."
   - **Recent Activity** (right, lines 276-304) — up to 12 events, each: description · debtor · relative time. Clickable to case. Empty state: "Upload documents or update cases to see activity here."
4. **Filter row** (lines 137-159):
   - Left: 5 pills — **All Cases** / **Intake** / **In Progress** / **Ready to File** / **Filed**. Only one active; active = dark fill. Click → `setStatusFilter(key)`, which triggers `loadData()` via `useEffect`.
   - Right: search input, placeholder "Search by name…". **No debounce** — every keystroke re-fires `loadData()` (lines 85-86).
5. **Cases table** (lines 162-217) — columns: Debtor · Chapter · District · Status · Completeness · Created. Each row is a click target → `navigate('/cases/{id})`.
   - Debtor cell: "{First} {Last} #{case_number}" (number omitted if missing).
   - Chapter: badge ("Ch. 7" / "Ch. 13") or blank for non-bankruptcy.
   - District: text or "—".
   - Status: colored badge (intake=blue, in_progress=amber, ready=green, filed=sage).
   - Completeness: pill with percentage, background tinted, plus a "missing" count and an optional "ready" label (computed lines 21-54).
   - Created: relative time.
   - Row hover: subtle bg tint. No right-click, no row action menu, no multi-select.
6. **Empty state** (lines 204-217) — folder icon, "No cases yet", explanatory copy, **Create First Case** button → `/cases/new`.

**What's happening under the hood:**
- `cases.list(filters)` → IPC → main process reads SQLite (`better-sqlite3`) at `app.getPath('userData')/tabula.db`, joins debtors, filters by status, returns JSON.
- `stats.overview()` → counts per status.
- `events.recent(12)` → last 12 rows from `timeline_events`.

**Discrepancies / smells:**
- Filter pills say "All Cases" / "Ready to File" but the sidebar says "Vault" / "Ready to File". Same labels when they match; inconsistent when they don't.
- "Ready to File" stat card uses a cream background + accent red text. Accent red is the same token used for destructive/critical elsewhere — seeing red next to "Ready to File" reads as a warning.
- Search has **no debounce**, no result count, and no empty-result messaging. If you search "asdf", the table simply goes empty with no "no matches".
- Completeness percentage on the table row is purely display — no click affordance to take you to the missing items. The Overview tab shows the same list with a useful "Missing" callout, but you have to know to go there.
- No column sort. No pagination.

---

### 2.2 NewCase — `/cases/new`
File: `src/renderer/pages/NewCase.jsx`.

**On load:** empty form, practice type defaults to "bankruptcy", chapter defaults to "7".

**Visible elements:**

1. **Page header** (lines 80-93): "New Case" (serif) + dynamic subtitle (e.g. "Create a new bankruptcy case"). Right-aligned **Cancel** button (ghost) → `navigate('/')`.
2. **Card 1 — Case Information** (lines 96-149):
   - **Practice Area pills** (4 buttons, lines 103-119): Bankruptcy / Personal Injury / Estate Administration / General / Other. Clicking calls `update('practiceType', key)`. Only one active.
   - **Chapter dropdown** (lines 125-132) — conditional, only when `practiceType === 'bankruptcy'`. Options: "Chapter 7 — Liquidation", "Chapter 13 — Wage Earner Plan".
   - **District dropdown** (lines 136-147) — 93 U.S. Bankruptcy Districts, placeholder "Select district…". Shown for **every** practice type, including PI and General where it doesn't apply.
3. **Card 2 — Debtor / Client Information** (lines 152-226). Card label swaps between "Debtor Information" and "Client Information" based on practice type (line 154).
   - Row 1: First Name (required) · Last Name (required)
   - Row 2: SSN (plain text, no masking, placeholder "XXX-XX-XXXX") · DOB (native date picker)
   - Row 3: Phone (tel) · Email (email)
4. **Card 3 — Address** (lines 229-278):
   - Street Address (full width)
   - Row: City · State (maxlen 2, auto-uppercase on input) · ZIP (maxlen 10)
5. **Footer** (lines 281-288):
   - **Cancel** (secondary) → `/`
   - **Create Case** (primary) — `onClick={handleSubmit}`. Disabled only while `saving === true`.

**What happens on Create Case (lines 49-76):**
1. Client-side validation: *only* `!firstName || !lastName` → early return (no visible error).
2. `saving = true`.
3. IPC `window.tabula.cases.create({ chapter, district, practiceType, debtor: {...} })`.
4. On success → `navigate('/cases/{result.id}/documents')` (jumps straight to Documents tab, **not** Overview).
5. On error → `console.error`, `saving = false`, no user-visible message.

**Discrepancies / smells:**
- District is shown for PI / Estate / General but is a **bankruptcy** concept. For a PI case it's either ignored or incorrectly persisted.
- SSN is plain text with no masking, no validation, no format enforcement. Phone and ZIP have no validation either.
- Only error path on submit is silent — if the DB write fails, the user sees no feedback, the button re-enables, and the page looks unchanged.
- On success, the jump to Documents tab skips Overview. A new user will not see the Completeness panel that would explain what's needed next.
- The "Cancel" button appears twice (header + footer), both doing the same thing.
- Label swap ("Debtor"/"Client") only appears on Card 2's header and the page subtitle. The submit button always says "Create Case" and the card header "Case Information" never changes — terminology is half-applied.

---

### 2.3 CaseDetail — `/cases/:id` and `/cases/:id/:tab`
File: `src/renderer/pages/CaseDetail.jsx` (1604 lines). This is the largest and densest screen.

**Shared shell (every tab):**

1. **Back link** (lines 98-102): arrow + "All Cases" → `navigate('/')`.
2. **Case header** (lines 105-151):
   - Left: "{First} {Last}" (serif, 2rem) + meta row: practice-type badge or "Chapter 7/13" badge · "District: {district}" · "Created: {relative}".
   - Right (lines 129-150):
     - **AI Assistant** toggle button (dark when panel open).
     - Status badge (read-only visual).
     - Status dropdown (select): intake / in_progress / ready / filed. Change → `cases.update(id, {status})` → reload.
3. **Tab strip** (lines 155-187) — tabs depend on practice type:
   - Bankruptcy: **Overview · Timeline · Documents · Assets · Creditors · Means Test · Review**
   - PI: **Overview · Accident & Insurance · Medical Records · Case Valuation · Settlement · Deadlines · Timeline · Documents · Review**
   - Active tab: dark fill. Tabs with data show a count badge.
4. **Tab content** below (lines 189-207).
5. **AI Assistant panel** on the right if open (lines 210-216, see §1.3).

Below: each tab in detail.

---

#### 2.3.A Overview (Bankruptcy) — lines 223-532

**Stats grid** (lines 312-333): Total Debt (red) · Total Assets · Monthly Income (green) · Monthly Expenses.

**Two-column grid** (lines 336-436):
- **Debtor Information card** (lines 337-391):
  - Display: Name · SSN masked as `***-**-{last4}` · DOB · Phone · Email
  - Header **Edit** button → toggles to edit mode (inline form in the same card). In edit mode: **Cancel** / **Save** in the same header slot.
- **Address card** (lines 394-435): same pattern, same Edit/Cancel/Save controls.

**Joint Debtor section** (lines 440-525, bankruptcy only) — tri-state:
- No joint + no form → "+ Add Joint Debtor" button, placeholder text below.
- Adding → full form with Cancel / Add Joint Debtor buttons.
- Exists → display grid + **Remove Joint Debtor** (no confirmation). Calls `debtors.delete(id)` on click.

**Deadlines card** (line 528) — `DeadlinesCard(caseData)`. Only renders if active deadlines exist. Same format as Dashboard deadlines.

**Completeness panel** (line 530, `CompletenessPanel`) — bankruptcy only.
- Header: "Petition Readiness" · "X of Y complete" · "Z%" · optional "Ready to File" badge.
- Progress bar (width = score%).
- "Missing (N)" red-bordered list with `!` icons, each with a label + hint. **No click target** — items are informational only.
- Checklist grid (2 columns) — circular checkboxes, filled when satisfied, faded when incomplete/optional, "optional" label suffix.

---

#### 2.3.B Overview (PI) — lines 284-334

Same two-column structure, different stat cards: Medical Bills (red) · Insurance Paid (green) · Outstanding (amber) · Liens. No Completeness panel.

---

#### 2.3.C Timeline — lines 1453-1525

Loads via `events.list(caseId)`.
- Loading: "Loading timeline…"
- Empty: card with "No timeline events yet" + explanatory copy.
- Populated: vertical timeline. Each row (TimelineEvent, lines 1494-1525): color-coded dot + connector line · description (bold) + event type (gray) · relative timestamp (mono, right-aligned).

No filtering, no date range. Read-only.

---

#### 2.3.D Documents — lines 671-733

- **Drop zone** (lines 678-686): 40px cloud icon, "Click to upload documents", helper text listing formats. Click → `documents.upload(caseId)` → native file picker.
- **Documents table** (lines 688-730):
  - Columns: Filename · Type · Uploaded · Extracted · (actions)
  - Per row: filename (bold), doc_type badge, relative uploaded time, "Extracted" (green) or "Pending". If pending → **Extract Data** button → `documents.extract(docId)`.

No drag-and-drop from OS into this tab (despite the "drop zone" label). No delete control. No preview.

---

#### 2.3.E Assets — lines 877-1015 (bankruptcy only)

- **Summary row** (lines 919-930): "{N} asset(s) — ${total} total value · ${exempt} exempt" + **+ Add Asset** button.
- **Add form** (inline, shows when `showForm`, lines 932-967): Category dropdown (real estate / vehicle / bank account / household goods / clothing / retirement / other) · Current Value · Description (full width) · Exemption Statute · Exempt Amount · **Cancel** / **Add Asset**.
- **Table** (lines 971-998): Description (bold) · Category · Schedule badge (Sch. A / Sch. B) · Value (mono, right) · Exempt (mono, right; green if >0, else "—").

No edit button per row, no delete button per row. Once added, you can't change it here.

---

#### 2.3.F Creditors — lines 736-874 (bankruptcy only)

- **Summary row** (lines 762-771): "{N} creditors — ${total} total claimed" + **+ Add Creditor**.
- **Add form** (inline, lines 774-824): Creditor Name · Amount Claimed · Debt Type (credit_card / medical / auto_loan / student_loan / mortgage / personal_loan / collections / tax / other) · Schedule (D-Secured / E-Priority Unsecured / F-Nonpriority Unsecured) · Account Number (placeholder "Last 4 digits") · Address · **Cancel** / **Add Creditor**.
- **Table** (lines 827-858): Creditor (name bold + account number small gray) · Type (underscores → spaces) · Schedule badge · Amount (mono, right) · Flags (blue "Disputed" / amber "Contingent" badges).

Like Assets, **no per-row edit or delete**.

---

#### 2.3.G Means Test — lines 1018-1351 (bankruptcy only)

- **Parameters card** (lines 1115-1147): State dropdown · Household Size (1-15) · Monthly Income/Expenses (read-only display) · **Run Means Test** (disabled if no income).
- **Result card** (lines 1150-1210, conditional): badge (Below/Above Median) · Recommendation · Confidence · Annualized Income · State Median · explanation paragraphs · warnings (red alert boxes if any) · deductions breakdown table.
- **Income Sources card** (lines 1216-1283): **+ Add Income** → inline form (Source dropdown / Employer / Gross Monthly / Net Monthly / Pay Frequency / buttons). List items show delete **×** (no confirm).
- **Expenses card** (lines 1287-1348): **+ Add Expense** → inline form (Category / Description / Monthly Amount / buttons). Delete **×** (no confirm).

**Discrepancy:** this tab overlaps the standalone Means Test screen (§2.5), but not cleanly — the standalone screen does document upload + extraction + save-to-case; the tab only lets you enter values manually and run the computation. A user who ran the standalone flow and saved to a case will find the numbers populated here but no breadcrumb about where they came from.

---

#### 2.3.H Review — lines 1355-1450

- **Add flag card** (lines 1377-1403):
  - Section dropdown: General / Debtor Info / Income / Expenses / Creditors / Assets / Means Test
  - Note text input · **Add** button. Enter key also submits (line 1398).
- **Open Flags** (lines 1406-1422): each row is section badge · note · **Resolve** button → `reviewFlags.resolve(id)`. No confirm.
- **Resolved Flags** (lines 1425-1438): faded, checkmark icon + note. No undo.
- Empty state (lines 1441-1448): "No review flags" + explanatory copy.

**Discrepancy:** "Resolve" is ambiguous — it means "mark this flag closed", not "fix the underlying issue". There's no link from a flag to the section it refers to.

---

#### 2.3.I PI-only tabs (file: `src/renderer/components/case/PIWorkflow.jsx`)

- **Accident & Insurance** (lines 11-325):
  - *Accident Details card* — display or edit mode (toggled by **Edit** in header). Fields: Date / Type / Location / Police Report # / Weather / Comparative Fault · Description · Liability Assessment.
  - *Insurance Information card* — two sub-sections ("Client's Insurance" and "At-Fault Party Insurance"). Each: Company / Policy # / Adjuster / Adjuster Phone / Claim # / Coverage Limit. At-Fault also shows At-Fault Party Name / Insurance / Policy Limit / UM/UIM checkbox + amount.
- **Medical Records** (lines 330-557):
  - Summary cards: Providers · Total Billed · Total Paid · Outstanding Liens.
  - Table header with **+ Add Provider**. Columns: Provider · Type · Visits · First Visit · Last Visit · Billed · Lien · Status · Edit · Delete (red, no confirm).
  - Add/edit opens a **modal** (lines 478-554) — dim overlay, dismissable by clicking the backdrop *or* Cancel. Contains: Provider Name · Type dropdown · Treatment Type · dates and visit count · billed/paid dollars · "Has Medical Lien" checkbox that reveals Lien Amount · Status dropdown · Notes textarea.
- **Case Valuation** (lines 562-888):
  - Parameters: Plaintiff Age (auto-filled from DOB) · Jurisdiction · Injury Severity dropdown · Occupation · Annual Income · **Estimate Verdict Range** button. Clicking hits `ai.chat(caseId, prompt)` with case context.
  - AI result card (conditional): confidence badge · Low/Median/High dollars · reasoning · key factor pills · warnings (red boxes) · disclaimer.
  - Calculator card: left = Damages (Medical Specials · Pain & Suffering with 1x–5x multiplier dropdown · Gross Case Value · Comparative Fault reduction if >0 · Net Case Value in green). Right = Distribution (Attorney Fee 33.3% · Estimated Costs $2500 hardcoded · Medical Liens · Net to Client).
- **Settlement**, **Deadlines**: also in PIWorkflow.jsx (same file). Follow the same list+form pattern. Each has list, add form, and per-row delete with no confirm.

**Discrepancy:** edit affordances in the same case are inconsistent — creditors and assets are inline, medical records are modal, debtor info is inline-edit-toggle, accident details are inline-edit-toggle. That is four different patterns for "edit a related record".

---

### 2.4 TabulaAI — `/ai`, `/ai?tab=workflows`, `/ai?tab=prompts`
File: `src/renderer/pages/TabulaAI.jsx`.

Two top-level states: **empty hero** (no conversation yet) and **conversation view**.

**Empty hero** (lines 125-253):
1. **Brand** (line 131): "Tabula" serif centered.
2. **Textarea** (lines 134-160): placeholder "Ask Tabula anything…", 3 rows, grows.
3. **Input bar** below (lines 146-160):
   - Left: two toggles — **Prompts** (speech bubble icon) and **Workflows** (chart icon). Clicking one changes `view` state (also reflected in URL tab param).
   - Right: **Ask Tabula** primary button, disabled while input empty.
4. **Sources row** (lines 164-171): 6 pills. "Case Files" (blue dot, connected), "PACER" (black, connected), "IRS Standards" (green, connected), "State Law" (gold, connected), "Web Search" (blue, connected), "Westlaw" (red dot, shows `+` — always not connected). None of these are actually wired; they're decorative.
5. **Case context picker** (lines 175-204):
   - Button with folder icon: "{First} {Last}" or "Set client matter".
   - If selected: **View case** button → `navigate('/cases/{caseId}')`.
   - Dropdown (when `showPicker`): list of cases with name/practice/chapter. Click to select. No search field — will be unwieldy past ~30 cases.
6. **Inline Workflows / Prompts** (lines 207-242):
   - `view === 'workflows'`: grid of cards, each shows title · description · type badge · step count. Click → injects a pre-built message into the chat.
     - Bankruptcy: "Run Means Test Analysis" (3 steps) / "Build Exemption Strategy" (4) / "Audit Creditor Matrix" (3) / "Pre-Filing Petition Review" (5)
     - PI: "Draft Demand Letter" (5) / "Full Case Valuation" (4) / "Medical Record Summary" (3) / "Lien Resolution Strategy" (4)
     - General: "Draft Case Memo" (4) / "Build Case Timeline" (3) / "Legal Research Brief" (4) / "Draft Client Letter" (2)
   - `view === 'prompts'`: grid of short-label cards. Click pre-fills the textarea and switches view to 'chat'.
     - Bankruptcy: Means test eligibility / Exemption analysis / Non-dischargeable debts / Chapter 13 plan feasibility
     - PI: Settlement range / Demand letter outline / Liability analysis / Lien identification
     - General: Case assessment / Research memo / Client update / Motion outline
7. **Default quick prompts** (lines 244-252, when `view === 'chat'`): first 4 prompts from PROMPTS.

**Conversation view** (lines 255-309):
- Sticky header: brand + "{First} {Last} ({practice type})" + **New chat** button.
- Scrollable messages (same bubble style as AI panel).
- Bottom input: text input + send arrow. Placeholder "Ask a follow-up…". Enter to send.

**Under the hood:**
- `handleSend()` (lines 90-115): if no case selected, returns a synthetic "Select a client matter above…" message locally; otherwise `ai.chat(caseId, message)`.
- Clear: `ai.clear(caseId)` + local reset.

**Discrepancies / smells:**
- Source connectors are decorative; nothing queries PACER, IRS, Westlaw, or the web. Showing them as "connected" is misleading.
- Workflow click sends a long canned prompt but doesn't indicate that it did — the textarea doesn't update, the message just appears in chat. Feels magical in a bad way.
- Clicking a Prompt card pre-fills the textarea instead of sending. Workflows send; Prompts prefill. Same-looking cards, different behavior.
- Case picker has no search.
- No case selected = no error, just an in-chat synthetic message. New user reads it and doesn't realize it isn't Claude.

---

### 2.5 MeansTest — `/means-test`
File: `src/renderer/pages/MeansTest.jsx`.

3-step wizard controlled by local `step` state.

**Header + stepper** (lines 918-928): "Means Test" title, "Back to Cases" ghost button, 3-step indicator (Upload → Extract → Review) with checkmarks for completed.

**API key banner** (lines 930-941): if `checkApiKey()` returns false, shows a red alert: "API key not configured. Set ANTHROPIC_API_KEY environment variable… Without it, document extraction will fail." Banner stays visible on all three steps.

**Step 1 — Upload** (UploadStep, lines 121-252):
- Empty zone: cloud icon, "Drop your financial documents here", "or click to browse files", helper text.
- Populated zone: "{N} document(s) ready", **Add Files** button, file list per file (icon · filename · size · category dropdown auto-guessed as paystub/bank_statement/tax_return/other · × delete).
- Footer: **Extract Financial Data** → `setStep(2)`.

**Step 2 — Extraction** (ExtractionStep, lines 255-360):
- "Extracting Financial Data" header.
- Per-file row: status icon (file → spinner → ✓ or ×) · filename · status text ("Waiting…" / "Analyzing Paystub…" / "Extracted 12 fields" / "Extraction failed — {error}") · progress bar · color code.
- Footer: **Back** (ghost, disabled until `allDone`) · **Review Results** (primary, appears when `allDone`).

Auto-starts extraction on mount; no start button. No cancel button during extraction.

**Step 3 — Review** (ReviewStep, lines 364-853):
- Summary cards (3): Monthly Income (green) / Monthly Expenses (red) / State Median (gray).
- Stacked bar: Expense/Remaining portion of Income, legend below.
- Two columns (60/40):
  - Left: Result card (Ch7/Ch13/Analysis badge · recommendation · confidence · explanation · warnings) and Math Breakdown table (annualized income, state median, above/below delta, deductions rows for national standards / health care / housing / transportation / secured debt / priority debt, disposable income, 60-month disposable).
  - Right: Case Parameters card (State dropdown · Household Size · Vehicles) · Income Sources card (add form + list + ×) · Expenses card (add form + list + ×) · Debt Payments card (Monthly Secured · Monthly Priority).
- Footer: **Start Over** (ghost, resets to step 1) · **Export Summary** (secondary, downloads `.txt` via blob — silent, no toast) · **Save to Case** (primary, opens modal).

**Save to Case modal** (lines 804-849):
- Backdrop (dark, click dismisses).
- Card: title, explainer text, First Name (autofocus) · Last Name inputs, **Cancel** / **Create Case**. On submit: `cases.create(...)` with extracted data, then `navigate('/cases/{id}')`.

**Discrepancies / smells:**
- API key banner is shown on all steps, including after extraction has already completed — once past step 1 it adds noise without adding value.
- Extraction can't be paused or cancelled; closing the app is the only exit.
- Debtor name is asked for at the end of the flow, after all the extraction work. If you planned to save to an existing case instead of creating a new one, there's no affordance.
- Export button is silent — no toast, no "downloaded" confirmation.

---

### 2.6 Analytics — `/analytics`
File: `src/renderer/pages/Analytics.jsx`.

Read-only dashboard. Loads on mount (`analytics.firmOverview()` + `stats.overview()`), shows "Loading analytics…" during fetch.

**Elements:**
1. Header: "Practice Analytics" + "Firm performance, revenue tracking, and case throughput".
2. 5-card revenue row: Total Revenue (green) · This Month (% change indicator) · Avg Fee / Case · Total Hours · Active Cases (blue).
3. Two-column grid:
   - **Cases by Practice Area** (lines 92-120): list with progress bars (sage/blue/amber/accent, cycled).
   - **Pipeline Status** (lines 124-143): bullet list status · count (right, mono).
4. **Monthly Trends** table (lines 148-177): Month · Cases · Revenue (mono, green). Empty state: "No data yet. Track fees on cases to see trends."

No interactions beyond viewing. No date range, no filters, no drill-down.

---

## 3. State, data, and IPC

- **No global state library** (no Redux, no Zustand usage in the renderer even though it's a dependency in `package.json`). Every page manages its own state with `useState`.
- **Data flow** is always: component mount → IPC call (through `window.tabula.*` defined in `src/preload.js`) → main process handler (in `src/main/**` and `src/index.js`) → better-sqlite3 query → JSON back to renderer → `setState`.
- **Database**: `app.getPath('userData')/tabula.db`, WAL mode, foreign keys on. Tables include `cases`, `debtors`, `income`, `expenses`, `assets`, `creditors`, `documents`, `review_flags`, `medical_records`, `settlements`, `pi_details`, `pi_statutes`, `notes`, `timeline_events`, `analytics`, `ai_conversations`.
- **AI**: `ai.chat(caseId, message)` → main process assembles case context → `@anthropic-ai/sdk` → response back → stored in `ai_conversations`.
- **File ops**: document upload goes through native file picker in the main process, files are copied into the userData directory (per `src/main/**` conventions); extraction calls Claude with base64'd/OCR'd content.

**IPC surface** (from `src/preload.js`):
- `cases.{list, get, create, update, delete}`
- `creditors.{list, upsert}`
- `debtors.{upsert, delete}`
- `income / expenses / assets` upsert/delete pattern
- `documents.{upload, list, extract}`
- `reviewFlags.{list, create, resolve}`
- `ai.{chat, history, clear}`
- `meansTest.{uploadFiles, extract, checkApiKey}`
- `analytics.{firmOverview, upsert}`
- `pi.details.{get, upsert}` / `pi.medical.{list, upsert, delete}` / `pi.settlements.{list, create, delete}` / `pi.statutes.{list, upsert, delete}`
- `stats.overview`, `events.{recent, list}`, `onNavigate`

---

## 4. Styling & visual consistency

### 4.1 Design tokens (`src/renderer/styles/global.css`)

- Ink `#0a0a0a` · Paper `#f6f4f0` · Cream `#ece8e1` · Warm Gray `#9e9589` · Accent `#c4553a` (red) · Sage `#4a6354` (green) · Blue `#3b6cb5` · Amber `#b8860b`.
- Type: "Instrument Serif"/Georgia (serif), "DM Sans"/system (sans), "JetBrains Mono"/SF Mono (mono).
- Radius: 6 (inputs/buttons) / 10 (cards) / 14 (alerts). Shadows at 3 scales.
- Buttons: `.btn .btn-primary / .btn-secondary / .btn-ghost / .btn-sm`.
- Forms: `.form-group .form-label .form-input .form-select .form-row .form-row-3`.

### 4.2 Inconsistencies I found

1. **Button styles drift by screen.** Primary on Dashboard is standard; on CaseDetail sub-tabs it's often `.btn-sm`. "Cancel" is sometimes secondary, sometimes ghost. No consistent disabled styling beyond opacity.
2. **Accent red overloaded.** Same color token is used for (a) destructive/critical, (b) "Ready to File" stat card text, (c) "Expenses" summary, (d) warnings in means test. A "Ready to File" pill reads as a warning at a glance.
3. **Status colors disagree.** Badge "ready" = green; stat card "Ready to File" = accent red. Badge "filed" = sage; stat card doesn't show filed.
4. **Typography hierarchy isn't enforced.** H2/H3 tags are used inconsistently; card titles are sans, page titles are serif, labels are mono-uppercase, section headers inside cards drift between sans-bold and mono-uppercase.
5. **Spacing varies inside cards.** Most card bodies are 22px padding; tables inside cards set padding to 0 on the body and push it into the `<td>`s, which gives a visibly different look card-to-card.
6. **No focus rings defined anywhere.** Keyboard users rely on browser defaults, which Electron sometimes suppresses.
7. **No ARIA labels on icon-only buttons** — the × delete, + add, trash (clear chat), arrow (send) buttons all lack labels.
8. **Color-only signaling** for severity/status. Color-blind users can't distinguish blue/amber/red badges without reading the text.
9. **Hardcoded widths.** Sidebar 240px, AI panel 440px, grid layouts use fixed `1fr 1fr`. No media queries found; app assumes ≥1024px.
10. **Inconsistent empty states.** Dashboard has a full empty state with icon + CTA. Timeline has text only. Means Test monthly trends has text only. Analytics has nothing for most cards (shows "$0"). Review tab has explanatory copy. There's no shared EmptyState component.
11. **Inconsistent loading.** Dashboard doesn't show loading at all. CaseDetail shows "Loading case…". Analytics shows "Loading analytics…". MeansTest step 2 shows per-file progress. No skeletons anywhere.

---

## 5. Cross-cutting UX discrepancies

1. **Naming drift**
   - "Vault" (sidebar) / "Cases" (page).
   - "Debtor" / "Client" — switched by practice type in some places but not others (submit button, card titles).
   - "Practice Type" / "Case Type" — used interchangeably.
   - "Library" means "Means Test".
   - "Guidance" and "Workflows" both land on TabulaAI with different tabs.

2. **Missing destructive-action confirmations** (every single one of these is a one-click irreversible action):
   - Remove Joint Debtor
   - Delete creditor (no per-row delete visible, but if added it would follow the pattern)
   - Delete income row × / Delete expense row ×
   - Delete medical record (red button)
   - Delete settlement / Delete statute
   - Clear AI conversation (trash icon)

3. **Silent failures**
   - NewCase submit error → `console.error` only.
   - Dashboard filter/search → on error, empty table, no indicator.
   - `documents.extract` → no error toast.
   - Means Test export `.txt` → silent download.

4. **Inconsistent modality**
   - Add creditor, add asset, add income, add expense, edit debtor, edit accident → **inline**.
   - Add/edit medical provider, Save-to-Case → **modal**.

5. **Dead-ends after create**
   - NewCase → Documents tab (skips Overview, user loses Completeness context).
   - Means Test → Save-to-Case → Case Overview (reasonable, but no "see what I extracted" affordance).

6. **Back-button inconsistency**
   - CaseDetail has "All Cases" (goes home).
   - NewCase has "Cancel" (goes home).
   - Means Test has "Back to Cases" (goes home) and internal step "Back".
   - TabulaAI has no back control at all.
   - Analytics has none.

7. **Things that look clickable but aren't**
   - Completeness percentage in Dashboard table — styled like a pill, not a link.
   - Status badge next to the status dropdown — same pill style as a clickable badge.
   - "Missing (N)" items in Completeness panel — look like menu items, don't navigate.

8. **Keyboard & accessibility gaps**
   - No focus trap in any modal (Save-to-Case, Add Medical Provider).
   - No ESC-to-close in any modal (click backdrop works, ESC doesn't).
   - Sidebar `<div>`s instead of `<nav>` and `<ul>`; no skip-to-content link.
   - Icon buttons have no accessible names.

9. **Two paths for the same work**
   - Means Test standalone (`/means-test`) vs Means Test tab inside a case. They share no code and don't reference each other. A user who started standalone and saved to a case will find the Means Test tab looks empty-ish until they click "Run Means Test" — there's no indicator that values were already extracted.

10. **AI sources claim**
    - `/ai` shows 5 connected sources (Case Files, PACER, IRS Standards, State Law, Web Search). In reality the AI only receives case data from SQLite; none of the others are wired. This is a credibility hit once users notice.

---

## 6. End-to-end flows

### Flow A — Create a bankruptcy case and prepare it for filing

1. Dashboard `/` → **New Case** (top-right) → `/cases/new`.
2. NewCase: select **Bankruptcy** pill (already selected by default) → Chapter stays **7** → pick **District** → enter First, Last (required) → optionally SSN, DOB, Phone, Email, address → **Create Case**.
3. App navigates to `/cases/{id}/documents`. **Friction:** user expected to land on Overview; has to click the tab.
4. User drops PDFs into the drop zone → auto-upload → per-row **Extract Data**.
5. User clicks **Assets** tab → **+ Add Asset** → inline form → **Add Asset**. Repeat.
6. User clicks **Creditors** tab → **+ Add Creditor** → inline form → **Add Creditor**. Repeat.
7. User clicks **Means Test** tab → pick state, household size → **Add Income** → **Run Means Test** → result card populates.
8. User clicks **Overview** → reads Completeness panel → sees Missing items.
9. User clicks **Review** tab → adds flags for follow-ups → resolves them as they go.
10. User changes **Status** dropdown to "filed".

Friction points along the way:
- Submit on step 2 with an empty last-name silently bails (no validation message).
- Step 7's **Run Means Test** button is disabled until income exists — message isn't explicit.
- Step 8's Missing items are descriptive but not linked.
- Step 9 has no "go to the section" affordance from a flag.

### Flow B — Standalone Means Test → save as a case

1. Sidebar → **Library** → `/means-test`.
2. Step 1: drop/browse files → auto-category → **Extract Financial Data**.
3. Step 2: extraction runs automatically; wait for all → **Review Results**.
4. Step 3: adjust state/household/debt inputs → read result and math.
5. **Save to Case** opens modal → enter First/Last → **Create Case** → redirect to `/cases/{id}` Overview.

Friction:
- API key warning visible throughout, even on step 3.
- No cancel during step 2.
- Silent `.txt` download on Export.
- Debtor name asked at the end, not at upload time.

### Flow C — Ask the AI about a case

1. On any CaseDetail tab → **AI Assistant** toggle.
2. Panel slides in; 4 suggestion buttons relevant to practice type.
3. Click a suggestion → pre-fill → Enter.
4. User message (right-aligned) → "Thinking…" → assistant response.
5. Follow-ups via the single-line input.
6. Close via × (ESC does not close; backdrop click does not close — this panel is pinned, not a modal).

Friction: the suggestion buttons truncate on the 440px panel for longer prompts. No way to see the full text before clicking.

### Flow D — Standalone assistant

1. Sidebar → **Assistant** → `/ai`.
2. Empty hero: type into the textarea or toggle Prompts/Workflows.
3. Click a Workflow card → sends a canned message; view switches to conversation (no visible "message queued" cue).
4. Or click a Prompt card → pre-fills textarea; user must hit Enter themselves.
5. Conversation continues in a chat panel. **New chat** clears.

Friction: Prompts vs Workflows behave differently despite identical affordance.

---

## 7. Recommendations (prioritized)

### P0 — correctness and trust
1. **Add a toast/notification system** (one `<Toaster>` at the root, a `useToast()` hook). Replace every `console.error`. Confirm successful upserts ("Creditor added", "Case created", "Export saved").
2. **Confirm destructive actions.** A single `confirm({title, body, danger: true})` utility. Wire it to every delete × and to "Clear conversation".
3. **Wire up form validation.** Minimum: required-field messaging inline, SSN mask, ZIP/phone format, email validity. On submit, scroll to first error.
4. **Don't claim data sources you don't have.** Either wire PACER / Westlaw / Web Search, or remove those pills from `/ai`.

### P1 — consistency
5. **Pick one edit pattern per type of object.** Recommendation: modal for create, inline-edit-toggle for update. Apply to creditors, assets, income, expenses, medical records, settlements.
6. **Unify terminology.** Decide: "Cases" or "Vault", "Debtor" or "Client" (or own the practice-type switch everywhere, consistently). Pick one. Do a pass.
7. **Unify close behavior.** Every modal: ESC closes, backdrop click closes, focus trap, focus returns to trigger. Pin AI panel: X closes.
8. **Shared `<EmptyState>`, `<LoadingSkeleton>`, `<Badge>`, `<PageHeader>` components.** Kill inline styles for these. Several screens are already 90% of the way there.

### P2 — navigation & context
9. **Adopt real routing** (react-router is in `package.json` but not used). Unlocks history, deep links, refresh-safety, and lets the browser back button work.
10. **Link Completeness panel Missing items to the sections that resolve them.** Click "Debtor SSN missing" → scroll to and focus the SSN field on Overview.
11. **Link Review flags to sections.** Same idea.
12. **Breadcrumbs** on CaseDetail: `All Cases › {Debtor} › {Tab}`. Cheap, big clarity win.
13. **Default new-case redirect to Overview**, not Documents. Show a banner: "Next: upload documents" with a button that opens the Documents tab.

### P3 — craft
14. **Debounce** Dashboard search (250ms). Add "No matches" empty state when filters yield nothing.
15. **Sortable columns** on Dashboard and Creditors/Assets/Medical Records.
16. **Unify status colors.** "Ready to File" should be sage green in both the stat card and the badge.
17. **Accessibility pass:** add ARIA labels on all icon buttons, use semantic `<nav>` in the sidebar, define a visible focus ring, test color contrast on amber/blue badges.
18. **Respect the window min size.** Either add media queries for <1024px or enforce the min-window size the main process already declares.
19. **Hide the API key banner** after extraction succeeds, or move it to Settings.
20. **Let the case picker in `/ai` filter.** A single input filters the dropdown.

### P4 — product clarity
21. **Reconcile the two Means Test flows.** Option: delete the standalone page and put its upload/extract/review inside the CaseDetail Means Test tab. Or keep both and show "Extracted from means test (Apr 22)" on the tab when data came from the standalone flow.
22. **Decide what the sources row on `/ai` actually is.** If it's a roadmap teaser, mark those pills "Coming soon" instead of showing them as connected.
23. **Distinguish Workflows from Prompts.** Different cards, different affordances, different labels. Workflows = "Run", Prompts = "Insert".

---

## 8. Appendix — file index

- App shell: `src/renderer/App.jsx`, `src/renderer/main.jsx`, `src/index.js`, `src/preload.js`, `src/index.html`
- Pages: `src/renderer/pages/Dashboard.jsx`, `NewCase.jsx`, `CaseDetail.jsx`, `TabulaAI.jsx`, `MeansTest.jsx`, `Analytics.jsx`
- Components: `src/renderer/components/layout/Sidebar.jsx`, `src/renderer/components/case/AIAssistant.jsx`, `src/renderer/components/case/PIWorkflow.jsx`
- Styling: `src/renderer/styles/global.css`
- Main process: `src/main/**` (IPC handlers), `src/index.js` (window config, DB init)

---

*Produced from static analysis on 2026-04-22. Line numbers may drift as the code evolves. Next pass should include a live click-through to validate timings, focus behavior, and error surface.*
