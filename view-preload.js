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
// Dieselbe Kennung wie die Header-Tarnung: main.js reicht sie per
// additionalArguments herein (eine Quelle, kein Abgleich zweier Dateien).
const UA_ARG = '--verti-firefox-ua=';
const FIREFOX_UA = (process.argv.find((a) => a.startsWith(UA_ARG)) || '').slice(UA_ARG.length)
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:154.0) Gecko/20100101 Firefox/154.0';

const uaDisguise = GOOGLE_AUTH_HOSTS.includes(location.host) ? `(() => {
  const def = (prop, value) => {
    try { Object.defineProperty(Navigator.prototype, prop, { get: () => value, configurable: true }); } catch (e) {}
  };
  def('userAgent', ${JSON.stringify(FIREFOX_UA)});
  def('appVersion', ${JSON.stringify(process.platform === 'darwin' ? '5.0 (Macintosh)' : '5.0 (Windows)')}); // so knapp meldet es Firefox
  def('vendor', '');           // Firefox meldet einen leeren vendor
  def('userAgentData', undefined); // Client Hints kennt Firefox nicht
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
//     favicon.badge(n) bzw. favicon.reset(); " " heißt „Punkt ohne Zahl" → 1.
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
  // 1. window.Notification
  const O = window.Notification;
  if (O && !O.__vertiPatched) {
    function V(title, opts) {
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
      signal('badge', Number.isFinite(c) ? Math.max(0, Math.round(c)) : 1);
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
function injectViaDom() {
  // Notnagel ohne webFrame: <script> bei document-start (feuert, sobald <html>
  // existiert, vor jedem Seitenskript) – auf CSP-Seiten wirkungslos.
  process.once('document-start', () => {
    try {
      const s = document.createElement('script');
      s.textContent = uaDisguise + bridge;
      document.documentElement.appendChild(s);
      s.remove();
    } catch (e) {}
  });
}
try {
  webFrame.executeJavaScript(uaDisguise + bridge).catch(() => {});
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
