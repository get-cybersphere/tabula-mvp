// Bank intel module — public API + IPC.
//
// Caller (src/index.js):
//   const bankIntel = require('./main/bank-intel');
//   bankIntel.installSchema(db);
//   bankIntel.registerIPC({ ipcMain, db, logCaseEvent });
//
// Persistence model:
//   - bank_intel_findings table stores each finding from the analyzer
//   - status: 'open' | 'accepted' | 'dismissed' | 'snoozed'
//   - evidence_json holds the source transactions for audit
//
// Auto-trigger:
//   - When a bank_statement document is extracted, call analyzeCase(caseId)
//     to refresh findings. Old findings with the same dedup key are
//     preserved (status carries forward) so an attorney's earlier
//     "dismissed" decision sticks across re-analyses.

const { v4: uuid } = require('uuid');
const { analyze } = require('./analyzer');

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_intel_findings (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      label TEXT NOT NULL,
      payee TEXT,
      amount REAL,
      monthly_estimate REAL,
      transaction_count INTEGER DEFAULT 1,
      first_date TEXT,
      last_date TEXT,
      evidence_json TEXT,
      suggested_disposition TEXT,
      dedup_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      attorney_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bif_case ON bank_intel_findings(case_id, severity, status);
    CREATE INDEX IF NOT EXISTS idx_bif_dedup ON bank_intel_findings(case_id, dedup_key);
  `);
}

// Pull transactions for a case from any source we know about:
//   - bank_statement document extractions (extracted_data.transactions[])
//   - (future) plaid_transactions table when team PR #13 lands
function gatherTransactions(db, caseId) {
  const docs = db.prepare(`SELECT extracted_data FROM documents WHERE case_id = ? AND doc_type = 'bank_statement'`).all(caseId);
  const all = [];
  for (const d of docs) {
    if (!d.extracted_data) continue;
    let parsed;
    try { parsed = JSON.parse(d.extracted_data); } catch { continue; }
    if (Array.isArray(parsed?.transactions)) {
      for (const t of parsed.transactions) all.push(t);
    }
  }
  // Future: union with plaid_transactions when that table lands.
  return all;
}

function dedupKey(f) {
  return [
    f.code,
    f.payee || f.creditorName || '',
    Math.round(Number(f.amount || f.totalAmount || f.monthlyEstimate || 0)),
    f.firstDate || f.date || '',
  ].join('|').toLowerCase();
}

function persistFindings(db, caseId, findings) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT dedup_key, status, attorney_note FROM bank_intel_findings WHERE case_id = ?`).all(caseId);
  const existingMap = new Map(existing.map(r => [r.dedup_key, r]));

  // Mark all existing as 'stale' first; we'll un-mark anything still
  // present in the new findings. Old dismissed/accepted findings keep
  // their status (we just refresh updated_at).
  db.prepare(`UPDATE bank_intel_findings SET updated_at = ? WHERE case_id = ?`).run(now, caseId);

  const ins = db.prepare(`
    INSERT INTO bank_intel_findings
    (id, case_id, category, code, severity, label, payee, amount, monthly_estimate,
     transaction_count, first_date, last_date, evidence_json, suggested_disposition,
     dedup_key, status, attorney_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let added = 0, kept = 0;
  for (const f of findings) {
    const key = dedupKey(f);
    if (existingMap.has(key)) {
      kept++;
      continue;
    }
    ins.run(
      uuid(), caseId, f.category, f.code, f.severity, f.label,
      f.payee || f.creditorName || null,
      Number(f.amount || f.totalAmount || 0) || null,
      Number(f.monthlyEstimate || f.monthlyAverage || 0) || null,
      Number(f.transactionCount || (f.transactions?.length || 1)) || 1,
      f.firstDate || f.date || null,
      f.lastDate || f.date || null,
      JSON.stringify(f.transactions || []),
      f.suggestedDisposition || '',
      key, 'open', null, now, now
    );
    added++;
  }

  return { added, kept };
}

function listFindings(db, caseId) {
  return db.prepare(`
    SELECT * FROM bank_intel_findings
    WHERE case_id = ?
    ORDER BY
      CASE status WHEN 'open' THEN 0 WHEN 'snoozed' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
      CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
      last_date DESC
  `).all(caseId).map(r => ({
    ...r,
    evidence: r.evidence_json ? JSON.parse(r.evidence_json) : [],
  }));
}

function analyzeCase(db, caseId, opts = {}) {
  const transactions = gatherTransactions(db, caseId);
  const creditors = db.prepare(`SELECT id, name, schedule, debt_type FROM creditors WHERE case_id = ?`).all(caseId);
  const declaredIncome = db.prepare(`SELECT employer_name, source FROM income WHERE case_id = ?`).all(caseId);

  const result = analyze({
    transactions,
    creditors,
    declaredIncome,
    asOfDate: opts.asOfDate,
  });

  const persisted = persistFindings(db, caseId, result.findings);

  return {
    ...result,
    persisted,
  };
}

function registerIPC({ ipcMain, db, logCaseEvent }) {
  ipcMain.handle('bankIntel:analyze', (_, caseId) => {
    const result = analyzeCase(db, caseId);
    if (logCaseEvent) {
      logCaseEvent(caseId, 'bank_intel_analyzed',
        `Bank intel: ${result.findings.length} finding${result.findings.length === 1 ? '' : 's'} across ${result.stats.transactionsAnalyzed} transactions`,
        { stats: result.stats }
      );
    }
    return result;
  });

  ipcMain.handle('bankIntel:list', (_, caseId) => {
    return listFindings(db, caseId);
  });

  ipcMain.handle('bankIntel:setStatus', (_, findingId, status, note) => {
    const allowed = ['open', 'accepted', 'dismissed', 'snoozed'];
    if (!allowed.includes(status)) return { success: false, reason: 'invalid status' };
    const now = new Date().toISOString();
    db.prepare(`UPDATE bank_intel_findings SET status = ?, attorney_note = ?, updated_at = ? WHERE id = ?`)
      .run(status, note || null, now, findingId);
    return { success: true };
  });

  ipcMain.handle('bankIntel:stats', (_, caseId) => {
    const rows = db.prepare(`
      SELECT severity, status, COUNT(*) as count
      FROM bank_intel_findings
      WHERE case_id = ?
      GROUP BY severity, status
    `).all(caseId);
    return rows;
  });
}

module.exports = { installSchema, registerIPC, analyzeCase, listFindings };
