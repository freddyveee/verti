const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, Menu, dialog, nativeImage, desktopCapturer, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const SIDEBAR_WIDTH = 68;
const TOP_BAR = 44;
const FRAME = 8;
const BROWSER_ID = 'browser';
const BROWSER_BAR = 93;    // Tabs + Adresszeile (10% größer)
const BOOKMARK_BAR = 37;   // Lesezeichenleiste (nur wenn Lesezeichen da sind)
function browserBarHeight() { return BROWSER_BAR + (state && Array.isArray(state.bookmarks) && state.bookmarks.length ? BOOKMARK_BAR : 0); }
const isMac = process.platform === 'darwin';

// Entwickeln/Testen mit eigenem Profil, ohne das echte Verti-Profil (und eine
// laufende Verti-Instanz) zu stören: VERTI_USER_DATA=/pfad/testprofil npx electron .
if (process.env.VERTI_USER_DATA) app.setPath('userData', process.env.VERTI_USER_DATA);

// Nur EINE Verti-Instanz pro Profil. Liefen zwei Prozesse auf derselben
// Session (persist:apps) — z.B. die installierte App und eine Dev-Version —,
// stritten sie sich um die Live-Verbindungen von Kalender/WhatsApp/Spotify
// (Google-Push, WebSockets) und blockierten sie gegenseitig: Die Apps luden
// nicht mehr, obwohl das Netz da war (im echten Browser lief alles). Zwei
// Prozesse auf einem Profil riskieren zudem dessen Beschädigung (LevelDB/
// Safe Storage) — vermutlich ein Teil des Chaos vom 21.08. Die zweite
// Instanz beendet sich und holt die erste nach vorn. Testprofile
// (VERTI_USER_DATA) haben einen eigenen Pfad und damit einen eigenen Lock,
// stören die installierte App also nicht.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const DEFAULT_APPS = [
  { id: 'browser', name: 'Verti Browser', url: 'https://verti.browser/', icon: 'icons/verti-browser.svg' },
  { id: 'calendar', name: 'Google Kalender', url: 'https://calendar.google.com/', icon: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: 'icons/whatsapp.png' },
  { id: 'todoist', name: 'Todoist', url: 'https://app.todoist.com/app/upcoming' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
];

// IMPERIO-Standard-Apps erscheinen in der Bibliothek in einem eigenen Bereich oben
const IMPERIO_IDS = ['browser', 'calendar', 'stackfield', 'claude', 'chatgpt', 'imperio-tools', 'gdrive'];

const CATALOG = [
  ...DEFAULT_APPS,
  { id: 'imperio-tools', name: 'IMPERIO Tools', url: 'https://imperio-tools.netlify.app/', icon: 'icons/imperio-tools.png' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'gdrive', name: 'Google Drive', url: 'https://drive.google.com/', icon: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png' },
  { id: 'stackfield', name: 'Stackfield', url: 'https://www.stackfield.com/', icon: 'icons/stackfield.png' },
  { id: 'notion', name: 'Notion', url: 'https://app.notion.com/' },
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
  // Kommunikation
  { id: 'teams', name: 'Microsoft Teams', url: 'https://teams.microsoft.com/' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/channels/@me' },
  { id: 'zoom', name: 'Zoom', url: 'https://app.zoom.us/' },
  { id: 'meet', name: 'Google Meet', url: 'https://meet.google.com/' },
  // Zusammenarbeit
  { id: 'trello', name: 'Trello', url: 'https://trello.com/' },
  { id: 'asana', name: 'Asana', url: 'https://app.asana.com/' },
  { id: 'miro', name: 'Miro', url: 'https://miro.com/app/dashboard/' },
  { id: 'canva', name: 'Canva', url: 'https://www.canva.com/' },
  { id: 'airtable', name: 'Airtable', url: 'https://airtable.com/' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://www.dropbox.com/home' },
  { id: 'office', name: 'Microsoft 365', url: 'https://www.office.com/' },
  // Google-Welt: Docs/Sheets/Maps teilen sich Domains, darum feste Icon-Adressen
  { id: 'gdocs', name: 'Google Docs', url: 'https://docs.google.com/document/', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { id: 'gsheets', name: 'Google Sheets', url: 'https://docs.google.com/spreadsheets/', icon: 'https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico' },
  { id: 'gmaps', name: 'Google Maps', url: 'https://www.google.com/maps', icon: 'https://www.google.com/s2/favicons?domain=maps.google.com&sz=64' },
  { id: 'gphotos', name: 'Google Fotos', url: 'https://photos.google.com/' },
  // Werkzeuge
  { id: 'deepl', name: 'DeepL', url: 'https://www.deepl.com/translator' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  // Social
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/' },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com/' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/' },
  { id: 'pinterest', name: 'Pinterest', url: 'https://www.pinterest.com/' },
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
    // Stammdaten (URL, Name, Icon) sind Katalog-Sache und werden für schon
    // gespeicherte Apps übernommen. Sonst blieben Katalog-Verbesserungen —
    // etwa Todoist, das direkt in „Demnächst" statt „Heute" startet — bei
    // bestehenden Nutzern hängen, weil deren window-state.json die alte URL
    // hält. saveState() schreibt die aktuelle Seite NICHT pro App zurück, es
    // geht also keine „zuletzt besuchte Seite" verloren. Reihenfolge und
    // Auswahl der Apps bleiben dem Nutzer; URLs kann er ohnehin nicht ändern.
    .map((a) => {
      const cat = CATALOG.find((c) => c.id === a.id);
      return cat ? { ...a, name: cat.name, url: cat.url, icon: cat.icon || a.icon } : a;
    });
  // Der Verti-Browser ist immer vorinstalliert und sitzt fix ganz oben
  if (!apps.some((a) => a.id === BROWSER_ID)) {
    const b = CATALOG.find((c) => c.id === BROWSER_ID);
    if (b) apps.unshift({ id: b.id, name: b.name, url: b.url, icon: b.icon });
  } else {
    const bi = apps.findIndex((a) => a.id === BROWSER_ID);
    if (bi > 0) { const [b] = apps.splice(bi, 1); apps.unshift(b); }
  }
  return {
    bounds: s.bounds || { width: 1400, height: 900 },
    activeApp: s.activeApp || 'calendar',
    apps,
    lastUrls: s.lastUrls && typeof s.lastUrls === 'object' ? s.lastUrls : {}, // zuletzt besuchte Seite je App
    zoom: s.zoom && typeof s.zoom === 'object' ? s.zoom : {}, // Zoomstufe je App
    browser: s.browser && typeof s.browser === 'object' ? s.browser : null, // offene Browser-Tabs
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [], // Lesezeichen
  };
}

// ---------- Letzte Seite pro App ----------
// Nach einem Neustart macht jede App dort weiter, wo man war (Stackfield-Raum,
// Kalenderwoche …), statt auf der Startseite (Freddys Wunsch 22.08.2026). Gemerkt
// wird nur eine Adresse derselben Site wie die Katalog-URL: Login-Seiten
// (accounts.google.com), Fremdseiten und Katalog-Umzüge (notion.so → notion.com)
// fallen damit raus, dann gilt wieder die Katalog-URL. „Zur Startseite" bleibt
// der Weg zurück zur Katalog-URL.
function sameSite(url, appUrl) {
  try {
    const a = new URL(url), b = new URL(appUrl);
    if (a.protocol !== 'https:' && a.protocol !== 'http:') return false;
    return a.host === b.host || a.host.endsWith('.' + b.host);
  } catch {
    return false;
  }
}
function startUrlFor(appDef) {
  const last = state.lastUrls[appDef.id];
  return last && sameSite(last, appDef.url) ? last : appDef.url;
}
// Anmeldeseiten nicht merken (z.B. app.todoist.com/auth/login liegt auf demselben
// Host): bekannte Login-Adressen (isAuthUrl) plus typische Pfadmuster
function looksLikeAuth(url) {
  if (isAuthUrl(url)) return true;
  try { return /(^|\/)(login|log-in|signin|sign-in|auth|oauth|sso)(\/|$)/i.test(new URL(url).pathname); } catch { return false; }
}
function rememberUrl(appDef, url) {
  if (!sameSite(url, appDef.url) || looksLikeAuth(url) || state.lastUrls[appDef.id] === url) return;
  state.lastUrls[appDef.id] = url;
  saveState();
}

// ---------- Zoom pro App ----------
// Cmd/Strg + Plus/Minus/0 im Menü „Ansicht". Gezählt wird in Prozent
// (100 % = Originalgröße), Schritte von 10 %. Beim Ändern erscheint kurz eine
// Prozentanzeige mittig über der App (showZoomOverlay). Die Stufe wird je App
// gemerkt und bei jedem Seitenladen wieder angewandt.
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 10;
function zoomPercent(id) {
  let v = state.zoom[id];
  if (v === undefined) return 100;
  // Migration: bis 1.1.2 wurde die Electron-Zoomstufe gespeichert (~ -4..6).
  // Solche Kleinwerte in Prozent umrechnen (Faktor 1,2^Stufe).
  if (v < ZOOM_MIN) v = Math.round(Math.pow(1.2, v) * 100);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v / ZOOM_STEP) * ZOOM_STEP));
}
function applyZoom(id) {
  const wc = views[id] && views[id].webContents;
  if (wc && !wc.isDestroyed()) wc.setZoomFactor(zoomPercent(id) / 100);
}
function zoomActive(dir) { // dir: +1 größer, -1 kleiner, 0 zurück auf 100 %
  if (!activeId || !views[activeId]) return;
  const percent = dir === 0 ? 100 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomPercent(activeId) + dir * ZOOM_STEP));
  views[activeId].webContents.setZoomFactor(percent / 100);
  if (percent === 100) delete state.zoom[activeId];
  else state.zoom[activeId] = percent;
  saveState();
  showZoomOverlay(percent);
}

// Kurze, gläserne Prozentanzeige mittig über der App. Eigenes rahmenloses,
// transparentes, klick-durchlässiges Fenster (die App-Views liegen als native
// Ebene über der Sidebar, ein DOM-Overlay der Sidebar wäre also verdeckt).
// focusable:false + showInactive: stiehlt der App NICHT den Tastatur-Fokus
// (sonst bräche Leertaste=Play/Pause).
let zoomHud = null, zoomHudTimer = null;
const ZOOM_HUD = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:transparent;-webkit-user-select:none">
<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center">
  <div id="p" style="font:600 26px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;background:rgba(28,28,34,0.86);border:0.5px solid rgba(255,255,255,0.18);border-radius:14px;padding:14px 22px;box-shadow:0 10px 34px rgba(0,0,0,0.4);font-variant-numeric:tabular-nums">100%</div>
</div>
<script>window.__z=(v)=>{document.getElementById('p').textContent=v+'%'}</script></body>`);
function showZoomOverlay(percent) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getContentBounds();
  const W = 116, H = 64;
  const x = Math.round(b.x + SIDEBAR_WIDTH + (b.width - SIDEBAR_WIDTH - W) / 2);
  const y = Math.round(b.y + TOP_BAR + (b.height - TOP_BAR - H) / 2);
  if (!zoomHud || zoomHud.isDestroyed()) {
    zoomHud = new BrowserWindow({
      width: W, height: H, x, y,
      frame: false, transparent: true, hasShadow: false, resizable: false,
      movable: false, focusable: false, skipTaskbar: true, show: false,
      parent: win && !win.isDestroyed() ? win : undefined,
    });
    zoomHud.setIgnoreMouseEvents(true);
    zoomHud.loadURL(ZOOM_HUD);
  } else {
    zoomHud.setBounds({ x, y, width: W, height: H });
  }
  const paint = () => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.webContents.executeJavaScript(`window.__z && window.__z(${percent})`).catch(() => {}); };
  if (zoomHud.webContents.isLoading()) zoomHud.webContents.once('did-finish-load', paint); else paint();
  zoomHud.showInactive();
  clearTimeout(zoomHudTimer);
  zoomHudTimer = setTimeout(() => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.hide(); }, 900);
}

let state = null;
let win = null;
const views = {};
let activeId = null;
// Verti-Browser: die Leiste (Tabs+Adresse) ist views['browser'] (eine WebContentsView
// mit browser.html); die eigentlichen Seiten sind eigene Tab-Views hier drunter.
const browserTabs = new Map(); // key -> WebContentsView
const browserFav = new Map();  // key -> Favicon-URL
let browserActive = null;      // key des aktiven Tabs
let browserSeq = 0;
let libraryOpen = false;
let quitting = false; // Cmd+Q/Update-Installation: echtes Beenden statt Verstecken (Mac)
app.on('before-quit', () => { quitting = true; });
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
  // Notion startet sein Google-Login-Popup auf einer eigenen Notion-URL.
  // App läuft seit 1.0.19 auf app.notion.com (notion.com), Altbestand auf notion.so.
  { host: 'notion.so', path: /^\/(login|verifyNoPopupBlocker|googlepopupredirect)/i },
  { host: 'notion.com', path: /^\/(login|verifyNoPopupBlocker|googlepopupredirect)/i },
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

// Popups erben von Electron nur sicherheitsrelevante webPreferences — Preload
// und Argumente müssen ausdrücklich mit, sonst läuft das Google-Login-Popup
// („Mit Google anmelden" bei Notion, Todoist …) ohne die JS-Seite der Tarnung
// (so war es bis 1.0.18).
function popupWindowOptions(width, height) {
  return {
    width,
    height,
    autoHideMenuBar: true,
    webPreferences: viewWebPreferences(),
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

// Von uns erlaubte Popup-Fenster bekommen dieselbe Policy. Den Chrome-UA
// erben sie über die Session (ses.setUserAgent) — KEIN wc.setUserAgent hier:
// das Popup navigiert beim Adoptieren oft schon, und setUserAgent mit
// laufender Navigation zerstört deren NavigationRequest (Chromium-CHECK,
// Absturz — die Ursache des 1.0.15–1.0.17-Startabsturzes).
function adoptChildWindow(child) {
  child.webContents.setWindowOpenHandler(windowOpenPolicy(child.webContents));
  child.webContents.on('did-create-window', (grandchild) => adoptChildWindow(grandchild));
  attachMouseNav(child.webContents);
  attachContextMenu(child.webContents);
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

// Googles Login-Bot-Erkennung lehnt Electron ab, egal wie Chrome-ähnlich die
// Header aussehen (sie prüft auch per JavaScript-Fingerabdruck). Ausweg wie
// bei Ferdium & Co.: Auf den Google-Anmelde-Domains gibt sich Verti als
// Firefox aus — der kennt weder Client-Hints noch userAgentData, es gibt
// also nichts, was sich widersprechen könnte. Alle anderen Seiten bekommen
// unverändert den Chrome-UA (bewährt seit 1.0.0, keine Extra-Header).
// Gemessen (Sonde 22.08.2026): Chrome-UA ohne Client-Hints → Ablehnung
// „rrk=46"; Firefox-Header → Google prüft das Konto ganz normal.
// Die Versionsnummer läuft grob mit (Mozilla: alle vier Wochen eine Haupt-
// version, 144 erschien am 14.10.2025, wir melden immer eine dahinter),
// damit Google die Tarnung nicht irgendwann als veralteten Browser abweist.
function firefoxUserAgent() {
  const major = 143 + Math.floor((Date.now() - Date.UTC(2025, 9, 14)) / (28 * 864e5));
  const os = isMac ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${os}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}
const FIREFOX_UA = firefoxUserAgent();
const GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);

// webPreferences aller App-Views und der von uns erlaubten Login-Popups.
// Die Firefox-Kennung reist als Argument mit, damit view-preload.js exakt
// dieselbe Zeichenkette wie die Header-Tarnung setzt (eine Quelle).
function viewWebPreferences() {
  return {
    partition: 'persist:apps',
    spellcheck: true,
    preload: path.join(__dirname, 'view-preload.js'),
    additionalArguments: [`--verti-firefox-ua=${FIREFOX_UA}`],
  };
}

function isGoogleAuthUrl(url) {
  try {
    return GOOGLE_AUTH_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

function applyGoogleAuthDisguise(ses) {
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    if (isGoogleAuthUrl(details.url)) {
      headers['User-Agent'] = FIREFOX_UA;
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
      }
    }
    cb({ requestHeaders: headers });
  });
}

// Einmalige Selbstheilung (v1.0.11): Bis v1.0.10 hat Googles Blockade die
// Anmelde-Cookies "verseucht" — die Sperre klebte am Profil, selbst nachdem
// die App sauber auftrat.
//
// ENTFERNT in 1.0.15: Die frühere Selbstheilung (cleanupGoogleAuthOnce) rief
// beim Start ses.clearStorageData für Google-Dienste auf. Auf Profilen mit viel
// Google-Speicher (Kalender/Gmail/Drive – Service-Worker + Cache) stürzte genau
// dieses Leeren den Hauptprozess beim Start ab (macOS 26 / Electron 43, V8/JIT).
// Der Google-Login funktioniert über die Firefox-Tarnung unten auch ohne dieses
// Aufräumen; ein hartes Storage-Löschen am Start ist zu riskant und fliegt raus.

// ENTFERNT in 1.0.18 — URSACHE DES STARTABSTURZES von 1.0.15–1.0.17:
// Hier stand attachGoogleAuthUaSwitch(), das wc.setUserAgent synchron in
// did-start-navigation/did-redirect-navigation aufrief, damit
// navigator.userAgent auf der Google-Anmeldeseite zum Firefox-Header passt.
// setUserAgent mit laufender (pending) Navigation löst in Chromium aber
// SetUserAgentOverride → Reload → Zerstörung des laufenden NavigationRequest
// aus dessen eigenem Event heraus aus → CHECK-Abbruch (EXC_BREAKPOINT in
// ~NavigationRequest, Hauptprozess tot ~1s nach Start). Der Crash traf nur
// Profile, die auf die Anmeldeseite UMGELEITET wurden — auf eingeloggten
// Profilen blieb er unsichtbar, deshalb wurde er tagelang überall anders
// gesucht. NIE wieder setUserAgent aus Navigations-Events aufrufen!
// Die JS-Kennung stellt jetzt view-preload.js per Property-Override um
// (rein lesend, kein Navigations-Eingriff; seit 1.0.19 per
// webFrame.executeJavaScript, weil Googles CSP eingefügte <script>-Elemente
// still verwirft); die Header macht weiterhin applyGoogleAuthDisguise oben.

function layoutViews() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  for (const id of Object.keys(views)) {
    views[id].setBounds({
      x: SIDEBAR_WIDTH,
      y: TOP_BAR,
      width: w - SIDEBAR_WIDTH - FRAME,
      height: id === BROWSER_ID ? browserBarHeight() : h - TOP_BAR - FRAME,
    });
  }
  layoutBrowserTabs();
}

function switchApp(id) {
  if (!views[id]) return;
  libraryOpen = false;
  activeId = id;
  clearBadge(id); // Öffnen = gelesen; Titel-Apps setzen sich per Titel gleich neu
  for (const [vid, view] of Object.entries(views)) {
    view.setVisible(vid === id);
  }
  layoutViews();
  if (id === BROWSER_ID && browserTabs.size === 0) browserRestoreOrNew();
  browserApplyVisibility();
  // Tastatur-Fokus in die App (bzw. den aktiven Browser-Tab) geben, damit
  // App-Tastenkürzel (z.B. Leertaste = Play/Pause) sofort greifen
  try { (activeWebContents() || views[id].webContents).focus(); } catch {}
  win.webContents.send('active-app', id);
  sendNavStateFor(id);
  saveState();
}

// ---------- Ungelesen-Badges ----------
// Die meisten Messenger schreiben ihre ungelesenen Nachrichten in den
// Seitentitel ("(3) WhatsApp"); daraus speisen sich die Sidebar-Badges.
// Bei diesen Apps darf die Zahl überall im Titel stehen; bei allen anderen
// nur ganz vorn, sonst machen Inhalts-Titel wie "Top 10 (2024)" falsche Badges.
const TITLE_BADGE_APPS = new Set(['whatsapp', 'gmail', 'telegram', 'messenger', 'slack', 'linkedin', 'x', 'discord', 'teams', 'instagram', 'facebook']);
// Drei Quellen: Titel-Zahl (exakt, für die Apps oben), die von der Seite
// selbst gemeldete Zahl (Favico.js-Hook in view-preload.js – so zählt
// Stackfield seine Ungelesenen exakt) und gezählte Web-Benachrichtigungen
// (für alle übrigen). titleCounts ist absolut, notifCounts wird pro Meldung
// hochgezählt und beim Öffnen genullt. pageCounts hat Vorrang vor notifCounts
// und wird beim Öffnen NICHT genullt: Die Seite setzt sie selbst auf 0, sobald
// gelesen wurde (wie ihr eigenes Favicon).
const titleCounts = {};
const notifCounts = {};
const pageCounts = {};
const badges = {};
// Welche App gerade hörbar Ton ausgibt (Spotify/YouTube im Hintergrund).
// Die Sidebar zeigt daran ein kleines „spielt gerade"-Zeichen.
const audible = {};

function parseUnread(id, title) {
  const t = String(title || '');
  const m = TITLE_BADGE_APPS.has(id) ? /\((\d+)\)/.exec(t) : /^\((\d+)\)/.exec(t);
  return m ? Math.min(999, parseInt(m[1], 10)) : 0;
}

function effectiveBadge(id) {
  // Titel-fähige Apps zählen NUR über den Titel (sonst Doppelzählung), alle
  // anderen über die von der Seite gemeldete Zahl, ersatzweise über
  // eingegangene Benachrichtigungen
  if (TITLE_BADGE_APPS.has(id)) return titleCounts[id] || 0;
  if (pageCounts[id] !== undefined) return pageCounts[id];
  return notifCounts[id] || 0;
}

function recomputeBadge(id) {
  const count = effectiveBadge(id);
  if ((badges[id] || 0) === count) return;
  if (count) badges[id] = count;
  else delete badges[id];
  broadcastBadges();
}

function setTitleBadge(id, count) {
  titleCounts[id] = count;
  recomputeBadge(id);
}

function addNotif(id) {
  if (TITLE_BADGE_APPS.has(id)) return; // die zählen über den Titel
  // Gerade sichtbar offen → kein Badge nötig (bei verstecktem oder
  // minimiertem Fenster sieht der Nutzer die App nicht → zählen)
  if (id === activeId && win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) return;
  notifCounts[id] = Math.min(999, (notifCounts[id] || 0) + 1);
  recomputeBadge(id);
}

function setPageBadge(id, count) {
  pageCounts[id] = Math.min(999, Math.max(0, Math.round(Number(count) || 0)));
  recomputeBadge(id);
}

function clearBadge(id) {
  titleCounts[id] = 0;
  notifCounts[id] = 0;
  recomputeBadge(id);
}

// App entfernt → auch die gemeldete Zahl vergessen
function forgetBadge(id) {
  delete pageCounts[id];
  clearBadge(id);
}

function broadcastBadges() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('badges', badges);
  if (isMac) {
    const total = Object.values(badges).reduce((a, b) => a + b, 0);
    app.setBadgeCount(total);
  }
  // Windows: das Overlay-Icon malt die Sidebar per Canvas und schickt es
  // über 'set-overlay' zurück
}

ipcMain.handle('get-badges', () => badges);
ipcMain.handle('get-audio', () => audible);
function broadcastAudio() {
  if (win && !win.isDestroyed()) win.webContents.send('audio', audible);
}
function setAudio(id, on) {
  if (!!audible[id] === !!on) return;
  if (on) audible[id] = true; else delete audible[id];
  broadcastAudio();
}
// Welche App steckt hinter einem IPC-Absender? (Login-Popups haben dasselbe
// Preload, gehören aber zu keiner View → null)
function appIdOf(sender) {
  for (const [id, view] of Object.entries(views)) {
    if (view.webContents === sender) return id;
  }
  return null;
}
// Signale aus view-preload.js: Web-Benachrichtigung gefeuert, Seite meldet
// ihre Ungelesen-Zahl (Favico.js), Nutzer hat eine Meldung angeklickt
ipcMain.on('verti-app-notify', (e) => {
  const id = appIdOf(e.sender);
  if (id) addNotif(id);
});
ipcMain.on('verti-app-badge', (e, count) => {
  const id = appIdOf(e.sender);
  if (id) setPageBadge(id, count);
});
ipcMain.on('verti-app-notify-click', (e) => {
  const id = appIdOf(e.sender);
  if (!id || !win || win.isDestroyed()) return;
  // Klick auf die Meldung → Verti nach vorn und zur App springen (die Seite
  // selbst kann aus einer versteckten View heraus kein Fenster holen)
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (id !== activeId) switchApp(id);
});
ipcMain.handle('get-pending-update', () => (pendingUpdate ? pendingUpdate.version : null));
ipcMain.on('open-update-popup', () => {
  if (pendingUpdate && !updateDialogOpen) openUpdatePopup(pendingUpdate);
});

ipcMain.on('set-overlay', (e, dataUrl, total) => {
  if (isMac || !win || win.isDestroyed()) return;
  if (dataUrl) win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${total} ungelesen`);
  else win.setOverlayIcon(null, '');
});

// ---------- Maus-Seitentasten (Zurück/Vorwärts) ----------
// Die Daumentasten kommen als Maustaste „back"/„forward" an (Mac: Button 3/4,
// Windows: XButton1/2). Chromium würde damit selbst navigieren, aber nur,
// wenn die Seite das mouseUp nicht verbraucht – Kalender, Stackfield & Co.
// fangen Mausereignisse gern ab, dann passiert nichts. Deshalb: Taste VOR
// der Seite abfangen (before-mouse-event + preventDefault; die Seite sieht
// sie gar nicht, Chromium navigiert also auch nicht doppelt) und selbst
// navigieren. Windows schickt für Maus-/Treibertasten außerdem
// WM_APPCOMMAND (app-command), Mac-Treiber wie Logi Options+ schicken statt
// Tasten eine Wischgeste (swipe, s. createWindow); ein kurzer Riegel
// verhindert, dass zwei Wege dieselbe Taste doppelt auslösen. Tastatur
// (Cmd+[ / Cmd+]) läuft übers Menü.
let lastMouseNav = { dir: '', at: 0 };
function mouseNav(wc, dir) {
  const now = Date.now();
  if (lastMouseNav.dir === dir && now - lastMouseNav.at < 250) return;
  lastMouseNav = { dir, at: now };
  if (!wc || wc.isDestroyed()) return;
  if (libraryOpen && wc === activeWebContents()) {
    // Bibliothek offen: Maus-Zurück schließt sie, Vorwärts tut nichts
    if (dir === 'back') closeLibrary();
    return;
  }
  const nh = wc.navigationHistory;
  if (dir === 'back' && nh.canGoBack()) nh.goBack();
  else if (dir === 'forward' && nh.canGoForward()) nh.goForward();
}
// target: welche WebContents navigiert werden (Sidebar → die aktive App)
function attachMouseNav(wc, target = () => wc) {
  wc.on('before-mouse-event', (e, m) => {
    if (m.button !== 'back' && m.button !== 'forward') return;
    e.preventDefault();
    if (m.type === 'mouseUp') mouseNav(target(), m.button);
  });
}
function activeWebContents() {
  if (activeId === BROWSER_ID) {
    const v = browserTabs.get(browserActive);
    return v && !v.webContents.isDestroyed() ? v.webContents : null;
  }
  return activeId && views[activeId] ? views[activeId].webContents : null;
}

// ---------- Verti-Browser ----------
const NEWTAB_FILE = 'browser-newtab.html';
function browserToUrl(input) {
  const t = String(input || '').trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;                 // hat Schema
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(t)) return 'http://' + t;
  if (/^[^\s]+\.[^\s]{2,}([\/?#]|$)/.test(t) && !t.includes(' ')) return 'https://' + t; // sieht wie Domain aus
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);  // sonst Suche
}
function createBrowserShell(appDef) {
  const view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'browser-preload.js') } });
  view.webContents.loadFile('browser.html');
  view.setVisible(false);
  win.contentView.addChildView(view);
  views[appDef.id] = view;
}
function layoutBrowserTabs() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const bar = browserBarHeight();
  const b = { x: SIDEBAR_WIDTH, y: TOP_BAR + bar, width: w - SIDEBAR_WIDTH - FRAME, height: h - TOP_BAR - bar - FRAME };
  for (const v of browserTabs.values()) v.setBounds(b);
}
function browserApplyVisibility() {
  const show = !libraryOpen && activeId === BROWSER_ID;
  for (const [key, v] of browserTabs) v.setVisible(show && key === browserActive);
}
function sendBrowserUpdate() {
  const shell = views[BROWSER_ID];
  if (!shell || shell.webContents.isDestroyed()) return;
  const tabs = [...browserTabs.entries()].map(([key, v]) => ({
    key,
    active: key === browserActive,
    title: v.webContents.isDestroyed() ? '' : (v.webContents.getTitle() || 'Neuer Tab'),
    favicon: browserFav.get(key) || '',
  }));
  shell.webContents.send('browser:tabs', tabs);
  const av = browserTabs.get(browserActive);
  if (av && !av.webContents.isDestroyed()) {
    const nh = av.webContents.navigationHistory;
    const url = av.webContents.getURL();
    shell.webContents.send('browser:state', {
      url: url.endsWith('/' + NEWTAB_FILE) || url.includes(NEWTAB_FILE) ? '' : url,
      canGoBack: nh.canGoBack(), canGoForward: nh.canGoForward(), loading: av.webContents.isLoading(),
      bookmarked: isBookmarked(url),
    });
  } else {
    shell.webContents.send('browser:state', { url: '', canGoBack: false, canGoForward: false, loading: false });
  }
  if (activeId === BROWSER_ID) sendNavStateFor(BROWSER_ID);
  browserPersist();
}
function browserNewTab(url) {
  if (!win) return;
  const key = 'bt' + (++browserSeq);
  const view = new WebContentsView({ webPreferences: viewWebPreferences() });
  const wc = view.webContents;
  wc.setUserAgent(chromeUserAgent());
  wc.setWindowOpenHandler(({ url: u }) => {
    if (isAuthUrl(u)) return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(520, 680) };
    if (u && u !== 'about:blank') browserNewTab(u); // Links / window.open → neuer Tab
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => adoptChildWindow(child));
  attachMouseNav(wc);
  attachContextMenu(wc);
  const upd = () => sendBrowserUpdate();
  wc.on('page-title-updated', upd);
  wc.on('did-navigate', upd);
  wc.on('did-navigate-in-page', upd);
  wc.on('did-start-loading', upd);
  wc.on('did-stop-loading', upd);
  wc.on('page-favicon-updated', (e, favs) => { browserFav.set(key, (favs && favs[0]) || ''); sendBrowserUpdate(); });
  win.contentView.addChildView(view);
  browserTabs.set(key, view);
  browserActive = key;
  if (url) wc.loadURL(url); else wc.loadFile(NEWTAB_FILE);
  layoutBrowserTabs();
  browserApplyVisibility();
  try { wc.focus(); } catch {}
  sendBrowserUpdate();
}
function browserCloseTab(key) {
  const v = browserTabs.get(key);
  if (!v) return;
  const keys = [...browserTabs.keys()];
  const idx = keys.indexOf(key);
  browserTabs.delete(key);
  browserFav.delete(key);
  try { win.contentView.removeChildView(v); } catch {}
  try { v.webContents.close(); } catch {}
  if (browserActive === key) {
    const next = keys[idx + 1] || keys[idx - 1] || null;
    browserActive = next;
    if (!next) { browserNewTab(); return; } // nie ganz leer
  }
  layoutBrowserTabs();
  browserApplyVisibility();
  const av = browserTabs.get(browserActive);
  if (av) { try { av.webContents.focus(); } catch {} }
  sendBrowserUpdate();
}
function browserSwitchTab(key) {
  if (!browserTabs.has(key)) return;
  browserActive = key;
  browserApplyVisibility();
  const av = browserTabs.get(key);
  if (av) { try { av.webContents.focus(); } catch {} }
  sendBrowserUpdate();
}
function browserActiveWc() {
  const v = browserTabs.get(browserActive);
  return v && !v.webContents.isDestroyed() ? v.webContents : null;
}

// ---- Lesezeichen ----
function isBookmarked(url) {
  return !!(state && state.bookmarks && state.bookmarks.some((b) => b.url === url));
}
function sendBrowserBookmarks() {
  const shell = views[BROWSER_ID];
  if (shell && !shell.webContents.isDestroyed()) shell.webContents.send('browser:bookmarks', (state && state.bookmarks) || []);
}
function browserToggleBookmark() {
  const wc = browserActiveWc();
  if (!wc) return;
  const url = wc.getURL();
  if (!/^https?:/i.test(url) || url.includes(NEWTAB_FILE)) return; // Neuer-Tab-Seite nicht merken
  if (!state.bookmarks) state.bookmarks = [];
  const i = state.bookmarks.findIndex((b) => b.url === url);
  if (i >= 0) state.bookmarks.splice(i, 1);
  else state.bookmarks.push({ url, title: wc.getTitle() || url, favicon: browserFav.get(browserActive) || '' });
  saveState();
  layoutViews();            // Leisten-Höhe ändert sich, wenn erstes/letztes Lesezeichen
  sendBrowserBookmarks();
  sendBrowserUpdate();
}
function browserRemoveBookmark(url) {
  if (!state.bookmarks) return;
  const i = state.bookmarks.findIndex((b) => b.url === url);
  if (i < 0) return;
  state.bookmarks.splice(i, 1);
  saveState();
  layoutViews();
  sendBrowserBookmarks();
  sendBrowserUpdate();
}

// Tastenkürzel wie in Chrome (Cmd/Strg + T/W/L). Cmd+W schließt NUR einen Tab,
// wenn der Browser aktiv ist – sonst auf dem Mac Fenster verstecken, unter
// Windows nichts (kein versehentliches Beenden, s. CLAUDE.md).
function browserCmdNewTab() {
  if (activeId === BROWSER_ID) browserNewTab();
  else switchApp(BROWSER_ID);
}
function browserCmdCloseTab() {
  if (activeId === BROWSER_ID) { if (browserActive) browserCloseTab(browserActive); }
  else if (isMac && win && !win.isDestroyed()) win.close();
}
function browserCmdFocusAddress() {
  if (activeId === BROWSER_ID && views[BROWSER_ID]) views[BROWSER_ID].webContents.send('browser:focus-address');
}

// Offene Tabs merken und nach Neustart wiederherstellen
function browserPersist() {
  if (!state) return;
  if (browserTabs.size === 0) return; // vor dem ersten Öffnen die gespeicherte Sitzung nicht leeren
  const keys = [...browserTabs.keys()];
  const tabs = keys.map((k) => {
    const wc = browserTabs.get(k).webContents;
    const u = wc.isDestroyed() ? '' : wc.getURL();
    return /^https?:/i.test(u) && !u.includes(NEWTAB_FILE) ? u : null; // Neuer-Tab-Seite → null
  });
  state.browser = { tabs, active: keys.indexOf(browserActive) };
  saveState();
}
function browserRestoreOrNew() {
  const saved = state && state.browser;
  if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
    saved.tabs.slice(0, 20).forEach((u) => browserNewTab(u || undefined));
    const keys = [...browserTabs.keys()];
    const k = keys[saved.active] || keys[keys.length - 1];
    if (k) browserActive = k;
    browserApplyVisibility();
    const av = browserTabs.get(browserActive);
    if (av) { try { av.webContents.focus(); } catch {} }
    sendBrowserUpdate();
  } else {
    browserNewTab();
  }
}

// ---------- Downloads ----------
// Ohne Nachfrage in den Downloads-Ordner (Freddys Wunsch 22.08.2026), danach eine
// Mitteilung; Klick darauf zeigt die Datei im Finder/Explorer. Gleichnamige
// Dateien bekommen „(2)", „(3)" … Gilt für App-Views und Login-/App-Popups.
function uniqueFileName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = name;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i++) candidate = `${base} (${i})${ext}`;
  return candidate;
}
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on('click', onClick);
  n.show();
}
function setupDownloads(ses) {
  ses.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    const name = uniqueFileName(dir, item.getFilename() || 'Download');
    const target = path.join(dir, name);
    item.setSavePath(target); // kein Dialog
    item.once('done', (ev, result) => {
      if (result === 'completed') {
        if (isMac && app.dock) app.dock.downloadFinished(target);
        notify('Download fertig', name, () => shell.showItemInFolder(target));
      } else if (result === 'interrupted') {
        notify('Download abgebrochen', name);
      }
    });
  });
}

// ---------- Rechtsklick-Menü in den Apps ----------
// Electron bringt keins mit; ohne gab es kein Kopieren/Einfügen per Maus und
// keine Rechtschreibvorschläge, obwohl die Prüfung läuft (Freddys Wunsch
// 22.08.2026). Inhalt richtet sich nach der Stelle: Wort, Link, Bild, Textfeld,
// Auswahl. Alle Aktionen laufen explizit über die jeweiligen WebContents,
// Menü-Rollen würden die Sidebar treffen.
function attachContextMenu(wc) {
  wc.on('context-menu', (e, p) => {
    const items = [];
    const sep = () => { if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' }); };
    if (p.misspelledWord) {
      const suggestions = (p.dictionarySuggestions || []).slice(0, 5);
      for (const word of suggestions) items.push({ label: word, click: () => wc.replaceMisspelling(word) });
      if (!suggestions.length) items.push({ label: 'Keine Vorschläge', enabled: false });
      items.push({ label: 'Zum Wörterbuch hinzufügen', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      sep();
    }
    if (p.linkURL) {
      items.push(
        { label: 'Link im Browser öffnen', click: () => openExternally(p.linkURL) },
        { label: 'Link kopieren', click: () => clipboard.writeText(p.linkURL) },
      );
      sep();
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push(
        { label: 'Bild kopieren', click: () => wc.copyImageAt(p.x, p.y) },
        { label: 'Bild in Downloads sichern', click: () => wc.downloadURL(p.srcURL) },
        { label: 'Bildadresse kopieren', click: () => clipboard.writeText(p.srcURL) },
      );
      sep();
    }
    const f = p.editFlags || {};
    if (p.isEditable) {
      items.push(
        { label: 'Rückgängig', enabled: !!f.canUndo, click: () => wc.undo() },
        { label: 'Wiederholen', enabled: !!f.canRedo, click: () => wc.redo() },
        { type: 'separator' },
        { label: 'Ausschneiden', enabled: !!f.canCut, click: () => wc.cut() },
        { label: 'Kopieren', enabled: !!f.canCopy, click: () => wc.copy() },
        { label: 'Einfügen', enabled: !!f.canPaste, click: () => wc.paste() },
        { label: 'Alles auswählen', enabled: !!f.canSelectAll, click: () => wc.selectAll() },
      );
      sep();
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ label: 'Kopieren', click: () => wc.copy() });
      sep();
    }
    items.push({ label: 'Neu laden', click: () => wc.reload() });
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(wc) || win });
  });
}

function createView(appDef) {
  if (appDef.id === BROWSER_ID) return createBrowserShell(appDef);
  const view = new WebContentsView({ webPreferences: viewWebPreferences() });
  view.webContents.setUserAgent(chromeUserAgent());
  view.webContents.loadURL(startUrlFor(appDef));
  view.webContents.setWindowOpenHandler(windowOpenPolicy(view.webContents));
  view.webContents.on('did-create-window', (child) => adoptChildWindow(child));
  attachMouseNav(view.webContents);
  attachContextMenu(view.webContents);
  view.webContents.on('audio-state-changed', (e) => {
    const on = typeof e.audible === 'boolean' ? e.audible : view.webContents.isCurrentlyAudible();
    setAudio(appDef.id, on);
  });
  view.webContents.on('did-finish-load', () => applyZoom(appDef.id));
  const tweaks = APP_TWEAKS[appDef.id];
  if (tweaks) {
    view.webContents.on('dom-ready', () => {
      if (tweaks.css) view.webContents.insertCSS(tweaks.css).catch(() => {});
      if (tweaks.js) view.webContents.executeJavaScript(tweaks.js).catch(() => {});
    });
  }
  view.setVisible(false);
  try { view.setBorderRadius(10); } catch {}
  const onNavigated = (e, url) => {
    if (appDef.id === activeId) sendNavStateFor(appDef.id);
    rememberUrl(appDef, url);
  };
  view.webContents.on('did-navigate', onNavigated);
  view.webContents.on('did-navigate-in-page', onNavigated);
  view.webContents.on('page-title-updated', (_e, title) => setTitleBadge(appDef.id, parseUnread(appDef.id, title)));
  win.contentView.addChildView(view);
  views[appDef.id] = view;
}

function sendNavStateFor(id) {
  if (!win) return;
  let nh = null;
  if (id === BROWSER_ID) { const wc = browserActiveWc(); nh = wc ? wc.navigationHistory : null; }
  else if (views[id]) nh = views[id].webContents.navigationHistory;
  win.webContents.send('nav-state', {
    canGoBack: nh ? nh.canGoBack() : false,
    canGoForward: nh ? nh.canGoForward() : false,
  });
}

function navHome(id) {
  const appDef = state.apps.find((a) => a.id === id);
  if (appDef && views[id]) views[id].webContents.loadURL(appDef.url);
}

// Zurück/Vorwärts/Startseite für die aktive App (Menü, Top-Leiste, Maus).
// Ist die App-Bibliothek offen, heißt „Zurück" bzw. „Startseite": Bibliothek
// schließen und zur App zurück (Freddys Wunsch 22.08.2026: der Pfeil oben soll
// aus der Bibliothek rausführen, nicht nur das ✕); Vorwärts tut dort nichts.
function closeLibrary() {
  setLibrary(false);
  switchApp(activeId && views[activeId] ? activeId : state.apps[0].id);
}
function navBackActive() {
  if (libraryOpen) return closeLibrary();
  const wc = activeWebContents();
  if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
}
function navForwardActive() {
  if (libraryOpen) return;
  const wc = activeWebContents();
  if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
}
function navHomeActive() {
  if (libraryOpen) return closeLibrary();
  if (activeId) navHome(activeId);
}

let screenPickerWin = null;
// Öffnet den Bildschirm-Auswahldialog und liefert das gewählte
// desktopCapturer-Quellobjekt (oder null bei Abbruch)
function pickScreenSource() {
  return new Promise(async (resolve) => {
    if (screenPickerWin && !screenPickerWin.isDestroyed()) {
      try { screenPickerWin.close(); } catch {}
    }
    let sources = [];
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 200 },
      });
    } catch {
      return resolve(null);
    }
    if (!sources.length) return resolve(null);
    const list = sources.map((s) => ({
      id: s.id,
      name: s.name || (s.id.startsWith('screen') ? 'Bildschirm' : 'Fenster'),
      kind: s.id.startsWith('screen') ? 'screen' : 'window',
      thumb: s.thumbnail ? s.thumbnail.toDataURL() : '',
    }));
    const pw = new BrowserWindow({
      width: 640, height: 520,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      frame: false, transparent: true, skipTaskbar: true, show: false,
      parent: win && !win.isDestroyed() ? win : undefined, modal: true,
      webPreferences: { preload: path.join(__dirname, 'screen-picker-preload.js') },
    });
    screenPickerWin = pw;
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      const chosen = id ? sources.find((s) => s.id === id) : null;
      if (!pw.isDestroyed()) pw.close();
      resolve(chosen || null);
    };
    const onChoose = (e, id) => {
      if (BrowserWindow.fromWebContents(e.sender) === pw) finish(id);
    };
    ipcMain.on('screen-picker:choose', onChoose);
    pw.on('closed', () => {
      ipcMain.removeListener('screen-picker:choose', onChoose);
      screenPickerWin = null;
      if (!done) { done = true; resolve(null); }
    });
    pw.loadFile('screen-picker.html');
    pw.webContents.once('did-finish-load', () => {
      if (pw.isDestroyed()) return;
      pw.webContents.send('screen-picker:sources', list);
      pw.show();
    });
  });
}

function createWindow() {
  state = loadState();

  const ses = session.fromPartition('persist:apps');
  ses.setUserAgent(chromeUserAgent());
  applyGoogleAuthDisguise(ses);
  // Login-Popups laufen teils in der Default-Session, bevor sie adoptiert werden
  applyGoogleAuthDisguise(session.defaultSession);
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  setupDownloads(ses);
  setupDownloads(session.defaultSession);
  // Bildschirmfreigabe (Zoom/Meet/Teams): eigener Auswahldialog, damit der
  // Nutzer Bildschirm oder Fenster wählen kann
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickScreenSource().then((source) => {
      // Kein Audio mitteilen; nur das gewählte Video-Quellobjekt oder Abbruch
      callback(source ? { video: source } : {});
    }).catch(() => callback({}));
  }, { useSystemPicker: false });

  win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    // Dev-Version (npx electron .) kenntlich machen, damit sie nicht mit der
    // installierten App verwechselt wird (Sidebar zeigt dazu ein rotes Etikett)
    title: app.isPackaged ? 'Verti' : 'Verti (Dev)',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 16 } }
      : { titleBarOverlay: { color: '#22242c', symbolColor: '#ffffff', height: TOP_BAR - 1 } }),
    backgroundColor: '#22242c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('sidebar.html');
  // Seitentasten über der Sidebar navigieren die aktive App
  attachMouseNav(win.webContents, activeWebContents);
  if (isMac) {
    // Logi Options+ & Co. setzen „Zurück/Vorwärts" der Maus-Seitentasten auf
    // dem Mac als Wischgeste um (gemessen 22.08.2026 mit scripts/mouse-probe.js:
    // swipe left/right, keine Maustaste, kein Tastenkürzel – deshalb griff
    // before-mouse-event bei Freddy nicht). Dieselbe Geste kommt vom Trackpad
    // mit drei Fingern („Zwischen Seiten wischen"). Richtung wie in Chrome und
    // Firefox: deltaX>0 (Electron „left") = zurück, deltaX<0 („right") = vor.
    win.on('swipe', (e, dir) => {
      if (dir === 'left') mouseNav(activeWebContents(), 'back');
      else if (dir === 'right') mouseNav(activeWebContents(), 'forward');
    });
  } else {
    // Windows meldet Maus-/Treibertasten zusätzlich als app-command
    win.on('app-command', (e, cmd) => {
      if (cmd === 'browser-backward') mouseNav(activeWebContents(), 'back');
      else if (cmd === 'browser-forward') mouseNav(activeWebContents(), 'forward');
    });
  }

  for (const appDef of state.apps) {
    createView(appDef);
  }

  win.on('resize', () => { layoutViews(); saveState(); });
  win.on('move', saveState);
  win.on('closed', () => { win = null; });
  // Mac: Schließen versteckt das Fenster nur. Die App-Views laufen weiter,
  // also kommen Dock-Badge und Benachrichtigungen auch bei geschlossenem
  // Fenster weiter an (Freddys Wunsch 22.08.2026); vorher starben die Views
  // mit dem Fenster und das Dock-Icon blieb stumm. Dock-Klick holt das
  // Fenster zurück (app 'activate'), Cmd+Q beendet wirklich (before-quit).
  // Windows: Schließen bleibt Beenden (window-all-closed).
  win.on('close', (e) => {
    if (!isMac || quitting) return;
    e.preventDefault();
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => { if (win && !win.isDestroyed()) win.hide(); });
      win.setFullScreen(false);
    } else {
      win.hide();
    }
  });
  // Fenster kommt zurück → die aktive App gilt als geöffnet (wie beim
  // App-Wechsel: Öffnen = gelesen)
  win.on('show', () => { if (activeId) clearBadge(activeId); });
  win.on('hide', () => { if (zoomHud && !zoomHud.isDestroyed()) zoomHud.hide(); });

  win.webContents.once('did-finish-load', () => {
    switchApp(views[state.activeApp] ? state.activeApp : state.apps[0].id);
  });
}

function setLibrary(open) {
  libraryOpen = open;
  for (const view of Object.values(views)) {
    view.setVisible(!open && undefined !== activeId && views[activeId] === view);
  }
  browserApplyVisibility();
}

ipcMain.on('switch-app', (e, id) => switchApp(id));
ipcMain.on('reload-app', (e, id) => views[id] && views[id].webContents.reload());
ipcMain.on('nav-back', navBackActive);
ipcMain.on('nav-forward', navForwardActive);
ipcMain.on('nav-home', navHomeActive);
// Verti-Browser
ipcMain.on('browser:ready', () => { if (browserTabs.size === 0 && activeId === BROWSER_ID) browserRestoreOrNew(); else sendBrowserUpdate(); sendBrowserBookmarks(); });
ipcMain.on('browser:new-tab', () => browserNewTab());
ipcMain.on('browser:close-tab', (e, key) => browserCloseTab(key));
ipcMain.on('browser:switch-tab', (e, key) => browserSwitchTab(key));
ipcMain.on('browser:navigate', (e, text) => { const wc = browserActiveWc(); const u = browserToUrl(text); if (wc && u) wc.loadURL(u); });
ipcMain.on('browser:back', () => { const wc = browserActiveWc(); if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); });
ipcMain.on('browser:forward', () => { const wc = browserActiveWc(); if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); });
ipcMain.on('browser:reload', () => { const wc = browserActiveWc(); if (wc) wc.reload(); });
ipcMain.on('browser:stop', () => { const wc = browserActiveWc(); if (wc) wc.stop(); });
ipcMain.on('browser:toggle-bookmark', browserToggleBookmark);
ipcMain.on('browser:remove-bookmark', (e, url) => browserRemoveBookmark(url));
ipcMain.on('browser:open-bookmark', (e, url) => { const wc = browserActiveWc(); if (wc && url) wc.loadURL(url); });
ipcMain.handle('get-apps', () => state.apps);
ipcMain.handle('get-app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged }));
// Die Sidebar fragt nach dem Start einmal nach: Das erste 'active-app' aus
// switchApp (did-finish-load) kommt, bevor sie ihre Empfänger registriert
// hat, und verpuffte → kein Icon war markiert, bis man klickte (bis 1.0.20).
ipcMain.handle('get-active-app', () => {
  if (activeId) sendNavStateFor(activeId);
  return activeId;
});
ipcMain.handle('get-catalog', () => CATALOG.map((c) => ({ ...c, imperio: IMPERIO_IDS.includes(c.id) })));
ipcMain.on('open-library', () => setLibrary(true));
ipcMain.on('close-library', closeLibrary);

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
  if (id === BROWSER_ID) return; // Browser ist fix, nicht entfernbar
  if (!views[id] || state.apps.length <= 1) return;
  const view = views[id];
  win.contentView.removeChildView(view);
  view.webContents.close();
  delete views[id];
  forgetBadge(id);
  setAudio(id, false);
  delete state.lastUrls[id];
  delete state.zoom[id];
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
  // Der Browser ist oben fix und nicht Teil der sortierbaren Liste
  const browser = state.apps.find((a) => a.id === BROWSER_ID);
  const expected = state.apps.length - (browser ? 1 : 0);
  if (reordered.length !== expected) return;
  state.apps = browser ? [browser, ...reordered] : reordered;
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
      enabled: state.apps.length > 1 && id !== BROWSER_ID,
      visible: id !== BROWSER_ID,
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
          click: () => { const wc = activeWebContents(); if (wc) wc.reload(); else if (activeId && views[activeId]) views[activeId].webContents.reload(); },
        },
        { type: 'separator' },
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+Plus', click: () => zoomActive(1) },
        // zweiter Weg für Tastaturen, auf denen „+" nur über Shift+= erreichbar ist
        { label: 'Vergrößern', accelerator: 'CmdOrCtrl+=', visible: false, acceleratorWorksWhenHidden: true, click: () => zoomActive(1) },
        { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', click: () => zoomActive(-1) },
        { label: 'Originalgröße', accelerator: 'CmdOrCtrl+0', click: () => zoomActive(0) },
        // Browser-Tastenkürzel (greifen nur, wenn der Verti-Browser aktiv ist)
        { label: 'Neuer Tab', accelerator: 'CmdOrCtrl+T', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdNewTab },
        { label: 'Tab schließen', accelerator: 'CmdOrCtrl+W', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdCloseTab },
        { label: 'Adresse fokussieren', accelerator: 'CmdOrCtrl+L', visible: false, acceleratorWorksWhenHidden: true, click: browserCmdFocusAddress },
        { type: 'separator' },
        {
          label: 'Zurück',
          accelerator: 'CmdOrCtrl+[',
          click: navBackActive,
        },
        {
          label: 'Vorwärts',
          accelerator: 'CmdOrCtrl+]',
          click: navForwardActive,
        },
        {
          label: 'Zur Startseite',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: navHomeActive,
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
// Beide Plattformen identisch (seit die App signiert ist): Hinweis-Popup mit
// Release-Notes, Nutzer bestätigt aktiv, dann Download + Installation über
// electron-updater (GitHub Releases; Mac braucht Verti-Mac.zip + latest-mac.yml).
// Kurzer Takt, damit der lila Update-Knopf im laufenden Betrieb zügig
// erscheint; zusätzlich wird bei Fenster-Fokus geprüft (gedrosselt)
const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP = 5 * 60 * 1000;
const appStartedAt = Date.now();
let updateNotifiedFor = null;
// Gefundenes, noch nicht installiertes Update — speist den lila
// "Update verfügbar"-Knopf in der Top-Bar (App läuft oft tagelang durch)
let pendingUpdate = null;
let updateDialogOpen = false;
let updateWin = null;

// Lila Update-Popup (update.html). Ein Fenster für alle Zustände:
// Update-Hinweis mit Release-Notes, Download-Fortschritt, Konfetti nach dem Update.
function openUpdatePopup(payload) {
  if (updateWin) {
    updateWin.focus();
    return;
  }
  updateDialogOpen = true;
  // Das Popup ist ein Kindfenster des Hauptfensters: ist das nur versteckt
  // (Mac, Schließen = Verstecken), erst wieder zeigen, sonst bleibt es unsichtbar
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  const width = 440;
  const height = 600;
  const b = win && !win.isDestroyed() ? win.getBounds() : null;
  updateWin = new BrowserWindow({
    ...(b ? { x: Math.round(b.x + (b.width - width) / 2), y: Math.round(b.y + (b.height - height) / 2) } : {}),
    width,
    height,
    frame: false,
    transparent: true,
    // Kein System-Fensterschatten: der zeichnet sonst einen grauen Rahmen
    // um das (unsichtbare) Fensterrechteck; die Karte hat ihren eigenen Schatten
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    parent: win && !win.isDestroyed() ? win : undefined,
    webPreferences: { preload: path.join(__dirname, 'update-preload.js') },
  });
  updateWin.loadFile('update.html');
  updateWin.webContents.once('did-finish-load', () => {
    if (!updateWin) return;
    updateWin.webContents.send('verti-update:state', payload);
    updateWin.show();
  });
  updateWin.on('closed', () => {
    updateWin = null;
    updateDialogOpen = false;
  });
}

function sendUpdateState(payload) {
  if (updateWin && !updateWin.isDestroyed()) updateWin.webContents.send('verti-update:state', payload);
}

ipcMain.on('verti-update:action', (_e, action) => {
  if (action === 'update') {
    sendUpdateState({ mode: 'downloading', percent: 0 });
    getAutoUpdater().downloadUpdate().catch(() => {
      // Beim nächsten 4-Stunden-Check wieder anbieten
      updateNotifiedFor = null;
      sendUpdateState({ mode: 'error' });
    });
    return;
  }
  if (updateWin) updateWin.close();
});

// Erster Start nach einem Update? Dann gibt es Konfetti. Erkannt über eine
// Marker-Datei mit der zuletzt gestarteten Version; beim allerersten Lauf der
// Marker-Datei zählt eine bestehende Installation (vorhandene Session-Daten)
// als frisches Update. Muss vor createWindow laufen, das legt die Session an.
function detectUpdateJustHappened() {
  if (!app.isPackaged) return false;
  const file = path.join(app.getPath('userData'), 'last-version.json');
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8')).version;
  } catch {}
  const cur = app.getVersion();
  if (prev === cur) return false;
  try {
    fs.writeFileSync(file, JSON.stringify({ version: cur }));
  } catch {}
  if (prev) return isNewerVersion(cur, prev);
  return fs.existsSync(path.join(app.getPath('userData'), 'Partitions'));
}

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

// Release-Notes für den Dialog aufbereiten: electron-updater liefert HTML
// (aus dem Markdown des GitHub-Release), die GitHub-API rohes Markdown
function releaseNotesText(notes) {
  const raw = typeof notes === 'string' ? notes : Array.isArray(notes) ? notes.map((n) => n && n.note).filter(Boolean).join('\n') : '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^[-*] /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function setupAutoUpdate() {
  if (!app.isPackaged) return; // im Entwicklungsmodus (npm start) nichts tun
  const autoUpdater = getAutoUpdater();
  // Erst fragen, dann laden: der Nutzer soll sehen, was sich ändert,
  // und das Update aktiv anstoßen statt es still im Hintergrund zu bekommen
  autoUpdater.autoDownload = false;
  // Nie still beim App-Beenden installieren: wird der Installer vom
  // Windows-Shutdown abgewürgt, bleibt eine kaputte Installation zurück
  // (electron-builder #7807). Installiert wird nur über 'Jetzt neu starten'.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', () => {});
  autoUpdater.on('update-available', (info) => {
    pendingUpdate = { mode: 'available', version: info.version, notes: releaseNotesText(info.releaseNotes) };
    if (win && !win.isDestroyed()) win.webContents.send('update-pill', pendingUpdate.version);
    // 'Später' respektieren: pro Version nur einmal je App-Lauf melden
    if (updateDialogOpen || info.version === updateNotifiedFor) return;
    updateNotifiedFor = info.version;
    // Popup nur kurz nach dem App-Start von selbst öffnen; findet der
    // 4-Stunden-Check mitten in der Arbeit etwas, bleibt nur der Knopf oben
    if (Date.now() - appStartedAt < 90 * 1000) openUpdatePopup(pendingUpdate);
  });
  autoUpdater.on('download-progress', (p) => {
    sendUpdateState({ mode: 'downloading', percent: p.percent });
  });
  autoUpdater.on('update-downloaded', () => {
    // Download passiert nur nach Klick auf 'Jetzt aktualisieren',
    // der Neustart ist also schon abgesegnet
    sendUpdateState({ mode: 'installing' });
    setTimeout(() => { quitting = true; autoUpdater.quitAndInstall(); }, 1500);
  });
  let lastCheck = 0;
  const throttledCheck = () => {
    if (Date.now() - lastCheck < UPDATE_CHECK_MIN_GAP) return;
    lastCheck = Date.now();
    autoUpdater.checkForUpdates().catch(() => {});
  };
  throttledCheck();
  setInterval(throttledCheck, UPDATE_CHECK_INTERVAL);
  if (win && !win.isDestroyed()) win.on('focus', throttledCheck);
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(win, { message: 'Update-Suche gibt es nur in der installierten App.' });
    return;
  }
  const autoUpdater = getAutoUpdater();
  try {
    // Update-Popup auch dann wieder zeigen, wenn es schon mal kam
    updateNotifiedFor = null;
    const result = await autoUpdater.checkForUpdates();
    const v = result?.updateInfo?.version;
    if (!v || !isNewerVersion(v, app.getVersion())) {
      dialog.showMessageBox(win, { message: `Verti ${app.getVersion()} ist aktuell.` });
      return;
    }
    // Manuell gesucht → Popup direkt öffnen ('update-available' hat
    // pendingUpdate gerade befüllt)
    if (pendingUpdate && !updateDialogOpen) openUpdatePopup(pendingUpdate);
  } catch {
    dialog.showMessageBox(win, { message: 'Update-Suche fehlgeschlagen. Bitte später erneut versuchen.' });
  }
}

app.whenReady().then(async () => {
  // castLabs ECS (Electron for Content Security, seit 1.0.21 für Spotify/DRM):
  // Widevine-CDM installieren bzw. aktualisieren, bevor Views entstehen.
  // components gibt es nur im castLabs-Build; mit normalem Electron wird
  // der Block übersprungen.
  const { components } = require('electron');
  if (components) {
    try { await components.whenReady(); } catch (e) { console.error('Widevine-CDM:', e); }
  }
  // Fallback-UA für alle WebContents ohne eigenen Override (v.a. Login-Popups):
  // sonst meldet navigator.userAgent dort Electron und Google blockt den Login
  app.userAgentFallback = chromeUserAgent();
  // Windows: AppUserModelID muss der appId entsprechen, sonst funktionieren Benachrichtigungen nicht sauber
  if (!isMac) app.setAppUserModelId('rocks.imperio.verti');
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  const justUpdated = detectUpdateJustHappened();
  createWindow();
  buildMenu();
  setupAutoUpdate();
  if (justUpdated) {
    // Kurz warten, bis das Hauptfenster steht, dann Konfetti
    setTimeout(() => openUpdatePopup({ mode: 'celebrate', version: app.getVersion() }), 900);
  }

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
  // Mac: kommt praktisch nicht vor (Schließen versteckt nur, s. createWindow);
  // unter Windows/Linux beendet Fenster-Schließen die App
  if (!isMac) app.quit();
});
