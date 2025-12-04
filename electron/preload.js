const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printLabel: (imgData) => ipcRenderer.send('print-label', imgData),
  printHTML: (htmlContent) => ipcRenderer.send('print-html', htmlContent),
  fetchGoogleSheets: (params) => ipcRenderer.invoke('fetch-google-sheets', params),
  updateScanStatus: (params) => ipcRenderer.invoke('update-scan-status', params)
});