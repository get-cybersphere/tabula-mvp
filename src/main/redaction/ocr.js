// OCR wrapper around tesseract.js.
// Returns words with bounding boxes so the redactor can black out precise regions.

const path = require('node:path');
const fs = require('node:fs');

let tesseractWorker = null;

async function getWorker() {
  if (tesseractWorker) return tesseractWorker;
  const { createWorker } = require('tesseract.js');
  tesseractWorker = await createWorker('eng');
  return tesseractWorker;
}

/**
 * OCR an image file.
 * @param {string} imagePath - absolute path to PNG/JPG
 * @returns {Promise<{text: string, words: Array<{text, bbox}>}>}
 */
async function ocrImage(imagePath) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagePath);
  return {
    text: data.text,
    words: (data.words || []).map(w => ({
      text: w.text,
      bbox: w.bbox, // { x0, y0, x1, y1 }
      confidence: w.confidence,
    })),
  };
}

/**
 * OCR a PDF by rasterizing pages first, then running tesseract on each.
 * Returns per-page results.
 * @param {string} pdfPath
 * @returns {Promise<Array<{page, width, height, text, words, imagePath}>>}
 */
async function ocrPdf(pdfPath) {
  const pageImages = await rasterizePdf(pdfPath);
  const results = [];
  for (const pg of pageImages) {
    const ocr = await ocrImage(pg.imagePath);
    results.push({ ...pg, ...ocr });
  }
  return results;
}

/**
 * Rasterize each page of a PDF to a temporary PNG file.
 * Uses pdfjs-dist in Node mode — no native deps.
 */
async function rasterizePdf(pdfPath) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const { createCanvas } = require('canvas'); // installed as a peer of pdfjs rendering
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const results = [];
  const tmpDir = path.join(require('os').tmpdir(), `tabula-pdfpages-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const outPath = path.join(tmpDir, `page-${pageNum}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    results.push({ page: pageNum, width: viewport.width, height: viewport.height, imagePath: outPath });
  }
  return results;
}

async function terminate() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

module.exports = { ocrImage, ocrPdf, terminate };
