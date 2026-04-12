# Design: PII Redaction Proxy for Claude API Calls

**Date:** 2026-04-11
**Status:** Proposed
**Stakeholder:** Partner lawyer — requires PII protection before transmitting documents to third-party APIs

---

## Problem

The current `extractWithClaude()` function in `src/index.js` sends raw document bytes (PDFs, images) directly to the Anthropic API. These documents contain sensitive debtor information:

- Social Security Numbers
- Bank account numbers (full, not just last 4)
- Dates of birth
- Home addresses
- Phone numbers
- Employer-issued employee IDs
- Medical information (on some bank statements / collection notices)

Bankruptcy filings are subject to heightened privacy standards because they:
- Are federal court records that become public after filing (with PII redacted per Fed. R. Bankr. P. 9037)
- Involve financial and medical data that triggers state-level privacy laws
- Are handled by attorneys bound by model rules of professional conduct (ABA Model Rule 1.6 — confidentiality)

Transmitting unredacted PII to a third-party LLM API — even one with enterprise data protection — creates exposure that the lawyer is not willing to accept.

---

## Goal

Redact PII from document content **before** it leaves the local machine, while preserving all financial data that the extraction needs to work.

The LLM should never see:
- Real SSNs, DOBs, full account numbers, phone numbers, email addresses, home addresses

The LLM must still see:
- Dollar amounts (gross pay, deductions, expenses, balances)
- Pay frequencies, statement periods, date ranges
- Employer names (needed to label income sources)
- Expense categories / payee names where they indicate category (e.g., "Chase" for bank, "Shell" for gas)

After extraction, the app must be able to **restore** the original values for storage in the case DB.

---

## Approach: Tokenization with Local Mapping

### Flow

```
[Local PDF/image]
      ↓
[Local PII scanner — detect SSNs, account numbers, etc.]
      ↓
[Redact: replace each PII value with a token like <SSN_1>, <ACCT_2>]
      ↓                                          ↓
[Store token→real mapping in memory]     [Send redacted content to Claude API]
      ↓                                          ↓
                      [Claude returns extracted JSON with tokens]
                                    ↓
                  [Local de-tokenizer replaces tokens with real values]
                                    ↓
                              [Store in DB]
```

### Why tokenization (not just deletion)

Claude needs to associate values with their context. If we just delete an SSN, the LLM may get confused about document structure. Replacing with `<SSN_1>` keeps the structure intact and lets us restore it later. Tokens are opaque — they carry no info the LLM can use.

### Why local (not an external redaction service)

- No second third-party to trust with PII
- Works offline (important for a desktop app that claims privacy)
- Simple, auditable — the redaction rules are just regex + a local list of debtor fields from the DB

---

## Components

### 1. PII Detector (`src/main/redaction/detector.js` — new file)

Pure functions, no I/O. Given text, returns an array of matches:

```
detectPII(text) → [
  { type: 'ssn', start: 42, end: 53, value: '123-45-6789' },
  { type: 'account', start: 127, end: 139, value: '**** 4821' },
  ...
]
```

**Detection rules:**

| Type | Rule |
|------|------|
| `ssn` | Regex: `\b\d{3}-\d{2}-\d{4}\b` and `\b\d{9}\b` (with context check: preceded by "SSN"/"Social Security") |
| `account_full` | `\b\d{8,17}\b` (8-17 consecutive digits) preceded by "Account", "Acct", "Account #" |
| `dob` | Dates in common formats preceded by "DOB", "Date of Birth", "Birthdate" |
| `phone` | Regex: `\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b` |
| `email` | Standard email regex |
| `debtor_name` | Lookup against the case's debtor first/last name (from DB) |
| `debtor_address` | Lookup against the case's debtor address fields (from DB) |

**Explicit non-matches:**
- Money amounts (`$1,234.56`, `1234.56`) — never redacted
- Dates in statement period / pay period context — never redacted
- Employer names — never redacted
- Last-4 account references (e.g., "****4821") — these are already partial and are needed

### 2. Redactor (`src/main/redaction/redactor.js` — new file)

```
redact(text, detections) → {
  redactedText: string,
  tokenMap: Map<token, original>
}
```

Uses sequential token IDs per type: `<SSN_1>`, `<SSN_2>`, `<ACCT_1>`, `<DOB_1>`, etc.

### 3. De-tokenizer (`src/main/redaction/detokenizer.js` — new file)

```
detokenize(obj, tokenMap) → obj
```

Recursively walks an object and replaces any `<TYPE_N>` token strings with their original values from the map. Operates on the JSON Claude returns.

### 4. Integration with extractWithClaude

Modify `extractWithClaude()` in `src/index.js`:

**Current (simplified):**
```
async function extractWithClaude(filePath, docCategory) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  // ... send to Claude directly ...
}
```

**Problem:** we're sending the **raw file bytes** (PDF/image), not text. Claude does the OCR. This means we can't redact text before sending — the LLM sees the original image.

### The hard question: PDF/image redaction

Two paths forward:

#### Path A: Pre-OCR text extraction + redact text

1. Locally OCR the PDF/image (using Tesseract, pdf2pic + OCR, or pdf-parse for text PDFs)
2. Redact the extracted text
3. Send **only the redacted text** to Claude (as a text prompt, not as a document/image)
4. Get JSON back, detokenize, store

**Pros:** Full control, nothing sensitive leaves the machine
**Cons:** Local OCR quality < Claude's vision model; extraction accuracy drops; loses visual layout cues (table structure, etc.)

#### Path B: Visual redaction before sending

1. Run local OCR to find PII positions in the image
2. Draw black rectangles over those regions in the image (pdf-lib for PDFs, sharp for images)
3. Send the **redacted image** to Claude
4. Get JSON back — Claude won't have seen the redacted fields, so it returns `null` or skips them
5. Separately, pull SSN/DOB/account from the debtor record we already have in the DB — don't re-extract them from the document at all

**Pros:** Keeps Claude's vision quality for the financial data; visually obvious what was redacted (auditable)
**Cons:** Extra image processing step; OCR false negatives mean PII could slip through

#### Recommendation: Path B

The extraction targets are financial numbers, which are almost always far from the PII fields on the document. Black-boxing the PII regions preserves the LLM's ability to read tables and amounts. Path A would degrade the core value prop (accurate extraction) just to protect data we already have in the local DB.

### 5. Revised extractWithClaude flow

```
async function extractWithClaude(filePath, docCategory, caseId) {
  // Load case context for debtor-specific PII (name, address, etc.)
  const debtor = db.prepare('SELECT * FROM debtors WHERE case_id = ? LIMIT 1').get(caseId);

  // Step 1: OCR the document to find PII positions
  const ocrResults = await localOcr(filePath);  // returns words + bounding boxes

  // Step 2: Detect PII in OCR output (using detector.js rules + debtor lookup)
  const piiRegions = detectPIIRegions(ocrResults, debtor);

  // Step 3: Produce a redacted copy of the file
  const redactedPath = await redactImage(filePath, piiRegions);

  // Step 4: Send redacted file to Claude (existing logic)
  const extracted = await callClaude(redactedPath, docCategory);

  // Step 5: Clean up temporary redacted file
  fs.unlinkSync(redactedPath);

  return extracted;
}
```

---

## Dependencies to add

- `tesseract.js` — local OCR (pure JS, bundles with Electron)
- `pdf-lib` — PDF manipulation (draw rectangles)
- `sharp` — image manipulation (for PNG/JPG redaction)

All three are actively maintained, MIT-licensed, work offline.

---

## Privacy guarantees after this change

- **No SSN, DOB, account number, phone, email, address leaves the local machine**
- Temp redacted files are deleted after the API call
- The Claude API still sees financial numbers and document structure
- Mapping from tokens to real values never exists on disk — only in memory during a single extraction call
- Extraction logs should scrub PII before writing to console

---

## Testing plan

1. **Golden path**: feed a sample paystub with a real-looking SSN, confirm redacted image has SSN blacked out
2. **Unit tests** for `detector.js` — test each regex against positive/negative cases
3. **Integration test**: mock Claude API, verify request body contains no PII strings from test fixtures
4. **OCR false negative test**: purposely use a non-standard SSN format ("SSN: 123 45 6789") and confirm the detector catches it
5. **Audit trail**: log hash of redacted content sent to API (for "we sent this, not the original" proof)

---

## Out of scope for v1 of this design

- **Network-level proxy** (full HTTPS intercept for audit) — nice-to-have, but local redaction gets us the privacy win
- **Differential privacy / noise injection** on financial amounts — amounts are the payload; can't redact them
- **PII detection in Claude's output** — theoretically Claude could hallucinate a PII-shaped string; low risk, worth logging
- **Redaction key rotation** — tokens are ephemeral per-call, so there's nothing to rotate

---

## File change summary (when implemented)

| File | Change |
|------|--------|
| `src/main/redaction/detector.js` | New — PII detection rules |
| `src/main/redaction/redactor.js` | New — image/PDF redaction using bounding boxes |
| `src/main/redaction/ocr.js` | New — tesseract.js wrapper |
| `src/index.js` | Modify `extractWithClaude()` to redact before sending |
| `package.json` | Add `tesseract.js`, `pdf-lib`, `sharp` |

---

## Open questions for the lawyer

1. Is black-box visual redaction acceptable, or do they want a different approach (on-prem LLM, contractual data processing addendum)?
2. Is the Anthropic Zero Data Retention program sufficient from a compliance angle? (If yes, redaction is still belt-and-suspenders but less critical.)
3. Are there specific PII categories beyond what's listed above we should redact (e.g., employer EIN)?
4. Do we need an audit log showing what was sent to the API per case?
