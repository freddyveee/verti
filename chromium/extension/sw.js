// Hintergrunddienst der Verti-Erweiterung. Das ist in Chromium das, was in
// Electron main.js war: Zustand, App-Tabs, Ungelesen-Zaehler, Farbwelt.
//
// Wichtiger Unterschied zu Electron: dieser Dienst wird von Chromium jederzeit
// beendet und beim naechsten Ereignis neu gestartet. Es darf deshalb NICHTS
// nur im Arbeitsspeicher stehen - jeder Zustand liegt in chrome.storage, und
// statt setInterval laeuft ein chrome.alarms-Wecker.

const KATALOG_DATEI = 'apps.json';
let katalog = null;

async function ladeKatalog() {
  if (katalog) return katalog;
  katalog = await fetch(chrome.runtime.getURL(KATALOG_DATEI)).then((r) => r.json());
  return katalog;
}

// ---------- Zustand ----------
// Entspricht window-state.json aus der Electron-Fassung.
const STANDARD = {
  apps: null,            // wird beim ersten Start aus dem Katalog gefuellt
  activeApp: 'calendar',
  theme: 'dark',
  themeColor: 'graphit',
  externalLinks: 'verti',
  mutedApps: [],
  tabs: {},              // appId -> tabId
};

async function zustand() {
  const k = await ladeKatalog();
  const roh = (await chrome.storage.local.get('verti')).verti || {};
  const s = { ...STANDARD, ...roh };
  if (!Array.isArray(s.apps) || !s.apps.length) {
    s.apps = k.standardApps
      .map((id) => k.apps.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a.id, name: a.name, url: a.url, icon: a.icon }));
  } else {
    // Stammdaten kommen immer aus dem Katalog, sonst haengen gespeicherte Apps
    // auf alten Adressen fest (gleiche Regel wie loadState() in main.js).
    s.apps = s.apps.map((a) => {
      const c = k.apps.find((x) => x.id === a.id);
      return c ? { ...a, name: c.name, url: c.url, icon: c.icon || a.icon } : a;
    });
  }
  if (!k.farbwelten.includes(s.themeColor)) s.themeColor = 'graphit';
  if (s.theme !== 'light') s.theme = 'dark';
  return s;
}

async function speichern(neu) {
  const s = await zustand();
  await chrome.storage.local.set({ verti: { ...s, ...neu } });
  return { ...s, ...neu };
}

// ---------- an die Sidebar melden ----------
// Die Sidebar ist ein eigener Kontext; wenn sie zu ist, geht die Nachricht ins
// Leere. Das ist normal und kein Fehler, deshalb der leere catch.
function melde(ereignis, ...wert) {
  chrome.runtime.sendMessage({ ereignis, wert }).catch(() => {});
}

// ---------- Ungelesen-Zaehler ----------
// Gleiche Regel wie main.js: bei den Apps aus titleBadge zaehlt eine Zahl
// ueberall im Titel, bei allen anderen nur am Anfang. Sonst entstehen falsche
// Badges aus Inhalts-Titeln.
function zahlAusTitel(titel, appId, titleBadge) {
  if (!titel) return 0;
  const m = titleBadge.includes(appId) ? titel.match(/\((\d+)\)/) : titel.match(/^\s*\((\d+)\)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return n > 0 ? Math.min(n, 999) : 0;
}

async function badgesMelden() {
  const k = await ladeKatalog();
  const s = await zustand();
  const tabs = { ...s.tabs };
  const stand = {};
  let geaendert = false;
  for (const [appId, tabId] of Object.entries(tabs)) {
    let tab = null;
    try { tab = await chrome.tabs.get(tabId); } catch (e) { delete tabs[appId]; geaendert = true; continue; }
    const n = zahlAusTitel(tab.title, appId, k.titleBadge);
    if (n) stand[appId] = n;
  }
  if (geaendert) await speichern({ tabs });
  const gesamt = Object.values(stand).reduce((a, b) => a + b, 0);
  chrome.action.setBadgeText({ text: gesamt ? String(gesamt) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  melde('badges', stand);
  return stand;
}

async function audioMelden() {
  const s = await zustand();
  const laut = {};
  for (const [appId, tabId] of Object.entries(s.tabs)) {
    try { const t = await chrome.tabs.get(tabId); if (t.audible) laut[appId] = true; } catch (e) {}
  }
  melde('audio', laut);
  return laut;
}

// ---------- App-Tabs ----------
async function appOeffnen(id, aktivieren = true) {
  const s = await zustand();
  const tabs = { ...s.tabs };
  if (tabs[id] !== undefined) {
    try {
      const t = await chrome.tabs.get(tabs[id]);
      if (aktivieren) await chrome.tabs.update(t.id, { active: true });
      await speichern({ activeApp: id });
      melde('active-app', id);
      return t.id;
    } catch (e) { delete tabs[id]; }
  }
  const app = s.apps.find((a) => a.id === id) || (await ladeKatalog()).apps.find((a) => a.id === id);
  if (!app) return null;
  const tab = await chrome.tabs.create({ url: app.url, active: aktivieren, pinned: true });
  tabs[id] = tab.id;
  const stumm = (s.mutedApps || []).includes(id);
  if (stumm) { try { await chrome.tabs.update(tab.id, { muted: true }); } catch (e) {} }
  await speichern({ tabs, activeApp: id });
  melde('active-app', id);
  return tab.id;
}

async function appSchliessen(id) {
  const s = await zustand();
  const tabs = { ...s.tabs };
  if (tabs[id] !== undefined) {
    try { await chrome.tabs.remove(tabs[id]); } catch (e) {}
    delete tabs[id];
    await speichern({ tabs });
  }
}

async function aktiverTab() {
  const s = await zustand();
  const id = s.activeApp;
  if (id && s.tabs[id] !== undefined) {
    try { return await chrome.tabs.get(s.tabs[id]); } catch (e) {}
  }
  return null;
}

async function navStandMelden() {
  const t = await aktiverTab();
  if (!t) return;
  // Chromium gibt den Verlaufsstand nicht per API heraus. Der Startpunkt ist
  // sicher bestimmbar (erste Seite der App), fuer zurueck/vorwaerts nehmen wir
  // an, dass es geht - ein Klick ins Leere ist harmlos.
  melde('nav-state', { canGoBack: true, canGoForward: true, url: t.url });
}

// ---------- Farbwelt ----------
async function themeMelden() {
  const s = await zustand();
  melde('theme', s.theme, s.themeColor);
}

// ---------- Ereignisse ----------
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create('verti-puls', { periodInMinutes: 1 });
  await ladeKatalog();
  await vertiStartAufbauen();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create('verti-puls', { periodInMinutes: 1 });
  await vertiStartAufbauen();
});

// ---------- Was beim Start passieren soll ----------
// In der Electron-Fassung liefen ALLE Apps dauerhaft - nur so kommen Badges und
// Benachrichtigungen an. In Chromium heisst das: jede App ist ein angehefteter
// Tab, und die zeigt die vertikale Tableiste als Vertis App-Leiste.
//
// Ohne das startet Verti mit Googles Neuer-Tab-Seite. Genau das ist am
// 03.09.2026 passiert und sah aus wie ein fremder Browser.
async function vertiStartAufbauen() {
  try {
    const s = await zustand();

    // 1. Alle eingerichteten Apps als angeheftete Tabs.
    //
    //    Vertis eigene Flaeche wird BEWUSST nicht geoeffnet (Freddys
    //    Entscheidung am 03.09.2026): Verti soll direkt mit einer App
    //    dastehen, nicht mit einer fast leeren Seite. Bibliothek und
    //    Einstellungen holt man ueber Vertis Knopf in der Werkzeugleiste.
    const apps = s.apps.filter((a) => a.id !== 'browser');
    for (const app of apps) {
      await appOeffnen(app.id, false);
    }

    // 2. Die leere Startseite wegraeumen, mit der Chromium aufmacht
    for (const t of await chrome.tabs.query({})) {
      if (/^chrome:\/\/(newtab|new-tab-page)/.test(t.url || '') && !t.pinned) {
        try { await chrome.tabs.remove(t.id); } catch (e) {}
      }
    }

    // 3. Nach vorn stellen: zuletzt benutzte App, sonst die erste
    const zeigen = apps.some((a) => a.id === s.activeApp)
      ? s.activeApp
      : (apps[0] && apps[0].id);
    if (zeigen) await appOeffnen(zeigen, true);
  } catch (e) {
    console.warn('[verti] Start konnte nicht aufgebaut werden', e);
  }
}

// Vertis Oberflaeche als eigener Tab, NICHT als Seitenpanel.
// Grund: Bibliothek und Einstellungen sind in Verti ganzflaechige Ueberlagerungen
// (sidebar.html rechnet mit 100vw). Ein Seitenpanel ist nur etwa 450 px breit -
// die Bibliothek waere darin gequetscht. Als Tab hat sie die volle Breite, und
// die App-Leiste zeichnet ohnehin Chromiums vertikale Tableiste.
async function vertiTabOeffnen() {
  const url = chrome.runtime.getURL('sidebar.html');
  const da = (await chrome.tabs.query({ url })) [0];
  if (da) { await chrome.tabs.update(da.id, { active: true }); return da.id; }
  const tab = await chrome.tabs.create({ url, active: true, pinned: true, index: 0 });
  return tab.id;
}

chrome.action.onClicked.addListener(vertiTabOeffnen);

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'verti-puls') { badgesMelden(); audioMelden(); } });

chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.title || info.status === 'complete') badgesMelden();
  if (info.audible !== undefined) audioMelden();
});
chrome.tabs.onRemoved.addListener(badgesMelden);
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const s = await zustand();
  const treffer = Object.entries(s.tabs).find(([, t]) => t === tabId);
  if (treffer) { await speichern({ activeApp: treffer[0] }); melde('active-app', treffer[0]); navStandMelden(); }
});

// ---------- Anfragen der Sidebar ----------
// Ein einziger Einstiegspunkt statt vieler Kanaele - das entspricht dem
// ipcMain-Block in main.js und haelt verti-shim.js schlank.
const RUFE = {
  // Das Inhaltsskript fragt beim Start: gehoert dieser Tab zu einer Verti-App,
  // und gilt die Titel-Regel "ueberall" oder nur "am Anfang"?
  'badge-regel': async (absender) => {
    const k = await ladeKatalog();
    const s = await zustand();
    const tabId = absender && absender.tab && absender.tab.id;
    const treffer = Object.entries(s.tabs).find(([, t]) => t === tabId);
    if (!treffer) return { istApp: false };
    return { istApp: true, ueberall: k.titleBadge.includes(treffer[0]) };
  },

  'verti-oeffnen': () => vertiTabOeffnen(),

  'get-apps': async () => (await zustand()).apps,
  'get-active-app': async () => { navStandMelden(); return (await zustand()).activeApp; },
  'get-app-info': async () => ({ version: chrome.runtime.getManifest().version, packaged: true, admin: false }),
  'get-catalog': async () => {
    const k = await ladeKatalog();
    // Gleiche Regel wie appStatus() in main.js: die Stufe beschreibt UNSERE
    // Zusage, nicht die Qualitaet der fremden App.
    const stufe = (id) => {
      if (k.appStatus.experimentell.includes(id)) return { stufe: 'experimentell' };
      if (k.appStatus.geprueft[id]) return { stufe: 'geprueft', datum: k.appStatus.geprueft[id] };
      return { stufe: 'unterstuetzt' };
    };
    return k.apps.map((c) => ({
      ...c,
      imperio: k.imperio.includes(c.id),
      category: k.kategorien[c.id] || 'Weitere',
      ...stufe(c.id),
    }));
  },
  'get-category-order': async () => (await ladeKatalog()).kategorieReihenfolge,
  'get-settings': async () => {
    const k = await ladeKatalog();
    const s = await zustand();
    return {
      theme: s.theme, themeColor: s.themeColor, farbwelten: k.farbwelten,
      externalLinks: s.externalLinks, mutedApps: s.mutedApps || [],
    };
  },
  'get-badges': () => badgesMelden(),
  'get-audio': () => audioMelden(),

  'switch-app': (id) => appOeffnen(id),
  'reload-app': async (id) => { const s = await zustand(); if (s.tabs[id] !== undefined) { try { await chrome.tabs.reload(s.tabs[id]); } catch (e) {} } },
  'add-app': async (appDef) => {
    const s = await zustand();
    if (s.apps.some((a) => a.id === appDef.id)) return appOeffnen(appDef.id);
    const apps = [...s.apps, { id: appDef.id, name: appDef.name, url: appDef.url, icon: appDef.icon }];
    await speichern({ apps });
    melde('apps-changed', apps);
    return appOeffnen(appDef.id);
  },
  'remove-app': async (id) => {
    const s = await zustand();
    const apps = s.apps.filter((a) => a.id !== id);
    await appSchliessen(id);
    await speichern({ apps });
    melde('apps-changed', apps);
  },
  'reorder-apps': async (ids) => {
    const s = await zustand();
    const apps = ids.map((id) => s.apps.find((a) => a.id === id)).filter(Boolean);
    for (const a of s.apps) if (!apps.some((x) => x.id === a.id)) apps.push(a);
    await speichern({ apps });
    melde('apps-changed', apps);
  },

  'set-theme': async (t) => { await speichern({ theme: t === 'light' ? 'light' : 'dark' }); themeMelden(); },
  'set-theme-color': async (f) => {
    const k = await ladeKatalog();
    if (k.farbwelten.includes(f)) { await speichern({ themeColor: f }); themeMelden(); }
  },
  'set-external-links': (m) => speichern({ externalLinks: m === 'system' ? 'system' : 'verti' }),
  'set-app-muted': async (id, muted) => {
    const s = await zustand();
    const liste = new Set(s.mutedApps || []);
    if (muted) liste.add(id); else liste.delete(id);
    await speichern({ mutedApps: [...liste] });
    if (s.tabs[id] !== undefined) { try { await chrome.tabs.update(s.tabs[id], { muted: !!muted }); } catch (e) {} }
  },

  'nav-back': async () => { const t = await aktiverTab(); if (t) chrome.tabs.goBack(t.id).catch(() => {}); },
  'nav-forward': async () => { const t = await aktiverTab(); if (t) chrome.tabs.goForward(t.id).catch(() => {}); },
  'nav-home': async () => {
    const s = await zustand();
    const app = s.apps.find((a) => a.id === s.activeApp);
    if (app && s.tabs[app.id] !== undefined) chrome.tabs.update(s.tabs[app.id], { url: app.url }).catch(() => {});
  },

  'open-admin': () => chrome.tabs.create({ url: 'https://freddyveee.github.io/verti/admin.html' }),
  'open-compat-check': () => chrome.tabs.create({ url: chrome.runtime.getURL('kompatibilitaets-check.html') }),
  'open-downloads-folder': () => chrome.downloads.showDefaultFolder(),
  'browser-new-tab': () => chrome.tabs.create({ url: 'about:blank', active: true }),

  'history-count': async () => {
    const seit = Date.now() - 1000 * 60 * 60 * 24 * 90;
    const treffer = await chrome.history.search({ text: '', startTime: seit, maxResults: 10000 });
    return treffer.length;
  },
  'history-clear': async () => { await chrome.browsingData.removeHistory({}); return 0; },

  'ext-list': async () => {
    const alle = await chrome.management.getAll();
    return alle
      .filter((e) => e.type === 'extension' && e.id !== chrome.runtime.id)
      .map((e) => ({ id: e.id, name: e.name, version: e.version, beschreibung: e.description || '', pfad: '', merkbar: true }));
  },
  'ext-remove': async (id) => { try { await chrome.management.uninstall(id, { showConfirmDialog: true }); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; } },

  'feedback-send': async (payload) => {
    const k = await ladeKatalog();
    const thema = String((payload && payload.topic) || '').trim().slice(0, 200);
    const text = String((payload && payload.description) || '').trim().slice(0, 4000);
    const absender = String((payload && payload.sender) || '').trim().slice(0, 120);
    if (!thema || !text) return { ok: false, error: 'Bitte Thema und Vorschlag ausfüllen.' };
    if (!/^https?:\/\//.test(k.feedback.url)) return { ok: false, error: 'Feedback ist noch nicht eingerichtet.' };
    const s = await zustand();
    try {
      const r = await fetch(k.feedback.url.replace(/\/+$/, '') + '/rest/v1/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: k.feedback.key,
          Authorization: 'Bearer ' + k.feedback.key,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          topic: thema, description: text, sender: absender || null,
          app: s.activeApp || null,
          device: navigator.userAgent.includes('Mac') ? 'Chromium / darwin' : 'Chromium / win32',
          version: chrome.runtime.getManifest().version,
        }),
      });
      if (r.ok) return { ok: true };
      return { ok: false, error: 'Konnte nicht senden (HTTP ' + r.status + ').' };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Netzwerkfehler.' };
    }
  },
};

chrome.runtime.onMessage.addListener((msg, absender, antwort) => {
  if (!msg || !msg.ruf) return false;
  const fn = RUFE[msg.ruf];
  if (!fn) { antwort({ fehler: 'unbekannter Ruf: ' + msg.ruf }); return false; }
  // Der Absender wird hinten angehaengt - nur 'badge-regel' braucht ihn, alle
  // anderen ignorieren ihn einfach.
  Promise.resolve(fn(...(msg.args || []), absender))
    .then((wert) => antwort({ wert }))
    .catch((e) => antwort({ fehler: String((e && e.message) || e) }));
  return true; // Antwort kommt asynchron
});

// ---------- Updates ----------
// Vertis Regel (Freddys ausdruecklicher Wunsch): NICHTS still im Hintergrund.
// Erst fragen, Release-Notes zeigen, dann laden. Genau wie in der Electron-
// Fassung - deshalb ist auch der Dialog derselbe (update.html).
//
// Geprueft wird gegen GitHub Releases, also gegen denselben Kanal, den die
// heutige Verti-Version schon benutzt.
const RELEASE_API = 'https://api.github.com/repos/freddyveee/verti/releases/latest';
const UPDATE_ABSTAND_MIN = 60;   // hoechstens einmal pro Stunde nachschauen

// Vergleicht "1.2.10" mit "1.2.9" richtig - ein Zeichenkettenvergleich wuerde
// hier "1.2.10 < 1.2.9" sagen.
function versionNeuer(neu, alt) {
  const z = (v) => String(v || '').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const a = z(neu), b = z(alt);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// Release-Notes von GitHub sind Markdown. Der Dialog erwartet einfachen Text
// mit Aufzaehlungspunkten - gleiche Aufbereitung wie releaseNotesText() in
// main.js.
function notizenText(roh) {
  return String(roh || '')
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function updateZustandLesen() {
  return (await chrome.storage.local.get('vertiUpdate')).vertiUpdate || null;
}

async function updateZustandSetzen(z) {
  await chrome.storage.local.set({ vertiUpdate: z });
  melde('update-zustand', z);
  return z;
}

async function updateFensterOeffnen() {
  const url = chrome.runtime.getURL('update.html');
  const da = (await chrome.tabs.query({ url }))[0];
  if (da) { await chrome.windows.update(da.windowId, { focused: true }); return; }
  await chrome.windows.create({ url, type: 'popup', width: 520, height: 620 });
}

async function updatePruefen(vonHand) {
  const jetzt = Date.now();
  const merk = (await chrome.storage.local.get('updateZuletzt')).updateZuletzt || 0;
  if (!vonHand && jetzt - merk < UPDATE_ABSTAND_MIN * 60000) return null;
  await chrome.storage.local.set({ updateZuletzt: jetzt });

  try {
    const r = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    const neu = String(rel.tag_name || '').replace(/^v/, '');
    const hier = chrome.runtime.getManifest().version;
    if (!neu || !versionNeuer(neu, hier)) {
      if (vonHand) return { ok: true, aktuell: true, version: hier };
      return null;
    }
    // Die Mac-Datei aus dem Release heraussuchen
    const datei = (rel.assets || []).find((a) => /Verti-Mac\.zip$/i.test(a.name))
      || (rel.assets || []).find((a) => /\.dmg$/i.test(a.name));
    const z = await updateZustandSetzen({
      mode: 'available',
      version: neu,
      notes: notizenText(rel.body),
      datei: datei ? { name: datei.name, url: datei.browser_download_url, groesse: datei.size } : null,
      forced: false,
    });
    melde('update-pill', neu);
    await updateFensterOeffnen();
    return { ok: true, aktuell: false, version: neu };
  } catch (e) {
    if (vonHand) return { ok: false, error: (e && e.message) || 'Netzwerkfehler.' };
    return null;
  }
}

// Was der Dialog ausloest.
//
// ACHTUNG, offener Punkt: 'update' kann die neue Fassung herunterladen, aber
// eine Erweiterung darf das Programm NICHT selbst austauschen. Dafuer fehlt
// noch der letzte Baustein (siehe CHROMIUM-STATUS.md). Bis dahin laden wir die
// Datei herunter und zeigen sie im Finder - der Nutzer zieht sie selbst
// hinueber. Das ist ehrlicher als so zu tun, als sei es fertig.
async function updateAktion(name) {
  const z = await updateZustandLesen();
  if (name === 'close') {
    const w = (await chrome.tabs.query({ url: chrome.runtime.getURL('update.html') }))[0];
    if (w) { try { await chrome.windows.remove(w.windowId); } catch (e) {} }
    return;
  }
  if (name === 'defer') { await updateZustandSetzen({ ...(z || {}), forced: false }); return; }
  if (name !== 'update') return;

  if (!z || !z.datei) {
    await updateZustandSetzen({ ...(z || {}), mode: 'error', fehler: 'Kein passendes Paket im Release gefunden.' });
    return;
  }
  await updateZustandSetzen({ ...z, mode: 'downloading', percent: 0 });
  try {
    const id = await chrome.downloads.download({ url: z.datei.url, filename: z.datei.name });
    // Fortschritt melden, solange der Download laeuft
    const takt = setInterval(async () => {
      const [d] = await chrome.downloads.search({ id });
      if (!d) return;
      if (d.totalBytes > 0) {
        const p = Math.round((d.bytesReceived / d.totalBytes) * 100);
        const jetzt = await updateZustandLesen();
        if (jetzt && jetzt.mode === 'downloading') await updateZustandSetzen({ ...jetzt, percent: p });
      }
      if (d.state === 'complete') {
        clearInterval(takt);
        chrome.downloads.show(id);
        await updateZustandSetzen({ ...z, mode: 'installing' });
      } else if (d.state === 'interrupted') {
        clearInterval(takt);
        await updateZustandSetzen({ ...z, mode: 'error', fehler: 'Download abgebrochen.' });
      }
    }, 700);
  } catch (e) {
    await updateZustandSetzen({ ...z, mode: 'error', fehler: (e && e.message) || 'Download fehlgeschlagen.' });
  }
}

RUFE['update-zustand'] = () => updateZustandLesen();
RUFE['update-aktion'] = (name) => updateAktion(name);
RUFE['settings-check-updates'] = () => updatePruefen(true);
RUFE['get-pending-update'] = async () => { const z = await updateZustandLesen(); return z && z.mode === 'available' ? z.version : null; };
RUFE['open-update-popup'] = () => updateFensterOeffnen();

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'verti-puls') updatePruefen(false); });
