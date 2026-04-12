// Visual redaction — draws black rectangles over PII regions in images/PDFs.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { detectPII } = require('./detector');
const { ocrImage, ocrPdf } = require('./ocr');

/**
 * Build a per-word char-offset index against the full OCR text. Each entry
 * records where that word lives in `fullText` so we can map a text-level
 * PII match back to the word bounding boxes that cover it.
 *
 * Why we walk both arrays in order: tesseract's `words` array is in the same
 * reading order as its concatenated `text`, but the joining characters
 * (spaces, newlines) are lossy. Using indexOf with a forward-only cursor
 * keeps us anchored even when a word isn't found exactly (OCR stripped a
 * trailing period, say) — we still advance past the word's *expected*
 * position so the next word doesn't latch onto an earlier occurrence.
 */
function buildWordOffsetIndex(ocrWords, fullText) {
  const index = [];
  let cursor = 0;
  for (const w of ocrWords) {
    if (!w.text) continue;
    const idx = fullText.indexOf(w.text, cursor);
    if (idx === -1) {
      // Word not found at or after current cursor. Best-effort: keep the
      // bbox but approximate position as the cursor. This word may still be
      // relevant for later bbox lookups, and the cursor advance prevents
      // downstream words from silently matching earlier text.
      index.push({ word: w, start: cursor, end: cursor + w.text.length, approx: true });
      cursor = cursor + w.text.length;
    } else {
      index.push({ word: w, start: idx, end: idx + w.text.length, approx: false });
      cursor = idx + w.text.length;
    }
  }
  return index;
}

function findWordsForMatch(wordIndex, match) {
  const hits = [];
  for (const entry of wordIndex) {
    if (entry.approx) continue; // don't trust approximated positions
    if (entry.end > match.start && entry.start < match.end) {
      hits.push(entry.word);
    }
  }
  return hits;
}

/** Safely remove a file; swallow any error. */
function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

/** Safely remove a directory (rm -rf); swallow any error. */
function safeRmrf(dir) {
  try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * Redact an image file by drawing black rectangles over PII regions.
 * @returns {Promise<{redactedPath, regions, detections}>}
 */
async function redactImageFile(imagePath, debtorContext = {}) {
  const ocr = await ocrImage(imagePath);
  const detections = detectPII(ocr.text, debtorContext);

  const wordIndex = buildWordOffsetIndex(ocr.words, ocr.text);
  const regions = [];
  for (const det of detections) {
    const words = findWordsForMatch(wordIndex, det);
    for (const w of words) regions.push({ type: det.type, bbox: w.bbox });
  }

  const meta = await sharp(imagePath).metadata();
  const svgOverlay = buildBlackRectsSvg(regions.map(r => r.bbox), meta.width, meta.height);

  const redactedPath = path.join(
    os.tmpdir(),
    `tabula-redacted-${Date.now()}-${path.basename(imagePath)}`
  );

  await sharp(imagePath)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .toFile(redactedPath);

  return { redactedPath, regions, detections };
}

/**
 * Redact a PDF by rasterizing each page, redacting, and re-combining into a
 * single PDF. Temp per-page images and the source raster dir are always
 * cleaned up before return, even on error.
 */
async function redactPdfFile(pdfPath, debtorContext = {}) {
  const pages = await ocrPdf(pdfPath);
  const allDetections = [];
  const redactedImagePaths = [];
  const sourcePageDirs = new Set();
  let redactedPath = null;

  try {
    for (const pg of pages) {
      if (pg.imagePath) sourcePageDirs.add(path.dirname(pg.imagePath));

      const detections = detectPII(pg.text, debtorContext);
      allDetections.push(...detections.map(d => ({ ...d, page: pg.page })));

      const wordIndex = buildWordOffsetIndex(pg.words, pg.text);
      const regions = [];
      for (const det of detections) {
        const words = findWordsForMatch(wordIndex, det);
        for (const w of words) regions.push({ type: det.type, bbox: w.bbox });
      }

      const svgOverlay = buildBlackRectsSvg(regions.map(r => r.bbox), pg.width, pg.height);
      const outPath = path.join(
        os.tmpdir(),
        `tabula-redacted-page-${Date.now()}-${pg.page}.png`
      );
      await sharp(pg.imagePath)
        .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
        .toFile(outPath);
      redactedImagePaths.push(outPath);
    }

    const { PDFDocument } = require('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    for (const imgPath of redactedImagePaths) {
      const bytes = fs.readFileSync(imgPath);
      const img = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    redactedPath = path.join(os.tmpdir(), `tabula-redacted-${Date.now()}.pdf`);
    fs.writeFileSync(redactedPath, await pdfDoc.save());
  } finally {
    // Clean up per-page redacted PNGs and the source rasterization dir.
    // The final redactedPath is returned to the caller for cleanup later.
    for (const p of redactedImagePaths) safeUnlink(p);
    for (const d of sourcePageDirs) safeRmrf(d);
  }

  return { redactedPath, detections: allDetections };
}

function buildBlackRectsSvg(bboxes, width, height) {
  const rects = bboxes.map(b => {
    const x = b.x0 - 2;
    const y = b.y0 - 2;
    const w = (b.x1 - b.x0) + 4;
    const h = (b.y1 - b.y0) + 4;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;
}

async function redactFile(filePath, debtorContext = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return redactPdfFile(filePath, debtorContext);
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return redactImageFile(filePath, debtorContext);
  throw new Error(`Unsupported file type for redaction: ${ext}`);
}

module.exports = {
  redactFile,
  redactImageFile,
  redactPdfFile,
  // Exported for tests
  buildWordOffsetIndex,
  findWordsForMatch,
};
