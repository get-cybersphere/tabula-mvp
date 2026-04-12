const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWordOffsetIndex,
  findWordsForMatch,
} = require('../../src/main/redaction/redactor');

// Helpers to build fake tesseract word shapes
function word(text, bbox) {
  return { text, bbox, confidence: 90 };
}

test('buildWordOffsetIndex: walks text forward only', () => {
  const fullText = 'SSN 123-45-6789 today';
  const words = [
    word('SSN', { x0: 0, y0: 0, x1: 30, y1: 12 }),
    word('123-45-6789', { x0: 35, y0: 0, x1: 140, y1: 12 }),
    word('today', { x0: 145, y0: 0, x1: 180, y1: 12 }),
  ];
  const index = buildWordOffsetIndex(words, fullText);
  assert.equal(index.length, 3);
  assert.equal(index[0].start, 0);
  assert.equal(index[1].start, 4);
  assert.equal(index[2].start, 16);
  assert.ok(index.every(e => !e.approx));
});

test('buildWordOffsetIndex: advances cursor past missing words', () => {
  // OCR produced "John's" for the text "John's" but tesseract may have
  // cleaned the apostrophe. Simulate a word that doesn't exist in fullText.
  const fullText = 'Name John Smith age 42';
  const words = [
    word('Name', { x0: 0, y0: 0, x1: 30, y1: 12 }),
    word('JOHN', { x0: 35, y0: 0, x1: 65, y1: 12 }),  // case mismatch: won't be found
    word('Smith', { x0: 70, y0: 0, x1: 110, y1: 12 }),
    word('age', { x0: 115, y0: 0, x1: 135, y1: 12 }),
  ];
  const index = buildWordOffsetIndex(words, fullText);

  // The unfound word should be marked approx and the cursor should still advance,
  // so "Smith" correctly maps to the later position in fullText rather than the
  // start of the string.
  const smithEntry = index.find(e => e.word.text === 'Smith');
  assert.ok(smithEntry);
  assert.ok(!smithEntry.approx, 'Smith should be found exactly');
  assert.equal(smithEntry.start, fullText.indexOf('Smith'), 'Smith positioned correctly');
});

test('findWordsForMatch: returns overlapping words only', () => {
  const fullText = 'SSN 123-45-6789 today';
  const words = [
    word('SSN', { x0: 0, y0: 0, x1: 30, y1: 12 }),
    word('123-45-6789', { x0: 35, y0: 0, x1: 140, y1: 12 }),
    word('today', { x0: 145, y0: 0, x1: 180, y1: 12 }),
  ];
  const index = buildWordOffsetIndex(words, fullText);

  const match = { type: 'ssn', value: '123-45-6789', start: 4, end: 15 };
  const hits = findWordsForMatch(index, match);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, '123-45-6789');
});

test('findWordsForMatch: skips approximated entries', () => {
  // If an entry is approximated (word not found), we must not trust its
  // position for redaction — we don't know where the black box should go.
  const index = [
    { word: word('x', { x0: 0, y0: 0, x1: 10, y1: 10 }), start: 0, end: 1, approx: true },
  ];
  const hits = findWordsForMatch(index, { type: 'ssn', start: 0, end: 1 });
  assert.equal(hits.length, 0, 'approx entries are not used as redaction sources');
});

test('findWordsForMatch: handles match spanning multiple words', () => {
  const fullText = 'John Quincy Doe';
  const words = [
    word('John', { x0: 0, y0: 0, x1: 30, y1: 12 }),
    word('Quincy', { x0: 35, y0: 0, x1: 85, y1: 12 }),
    word('Doe', { x0: 90, y0: 0, x1: 115, y1: 12 }),
  ];
  const index = buildWordOffsetIndex(words, fullText);

  const match = { type: 'debtor_name', value: 'John Quincy Doe', start: 0, end: 15 };
  const hits = findWordsForMatch(index, match);
  assert.equal(hits.length, 3, 'all three words should be in the redaction set');
});
