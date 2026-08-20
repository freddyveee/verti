const { ipcRenderer } = require('electron');

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
    s.textContent = bridge;
    target.appendChild(s);
    s.remove();
  } catch (e) {}
}

// So früh wie möglich, bevor die App ihre eigene Notification-Referenz greift
inject();

document.addEventListener('verti-app-notify', () => {
  ipcRenderer.send('verti-app-notify');
});
