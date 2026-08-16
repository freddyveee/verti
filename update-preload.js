const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vertiUpdate', {
  onState: (cb) => ipcRenderer.on('verti-update:state', (_e, payload) => cb(payload)),
  action: (name) => ipcRenderer.send('verti-update:action', name),
});
