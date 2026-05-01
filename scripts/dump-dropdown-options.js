// Dumps dropdown options for any field on any form.
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');
const TEMPLATES = path.join(__dirname, '..', 'src', 'main', 'petition', 'forms', 'templates');

(async () => {
  const bytes = fs.readFileSync(path.join(TEMPLATES, 'B101.pdf'));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  for (const f of form.getFields()) {
    if (f.constructor.name === 'PDFDropdown') {
      console.log(`\n=== ${f.getName()} ===`);
      const opts = f.getOptions();
      console.log(`(${opts.length} options)`);
      opts.forEach(o => console.log('  ' + o));
    }
  }
})();
