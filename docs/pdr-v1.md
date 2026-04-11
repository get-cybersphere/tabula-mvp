# Tabula v1 PDR

## Goal

Build a demoable bankruptcy workflow that feels real end-to-end in 2-4 days.
Focus on one tight loop that shows value to a lawyer or paralegal.

## Core idea

Bankruptcy is repetitive and still manual.
We automate intake, extraction, basic eligibility, and review.

## v1 flow

1. User uploads docs (paystubs, bank statements, etc.)
2. System extracts key financial data
3. System runs a basic means test (Chapter 7 vs 13)
4. User sees everything in a review screen and can edit

## What we are building (v1 only)

- Upload flow (PDFs)
- Extraction (LLM to structured JSON)
- Simple means test logic (hardcoded / basic rules)
- Review UI (editable fields + result)

## What we are NOT building yet

- Trustee pattern analysis
- District-aware filing
- Full petition generation
- Full agent platform / VPS infra

These are v2 once we have real usage.

## AI vs deterministic

| Component   | Approach                  |
| ----------- | ------------------------- |
| Extraction  | AI (LLM)                 |
| Means test  | Simple rules (deterministic) |
| UI          | Manual review always      |

## Demo goal

When someone sees it, they think:
"This could actually replace a few hours of paralegal work."
