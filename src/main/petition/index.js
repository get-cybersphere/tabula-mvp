// Petition module — public API + IPC registration.
//
// Caller (src/index.js) does:
//   const petition = require('./main/petition');
//   petition.installSchema(db);
//   petition.registerIPC({ ipcMain, db, app, logCaseEvent });

const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');
const { v4: uuid } = require('uuid');

const { buildPacket, previewCompleteness } = require('./packet-builder');
const { listForms } = require('./registry');

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS filing_packets (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      generated_at TEXT NOT NULL,
      output_dir TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_filing_packets_case ON filing_packets(case_id, generated_at DESC);
  `);
}

function registerIPC({ ipcMain, db, app, logCaseEvent }) {

  // List the form catalog for a given chapter — drives the Filing tab
  // sidebar even before the first generation.
  ipcMain.handle('petition:listForms', (_, chapter = 7) => {
    return listForms({ chapter });
  });

  // Per-form completion percentages without writing any PDF.
  ipcMain.handle('petition:preview', async (_, caseId) => {
    return await previewCompleteness({ db, caseId });
  });

  // Generate a complete packet to disk + persist a row.
  ipcMain.handle('petition:generate', async (_, caseId, opts = {}) => {
    const { outputDir, manifest } = await buildPacket({ db, caseId, app });
    const id = uuid();
    db.prepare(`
      INSERT INTO filing_packets (id, case_id, generated_at, output_dir, manifest_json, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, caseId, manifest.generatedAt, outputDir, JSON.stringify(manifest), 'draft', opts.notes || null);

    // Auto-create review flags for any gaps we found, so they show up in
    // the existing case-wide review-flag list. Reuse the section/field_path
    // shape the case-completeness UI already understands.
    for (const formResult of manifest.forms) {
      for (const gap of formResult.gaps || []) {
        try {
          db.prepare(`
            INSERT INTO review_flags (id, case_id, section, field_path, note, resolved, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
          `).run(
            uuid(), caseId, formResult.code, gap.field, gap.reason, manifest.generatedAt
          );
        } catch {
          // Don't fail the packet if a flag insert fails (duplicates etc.).
        }
      }
    }

    if (logCaseEvent) {
      logCaseEvent(caseId, 'petition_drafted',
        `Drafted filing packet (${manifest.summary.formsTotal} forms, ${manifest.summary.mappedFields}/${manifest.summary.totalFields} fields)`,
        { packetId: id, mapped: manifest.summary.mappedFields, total: manifest.summary.totalFields });
    }

    return { id, outputDir, manifest };
  });

  // List prior packets for a case, newest first.
  ipcMain.handle('petition:listPackets', (_, caseId) => {
    const rows = db.prepare(`
      SELECT id, case_id, generated_at, output_dir, status, notes, manifest_json
      FROM filing_packets
      WHERE case_id = ?
      ORDER BY generated_at DESC
    `).all(caseId);
    return rows.map(r => ({
      id: r.id,
      caseId: r.case_id,
      generatedAt: r.generated_at,
      outputDir: r.output_dir,
      status: r.status,
      notes: r.notes,
      // Provide a slim manifest summary; full manifest available on demand.
      summary: (() => {
        try { return JSON.parse(r.manifest_json).summary; }
        catch { return null; }
      })(),
    }));
  });

  // Get the full manifest for a packet (for showing per-form details).
  ipcMain.handle('petition:getPacket', (_, packetId) => {
    const row = db.prepare('SELECT * FROM filing_packets WHERE id = ?').get(packetId);
    if (!row) return null;
    return {
      id: row.id,
      caseId: row.case_id,
      generatedAt: row.generated_at,
      outputDir: row.output_dir,
      status: row.status,
      notes: row.notes,
      manifest: JSON.parse(row.manifest_json),
    };
  });

  // Reveal the packet output folder in Finder / Explorer.
  ipcMain.handle('petition:revealPacket', (_, packetId) => {
    const row = db.prepare('SELECT output_dir FROM filing_packets WHERE id = ?').get(packetId);
    if (!row || !fs.existsSync(row.output_dir)) return { success: false, reason: 'folder not found' };
    shell.openPath(row.output_dir);
    return { success: true };
  });

  // Open one of the filled forms in the OS PDF viewer.
  ipcMain.handle('petition:openForm', (_, packetId, fileName) => {
    const row = db.prepare('SELECT output_dir FROM filing_packets WHERE id = ?').get(packetId);
    if (!row) return { success: false, reason: 'packet not found' };
    const filePath = path.join(row.output_dir, fileName);
    if (!fs.existsSync(filePath)) return { success: false, reason: 'file not found: ' + fileName };
    shell.openPath(filePath);
    return { success: true };
  });

  // Mark a packet's status (draft → reviewed → filed).
  ipcMain.handle('petition:setStatus', (_, packetId, status, notes) => {
    db.prepare('UPDATE filing_packets SET status = ?, notes = ? WHERE id = ?').run(status, notes || null, packetId);
    return { success: true };
  });

  ipcMain.handle('petition:deletePacket', (_, packetId) => {
    const row = db.prepare('SELECT output_dir FROM filing_packets WHERE id = ?').get(packetId);
    if (row && row.output_dir && fs.existsSync(row.output_dir)) {
      try { fs.rmSync(row.output_dir, { recursive: true, force: true }); } catch {}
    }
    db.prepare('DELETE FROM filing_packets WHERE id = ?').run(packetId);
    return { success: true };
  });
}

module.exports = { installSchema, registerIPC };
