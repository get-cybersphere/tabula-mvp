// Dumps every AcroForm field name + type per template form.
// Output: src/main/petition/forms/field-map.json
// Run: node scripts/dump-petition-fields.js

const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES = path.join(__dirname, '..', 'src', 'main', 'petition', 'forms', 'templates');
const OUT = path.join(__dirname, '..', 'src', 'main', 'petition', 'forms', 'field-map.json');

(async () => {
  const out = {};
  for (const file of fs.readdirSync(TEMPLATES).filter(f => f.endsWith('.pdf')).sort()) {
    const code = file.replace(/\.pdf$/i, '');
    const bytes = fs.readFileSync(path.join(TEMPLATES, file));
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    out[code] = {
      pages: doc.getPageCount(),
      fields: form.getFields().map(f => ({
        name: f.getName(),
        type: f.constructor.name.replace(/^PDF/, ''),
      })),
    };
    console.log(`${code}: ${out[code].fields.length} fields`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT}`);
})();
