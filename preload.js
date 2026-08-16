const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('verti', {
  platform: process.platform,
  getApps: () => ipcRenderer.invoke('get-apps'),
  getCatalog: () => ipcRenderer.invoke('get-catalog'),
  switchApp: (id) => ipcRenderer.send('switch-app', id),
  reloadApp: (id) => ipcRenderer.send('reload-app', id),
  addApp: (appDef) => ipcRenderer.send('add-app', appDef),
  removeApp: (id) => ipcRenderer.send('remove-app', id),
  reorderApps: (ids) => ipcRenderer.send('reorder-apps', ids),
  showAppMenu: (id) => ipcRenderer.send('app-context-menu', id),
  openLibrary: () => ipcRenderer.send('open-library'),
  closeLibrary: () => ipcRenderer.send('close-library'),
  navBack: () => ipcRenderer.send('nav-back'),
  navForward: () => ipcRenderer.send('nav-forward'),
  navHome: () => ipcRenderer.send('nav-home'),
  getBadges: () => ipcRenderer.invoke('get-badges'),
  onBadges: (cb) => ipcRenderer.on('badges', (e, b) => cb(b)),
  setOverlay: (dataUrl, total) => ipcRenderer.send('set-overlay', dataUrl, total),
  onNavState: (cb) => ipcRenderer.on('nav-state', (e, s) => cb(s)),
  onActiveApp: (cb) => ipcRenderer.on('active-app', (e, id) => cb(id)),
  onAppsChanged: (cb) => ipcRenderer.on('apps-changed', (e, apps) => cb(apps)),
});
