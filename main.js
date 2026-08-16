const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, dialog } = require('electron');
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

// IMPERIO-Standard-Apps erscheinen in der Bibliothek in einem eigenen Bereich oben
const IMPERIO_IDS = ['calendar', 'stackfield', 'claude', 'chatgpt', 'google', 'imperio-tools'];

const CATALOG = [
  ...DEFAULT_APPS,
  { id: 'google', name: 'Google', url: 'https://www.google.com/' },
  { id: 'imperio-tools', name: 'IMPERIO Tools', url: 'https://imperio-tools.netlify.app/' },
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

// Login-Popups müssen in der App bleiben (gleiche Session), sonst landet die
// Anmeldung im externen Browser, wo sie der App nichts bringt.
// host matcht exakt oder als Subdomain; path (falls gesetzt) den Pfadanfang.
const AUTH_TARGETS = [
  { host: 'accounts.google.com' },
  { host: 'accounts.youtube.com' },
  { host: 'appleid.apple.com' },
  { host: 'login.microsoftonline.com' },
  { host: 'login.live.com' },
  { host: 'login.yahoo.com' },
  { host: 'auth.openai.com' },
  { host: 'auth0.com' },
  { host: 'okta.com' },
  { host: 'id.atlassian.com' },
  // Facebook nutzt versionierte Dialog-Pfade: /v25.0/dialog/oauth
  { host: 'facebook.com', path: /^\/(v\d+(\.\d+)?\/)?(dialog|login)([/.?]|$)/ },
  { host: 'github.com', path: /^\/(login|session)([/?]|$)/ },
  { host: 'linkedin.com', path: /^\/(oauth|checkpoint)([/?]|$)/ },
  { host: 'slack.com', path: /^\/(signin|sso|openid|workspace-signin)([/?]|$)/ },
  { host: 'stackfield.com', path: /^\/login/ },
  { host: 'claude.ai', path: /^\/(login|oauth)([/?]|$)/ },
  // Notion startet sein Google-Login-Popup auf einer eigenen notion.so-URL
  { host: 'notion.so', path: /^\/(login|verifyNoPopupBlocker|googlepopupredirect)/i },
];

function isAuthUrl(url) {
  // Leere/about:blank-Popups nutzen viele OAuth-Flows als Startpunkt
  if (!url || url === 'about:blank') return true;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return AUTH_TARGETS.some(
    (t) => (u.host === t.host || u.host.endsWith('.' + t.host)) && (!t.path || t.path.test(u.pathname))
  );
}

// shell.openExternal ist ShellExecute: nur harmlose Protokolle rauslassen,
// file://, UNC-Pfade und Custom-Protokolle aus Webinhalt verwerfen
function openExternally(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (['http:', 'https:', 'mailto:'].includes(u.protocol)) shell.openExternal(url);
}

// Popouts einer installierten App (z.B. Gmail "In neuem Fenster verfassen")
// gehören in die App-Session, nicht in den externen Browser
function isInstalledAppUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return (state?.apps || []).some((a) => {
    try {
      const appHost = new URL(a.url).host;
      return u.host === appHost || u.host.endsWith('.' + appHost);
    } catch {
      return false;
    }
  });
}

function popupWindowOptions(width, height) {
  return {
    width,
    height,
    autoHideMenuBar: true,
    webPreferences: { partition: 'persist:apps' },
  };
}

// Eine gemeinsame Fenster-Policy für Views UND deren Popups: Auth bleibt in
// der App, App-Popouts bleiben in der App, alles andere geht in den Browser
function windowOpenPolicy(openerContents) {
  return ({ url, disposition }) => {
    if (isAuthUrl(url)) {
      // Skript-Popups (window.open mit Fenstermaßen, disposition 'new-window')
      // melden sich beim Opener zurück und schließen sich selbst → kleines Fenster.
      // Normale Login-Links (target=_blank) dagegen in der Ansicht selbst laden,
      // dort geht es nach dem Login im Dienst weiter.
      if (disposition === 'new-window' || !url || url === 'about:blank') {
        return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(520, 680) };
      }
      openerContents.loadURL(url);
      return { action: 'deny' };
    }
    if (disposition === 'new-window' && isInstalledAppUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(1100, 800) };
    }
    openExternally(url);
    return { action: 'deny' };
  };
}

// Von uns erlaubte Popup-Fenster bekommen dieselbe Policy und denselben
// Chrome-UA, sonst wären sie unreguliert (und verraten sich als Electron)
function adoptChildWindow(child) {
  child.webContents.setUserAgent(chromeUserAgent());
  child.webContents.setWindowOpenHandler(windowOpenPolicy(child.webContents));
  child.webContents.on('did-create-window', (grandchild) => adoptChildWindow(grandchild));
}

// Pro App: CSS/JS gegen "Lade unsere Desktop-App"-Werbung der Web-Apps.
// Der JS-Wächter fasst nur Bereiche außerhalb des Chat-Fensters (#main) an,
// damit niemals echte Nachrichten ausgeblendet werden.
const APP_TWEAKS = {
  whatsapp: {
    css: '[data-testid="intro_panel_v2_title_card"] { display: none !important; }',
    js: `(() => {
      const AD = /^(Hol dir WhatsApp für (Windows|Mac)|Get WhatsApp for (Windows|Mac)|Lade WhatsApp für (Windows|Mac) herunter|Download WhatsApp for (Windows|Mac))$/i;
      const hide = (el) => { if (el && el.style) el.style.setProperty('display', 'none', 'important'); };
      const sweep = () => {
        for (const a of document.querySelectorAll('a[href*="whatsapp.com/download"], a[href*="ms-windows-store"], a[href*="apps.microsoft.com"]')) {
          if (!a.closest('#main')) hide(a.closest('[role="listitem"]') || a);
        }
        for (const el of document.querySelectorAll('span, h1, h2')) {
          if (el.childElementCount === 0 && AD.test((el.textContent || '').trim()) && !el.closest('#main')) {
            hide(el.closest('[role="button"], a') || el.parentElement);
          }
        }
      };
      let timer = null;
      const queueSweep = () => { clearTimeout(timer); timer = setTimeout(sweep, 400); };
      sweep();
      new MutationObserver(queueSweep).observe(document.body, { childList: true, subtree: true });
    })();`,
  },
};

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
  view.webContents.setWindowOpenHandler(windowOpenPolicy(view.webContents));
  view.webContents.on('did-create-window', (child) => adoptChildWindow(child));
  const tweaks = APP_TWEAKS[appDef.id];
  if (tweaks) {
    view.webContents.on('dom-ready', () => {
      if (tweaks.css) view.webContents.insertCSS(tweaks.css).catch(() => {});
      if (tweaks.js) view.webContents.executeJavaScript(tweaks.js).catch(() => {});
    });
  }
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
ipcMain.handle('get-catalog', () => CATALOG.map((c) => ({ ...c, imperio: IMPERIO_IDS.includes(c.id) })));
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
        { label: 'Nach Updates suchen…', click: () => checkForUpdatesManually() },
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

// ---------- Auto-Update ----------
// Windows: vollautomatisch über electron-updater (GitHub Releases).
// Mac: App ist unsigniert, dort Hinweis-Dialog + Download der neuen DMG.
const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
let macUpdateNotifiedFor = null;
let winUpdateNotifiedFor = null;
let updateDialogOpen = false;

function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function getAutoUpdater() {
  const { autoUpdater } = require('electron-updater');
  return autoUpdater;
}

// Liefert 'update' | 'none' | 'error'. auto=true unterdrückt wiederholte
// Hinweise für dieselbe Version (Check läuft alle 4 Stunden).
async function checkMacUpdate(auto) {
  let latest;
  try {
    const res = await fetch('https://api.github.com/repos/freddyveee/verti/releases/latest', {
      headers: { 'User-Agent': 'Verti' },
    });
    if (!res.ok) return 'error';
    latest = String((await res.json()).tag_name || '').replace(/^v/, '');
  } catch {
    return 'error';
  }
  if (!latest) return 'error';
  if (!isNewerVersion(latest, app.getVersion())) return 'none';
  if (auto && macUpdateNotifiedFor === latest) return 'update';
  macUpdateNotifiedFor = latest;
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Update verfügbar',
    message: `Verti ${latest} ist verfügbar.`,
    detail: 'Lade die neue Version herunter und ziehe sie einmal in den Programme-Ordner. Alle Logins und Apps bleiben erhalten.',
    buttons: ['Herunterladen', 'Später'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.openExternal('https://github.com/freddyveee/verti/releases/latest/download/Verti-Mac.dmg');
  return 'update';
}

function setupAutoUpdate() {
  if (!app.isPackaged) return; // im Entwicklungsmodus (npm start) nichts tun
  if (isMac) {
    checkMacUpdate(true);
    setInterval(() => checkMacUpdate(true), UPDATE_CHECK_INTERVAL);
    return;
  }
  const autoUpdater = getAutoUpdater();
  autoUpdater.autoDownload = true;
  // Nie still beim App-Beenden installieren: wird der Installer vom
  // Windows-Shutdown abgewürgt, bleibt eine kaputte Installation zurück
  // (electron-builder #7807). Installiert wird nur über 'Jetzt updaten'.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', () => {});
  autoUpdater.on('update-downloaded', async (info) => {
    // 'Später' respektieren: pro Version nur einmal je App-Lauf melden,
    // sonst poppt der Dialog alle 4 Stunden erneut auf
    if (updateDialogOpen || info.version === winUpdateNotifiedFor) return;
    winUpdateNotifiedFor = info.version;
    updateDialogOpen = true;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update verfügbar',
        message: `Verti ${info.version} ist bereit.`,
        detail: 'Das Update wurde bereits heruntergeladen. Beim Neustart wird es installiert; alle Logins und Apps bleiben erhalten.',
        buttons: ['Jetzt updaten', 'Später'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) autoUpdater.quitAndInstall();
    } finally {
      updateDialogOpen = false;
    }
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), UPDATE_CHECK_INTERVAL);
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(win, { message: 'Update-Suche gibt es nur in der installierten App.' });
    return;
  }
  if (isMac) {
    const result = await checkMacUpdate(false);
    if (result === 'none') dialog.showMessageBox(win, { message: `Verti ${app.getVersion()} ist aktuell.` });
    if (result === 'error') dialog.showMessageBox(win, { message: 'Update-Suche fehlgeschlagen. Bitte später erneut versuchen.' });
    return;
  }
  const autoUpdater = getAutoUpdater();
  try {
    // Ergebnis-Dialog auch dann wieder zeigen, wenn er schon mal kam
    winUpdateNotifiedFor = null;
    const result = await autoUpdater.checkForUpdates();
    const v = result?.updateInfo?.version;
    if (!v || !isNewerVersion(v, app.getVersion())) {
      dialog.showMessageBox(win, { message: `Verti ${app.getVersion()} ist aktuell.` });
      return;
    }
    // Update gefunden: lädt im Hintergrund, der Update-Dialog kommt über
    // 'update-downloaded'. Bis dahin dem Nutzer sagen, was passiert.
    if (!updateDialogOpen) {
      dialog.showMessageBox(win, {
        message: `Verti ${v} wird im Hintergrund heruntergeladen. Du bekommst eine Meldung, sobald es bereit ist.`,
      });
    }
    const onError = () => dialog.showMessageBox(win, { message: 'Update-Download fehlgeschlagen. Bitte später erneut versuchen.' });
    autoUpdater.once('error', onError);
    setTimeout(() => autoUpdater.removeListener('error', onError), 30 * 60 * 1000);
  } catch {
    dialog.showMessageBox(win, { message: 'Update-Suche fehlgeschlagen. Bitte später erneut versuchen.' });
  }
}

app.whenReady().then(() => {
  // Fallback-UA für alle WebContents ohne eigenen Override (v.a. Login-Popups):
  // sonst meldet navigator.userAgent dort Electron und Google blockt den Login
  app.userAgentFallback = chromeUserAgent();
  // Windows: AppUserModelID muss der appId entsprechen, sonst funktionieren Benachrichtigungen nicht sauber
  if (!isMac) app.setAppUserModelId('rocks.imperio.verti');
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();
  buildMenu();
  setupAutoUpdate();

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
