// Entscheidet, was passiert, wenn eine Seite ein Fenster oeffnen will.
//
// Bewusst in einer EIGENEN Datei ohne Electron-Abhaengigkeit: dadurch laesst
// sich die Regel ohne laufende App durchtesten (scripts/test-window-policy.js).
// Genau hier steckte der Canva-Fehler (29.08.2026) - ein Tab-Wunsch wurde als
// Fenster-Wunsch behandelt und riss ein zweites Fenster auf.

// Will die Seite WIRKLICH ein eigenes Fenster, oder nur "mach das woanders auf"?
// Chromium meldet echte Skript-Popups als 'new-window'; ein target=_blank-Link
// oder window.open OHNE Fenstermasse kommt als 'foreground-tab'/'default' an -
// das ist ein Tab-Wunsch, kein Fenster-Wunsch.
// Die vier Ja-Faelle MUESSEN ein echtes Fenster bekommen, sonst gehen
// OAuth-Flows kaputt (sie brauchen das zurueckgegebene Fensterobjekt, reden per
// window.opener mit der Ursprungsseite und schliessen sich selbst per
// window.close()) bzw. ginge bei einem POST der Formularinhalt verloren.
function wantsRealWindow({ url, disposition, features, postBody } = {}) {
  if (!url || url === 'about:blank') return true;  // OAuth startet oft leer
  if (disposition === 'new-window') return true;   // echtes Skript-Popup
  if (features && String(features).trim()) return true; // window.open mit Massen
  if (postBody) return true;                       // <form target=_blank>
  return false;
}

// deps: { isAuthUrl, isInstalledAppUrl, popupWindowOptions, browserOpenExternal, log }
// Gemeinsame Regel fuer App-Views UND deren Popups: Auth bleibt in der App,
// App-Popouts bleiben in der App, alles andere geht in den Browser.
function makeWindowOpenPolicy(deps) {
  const { isAuthUrl, isInstalledAppUrl, popupWindowOptions, browserOpenExternal, log } = deps;
  return function windowOpenPolicy(openerContents) {
    return (details) => {
      const { url, disposition } = details;
      if (log) {
        log('[fenster]', disposition, 'features=' + JSON.stringify(details.features || ''),
          'post=' + !!details.postBody, String(url).slice(0, 90));
      }
      if (isAuthUrl(url)) {
        // Skript-Popups melden sich beim Opener zurueck und schliessen sich
        // selbst -> kleines Fenster. Normale Login-Links (target=_blank)
        // dagegen in der Ansicht selbst laden, dort geht es danach weiter.
        if (wantsRealWindow(details)) {
          return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(520, 680) };
        }
        openerContents.loadURL(url);
        return { action: 'deny' };
      }
      // Neue Fenster/Tabs zur SELBEN App (gleicher Ursprung wie der Opener)
      // oder zu einer anderen installierten App bleiben IN Verti statt im
      // externen Browser. Ein reiner Tab-Wunsch wird dabei IN der bestehenden
      // Ansicht geoeffnet (Canva "Im Editor oeffnen" bekam sonst ein zweites
      // Fenster); nur echte Skript-Popups erhalten ein eigenes Fenster (z.B.
      // ChatGPT "neue Unterhaltung", die per window.open mit Massen aufgeht).
      let sameApp = false;
      try { sameApp = !!url && new URL(url).origin === new URL(openerContents.getURL()).origin; } catch (e) {}
      if (sameApp) {
        if (wantsRealWindow(details)) {
          return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(1100, 800) };
        }
        openerContents.loadURL(url);
        return { action: 'deny' };
      }
      if (disposition === 'new-window' && isInstalledAppUrl(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(1100, 800) };
      }
      browserOpenExternal(url);
      return { action: 'deny' };
    };
  };
}

module.exports = { wantsRealWindow, makeWindowOpenPolicy };
