const { ipcRenderer } = require('electron');

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
const FIREFOX_UA = process.platform === 'darwin'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';

const uaDisguise = GOOGLE_AUTH_HOSTS.includes(location.host) ? `(() => {
  const ua = ${JSON.stringify(FIREFOX_UA)};
  const def = (prop, value) => {
    try { Object.defineProperty(Navigator.prototype, prop, { get: () => value, configurable: true }); } catch (e) {}
  };
  def('userAgent', ua);
  def('appVersion', ua.replace(/^Mozilla\\//, ''));
  def('vendor', '');           // Firefox meldet einen leeren vendor
  def('userAgentData', undefined); // Client Hints kennt Firefox nicht
})();` : '';

// Läuft in jeder App-View. Ziel: jede Web-Benachrichtigung einer App
// (z.B. Stackfield-@-Mention, Slack-DM) an den Hauptprozess melden, damit
// die Sidebar auch bei Apps ein Badge zeigt, die NICHTS in den Seitentitel
// schreiben. Die native Mac-Mitteilung selbst zeigt Electron weiterhin.
//
// window.Notification lebt in der Seiten-Welt (main world), das Preload in
// der isolierten Welt. Brücke: ein ins DOM injiziertes Skript patcht dort
// Notification und feuert ein CustomEvent auf document; beide Welten teilen
// sich denselben document-Knoten, also empfängt das Preload das Event.
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

function inject() {
  const target = document.head || document.documentElement;
  if (!target) {
    // Preload startet vor dem <html>-Knoten – kurz erneut versuchen
    setTimeout(inject, 0);
    return;
  }
  try {
    const s = document.createElement('script');
    s.textContent = uaDisguise + bridge;
    target.appendChild(s);
    s.remove();
  } catch (e) {}
}

// So früh wie möglich, bevor die App ihre eigene Notification-Referenz greift
inject();

document.addEventListener('verti-app-notify', () => {
  ipcRenderer.send('verti-app-notify');
});
