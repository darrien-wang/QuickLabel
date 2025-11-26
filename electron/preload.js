const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printLabel: (imgData) => ipcRenderer.send('print-label', imgData),
  printHTML: (htmlContent) => ipcRenderer.send('print-html', htmlContent)
});