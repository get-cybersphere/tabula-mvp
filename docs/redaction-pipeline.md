# PII Redaction Pipeline

How Tabula protects debtor PII when sending documents to the LLM.

## Overview

```
[User uploads PDF/image]
          │
          ▼
[Local OCR (tesseract.js)] ──────► text + word bounding boxes
          │
          ▼
[PII detector]  ──► regex + debtor DB lookup finds SSNs, accounts,
          │          DOBs, phones, emails, names, addresses
          ▼
[Visual redactor (sharp / pdf-lib)] ──► black rectangles drawn
          │                             over PII regions
          ▼
[Redacted file in OS temp dir]
          │
          ▼
[LiteLLM proxy at localhost:4000]
          │  ├─ Audit log (Postgres)
          │  └─ Presidio guardrail (masks any PII that slipped through)
          ▼
[Anthropic API]
          │
          ▼
[Extracted JSON]
          │
          ▼
[Auto-populate case DB]
          │
          ▼
[Delete temp redacted file]
```

## Components

| File | Responsibility |
|------|----------------|
| `src/main/redaction/ocr.js` | tesseract.js wrapper — OCRs images/PDFs, returns words + bboxes |
| `src/main/redaction/detector.js` | Regex-based PII detection + debtor-specific name/address lookup |
| `src/main/redaction/redactor.js` | Draws black rectangles over PII regions using sharp (images) or pdf-lib (PDFs) |
| `src/main/redaction/index.js` | Public API: `redactForExtraction(filePath, debtorContext)` |
| `src/index.js` | `extractWithClaude()` calls redactor first, then sends redacted file through LiteLLM |
| `litellm/config.yaml` | LiteLLM proxy config — adds Presidio guardrail as second line of defense |

## What gets redacted

| Category | Always redacted? |
|----------|------------------|
| SSN (hyphenated or labeled) | Yes |
| ITIN | Yes |
| Full bank account number (8-17 digits, labeled) | Yes |
| Routing number | Yes |
| Driver's license | Yes |
| Date of birth (labeled) | Yes |
| Phone number | Yes |
| Email address | Yes |
| Debtor first/last name | Yes (if debtor context is available) |
| Debtor home address (street) | Yes (if debtor context is available) |

## What stays visible

The LLM needs these to do its job:

- Dollar amounts (pay, deductions, balances, expenses)
- Pay frequencies and pay period dates
- Statement period dates
- Employer names and addresses
- Expense payee names (for categorization — "Shell" → gas, "Chase" → bank)
- Last-4 account references
- Document structure / table layouts

## Defense in depth

Even if the local redactor misses something (OCR false negative, unusual format), the LiteLLM proxy runs Presidio on the text content of each request. Presidio is a second independent detector — reduces the chance of unredacted PII reaching the provider.

## Configuration

Environment variables in the root `.env`:

```
ANTHROPIC_API_KEY=sk-tabula-dev-local        # LiteLLM master key
LITELLM_BASE_URL=http://localhost:4000       # proxy endpoint
```

The real Anthropic key lives only inside the LiteLLM container's env (see `litellm/.env`), never in the Electron app.

## Disabling redaction (not recommended)

If you comment out `LITELLM_BASE_URL`, the app hits Anthropic directly. **Local visual redaction still runs** — it's part of `extractWithClaude()`, not the proxy. The only thing you lose is audit logging and the Presidio guardrail.

There is no way to fully bypass local redaction short of editing `src/index.js`. This is intentional.

## Running the stack

1. Start LiteLLM proxy:
   ```bash
   cd litellm
   cp .env.example .env          # fill in real ANTHROPIC_API_KEY
   docker compose up -d
   ```

2. Start the Electron app:
   ```bash
   cp .env.example .env          # ANTHROPIC_API_KEY=sk-tabula-dev-local
   npm run dev
   ```

## Verifying a redaction worked

- Extract a document in the UI.
- Watch the Electron dev tools console for `[redaction] N PII region(s) redacted before API call: ssn, phone, ...`
- In the LiteLLM admin UI (`http://localhost:4000`), inspect the logged request body — PII fields should be either black-boxed in the image or masked by Presidio in any accompanying text.

## Known limitations

- **OCR quality** — low-resolution scans or handwritten PII may not be detected. Mitigation: upload high-quality PDFs; the 2x rendering scale helps.
- **Unusual formats** — SSN written as "123 45 6789" (spaces) or reversed formats may slip through. Mitigation: Presidio at the proxy layer.
- **Name collisions** — a debtor named "John Smith" will also cause "John Smith" the employer to be redacted. Current behavior is to over-redact; we may tune this later.
- **Performance** — full OCR + rasterization of a 10-page PDF adds ~15 seconds to extraction time. Acceptable for a local desktop app; would not scale to a server workflow without a queue.
