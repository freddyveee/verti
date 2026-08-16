const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const SIDEBAR_WIDTH = 68;
const TOP_BAR = 44;
const FRAME = 8;
const isMac = process.platform === 'darwin';

const DEFAULT_APPS = [
  { id: 'calendar', name: 'Google Kalender', url: 'https://calendar.google.com/', icon: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: 'icons/whatsapp.png' },
  { id: 'todoist', name: 'Todoist', url: 'https://app.todoist.com/app/today' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
];

const CATALOG = [
  ...DEFAULT_APPS,
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'gdrive', name: 'Google Drive', url: 'https://drive.google.com/' },
  { id: 'stackfield', name: 'Stackfield', url: 'https://www.stackfield.com/', icon: 'icons/stackfield.png' },
  { id: 'notion', name: 'Notion', url: 'https://www.notion.so/' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/', icon: 'icons/telegram.png' },
  { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/' },
  { id: 'x', name: 'X', url: 'https://x.com/' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/' },
  { id: 'figma', name: 'Figma', url: 'https://www.figma.com/' },
];

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  let s;
  try {
    s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    s = {};
  }
  const apps = (Array.isArray(s.apps) && s.apps.length ? s.apps : DEFAULT_APPS)
    // Icon-Updates aus dem Katalog auch für bereits gespeicherte Apps übernehmen
    .map((a) => {
      const cat = CATALOG.find((c) => c.id === a.id);
      return cat && cat.icon ? { ...a, icon: cat.icon } : a;
    });
  return {
    bounds: s.bounds || { width: 1400, height: 900 },
    activeApp: s.activeApp || 'calendar',
    apps,
  };
}

let state = null;
let win = null;
const views = {};
let activeId = null;
let libraryOpen = false;
let saveTimer = null;

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (win && !win.isDestroyed()) {
        state.bounds = win.getBounds();
        state.activeApp = activeId;
        fs.writeFileSync(stateFile(), JSON.stringify(state));
      }
    } catch {}
  }, 300);
}

// Chrome-like UA so Google sign-in and WhatsApp Web accept the embedded browser
function chromeUserAgent() {
  const os = isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
}

function layoutViews() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  for (const id of Object.keys(views)) {
    views[id].setBounds({
      x: SIDEBAR_WIDTH,
      y: TOP_BAR,
      width: w - SIDEBAR_WIDTH - FRAME,
      height: h - TOP_BAR - FRAME,
    });
  }
}

function switchApp(id) {
  if (!views[id]) return;
  libraryOpen = false;
  activeId = id;
  for (const [vid, view] of Object.entries(views)) {
    view.setVisible(vid === id);
  }
  layoutViews();
  win.webContents.send('active-app', id);
  sendNavStateFor(id);
  saveState();
}

function createView(appDef) {
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:apps',
      spellcheck: true,
    },
  });
  view.webContents.setUserAgent(chromeUserAgent());
  view.webContents.loadURL(appDef.url);
  view.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  view.setVisible(false);
  try { view.setBorderRadius(10); } catch {}
  const sendNavState = () => {
    if (appDef.id === activeId) sendNavStateFor(appDef.id);
  };
  view.webContents.on('did-navigate', sendNavState);
  view.webContents.on('did-navigate-in-page', sendNavState);
  win.contentView.addChildView(view);
  views[appDef.id] = view;
}

function sendNavStateFor(id) {
  if (!win || !views[id]) return;
  const nh = views[id].webContents.navigationHistory;
  win.webContents.send('nav-state', {
    canGoBack: nh.canGoBack(),
    canGoForward: nh.canGoForward(),
  });
}

function navHome(id) {
  const appDef = state.apps.find((a) => a.id === id);
  if (appDef && views[id]) views[id].webContents.loadURL(appDef.url);
}

function createWindow() {
  state = loadState();

  const ses = session.fromPartition('persist:apps');
  ses.setUserAgent(chromeUserAgent());
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });

  win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'Verti',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 16 } }
      : { titleBarOverlay: { color: '#1b1d23', symbolColor: '#ffffff', height: TOP_BAR - 1 } }),
    backgroundColor: '#1b1d23',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('sidebar.html');

  for (const appDef of state.apps) {
    createView(appDef);
  }

  win.on('resize', () => { layoutViews(); saveState(); });
  win.on('move', saveState);
  win.on('closed', () => { win = null; });

  win.webContents.once('did-finish-load', () => {
    switchApp(views[state.activeApp] ? state.activeApp : state.apps[0].id);
  });
}

function setLibrary(open) {
  libraryOpen = open;
  for (const view of Object.values(views)) {
    view.setVisible(!open && undefined !== activeId && views[activeId] === view);
  }
}

ipcMain.on('switch-app', (e, id) => switchApp(id));
ipcMain.on('reload-app', (e, id) => views[id] && views[id].webContents.reload());
ipcMain.on('nav-back', () => activeId && views[activeId] && views[activeId].webContents.navigationHistory.goBack());
ipcMain.on('nav-forward', () => activeId && views[activeId] && views[activeId].webContents.navigationHistory.goForward());
ipcMain.on('nav-home', () => activeId && navHome(activeId));
ipcMain.handle('get-apps', () => state.apps);
ipcMain.handle('get-catalog', () => CATALOG);
ipcMain.on('open-library', () => setLibrary(true));
ipcMain.on('close-library', () => {
  setLibrary(false);
  switchApp(activeId && views[activeId] ? activeId : state.apps[0].id);
});

ipcMain.on('add-app', (e, appDef) => {
  if (!appDef || !appDef.id || !appDef.url || views[appDef.id]) return;
  let url;
  try {
    url = new URL(appDef.url);
  } catch {
    return;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  const clean = { id: String(appDef.id), name: String(appDef.name || url.hostname), url: url.href };
  if (typeof appDef.icon === 'string') clean.icon = appDef.icon;
  state.apps.push(clean);
  createView(clean);
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
  switchApp(clean.id);
});

function removeApp(id) {
  if (!views[id] || state.apps.length <= 1) return;
  const view = views[id];
  win.contentView.removeChildView(view);
  view.webContents.close();
  delete views[id];
  state.apps = state.apps.filter((a) => a.id !== id);
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
  if (activeId === id) {
    activeId = null;
    if (!libraryOpen) switchApp(state.apps[0].id);
  }
}

ipcMain.on('remove-app', (e, id) => removeApp(id));

ipcMain.on('reorder-apps', (e, ids) => {
  if (!Array.isArray(ids)) return;
  const byId = Object.fromEntries(state.apps.map((a) => [a.id, a]));
  const reordered = ids.map((id) => byId[id]).filter(Boolean);
  if (reordered.length !== state.apps.length) return;
  state.apps = reordered;
  buildMenu();
  saveState();
  win.webContents.send('apps-changed', state.apps);
});

ipcMain.on('app-context-menu', (e, id) => {
  const appDef = state.apps.find((a) => a.id === id);
  if (!appDef) return;
  const menu = Menu.buildFromTemplate([
    { label: appDef.name, enabled: false },
    { type: 'separator' },
    { label: 'Neu laden', click: () => views[id] && views[id].webContents.reload() },
    { label: 'Zur Startseite', click: () => navHome(id) },
    {
      label: 'Entfernen',
      enabled: state.apps.length > 1,
      click: () => removeApp(id),
    },
  ]);
  menu.popup({ window: win });
});

function buildMenu() {
  const appSwitchItems = state.apps.slice(0, 9).map((a, i) => ({
    label: a.name,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: () => switchApp(a.id),
  }));
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Ansicht',
      submenu: [
        ...appSwitchItems,
        { type: 'separator' },
        {
          label: 'Aktive App neu laden',
          accelerator: 'CmdOrCtrl+R',
          click: () => activeId && views[activeId] && views[activeId].webContents.reload(),
        },
        {
          label: 'Zurück',
          accelerator: 'CmdOrCtrl+[',
          click: () => activeId && views[activeId] && views[activeId].webContents.navigationHistory.goBack(),
        },
        {
          label: 'Vorwärts',
          accelerator: 'CmdOrCtrl+]',
          click: () => activeId && views[activeId] && views[activeId].webContents.navigationHistory.goForward(),
        },
        {
          label: 'Zur Startseite',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => activeId && navHome(activeId),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Windows: kein 'close'-Role im Fenstermenü, sonst beendet Strg+W die komplette App
    isMac ? { role: 'windowMenu' } : { label: 'Fenster', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // Windows: AppUserModelID muss der appId entsprechen, sonst funktionieren Benachrichtigungen nicht sauber
  if (!isMac) app.setAppUserModelId('rocks.imperio.verti');
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (win === null || BrowserWindow.getAllWindows().length === 0) {
      Object.keys(views).forEach((k) => delete views[k]);
      createWindow();
    } else if (win) {
      win.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Mac-üblich: App läuft im Dock weiter; unter Windows/Linux beendet Fenster-Schließen die App
  if (!isMac) app.quit();
});
