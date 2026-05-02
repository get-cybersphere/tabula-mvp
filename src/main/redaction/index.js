// Public entry point for the redaction pipeline.
//
// Usage:
//   const { redactForExtraction, cleanup } = require('./redaction');
//   const { redactedPath, detections } = await redactForExtraction(filePath, debtorContext);
//   // ... send redactedPath to LiteLLM/Claude ...
//   await cleanup(redactedPath);

const fs = require('node:fs');
const { redactFile } = require('./redactor');
const { terminate } = require('./ocr');
const { detectPII } = require('./detector');

async function redactForExtraction(filePath, debtorContext = {}) {
  return redactFile(filePath, debtorContext);
}

function cleanup(tempPath) {
  try {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch (err) {
    console.error('Redaction cleanup failed:', err.message);
  }
}

async function shutdown() {
  await terminate();
}

// Redact PII inside a string (chat messages, user input). Returns
// { text, detections } so callers can log the count without re-running.
//
// For chat we deliberately skip name/address detection by default — the
// system prompt already contains the client's name and stripping it from
// user messages makes responses unreadable. SSNs, accounts, phones, emails,
// DOBs, ITINs, routing numbers, and DLs are always replaced with
// `[REDACTED:type]` markers.
function redactText(text, debtorContext = {}, options = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: text ?? '', detections: [] };
  }
  // By default suppress name/address detection — see comment above.
  const ctx = options.includeName
    ? debtorContext
    : { ...debtorContext, firstName: undefined, lastName: undefined, street: undefined };
  const detections = detectPII(text, ctx);
  if (detections.length === 0) return { text, detections: [] };

  // Replace from end to start so offsets stay valid.
  const sorted = detections.slice().sort((a, b) => b.start - a.start);
  let out = text;
  for (const d of sorted) {
    out = out.slice(0, d.start) + `[REDACTED:${d.type}]` + out.slice(d.end);
  }
  return { text: out, detections };
}

module.exports = { redactForExtraction, cleanup, shutdown, redactText };
