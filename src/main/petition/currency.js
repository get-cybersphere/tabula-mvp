// Money formatting for AcroForm text fields.
//
// US Courts forms typically render currency as "$1,234.56". They accept
// either string or numeric input in the AcroForm field but the visual
// alignment of the printed form looks right with explicit comma-separated,
// 2-decimal strings.

function fmt(amount) {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '';
  const n = Number(amount);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtWithSign(amount) {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '';
  return '$' + fmt(amount);
}

function sum(arr, key) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, x) => {
    const v = key ? x?.[key] : x;
    return acc + (Number(v) || 0);
  }, 0);
}

module.exports = { fmt, fmtWithSign, sum };
