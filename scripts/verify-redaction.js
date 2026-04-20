#!/usr/bin/env node
//
// Verify the redaction pipeline on a real document WITHOUT sending it
// to Claude. Saves the redacted output to a known path so you can open
// it and confirm PII is visually blacked out.
//
// Usage:
//   node scripts/verify-redaction.js /path/to/document.pdf
//
// Or with debtor context (catches debtor-specific name/address):
//   node scripts/verify-redaction.js /path/to/document.pdf "John Doe" "742 Evergreen Terrace"

const path = require('node:path');
const fs = require('node:fs');
const { redactForExtraction } = require('../src/main/redaction');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/verify-redaction.js <path-to-file> [firstName lastName] [street]');
    process.exit(1);
  }
  if (!fs.existsSync(inputPath)) {
    console.error('File not found:', inputPath);
    process.exit(1);
  }

  const debtorContext = {};
  if (process.argv[3]) {
    const nameParts = process.argv[3].split(' ');
    debtorContext.firstName = nameParts[0];
    debtorContext.lastName = nameParts.slice(1).join(' ');
  }
  if (process.argv[4]) {
    debtorContext.street = process.argv[4];
  }

  console.log('Input:         ', inputPath);
  if (Object.keys(debtorContext).length) {
    console.log('Debtor ctx:    ', debtorContext);
  }
  console.log('Running OCR + redaction...\n');

  const start = Date.now();
  const { redactedPath, detections } = await redactForExtraction(inputPath, debtorContext);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Redacted in ${elapsed}s`);
  console.log(`Redacted file: ${redactedPath}`);
  console.log(`PII detected: ${detections.length}`);
  console.log('');
  console.log('Detections by type:');
  const byType = {};
  for (const d of detections) {
    byType[d.type] = (byType[d.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
  console.log('');
  console.log('To visually inspect:');
  console.log(`  open "${redactedPath}"`);
  console.log('');
  console.log('The redacted file has the same content as the original BUT');
  console.log('every detected PII region is covered by a black rectangle.');
  console.log('This is what Claude would receive (the original never leaves).');

  // Leave the file in place so the user can open it.
  // Don't call cleanup() — we want the verification artifact to persist.

  // Clean shutdown of the tesseract worker so the process can exit.
  const { shutdown } = require('../src/main/redaction');
  await shutdown();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
