// Visual redaction — draws black rectangles over PII regions in images/PDFs.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { detectPII } = require('./detector');
const { ocrImage, ocrPdf } = require('./ocr');

/**
 * Given OCR word results and a text-level PII match, find the bounding boxes
 * of the words that contain the match.
 * Approach: reconstruct char offsets of each word in the full OCR text,
 * then find any words whose char range overlaps the match's [start, end).
 */
function findWordsForMatch(ocrWords, fullText, match) {
  // Build a char-offset index by walking fullText and locating each word.
  // Tesseract's full text usually concatenates words with spaces/newlines,
  // but may not perfectly align. We fall back to per-word `indexOf` search.
  const hits = [];
  let searchFrom = 0;
  for (const w of ocrWords) {
    if (!w.text) continue;
    const idx = fullText.indexOf(w.text, searchFrom);
    if (idx === -1) continue;
    const wStart = idx;
    const wEnd = idx + w.text.length;
    searchFrom = wEnd;
    // Overlap check
    if (wEnd > match.start && wStart < match.end) {
      hits.push(w);
    }
  }
  return hits;
}

/**
 * Redact an image file by drawing black rectangles over PII regions.
 * @param {string} imagePath
 * @param {object} debtorContext
 * @returns {Promise<{redactedPath: string, regions: Array, detections: Array}>}
 */
async function redactImageFile(imagePath, debtorContext = {}) {
  const ocr = await ocrImage(imagePath);
  const detections = detectPII(ocr.text, debtorContext);

  // Map text detections to word bounding boxes
  const regions = [];
  for (const det of detections) {
    const words = findWordsForMatch(ocr.words, ocr.text, det);
    for (const w of words) {
      regions.push({
        type: det.type,
        bbox: w.bbox,
      });
    }
  }

  // Build an SVG overlay with black rectangles for each region
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
 * Redact a PDF by rasterizing each page, redacting, then re-combining into a PDF.
 * Output is a single PDF with all pages redacted.
 */
async function redactPdfFile(pdfPath, debtorContext = {}) {
  const pages = await ocrPdf(pdfPath);
  const allDetections = [];
  const redactedImagePaths = [];

  for (const pg of pages) {
    const detections = detectPII(pg.text, debtorContext);
    allDetections.push(...detections.map(d => ({ ...d, page: pg.page })));

    const regions = [];
    for (const det of detections) {
      const words = findWordsForMatch(pg.words, pg.text, det);
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

  // Rebuild a PDF from the redacted page images using pdf-lib
  const { PDFDocument } = require('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  for (const imgPath of redactedImagePaths) {
    const bytes = fs.readFileSync(imgPath);
    const img = await pdfDoc.embedPng(bytes);
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const redactedPath = path.join(
    os.tmpdir(),
    `tabula-redacted-${Date.now()}.pdf`
  );
  fs.writeFileSync(redactedPath, await pdfDoc.save());

  return { redactedPath, detections: allDetections };
}

function buildBlackRectsSvg(bboxes, width, height) {
  const rects = bboxes.map(b => {
    const x = b.x0;
    const y = b.y0;
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    // Pad by 2px for safety
    return `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" fill="black"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;
}

/**
 * Dispatch to the right redactor based on file extension.
 */
async function redactFile(filePath, debtorContext = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return redactPdfFile(filePath, debtorContext);
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return redactImageFile(filePath, debtorContext);
  throw new Error(`Unsupported file type for redaction: ${ext}`);
}

module.exports = { redactFile, redactImageFile, redactPdfFile };
