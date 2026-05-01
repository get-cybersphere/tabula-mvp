const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const dir = '/Users/archiesoni/Desktop/Projects/tabula-v2/src/main/petition/forms/templates';

(async () => {
  const summary = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.pdf')).sort()) {
    try {
      const bytes = fs.readFileSync(path.join(dir, f));
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = doc.getForm();
      const fields = form.getFields();
      summary[f] = {
        pages: doc.getPageCount(),
        fields: fields.length,
        sample: fields.slice(0, 5).map(x => `${x.constructor.name}: ${x.getName()}`),
      };
    } catch (e) {
      summary[f] = { error: e.message.slice(0, 80) };
    }
  }
  console.log(JSON.stringify(summary, null, 2));
})();
