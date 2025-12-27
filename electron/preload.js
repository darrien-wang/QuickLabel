const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printLabel: (imgData) => ipcRenderer.send('print-label', imgData),
  printHTML: (htmlContent, printerName) => ipcRenderer.send('print-html', { htmlContent, printerName }),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  // Google Sheets & Data
  fetchGoogleSheets: (params) => ipcRenderer.invoke('fetch-google-sheets', params),
  fetchAllGoogleSheets: (params) => ipcRenderer.invoke('fetch-all-google-sheets', params),
  updateScanStatus: (params) => ipcRenderer.invoke('update-scan-status', params),
  batchUpdateScanStatus: (params) => ipcRenderer.invoke('batch-update-scan-status', params),
  onSyncBeforeClose: (callback) => ipcRenderer.on('sync-before-close', callback),
  sendSyncComplete: () => ipcRenderer.send('sync-complete'),

  // LAN Sync
  startHost: () => ipcRenderer.invoke('lan-start-host'),
  stopHost: () => ipcRenderer.invoke('lan-stop-host'),
  connectToHost: (ip) => ipcRenderer.invoke('lan-connect', ip),
  disconnectFromHost: () => ipcRenderer.invoke('lan-disconnect'),
  requestSync: () => ipcRenderer.invoke('lan-request-sync'),
  getLanStatus: () => ipcRenderer.invoke('lan-get-status'),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),

  // Host -> Client
  sendSyncData: (socketId, batches, activeBatchId) => ipcRenderer.send('lan-send-sync-data', { socketId, batches, activeBatchId }),
  broadcastScan: (scanData) => ipcRenderer.send('lan-broadcast-scan', scanData),

  // Client -> Host
  sendClientScan: (scanData) => ipcRenderer.send('lan-client-scan', scanData),

  // Events
  onSyncDataRequest: (callback) => ipcRenderer.on('sync-data-request', (event, socketId) => callback(socketId)),
  onRemoteScan: (callback) => ipcRenderer.on('remote-scan', (event, data) => callback(data)),

  onHostConnected: (callback) => ipcRenderer.on('host-connected', callback),
  onHostConnectionError: (callback) => ipcRenderer.on('host-connection-error', (event, err) => callback(err)),
  onSyncDataReceived: (callback) => ipcRenderer.on('sync-data-received', (event, data) => callback(data)),
  onRemoteScanUpdate: (callback) => ipcRenderer.on('remote-scan-update', (event, data) => callback(data))
});