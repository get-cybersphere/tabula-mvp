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

  // Income
  income: {
    upsert: (caseId, income) => ipcRenderer.invoke('income:upsert', caseId, income),
  },

  // Expenses
  expenses: {
    upsert: (caseId, expense) => ipcRenderer.invoke('expenses:upsert', caseId, expense),
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

  // Means Test
  meansTest: {
    uploadFiles: () => ipcRenderer.invoke('means-test:upload-files'),
    extract: (filePath, docCategory) => ipcRenderer.invoke('means-test:extract', filePath, docCategory),
    checkApiKey: () => ipcRenderer.invoke('means-test:check-api-key'),
  },

  // Navigation listener (from menu bar)
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
