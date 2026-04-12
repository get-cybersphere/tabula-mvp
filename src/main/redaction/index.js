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

module.exports = { redactForExtraction, cleanup, shutdown };
