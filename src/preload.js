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
    delete: (docId) => ipcRenderer.invoke('documents:delete', docId),
    // Drag-drop multi-file processor. Sends absolute file paths; emits
    // progress events via the listener registered with onProgress().
    processFiles: (caseId, filePaths) => ipcRenderer.invoke('documents:processFiles', caseId, filePaths),
    onProgress: (callback) => {
      const handler = (_, payload) => callback(payload);
      ipcRenderer.on('documents:progress', handler);
      return () => ipcRenderer.removeListener('documents:progress', handler);
    },
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

  // Petition / filing packet
  petition: {
    listForms: (chapter) => ipcRenderer.invoke('petition:listForms', chapter),
    preview: (caseId) => ipcRenderer.invoke('petition:preview', caseId),
    generate: (caseId, opts) => ipcRenderer.invoke('petition:generate', caseId, opts),
    listPackets: (caseId) => ipcRenderer.invoke('petition:listPackets', caseId),
    getPacket: (packetId) => ipcRenderer.invoke('petition:getPacket', packetId),
    revealPacket: (packetId) => ipcRenderer.invoke('petition:revealPacket', packetId),
    openForm: (packetId, fileName) => ipcRenderer.invoke('petition:openForm', packetId, fileName),
    setStatus: (packetId, status, notes) => ipcRenderer.invoke('petition:setStatus', packetId, status, notes),
    deletePacket: (packetId) => ipcRenderer.invoke('petition:deletePacket', packetId),
  },

  // Navigation listener (from menu bar)
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
