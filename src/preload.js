const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabula', {
  // Cases
  cases: {
    list: (filters) => ipcRenderer.invoke('cases:list', filters),
    get: (id) => ipcRenderer.invoke('cases:get', id),
    create: (data) => ipcRenderer.invoke('cases:create', data),
    update: (id, data) => ipcRenderer.invoke('cases:update', id, data),
    delete: (id) => ipcRenderer.invoke('cases:delete', id),
  },

  // Creditors
  creditors: {
    list: (caseId) => ipcRenderer.invoke('creditors:list', caseId),
    upsert: (caseId, creditor) => ipcRenderer.invoke('creditors:upsert', caseId, creditor),
  },

  // Debtors
  debtors: {
    upsert: (caseId, debtor) => ipcRenderer.invoke('debtors:upsert', caseId, debtor),
    delete: (id) => ipcRenderer.invoke('debtors:delete', id),
  },

  // Income
  income: {
    upsert: (caseId, income) => ipcRenderer.invoke('income:upsert', caseId, income),
    delete: (id) => ipcRenderer.invoke('income:delete', id),
  },

  // Expenses
  expenses: {
    upsert: (caseId, expense) => ipcRenderer.invoke('expenses:upsert', caseId, expense),
    delete: (id) => ipcRenderer.invoke('expenses:delete', id),
  },

  // Assets
  assets: {
    upsert: (caseId, asset) => ipcRenderer.invoke('assets:upsert', caseId, asset),
  },

  // Documents
  documents: {
    upload: (caseId) => ipcRenderer.invoke('documents:upload', caseId),
    list: (caseId) => ipcRenderer.invoke('documents:list', caseId),
    extract: (docId) => ipcRenderer.invoke('documents:extract', docId),
  },

  // Review Flags
  reviewFlags: {
    list: (caseId) => ipcRenderer.invoke('review-flags:list', caseId),
    create: (flag) => ipcRenderer.invoke('review-flags:create', flag),
    resolve: (id) => ipcRenderer.invoke('review-flags:resolve', id),
  },

  // Stats
  stats: {
    overview: () => ipcRenderer.invoke('stats:overview'),
  },

  // Timeline events
  events: {
    list: (caseId) => ipcRenderer.invoke('events:list', caseId),
    recent: (limit) => ipcRenderer.invoke('events:recent', limit),
  },

  // Means Test
  meansTest: {
    uploadFiles: () => ipcRenderer.invoke('means-test:upload-files'),
    extract: (filePath, docCategory) => ipcRenderer.invoke('means-test:extract', filePath, docCategory),
    checkApiKey: () => ipcRenderer.invoke('means-test:check-api-key'),
    // v1: provenance graph
    listReceipts: (caseId) => ipcRenderer.invoke('meansTest:listReceipts', caseId),
    upsertReceipt: (caseId, receipt) => ipcRenderer.invoke('meansTest:upsertReceipt', caseId, receipt),
    deleteReceipt: (id) => ipcRenderer.invoke('meansTest:deleteReceipt', id),
    listManualDeductions: (caseId) => ipcRenderer.invoke('meansTest:listManualDeductions', caseId),
    upsertManualDeduction: (caseId, ded) => ipcRenderer.invoke('meansTest:upsertManualDeduction', caseId, ded),
    deleteManualDeduction: (id) => ipcRenderer.invoke('meansTest:deleteManualDeduction', id),
    saveRun: (caseId, runData) => ipcRenderer.invoke('meansTest:saveRun', caseId, runData),
    listRuns: (caseId) => ipcRenderer.invoke('meansTest:listRuns', caseId),
    exportAuditPacket: (caseId, runId) => ipcRenderer.invoke('meansTest:exportAuditPacket', caseId, runId),
    exportB122A: (caseId, runId) => ipcRenderer.invoke('meansTest:exportB122A', caseId, runId),
  },

  // Notes
  notes: {
    list: (caseId) => ipcRenderer.invoke('notes:list', caseId),
    create: (caseId, content) => ipcRenderer.invoke('notes:create', caseId, content),
    update: (id, content) => ipcRenderer.invoke('notes:update', id, content),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
  },

  // AI Assistant
  ai: {
    chat: (caseId, message) => ipcRenderer.invoke('ai:chat', caseId, message),
    history: (caseId) => ipcRenderer.invoke('ai:history', caseId),
    clear: (caseId) => ipcRenderer.invoke('ai:clear', caseId),
  },

  // Analytics
  analytics: {
    upsert: (caseId, data) => ipcRenderer.invoke('analytics:upsert', caseId, data),
    get: (caseId) => ipcRenderer.invoke('analytics:get', caseId),
    firmOverview: () => ipcRenderer.invoke('analytics:firm-overview'),
  },

  // Templates
  templates: {
    list: (practiceType) => ipcRenderer.invoke('templates:list', practiceType),
    create: (template) => ipcRenderer.invoke('templates:create', template),
  },

  // PI Case Details
  pi: {
    details: {
      get: (caseId) => ipcRenderer.invoke('pi:details:get', caseId),
      upsert: (caseId, data) => ipcRenderer.invoke('pi:details:upsert', caseId, data),
    },
    medical: {
      list: (caseId) => ipcRenderer.invoke('pi:medical:list', caseId),
      upsert: (caseId, record) => ipcRenderer.invoke('pi:medical:upsert', caseId, record),
      delete: (id) => ipcRenderer.invoke('pi:medical:delete', id),
    },
    settlements: {
      list: (caseId) => ipcRenderer.invoke('pi:settlements:list', caseId),
      create: (caseId, data) => ipcRenderer.invoke('pi:settlements:create', caseId, data),
      delete: (id) => ipcRenderer.invoke('pi:settlements:delete', id),
    },
    statutes: {
      list: (caseId) => ipcRenderer.invoke('pi:statutes:list', caseId),
      upsert: (caseId, data) => ipcRenderer.invoke('pi:statutes:upsert', caseId, data),
      delete: (id) => ipcRenderer.invoke('pi:statutes:delete', id),
    },
  },

  // Plaid (sandbox-ready scaffold; phase 1 = link + token + sync)
  plaid: {
    isConfigured:      ()                                  => ipcRenderer.invoke('plaid:isConfigured'),
    createLinkToken:   (caseId)                            => ipcRenderer.invoke('plaid:createLinkToken', caseId),
    exchangeToken:     (caseId, publicToken, metadata)     => ipcRenderer.invoke('plaid:exchangeToken', caseId, publicToken, metadata),
    listForCase:       (caseId)                            => ipcRenderer.invoke('plaid:listForCase', caseId),
    syncTransactions:  (itemRowId)                         => ipcRenderer.invoke('plaid:syncTransactions', itemRowId),
    disconnectItem:    (itemRowId)                         => ipcRenderer.invoke('plaid:disconnectItem', itemRowId),
    detectIncome:      (caseId, windowStart, windowEnd)    => ipcRenderer.invoke('plaid:detectIncome', caseId, windowStart, windowEnd),
    classifyExpenses:  (caseId, windowStart, windowEnd)    => ipcRenderer.invoke('plaid:classifyExpenses', caseId, windowStart, windowEnd),
  },

  // Navigation listener (from menu bar)
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
