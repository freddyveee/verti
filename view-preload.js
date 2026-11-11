const { ipcRenderer, webFrame } = require('electron');

// ---------- Firefox-Tarnung für Google-Anmeldeseiten (JS-Seite) ----------
// Die HTTP-Header stellt der Hauptprozess per webRequest auf Firefox um
// (sicher, pro Anfrage). navigator.userAgent muss dazu passen, sonst blockt
// Google den Login wegen des Widerspruchs Header vs. JS-Kennung.
// WICHTIG: Früher schaltete der Hauptprozess dafür wc.setUserAgent mitten in
// Navigations-Events um (did-start/did-redirect-navigation). Das zerstörte
// die laufende Navigations-Anfrage und crashte Chromium deterministisch
// (EXC_BREAKPOINT in ~NavigationRequest — der Startabsturz von 1.0.15–1.0.17,
// der nur auf ausgeloggten Profilen sichtbar wurde). Deshalb passiert die
// JS-Seite jetzt HIER im Preload: rein lesende Property-Overrides, kein
// einziger Navigations-Eingriff.
const GOOGLE_AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com'];
// Auf Googles Anmeldeseiten läuft NUR die Tarnung, sonst nichts (siehe unten).
const ON_GOOGLE_AUTH = GOOGLE_AUTH_HOSTS.includes(location.host);
// Dieselbe Kennung wie die Header-Tarnung: main.js reicht sie per
// additionalArguments herein (eine Quelle, kein Abgleich zweier Dateien).
const UA_ARG = '--verti-firefox-ua=';
const FIREFOX_UA = (process.argv.find((a) => a.startsWith(UA_ARG)) || '').slice(UA_ARG.length)
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:154.0) Gecko/20100101 Firefox/154.0';

// Stumm-Status (pro App in den Einstellungen): main.js reicht ihn als Argument
// herein und aktualisiert ihn live per IPC. Der Wert steht als data-Attribut am
// <html>, die Notification-Hülle unten liest es bei jeder Meldung.
const VERTI_MUTED = process.argv.includes('--verti-muted=1');
const mutedInit = `window.__vertiMutedInit = ${VERTI_MUTED}; try { if (document.documentElement) document.documentElement.setAttribute('data-verti-muted', ${VERTI_MUTED} ? '1' : '0'); } catch (e) {}`;

const uaDisguise = ON_GOOGLE_AUTH ? `(() => {
  const def = (prop, value) => {
    try { Object.defineProperty(Navigator.prototype, prop, { get: () => value, configurable: true }); } catch (e) {}
  };
  def('userAgent', ${JSON.stringify(FIREFOX_UA)});
  def('appVersion', ${JSON.stringify(process.platform === 'darwin' ? '5.0 (Macintosh)' : '5.0 (Windows)')}); // so knapp meldet es Firefox
  def('vendor', '');           // Firefox meldet einen leeren vendor
  def('userAgentData', undefined); // Client Hints kennt Firefox nicht
  // Tieferer Fingerabdruck: bei ECHTEN Konten prüft Google mehr als den UA und
  // erkennt sonst Chromium trotz Firefox-UA (Ablehnung erst NACH der E-Mail,
  // vor dem Passwort). Diese Merkmale verraten Chromium am deutlichsten:
  def('productSub', '20100101');   // Firefox-Konstante; Chrome wäre 20030107
  def('oscpu', ${JSON.stringify(process.platform === 'darwin' ? 'Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64')}); // nur Firefox hat oscpu
  def('buildID', '20181001000000'); // Firefox meldet eine eingefrorene buildID
  try { if (!delete window.chrome) Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true }); } catch (e) {} // echtes Firefox hat kein window.chrome
})();` : '';

// ---------- Brücke Seite → Verti: Badges, Meldungen, Klicks ----------
// Läuft in jeder App-View (Login-Popups bekommen sie auch, dort wirkungslos).
// Ziel: Sidebar-Badges auch für Apps, die NICHTS in den Seitentitel schreiben
// (Stackfield), und Web-Benachrichtigungen, die Electron sonst verschluckt.
// Drei Quellen, alle in der Seiten-Welt (main world) abgefangen:
//  1. window.Notification – klassische Meldung. Stackfield feuert so
//     (sf.notifications.js: new Notification(titel, {body, icon})), aber nur,
//     wenn im Stackfield-Profil „Desktop-Benachrichtigungen" an sind, die
//     Arbeitszeit passt und kein Abwesenheitsmodus läuft. Electron zeigt sie
//     nativ; wir zählen mit und melden Klicks (Verti nach vorn, App wechseln).
//  2. ServiceWorkerRegistration.showNotification – Electron verwirft solche
//     „persistenten" Meldungen still (DisplayPersistentNotification ist in
//     Electron 43 leer). Wir zeigen sie über die klassische API an; `actions`
//     fliegt raus (nur persistent erlaubt). Web-Push gibt es in Electron
//     ohnehin nicht, der Weg greift also nur für Aufrufe aus der Seite.
//  3. Favico.js – Zähler im Favicon. Stackfield rechnet in ShowPageTitle()
//     (sf.utils.js, gelesen 22.08.2026) die echte Ungelesen-Zahl aus und ruft
//     favicon.badge(n) bzw. favicon.reset(). NUR echte Zahlen ergeben ein
//     Badge; ein nicht-numerischer Wert ist ein reiner Punkt-Indikator (den
//     Stackfield auch ohne echtes Ungelesenes setzt) → 0, sonst Phantom-1
//     (25.08.2026 bei Cindy beobachtet: Verti zeigte 1, Chrome-Favicon nichts).
//     Damit stimmt das Badge exakt und sinkt beim Lesen wieder – unabhängig
//     von Desktop-Benachrichtigungen. Der Hook ist generisch: jede App, die
//     Favico.js global lädt (this.Favico = …), bekommt so ein Badge.
// Seiten-Welt und Preload (isolierte Welt) teilen sich den DOM: Die Seite
// schreibt den Wert in ein data-Attribut am <html> und feuert ein Event auf
// document; das Preload liest beides und meldet per IPC an main.js.
// (CustomEvent.detail wäre zwischen den Welten nicht verlässlich.)
const bridge = `(() => {
  const signal = (name, value) => {
    try {
      const root = document.documentElement; // existiert beim Preload-Start evtl. noch nicht
      if (value !== undefined && root) root.setAttribute('data-verti-' + name, String(value));
      document.dispatchEvent(new Event('verti-' + name));
    } catch (e) {}
  };
  // Stumm? Erst das (per IPC live gesetzte) data-Attribut, sonst der Startwert
  const isMuted = () => {
    const el = document.documentElement;
    if (el && el.hasAttribute('data-verti-muted')) return el.getAttribute('data-verti-muted') === '1';
    return !!window.__vertiMutedInit;
  };
  // 1. window.Notification
  //    Seit 02.11.2026 zeigt NICHT mehr die Seite die Meldung an, sondern
  //    main.js (Freddys Wunsch: man soll auf einen Blick sehen, aus welchem
  //    Kanal sie kommt). Nur dort lassen sich Kanalname (Zeile unter dem
  //    Titel) und Kanal-Logo setzen. Die Seite bekommt ein Ersatz-Objekt, das
  //    sich wie eine Notification verhaelt: onclick/addEventListener('click')
  //    feuern, wenn der Nutzer die Meldung anklickt (WhatsApp oeffnet dann den
  //    Chat), close() nimmt sie wieder weg.
  const O = window.Notification;
  const notes = {};
  const feuer = (note, typ) => {
    const ev = new Event(typ);
    try { if (typeof note['on' + typ] === 'function') note['on' + typ].call(note, ev); } catch (e) {}
    try { note.dispatchEvent(ev); } catch (e) {}
  };
  document.addEventListener('verti-noteclick', () => {
    const id = document.documentElement && document.documentElement.getAttribute('data-verti-noteclick');
    if (id && notes[id]) feuer(notes[id], 'click');
  });
  if (O && !O.__vertiPatched) {
    function V(title, opts) {
      if (isMuted()) {
        return { close() {}, addEventListener() {}, removeEventListener() {}, onclick: null }; // stumm
      }
      signal('notify');
      const o = opts || {};
      const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const et = new EventTarget();
      const note = Object.create(O.prototype); // instanceof Notification bleibt wahr
      const def = (k, v) => Object.defineProperty(note, k, { value: v, writable: true, configurable: true, enumerable: true });
      def('title', String(title == null ? '' : title));
      def('body', String(o.body || ''));
      def('tag', String(o.tag || ''));
      def('icon', o.icon || '');
      def('data', o.data === undefined ? null : o.data);
      def('silent', !!o.silent);
      for (const k of ['onclick', 'onclose', 'onshow', 'onerror']) def(k, null);
      def('addEventListener', (t, f, x) => et.addEventListener(t, f, x));
      def('removeEventListener', (t, f, x) => et.removeEventListener(t, f, x));
      def('dispatchEvent', (ev) => et.dispatchEvent(ev));
      def('close', () => { if (notes[id]) { delete notes[id]; signal('closenote', id); feuer(note, 'close'); } });
      notes[id] = note;
      signal('shownote', JSON.stringify({ id: id, title: note.title, body: note.body, tag: note.tag, silent: note.silent }));
      setTimeout(() => feuer(note, 'show'), 0);
      return note;
    }
    V.prototype = O.prototype; // instanceof Notification bleibt wahr
    V.__vertiPatched = true;
    V.requestPermission = function () { return O.requestPermission.apply(O, arguments); };
    Object.defineProperty(V, 'permission', { get: function () { return O.permission; } });
    Object.defineProperty(V, 'maxActions', { get: function () { return O.maxActions; } });
    try { window.Notification = V; } catch (e) {}
  }
  // 2. showNotification aus der Seite heraus (Service-Worker-Registrierung)
  const SWR = window.ServiceWorkerRegistration;
  if (O && SWR && SWR.prototype && !SWR.prototype.__vertiPatched) {
    SWR.prototype.__vertiPatched = true;
    SWR.prototype.showNotification = function (title, opts) {
      if (isMuted()) return Promise.resolve();
      try {
        const o = Object.assign({}, opts);
        delete o.actions;
        new window.Notification(title, o); // läuft über V: zählt + Klick-Relais
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    };
  }
  // 4. Eigene Toene der Seite (Cindy, gemeldet am 22.10.2026):
  //    WhatsApp spielt seinen Nachrichtenton SELBST in der Seite ab, nicht ueber
  //    eine Mitteilung - der Stumm-Schalter blockte nur Mitteilung und Badge, der
  //    Ton kam trotzdem. Stumm geschaltete Apps duerfen deshalb keinen Ton von
  //    sich aus spielen, solange sie nicht zu sehen sind (document.hidden) und
  //    keine frische Nutzer-Geste vorliegt. Selbst angeklickte Sprachnachrichten
  //    und alles in der sichtbaren App laufen normal.
  try {
    const stillHalten = () => isMuted() && document.hidden && !(navigator.userActivation && navigator.userActivation.isActive);
    const MP = HTMLMediaElement.prototype, mPlay = MP.play;
    MP.play = function () {
      if (stillHalten() && !this.muted && this.volume > 0) return Promise.resolve();
      return mPlay.apply(this, arguments);
    };
    // AudioBufferSourceNode hat ein EIGENES start() und lief an der Basisklasse
    // vorbei (so kam Cindys WhatsApp-Ton durch, 11.11.2026). Die eigentliche
    // Sperre sitzt seitdem in main.js (setAudioMuted), das hier ist nur Zusatz.
    for (const K of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
      const SP = K && K.prototype;
      if (!SP || !Object.prototype.hasOwnProperty.call(SP, 'start')) continue;
      const sStart = SP.start;
      SP.start = function () { if (stillHalten()) return; return sStart.apply(this, arguments); };
    }
  } catch (e) {}
  // 3. Favico.js: Konstruktor abfangen, badge()/reset() der Instanz umhüllen
  let Favico;
  const wrapInstance = (inst) => {
    if (!inst || typeof inst.badge !== 'function' || inst.__vertiWrapped) return inst;
    const badge = inst.badge, reset = inst.reset;
    inst.badge = function (n) {
      const c = typeof n === 'number' ? n : parseInt(n, 10);
      // Nur echte Zahlen ergeben ein Badge. Ein nicht-numerischer Wert ist ein
      // reiner Favicon-PUNKT ohne Zähler (Stackfield setzt so einen Punkt auch
      // ohne echtes Ungelesenes) → 0, sonst erscheint eine Phantom-1.
      signal('badge', Number.isFinite(c) ? Math.max(0, Math.round(c)) : 0);
      return badge.apply(this, arguments);
    };
    if (typeof reset === 'function') {
      inst.reset = function () { signal('badge', 0); return reset.apply(this, arguments); };
    }
    inst.__vertiWrapped = true;
    return inst;
  };
  try {
    Object.defineProperty(window, 'Favico', {
      configurable: true, enumerable: true,
      get: function () { return Favico; },
      set: function (v) {
        Favico = typeof v === 'function' ? function () { return wrapInstance(new v(...arguments)); } : v;
      },
    });
  } catch (e) {}
  // 5. Badging-API (navigator.setAppBadge / clearAppBadge), 11.11.2026:
  //    Telegram (beide Web-Fassungen, im Quellcode nachgelesen) schreibt seine
  //    Ungelesen-Zahl NICHT in den Titel, sondern meldet sie so an den
  //    Browser. Verti hoerte darauf nicht, deshalb nie eine Zahl an Telegram.
  //    Gilt fuer jede App, die diesen Weg nutzt. setAppBadge() ohne Zahl ist
  //    ein reiner Hinweis-Punkt -> als 1 gezaehlt.
  try {
    const N = Navigator.prototype;
    N.setAppBadge = function (n) {
      const c = n === undefined ? 1 : Number(n);
      signal('badge', Number.isFinite(c) ? Math.max(0, Math.round(c)) : 0);
      return Promise.resolve();
    };
    N.clearAppBadge = function () { signal('badge', 0); return Promise.resolve(); };
  } catch (e) {}
  // 6. Zaehler direkt aus der Seite lesen (Freddys Wunsch 11.11.2026: die
  //    Zahl wie bei WhatsApp bei ALLEN Kommunikations-Apps). Viele Apps
  //    schreiben nichts in den Titel, zeigen ihre Ungelesenen aber als kleine
  //    Zaehler in der eigenen Seitenleiste. Die Stellen stammen aus den
  //    Ferdium-Rezepten (github.com/ferdium/ferdium-recipes, MIT-Lizenz), die
  //    seit Jahren fuer genau diesen Zweck gepflegt werden. Aendert eine App
  //    ihre Seite, liefert ihr Rezept 0 - Titel, Badging-API und gezaehlte
  //    Meldungen greifen dann weiter (main.js nimmt jeweils die groesste Zahl).
  try {
    const zahl = (t) => { const n = parseInt(String(t || '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
    const summe = (sel, wert) => { let n = 0; for (const el of document.querySelectorAll(sel)) n += zahl(wert ? wert(el) : el.textContent); return n; };
    const REZEPTE = {
      'web.telegram.org': () => location.pathname.startsWith('/k')
        ? summe('.rp:not(.is-muted) .dialog-subtitle-badge')
        : summe('.chat-list .ListItem .ChatBadge.unread:not(.muted)'),
      'app.slack.com': () => summe('.p-channel_sidebar__channel--unread:not(.p-channel_sidebar__channel--muted) .p-channel_sidebar__badge'),
      'discord.com': () => summe('[class*="lowerBadge_"] [class*="numberBadge_"]'),
      'teams.microsoft.com': () => summe('.fui-Badge') || summe('.activity-badge.dot-activity-badge .activity-badge'),
      'teams.cloud.microsoft': () => summe('.fui-Badge'),
      'teams.live.com': () => summe('.fui-Badge'),
      'chat.google.com': () => summe('div[data-section-type="1"] div.TeR7uc') + summe('div[data-section-type="2"] div.TeR7uc'),
      'outlook.office.com': () => {
        const ordner = document.querySelector('div[role=tree] > div:nth-of-type(2)');
        if (!ordner) return summe("span[title*='Inbox'] + div > span, span[title*='Posteingang'] + div > span");
        let n = 0; for (const sr of ordner.querySelectorAll('span.screenReaderOnly')) if (sr.previousSibling) n += zahl(sr.previousSibling.textContent);
        return n;
      },
      'outlook.live.com': () => REZEPTE['outlook.office.com'](),
      'mail.proton.me': () => { let n = 0; for (const el of document.querySelectorAll('[data-testid="navigation-link:inbox"] [data-testid="navigation-link:unread-count"]')) n = Math.max(n, zahl(el.textContent)); return n; },
      'web.webex.com': () => zahl((document.querySelector('.navigation-list-item--badgeCount, .navigation-list-item--badgeCount-minimized') || {}).textContent),
      'www.linkedin.com': () => zahl((document.querySelector('.nav-item--messaging .nav-item__badge-count') || {}).textContent),
      'www.instagram.com': () => zahl((document.querySelector('a[href^="/direct/inbox"] span') || {}).textContent),
      'www.threads.net': () => zahl((document.querySelector('a[href^="/direct/inbox"] span') || {}).textContent),
      'x.com': () => zahl((document.querySelector('[data-testid=AppTabBar_Notifications_Link] div div div') || {}).textContent)
        + zahl((document.querySelector('[data-testid=AppTabBar_DirectMessage_Link] div div div') || {}).textContent),
      'www.xing.com': () => zahl((document.querySelector('#unread-conversations') || {}).textContent),
    };
    const rezept = window === window.top && REZEPTE[location.host];
    if (rezept) {
      let zuletzt = -1;
      setInterval(() => {
        let n = 0;
        try { n = Math.min(999, Math.max(0, rezept() || 0)); } catch (e) {}
        if (n !== zuletzt) { zuletzt = n; signal('domcount', n); }
      }, 2000);
    }
  } catch (e) {}
})();`;

// Beide Skripte laufen per webFrame.executeJavaScript in der Seiten-Welt: das
// greift noch vor dem ersten Skript der Seite (gemessen) und unterliegt —
// anders als ein eingefügtes <script>-Element — nicht der Content-Security-
// Policy der Seite. Googles Anmeldeseite (script-src 'nonce-…') hatte die
// frühere DOM-Injektion still verworfen: JS-Kennung blieb Chrome, Header
// sagten Firefox → „Dieser Browser oder diese App ist unter Umständen nicht
// sicher". Apps mit strenger CSP hätte es genauso beim Badge erwischt.
// ---------- Autoplay-Riegel (Freddys Wunsch 24.08.2026) ----------
// YouTube & Co. starten Videos beim Laden von selbst - auch nach dem
// Neuoeffnen von Verti (erschreckt beim stummen Wiederherstellen der Views).
// Electrons globale autoplay-policy haelt YouTube nicht zuverlaessig auf.
// Deshalb hier ein harter Riegel in der Seiten-Welt: Medien mit TON duerfen
// erst abspielen, wenn die Seite eine echte Nutzer-Geste hatte
// (navigator.userActivation.hasBeenActive). Nach dem ersten Klick spielt alles
// normal; stumme Vorschauen (GIFs o. AE.) bleiben immer erlaubt.
const autoplayGuard = `(() => {
  const beforeGesture = () => { const ua = navigator.userActivation; return ua ? ua.hasBeenActive === false : false; };
  const audible = (m) => m && !m.muted && m.volume > 0;
  try {
    const proto = HTMLMediaElement.prototype, origPlay = proto.play;
    proto.play = function () {
      if (beforeGesture() && audible(this)) {
        try { this.pause(); } catch (e) {}
        return Promise.reject(new DOMException('Autoplay von Verti blockiert', 'NotAllowedError'));
      }
      return origPlay.apply(this, arguments);
    };
    document.addEventListener('play', (e) => {
      if (beforeGesture() && audible(e.target)) { try { e.target.pause(); } catch (err) {} }
    }, true);
  } catch (e) {}
})();`;

// WICHTIG (28.08.2026, forensisch belegt): Auf Googles Anmeldeseiten läuft NUR
// die Tarnung — KEINE Brücke, KEIN Autoplay-Riegel. Grund: Diese Skripte
// überschreiben Standard-Funktionen der Seite (window.Notification,
// ServiceWorkerRegistration.showNotification, HTMLMediaElement.prototype.play,
// window.Favico). Genau das wertet Googles Anmelde-Prüfung als manipulierten
// Browser und lehnt den Login ab („nicht sicher", rrk=46) — die Tarnung selbst
// ist dann egal. Nachweis: Am 22.08.2026 um 10:45 UTC gelang eine frische
// Anmeldung mit echtem Konto (Cookie-Zeitstempel im Profil); zu dem Zeitpunkt
// enthielt dieses Preload NUR die Tarnung. Erst danach kamen Favico-Hook
// (22.08. 14:03 UTC), Autoplay-Riegel (24.08.) und Stumm-Schaltung dazu — und
// seitdem scheitern frische Anmeldungen. Auf der Anmeldeseite braucht es
// Badges/Meldungen/Autoplay ohnehin nicht.
const pageScript = ON_GOOGLE_AUTH ? uaDisguise : mutedInit + autoplayGuard + bridge;

function injectViaDom() {
  // Notnagel ohne webFrame: <script> bei document-start (feuert, sobald <html>
  // existiert, vor jedem Seitenskript) – auf CSP-Seiten wirkungslos.
  process.once('document-start', () => {
    try {
      const s = document.createElement('script');
      s.textContent = pageScript;
      document.documentElement.appendChild(s);
      s.remove();
    } catch (e) {}
  });
}
try {
  webFrame.executeJavaScript(pageScript).catch(() => {});
} catch (e) {
  injectViaDom();
}

// Signale der Seiten-Welt an main.js weiterreichen
const readValue = (name) => {
  const root = document.documentElement;
  const v = root ? Number(root.getAttribute('data-verti-' + name)) : NaN;
  return Number.isFinite(v) ? v : 0;
};
document.addEventListener('verti-notify', () => ipcRenderer.send('verti-app-notify'));
document.addEventListener('verti-notify-click', () => ipcRenderer.send('verti-app-notify-click'));
// Meldungen zeigt main.js an (mit Kanalname und -Logo), Klicks kommen zurueck
document.addEventListener('verti-shownote', () => {
  try { ipcRenderer.send('verti-app-shownote', JSON.parse(document.documentElement.getAttribute('data-verti-shownote'))); } catch (e) {}
});
document.addEventListener('verti-closenote', () => {
  try { ipcRenderer.send('verti-app-closenote', document.documentElement.getAttribute('data-verti-closenote')); } catch (e) {}
});
ipcRenderer.on('verti-note-click', (e, id) => {
  try {
    document.documentElement.setAttribute('data-verti-noteclick', String(id));
    document.dispatchEvent(new Event('verti-noteclick'));
  } catch (err) {}
});
document.addEventListener('verti-badge', () => ipcRenderer.send('verti-app-badge', readValue('badge')));
document.addEventListener('verti-domcount', () => ipcRenderer.send('verti-app-domcount', readValue('domcount')));
// Stumm-Status live aus main.js (Einstellungen umgeschaltet)
ipcRenderer.on('verti-muted', (e, on) => {
  try { document.documentElement.setAttribute('data-verti-muted', on ? '1' : '0'); } catch (e) {}
});
