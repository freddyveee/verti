// Bruecke fuer den Update-Dialog: stellt genau das `vertiUpdate`-API aus
// update-preload.js bereit, nur auf Chrome-APIs statt auf IPC.
// Dadurch bleibt update.html im Projektwurzel-Verzeichnis unveraendert.
(() => {
  const empfaenger = [];

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.ereignis === 'update-zustand') {
      for (const cb of empfaenger) {
        try { cb(msg.wert[0]); } catch (e) { console.warn('[verti-update]', e); }
      }
    }
  });

  window.vertiUpdate = {
    onState: (cb) => {
      empfaenger.push(cb);
      // Den aktuellen Stand sofort nachreichen: der Dienst hat ihn womoeglich
      // schon gemeldet, bevor dieses Fenster ueberhaupt zuhoerte.
      chrome.runtime.sendMessage({ ruf: 'update-zustand' }, (a) => {
        if (!chrome.runtime.lastError && a && a.wert) cb(a.wert);
      });
    },
    action: (name) => { chrome.runtime.sendMessage({ ruf: 'update-aktion', args: [name] }); },
  };
})();
