// Orchestrates packet generation:
//   1. Resolve form list for the case's chapter
//   2. Load each blank PDF template
//   3. Run the form's mapper (or universal header filler if headerOnly)
//   4. Save filled PDF to the output directory
//   5. Write a manifest summarizing what was filled / what's a gap
//
// Output layout (timestamped so multiple drafts coexist):
//   <userData>/petition-packets/<caseId>/<isoTimestamp>/
//     01-B121-Statement_About_SSN.pdf
//     02-B101-Voluntary_Petition.pdf
//     ...
//     16-B122A-2-Means_Test_Calculation.pdf
//     manifest.json
//
// The PDF Acro field state is "filled but unflattened" — the attorney can
// still edit each field in any PDF reader before printing.

const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

const { listForms, getForm } = require('./registry');
const { collectCaseData } = require('./data-collector');
const { fillHeader } = require('./forms/_common');

const TEMPLATE_DIR = path.join(__dirname, 'forms', 'templates');

// Mapper modules are loaded lazily so a missing or broken mapper for
// one form doesn't crash the whole packet build.
function loadMapper(name) {
  if (!name) return null;
  try {
    return require(`./forms/${name}.js`);
  } catch (err) {
    console.warn(`[petition] mapper ${name} failed to load:`, err.message);
    return null;
  }
}

function safeFileName(label) {
  return label
    .replace(/[^A-Za-z0-9 _\-—]+/g, '')
    .replace(/[\s—-]+/g, '_')
    .slice(0, 80);
}

async function fillOneForm(formMeta, data) {
  const templatePath = path.join(TEMPLATE_DIR, `${formMeta.code}.pdf`);
  if (!fs.existsSync(templatePath)) {
    return { code: formMeta.code, error: `template not found: ${templatePath}` };
  }
  const bytes = fs.readFileSync(templatePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();

  let result;
  const mapperMod = loadMapper(formMeta.mapper);
  if (mapperMod && typeof mapperMod.map === 'function') {
    result = mapperMod.map(form, data);
  } else {
    // headerOnly: just fill universal header.
    const stats = fillHeader(form, data);
    const total = form.getFields().length;
    result = {
      formCode: formMeta.code,
      label: formMeta.label,
      mapped: stats.hits,
      total,
      gaps: [{
        field: '(form-specific mapping)',
        reason: 'Per-field mapping not yet implemented — header filled, body left blank for attorney',
      }],
    };
  }

  // Don't flatten — attorney needs to edit. But updateFieldAppearances
  // makes the values render correctly when opened in Preview/Acrobat.
  form.updateFieldAppearances();

  const outBytes = await doc.save({ updateFieldAppearances: false });

  return {
    code: formMeta.code,
    label: formMeta.label,
    pages: formMeta.pages,
    mapped: result.mapped,
    total: result.total,
    gaps: result.gaps || [],
    bytes: outBytes,
    order: formMeta.order,
  };
}

async function buildPacket({ db, caseId, app }) {
  const data = collectCaseData(db, caseId);
  if (!data) throw new Error('case not found: ' + caseId);

  const chapter = data.case.chapter;
  const forms = listForms({ chapter });

  // Output directory: <userData>/petition-packets/<caseId>/<timestamp>
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseDir = path.join(app.getPath('userData'), 'petition-packets', caseId, stamp);
  fs.mkdirSync(baseDir, { recursive: true });

  const results = [];
  for (const formMeta of forms) {
    let r;
    try {
      r = await fillOneForm(formMeta, data);
    } catch (err) {
      console.error(`[petition] failed to fill ${formMeta.code}:`, err);
      r = {
        code: formMeta.code,
        label: formMeta.label,
        pages: formMeta.pages,
        order: formMeta.order,
        mapped: 0,
        total: 0,
        gaps: [{ field: '(error)', reason: err.message }],
        error: err.message,
      };
    }
    if (r.bytes) {
      const order = String(r.order || 0).padStart(2, '0');
      const fname = `${order}-${r.code}-${safeFileName(r.label)}.pdf`;
      fs.writeFileSync(path.join(baseDir, fname), Buffer.from(r.bytes));
      r.outputFile = fname;
      delete r.bytes; // don't keep buffers in manifest
    }
    results.push(r);
  }

  const manifest = {
    caseId,
    chapter,
    generatedAt: new Date().toISOString(),
    debtorName: data.debtor1 ? data.debtor1.fullName : '(no debtor)',
    district: data.case.district,
    forms: results,
    summary: {
      formsTotal: results.length,
      formsFullyMapped: results.filter(r => !r.error && r.mapped === r.total).length,
      totalFields: results.reduce((s, r) => s + (r.total || 0), 0),
      mappedFields: results.reduce((s, r) => s + (r.mapped || 0), 0),
      totalGaps: results.reduce((s, r) => s + (r.gaps?.length || 0), 0),
    },
  };
  fs.writeFileSync(path.join(baseDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { outputDir: baseDir, manifest };
}

// Per-form completeness preview (no PDF write). Used by the Filing tab to
// show the per-form completion percentage without generating files.
async function previewCompleteness({ db, caseId }) {
  const data = collectCaseData(db, caseId);
  if (!data) return null;

  const chapter = data.case.chapter;
  const forms = listForms({ chapter });

  const out = [];
  for (const formMeta of forms) {
    const templatePath = path.join(TEMPLATE_DIR, `${formMeta.code}.pdf`);
    if (!fs.existsSync(templatePath)) {
      out.push({ code: formMeta.code, label: formMeta.label, pages: formMeta.pages, mapped: 0, total: 0, gaps: [] });
      continue;
    }
    try {
      const bytes = fs.readFileSync(templatePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = doc.getForm();

      const mapperMod = loadMapper(formMeta.mapper);
      if (mapperMod && typeof mapperMod.map === 'function') {
        const r = mapperMod.map(form, data);
        out.push({ code: formMeta.code, label: formMeta.label, pages: formMeta.pages, mapped: r.mapped, total: r.total, gaps: r.gaps });
      } else {
        const stats = fillHeader(form, data);
        const total = form.getFields().length;
        out.push({
          code: formMeta.code,
          label: formMeta.label,
          pages: formMeta.pages,
          mapped: stats.hits,
          total,
          headerOnly: true,
          gaps: [{
            field: '(form-specific mapping)',
            reason: 'Header-only fill — per-field mapping for this form ships in a follow-up',
          }],
        });
      }
    } catch (err) {
      out.push({
        code: formMeta.code,
        label: formMeta.label,
        pages: formMeta.pages,
        mapped: 0,
        total: 0,
        gaps: [{ field: '(error)', reason: err.message }],
      });
    }
  }
  return { caseId, chapter, forms: out, debtorName: data.debtor1?.fullName || '' };
}

module.exports = { buildPacket, previewCompleteness };
