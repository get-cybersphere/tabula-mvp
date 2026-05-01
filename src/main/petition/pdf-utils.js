// Safe AcroForm setters.
//
// Why a wrapper instead of calling pdf-lib directly: each form has hundreds
// of fields, names vary slightly across revisions, and a single call to
// `getTextField()` for a non-existent name throws and aborts the entire
// fill. We want a fill to be best-effort: try the field, swallow misses,
// and report what landed vs what didn't.
//
// Every setter returns `true` on success / `false` on miss so the mapper
// can count `mapped / total`.

function setText(form, name, value) {
  if (value == null || value === '') return false;
  try {
    const field = form.getTextField(name);
    field.setText(String(value));
    return true;
  } catch {
    return false;
  }
}

function setCheck(form, name, on) {
  try {
    const field = form.getCheckBox(name);
    if (on) field.check();
    else field.uncheck();
    return true;
  } catch {
    return false;
  }
}

function setDropdown(form, name, value) {
  if (value == null || value === '') return false;
  try {
    const field = form.getDropdown(name);
    const options = field.getOptions();
    if (options.includes(value)) {
      field.select(value);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Tracks per-form fill stats. Pass instances around so multiple mappers
// can write to the same counter for shared fields (e.g., header on B101).
class FillStats {
  constructor(totalFields) {
    this.total = totalFields;
    this.mapped = 0;
    this.missedSetters = []; // { name, reason } we tried but couldn't set
  }
  hit() { this.mapped += 1; }
  miss(name, reason) { this.missedSetters.push({ name, reason: reason || 'field not found' }); }
  record(ok, name) { if (ok) this.hit(); else this.miss(name); }
}

module.exports = { setText, setCheck, setDropdown, FillStats };
