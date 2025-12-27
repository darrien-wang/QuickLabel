const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printLabel: (imgData) => ipcRenderer.send('print-label', imgData),
  printHTML: (htmlContent, printerName) => ipcRenderer.send('print-html', { htmlContent, printerName }),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  fetchGoogleSheets: (params) => ipcRenderer.invoke('fetch-google-sheets', params),
  fetchAllGoogleSheets: (params) => ipcRenderer.invoke('fetch-all-google-sheets', params),
  updateScanStatus: (params) => ipcRenderer.invoke('update-scan-status', params),
  batchUpdateScanStatus: (params) => ipcRenderer.invoke('batch-update-scan-status', params),
  onSyncBeforeClose: (callback) => ipcRenderer.on('sync-before-close', callback),
  sendSyncComplete: () => ipcRenderer.send('sync-complete')
});