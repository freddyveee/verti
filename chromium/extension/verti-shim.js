// Bruecke: stellt genau das window.verti-API bereit, das preload.js in der
// Electron-Fassung liefert - nur auf Chrome-APIs statt auf IPC.
//
// Sinn der Sache: sidebar.html bleibt dadurch UNVERAENDERT. Waere die Sidebar
// fuer Chromium neu geschrieben worden, haetten wir ab sofort zwei Fassungen
// zu pflegen, und die zweite waere nach dem naechsten Release veraltet.
//
// Der Aufbau folgt preload.js Zeile fuer Zeile. Was Chromium (noch) nicht kann,
// steht unten unter "Noch nicht uebersetzt" - bewusst sichtbar und nicht still
// weggelassen.

(() => {
  // ---------- Verbindung zum Hintergrunddienst ----------
  function ruf(name, ...args) {
    return new Promise((fertig) => {
      chrome.runtime.sendMessage({ ruf: name, args }, (a) => {
        if (chrome.runtime.lastError) return fertig(undefined);
        if (a && a.fehler) { console.warn('[verti]', name, a.fehler); return fertig(undefined); }
        fertig(a ? a.wert : undefined);
      });
    });
  }
  // Fuer die send-artigen Aufrufe: absichtlich ohne Rueckgabe, damit sich der
  // Aufrufer genau wie in Electron verhaelt (dort war es ipcRenderer.send).
  const sende = (name, ...args) => { ruf(name, ...args); };

  // ---------- Ereignisse ----------
  const empfaenger = {};
  function auf(ereignis, cb) { (empfaenger[ereignis] = empfaenger[ereignis] || []).push(cb); }
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.ereignis) return;
    for (const cb of empfaenger[msg.ereignis] || []) {
      try { cb(...(msg.wert || [])); } catch (e) { console.warn('[verti] Empfaenger', msg.ereignis, e); }
    }
  });

  // ---------- Rechtsklick-Menue ----------
  // Electron konnte hier ein natives Menue oeffnen. Erweiterungen duerfen das
  // nicht, also baut die Bruecke ein eigenes - gleiche Eintraege, gleiche
  // Reihenfolge wie in main.js.
  let menuEl = null;
  function appMenue(id) {
    ruf('get-apps').then((apps) => {
      const app = (apps || []).find((a) => a.id === id);
      if (!app) return;
      if (menuEl) menuEl.remove();
      const eintraege = [
        { text: 'Neu laden', tu: () => sende('reload-app', id) },
        { text: 'Zur Startseite', tu: () => sende('nav-home') },
        { trenner: true },
        { text: 'Diese App funktioniert nicht …', tu: () => (empfaenger['report-app-problem'] || []).forEach((cb) => cb({ id, name: app.name })) },
        { text: 'Entfernen', aus: (apps.length < 2 || id === 'browser'), tu: () => sende('remove-app', id) },
      ];
      menuEl = document.createElement('div');
      menuEl.style.cssText = 'position:fixed;z-index:9999;min-width:210px;padding:6px;border-radius:10px;font:13px system-ui;'
        + 'background:var(--panel,#2a2c36);color:var(--text,#e8e8ec);border:1px solid var(--divider,#3a3d48);box-shadow:0 12px 32px rgba(0,0,0,.45)';
      const kopf = document.createElement('div');
      kopf.textContent = app.name;
      kopf.style.cssText = 'padding:6px 10px 8px;opacity:.55;font-weight:600';
      menuEl.appendChild(kopf);
      for (const e of eintraege) {
        if (e.trenner) {
          const t = document.createElement('div');
          t.style.cssText = 'height:1px;margin:5px 8px;background:var(--divider,#3a3d48)';
          menuEl.appendChild(t);
          continue;
        }
        const b = document.createElement('div');
        b.textContent = e.text;
        b.style.cssText = 'padding:7px 10px;border-radius:7px;cursor:pointer' + (e.aus ? ';opacity:.35;pointer-events:none' : '');
        b.addEventListener('mouseenter', () => { b.style.background = 'rgba(124,58,237,.22)'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
        b.addEventListener('click', () => { zu(); e.tu(); });
        menuEl.appendChild(b);
      }
      const x = Math.min(letzterKlick.x, innerWidth - 224);
      const y = Math.min(letzterKlick.y, innerHeight - 40 - eintraege.length * 32);
      menuEl.style.left = Math.max(6, x) + 'px';
      menuEl.style.top = Math.max(6, y) + 'px';
      document.body.appendChild(menuEl);
      setTimeout(() => document.addEventListener('mousedown', zu, { once: true }), 0);
    });
  }
  function zu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  const letzterKlick = { x: 20, y: 20 };
  document.addEventListener('contextmenu', (e) => { letzterKlick.x = e.clientX; letzterKlick.y = e.clientY; }, true);

  // ---------- Plattform ----------
  const platform = navigator.userAgent.includes('Macintosh') ? 'darwin'
    : navigator.userAgent.includes('Windows') ? 'win32' : 'linux';

  window.verti = {
    platform,

    // --- Apps und Katalog ---
    getApps: () => ruf('get-apps'),
    getActiveApp: () => ruf('get-active-app'),
    getAppInfo: () => ruf('get-app-info'),
    getCatalog: () => ruf('get-catalog'),
    getCategoryOrder: () => ruf('get-category-order'),
    switchApp: (id) => sende('switch-app', id),
    reloadApp: (id) => sende('reload-app', id),
    addApp: (appDef) => sende('add-app', appDef),
    removeApp: (id) => sende('remove-app', id),
    reorderApps: (ids) => sende('reorder-apps', ids),
    showAppMenu: (id) => appMenue(id),

    // --- Navigation ---
    navBack: () => sende('nav-back'),
    navForward: () => sende('nav-forward'),
    navHome: () => sende('nav-home'),

    // --- Zaehler und Ton ---
    getBadges: () => ruf('get-badges'),
    getAudio: () => ruf('get-audio'),
    onBadges: (cb) => auf('badges', cb),
    onAudio: (cb) => auf('audio', cb),

    // --- Einstellungen ---
    getSettings: () => ruf('get-settings'),
    setTheme: (t) => sende('set-theme', t),
    setThemeColor: (f) => sende('set-theme-color', f),
    setExternalLinks: (m) => sende('set-external-links', m),
    setAppMuted: (id, muted) => sende('set-app-muted', id, muted),
    onTheme: (cb) => auf('theme', cb),
    onAppsChanged: (cb) => auf('apps-changed', cb),
    onActiveApp: (cb) => auf('active-app', cb),
    onNavState: (cb) => auf('nav-state', cb),

    // --- Werkzeuge ---
    sendFeedback: (payload) => ruf('feedback-send', payload),
    openAdmin: () => sende('open-admin'),
    openCompatCheck: () => sende('open-compat-check'),
    onReportAppProblem: (cb) => auf('report-app-problem', cb),
    openDownloadsFolder: () => sende('open-downloads-folder'),
    historyCount: () => ruf('history-count'),
    historyClear: () => ruf('history-clear'),
    browserNewTab: () => sende('browser-new-tab'),

    // --- Updates ---
    getPendingUpdate: () => ruf('get-pending-update'),
    openUpdatePopup: () => sende('open-update-popup'),
    checkUpdates: () => ruf('settings-check-updates'),
    onUpdatePill: (cb) => auf('update-pill', cb),

    // --- Erweiterungen ---
    extList: () => ruf('ext-list'),
    extRemove: (id) => ruf('ext-remove', id),

    // ---------- Noch nicht uebersetzt ----------
    // Diese Aufrufe gehoeren zu Teilen, die es in der Chromium-Fassung noch
    // nicht gibt. Sie tun bewusst nichts Sinnvolles, statt zu fehlen - so
    // laeuft die Sidebar vollstaendig, und die Luecken bleiben benennbar.

    // In Electron blendeten diese Aufrufe die App-Ansichten aus, damit die
    // Bibliothek darueber sichtbar wird. Die Sidebar ist hier eine eigene
    // Flaeche - es liegt nichts davor, also ist nichts auszublenden.
    openLibrary: () => {},
    closeLibrary: () => {},

    // Das Dock-Badge setzt der Hintergrunddienst selbst (chrome.action).
    setOverlay: () => {},

    // Erweiterungen von der Platte laden geht nur ueber Chromiums eigene
    // Oberflaeche; ein Dateidialog reicht dafuer nicht.
    extAdd: () => Promise.resolve({ ok: false, error: 'Bitte ueber chrome://extensions laden.' }),

    // Der Verti-Browser ist in der Chromium-Fassung der Browser selbst.
    browserPanelState: () => {},
    onOpenBrowserPanel: () => {},
    onOpenSettingsSection: (cb) => auf('open-settings-section', cb),
  };
})();
