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

// Läuft in jeder App-View. Ziel: jede Web-Benachrichtigung einer App
// (z.B. Stackfield-@-Mention, Slack-DM) an den Hauptprozess melden, damit
// die Sidebar auch bei Apps ein Badge zeigt, die NICHTS in den Seitentitel
// schreiben. Die native Mac-Mitteilung selbst zeigt Electron weiterhin.
//
// window.Notification lebt in der Seiten-Welt (main world), das Preload in
// der isolierten Welt. Brücke: ein in die Seiten-Welt gegebenes Skript patcht
// dort Notification und feuert ein CustomEvent auf document; beide Welten
// teilen sich denselben document-Knoten, also empfängt das Preload das Event.
const bridge = `(() => {
  const O = window.Notification;
  if (!O || O.__vertiPatched) return;
  function V(title, opts) {
    try { document.dispatchEvent(new CustomEvent('verti-app-notify')); } catch (e) {}
    return new O(title, opts);
  }
  V.__vertiPatched = true;
  V.requestPermission = function () { return O.requestPermission.apply(O, arguments); };
  Object.defineProperty(V, 'permission', { get: function () { return O.permission; } });
  Object.defineProperty(V, 'maxActions', { get: function () { return O.maxActions; } });
  try { window.Notification = V; } catch (e) {}
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

document.addEventListener('verti-app-notify', () => {
  ipcRenderer.send('verti-app-notify');
});
