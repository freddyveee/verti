// Preload der Verti-Browser-Leiste (browser.html). Brücke zwischen der Leiste
// (Tabs + Adresse, im Renderer) und dem Hauptprozess, der die eigentlichen
// Seiten als eigene WebContentsViews verwaltet.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vertibrowser', {
  ready: () => ipcRenderer.send('browser:ready'),
  newTab: () => ipcRenderer.send('browser:new-tab'),
  closeTab: (key) => ipcRenderer.send('browser:close-tab', key),
  switchTab: (key) => ipcRenderer.send('browser:switch-tab', key),
  navigate: (text) => ipcRenderer.send('browser:navigate', text),
  back: () => ipcRenderer.send('browser:back'),
  forward: () => ipcRenderer.send('browser:forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  stop: () => ipcRenderer.send('browser:stop'),
  onTabs: (cb) => ipcRenderer.on('browser:tabs', (e, tabs) => cb(tabs)),
  onState: (cb) => ipcRenderer.on('browser:state', (e, s) => cb(s)),
  onFocusAddress: (cb) => ipcRenderer.on('browser:focus-address', () => cb()),
});
