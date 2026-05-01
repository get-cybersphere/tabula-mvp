// Registry of all 16 forms in a Chapter 7 individual filing packet.
//
// `mapper` is the module name when we have a structured field mapper for it.
// `headerOnly: true` means we only auto-fill the universal header (Debtor 1/2,
// Case number, district) and leave the rest blank for the attorney. As more
// mappers ship, headerOnly forms get promoted to `mapper`.
//
// `order` controls the order of forms in the generated packet folder.

const FORMS = [
  { code: 'B121',     order: 1,  label: 'Statement About Your Social Security Numbers', pages: 1,  mapper: 'B121',     required: true,  chapter: 'all' },
  { code: 'B101',     order: 2,  label: 'Voluntary Petition for Individuals',          pages: 9,  mapper: 'B101',     required: true,  chapter: 'all' },
  { code: 'B106Sum',  order: 3,  label: 'Summary of Your Assets and Liabilities',      pages: 2,  mapper: 'B106Sum',  required: true,  chapter: 'all' },
  { code: 'B106AB',   order: 4,  label: 'Schedule A/B — Property',                     pages: 10, mapper: 'B106AB',   required: true,  chapter: 'all' },
  { code: 'B106C',    order: 5,  label: 'Schedule C — Property You Claim as Exempt',   pages: 2,  mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B106D',    order: 6,  label: 'Schedule D — Creditors With Secured Claims',  pages: 3,  mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B106EF',   order: 7,  label: 'Schedule E/F — Unsecured Claims',             pages: 6,  mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B106G',    order: 8,  label: 'Schedule G — Executory Contracts and Leases', pages: 2,  mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B106H',    order: 9,  label: 'Schedule H — Codebtors',                      pages: 2,  mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B106I',    order: 10, label: 'Schedule I — Your Income',                    pages: 2,  mapper: 'B106I',    required: true,  chapter: 'all' },
  { code: 'B106J',    order: 11, label: 'Schedule J — Your Expenses',                  pages: 3,  mapper: 'B106J',    required: true,  chapter: 'all' },
  { code: 'B106Dec',  order: 12, label: 'Declaration About Schedules',                 pages: 1,  mapper: 'B106Dec',  required: true,  chapter: 'all' },
  { code: 'B107',     order: 13, label: 'Statement of Financial Affairs',              pages: 12, mapper: null,        required: true,  chapter: 'all', headerOnly: true },
  { code: 'B108',     order: 14, label: 'Statement of Intention',                      pages: 2,  mapper: null,        required: true,  chapter: 7,     headerOnly: true },
  { code: 'B122A-1',  order: 15, label: 'Chapter 7 Statement of Current Monthly Income', pages: 2, mapper: null,        required: true, chapter: 7,     headerOnly: true },
  { code: 'B122A-2',  order: 16, label: 'Chapter 7 Means Test Calculation',            pages: 9,  mapper: null,        required: true,  chapter: 7,     headerOnly: true },
];

function listForms({ chapter = 7 } = {}) {
  return FORMS
    .filter(f => f.chapter === 'all' || f.chapter === chapter)
    .sort((a, b) => a.order - b.order);
}

function getForm(code) {
  return FORMS.find(f => f.code === code) || null;
}

module.exports = { FORMS, listForms, getForm };
