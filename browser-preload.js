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
  toggleBookmark: () => ipcRenderer.send('browser:toggle-bookmark'),
  openBookmark: (url) => ipcRenderer.send('browser:open-bookmark', url),
  removeBookmark: (url) => ipcRenderer.send('browser:remove-bookmark', url),
  onBookmarks: (cb) => ipcRenderer.on('browser:bookmarks', (e, list) => cb(list)),
  suggest: (text) => ipcRenderer.send('browser:suggest', text),
  suggestOpen: () => ipcRenderer.send('browser:suggest-open'),
  suggestClose: () => ipcRenderer.send('browser:suggest-close'),
  onSuggestions: (cb) => ipcRenderer.on('browser:suggestions', (e, data) => cb(data)),
  onTabs: (cb) => ipcRenderer.on('browser:tabs', (e, tabs) => cb(tabs)),
  onState: (cb) => ipcRenderer.on('browser:state', (e, s) => cb(s)),
  onFocusAddress: (cb) => ipcRenderer.on('browser:focus-address', () => cb()),
});
