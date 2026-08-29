// ChatGPT-Sonde: findet heraus, WARUM ChatGPT in Verti irgendwann keine
// Nachricht mehr abschickt (Enter tut nichts, der Text bleibt im Feld stehen).
//
// Die Sonde baut Vertis View-Setup exakt nach (persist:apps-Partition,
// view-preload.js, Chrome-UA, spellcheck) und schreibt ALLES mit, was beim
// Hängen interessant ist: Konsolenfehler der Seite, unbehandelte Promise-
// Fehler, fehlgeschlagene Netzwerk-Anfragen, eingefrorene Renderer.
//
// DER ENTSCHEIDENDE TEST ist ein A/B:
//   npx electron scripts/chatgpt-probe.js              → MIT Vertis Preload
//   NO_PRELOAD=1 npx electron scripts/chatgpt-probe.js → OHNE Preload
// Hängt es nur in der ersten Variante, ist unser Preload die Ursache.
//
//   KEEP_PROFILE=1  Profil behalten (dann nur einmal bei ChatGPT anmelden)
//   PROFILE=name    eigener Profilname (Standard: je nach Preload-Variante)
//
// Bedienung: Fenster geht auf, ganz normal mit ChatGPT arbeiten, bis es hängt.
// Sobald Enter nichts mehr tut, im Terminal Strg+C drücken — die Sonde legt
// dann eine Zusammenfassung ab. Log: /tmp/verti-chatgpt-probe/<variante>.log
//
// Eigene Profile: die Sonde kollidiert NICHT mit dem laufenden Verti.
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const WITH_PRELOAD = !process.env.NO_PRELOAD;
const VARIANT = WITH_PRELOAD ? 'mit-preload' : 'ohne-preload';
const workDir = path.join(os.tmpdir(), 'verti-chatgpt-probe');
const profile = path.join(workDir, 'profil-' + (process.env.PROFILE || VARIANT));
fs.mkdirSync(workDir, { recursive: true });
if (!process.env.KEEP_PROFILE) fs.rmSync(profile, { recursive: true, force: true });
app.setPath('userData', profile);

const logFile = path.join(workDir, VARIANT + '.log');
fs.writeFileSync(logFile, '');
const counts = { fehler: 0, rejection: 0, netzfehler: 0, warnung: 0 };
function log(...a) {
  const line = new Date().toISOString().slice(11, 23) + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n'); } catch (e) {}
}

const isMac = process.platform === 'darwin';
// Exakt wie chromeUserAgent() in main.js
const chromeUA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;

app.whenReady().then(async () => {
  app.userAgentFallback = chromeUA;
  const ses = session.fromPartition('persist:apps');
  ses.setUserAgent(chromeUA);

  log('=== ChatGPT-Sonde,', VARIANT, '===');
  log('Electron', process.versions.electron, '| Chromium', process.versions.chrome);
  log('Profil:', profile);
  log('Log:', logFile);
  log('');
  log('Jetzt ganz normal mit ChatGPT arbeiten, bis Enter nichts mehr tut.');
  log('Dann im Terminal Strg+C druecken.');
  log('');

  // Fehlgeschlagene Anfragen mitschreiben (verrät Cloudflare-/403-Blockaden)
  ses.webRequest.onErrorOccurred((d) => {
    if (d.resourceType === 'image' || d.resourceType === 'font') return;
    counts.netzfehler++;
    log('NETZFEHLER', d.error, d.resourceType, String(d.url).slice(0, 120));
  });
  ses.webRequest.onCompleted((d) => {
    if (d.statusCode >= 400 && d.resourceType !== 'image') {
      counts.netzfehler++;
      log('HTTP', d.statusCode, d.method || '', d.resourceType, String(d.url).slice(0, 120));
    }
  });

  const win = new BrowserWindow({ width: 1200, height: 900, title: 'ChatGPT-Sonde: ' + VARIANT });
  const webPreferences = { partition: 'persist:apps', spellcheck: true };
  if (WITH_PRELOAD) {
    // Wie viewWebPreferences() in main.js
    const major = 143 + Math.floor((Date.now() - Date.UTC(2025, 9, 14)) / (28 * 864e5));
    const ffUA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64'}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
    webPreferences.preload = path.join(__dirname, '..', 'view-preload.js');
    webPreferences.additionalArguments = ['--verti-firefox-ua=' + ffUA];
  }
  const view = new WebContentsView({ webPreferences });
  win.contentView.addChildView(view);
  const fit = () => {
    const [w, h] = win.getContentSize();
    view.setBounds({ x: 0, y: 0, width: w, height: h });
  };
  fit();
  win.on('resize', fit);

  const wc = view.webContents;
  wc.setUserAgent(chromeUA);

  // Konsole der Seite: Fehler sind das Wichtigste
  // Electron 43 liefert ein Event-Objekt (level als Wort); die alte Signatur
  // (level als Zahl) ist abgekündigt. Beide Formen abfangen, damit nichts fehlt.
  // Genau EIN Parameter: daran erkennt Electron 43 die neue Signatur
  // (mit mehreren Parametern warnt es bei jedem Start über die alte).
  wc.on('console-message', (ev) => {
    const level = ev && ev.level;
    const isErr = level === 'error';
    if (!isErr && level !== 'warning') return;
    const message = String((ev && ev.message) || '');
    if (/Electron Security Warning/.test(message)) return; // Eigenrauschen
    counts[isErr ? 'fehler' : 'warnung']++;
    const src = (ev && ev.sourceId) ? ' (' + String(ev.sourceId).slice(-60) + ':' + ev.lineNumber + ')' : '';
    log(isErr ? 'SEITENFEHLER' : 'WARNUNG', message.slice(0, 300) + src);
  });
  wc.on('render-process-gone', (e, d) => log('RENDERER WEG:', d.reason, d.exitCode));
  wc.on('unresponsive', () => log('*** SEITE REAGIERT NICHT MEHR (unresponsive) ***'));
  wc.on('responsive', () => log('Seite reagiert wieder'));
  wc.on('did-fail-load', (e, code, desc, url) => log('LADEN FEHLGESCHLAGEN', code, desc, String(url).slice(0, 100)));

  // In der Seiten-Welt: unbehandelte Promise-Fehler und harte Fehler melden.
  // Genau die sind der Verdacht — ein unbehandelter Fehler kann Reacts Baum in
  // einen kaputten Zustand bringen, sodass der Senden-Knopf nicht mehr feuert.
  wc.on('dom-ready', () => {
    wc.executeJavaScript(`(() => {
      if (window.__probeArmed) return; window.__probeArmed = true;
      addEventListener('unhandledrejection', (e) => {
        console.error('[SONDE] Unbehandelte Promise-Ablehnung:', (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason));
      });
      addEventListener('error', (e) => {
        console.error('[SONDE] Fehler:', e.message, '@', e.filename + ':' + e.lineno);
      });
      // Enter im Eingabefeld beobachten: kommt die Taste ueberhaupt an, und
      // verschluckt sie jemand (defaultPrevented) bzw. haengt der IME-Zustand?
      addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        setTimeout(() => {
          console.warn('[SONDE] Enter gedrueckt | isComposing=' + e.isComposing +
            ' | verhindert=' + e.defaultPrevented +
            ' | ziel=' + (e.target && (e.target.tagName + (e.target.id ? '#' + e.target.id : ''))) +
            ' | textLaenge=' + ((e.target && (e.target.value !== undefined ? e.target.value.length : (e.target.textContent || '').length)) || 0));
        }, 250);
      }, true);
    })();`).catch(() => {});
  });

  await wc.loadURL('https://chatgpt.com/').catch((e) => log('Laden fehlgeschlagen:', e.message));
  log('ChatGPT geladen. Viel Erfolg beim Reproduzieren.');
});

function zusammenfassung() {
  log('');
  log('=== Zusammenfassung (' + VARIANT + ') ===');
  log('Seitenfehler:', counts.fehler, '| unbehandelte Ablehnungen: siehe [SONDE]-Zeilen');
  log('Warnungen:', counts.warnung, '| Netz-/HTTP-Fehler:', counts.netzfehler);
  log('Vollstaendiges Log:', logFile);
}
app.on('before-quit', zusammenfassung);
process.on('SIGINT', () => { zusammenfassung(); app.exit(0); });
app.on('window-all-closed', () => app.quit());
