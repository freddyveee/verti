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
  const O = window.Notification;
  if (O && !O.__vertiPatched) {
    function V(title, opts) {
      if (isMuted()) {
        return { close() {}, addEventListener() {}, removeEventListener() {}, onclick: null }; // stumm
      }
      signal('notify');
      const n = new O(title, opts);
      try { n.addEventListener('click', () => signal('notify-click')); } catch (e) {}
      return n;
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
document.addEventListener('verti-badge', () => ipcRenderer.send('verti-app-badge', readValue('badge')));
// Stumm-Status live aus main.js (Einstellungen umgeschaltet)
ipcRenderer.on('verti-muted', (e, on) => {
  try { document.documentElement.setAttribute('data-verti-muted', on ? '1' : '0'); } catch (e) {}
});
