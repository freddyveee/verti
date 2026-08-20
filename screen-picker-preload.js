const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vertiPicker', {
  onSources: (cb) => ipcRenderer.on('screen-picker:sources', (_e, list) => cb(list)),
  choose: (id) => ipcRenderer.send('screen-picker:choose', id),
});
