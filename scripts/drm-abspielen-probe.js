// Der eigentliche Beweis: laedt einen echten Widevine-geschuetzten Stream,
// holt eine Lizenz vom Lizenzserver und schaut, ob die Wiedergabe laeuft.
// Verwendet Googles oeffentliche Shaka-Testinhalte (kein Konto noetig).
const { spawn } = require('child_process');
const http = require('http');

const bin = process.argv[2];
const profil = process.argv[3] || '/tmp/verti-cdm-probe';
const PORT = 9672;

const SEITE = `<!doctype html><meta charset="utf-8"><title>drm</title>
<video id="v" autoplay muted></video>
<script src="https://cdn.jsdelivr.net/npm/shaka-player@4.11.3/dist/shaka-player.compiled.js"></script>
<script>
window.ergebnis = { schritt: 'start' };
(async () => {
  try {
    shaka.polyfill.installAll();
    window.ergebnis.schritt = 'shaka geladen';
    const p = new shaka.Player();
    await p.attach(document.getElementById('v'));
    p.configure({ drm: { servers: { 'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth' } } });
    p.addEventListener('error', (e) => { window.ergebnis.fehler = 'Shaka ' + e.detail.code + ' ' + (e.detail.message || ''); });
    window.ergebnis.schritt = 'lade Manifest';
    await p.load('https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/dash.mpd');
    window.ergebnis.schritt = 'geladen, warte auf Wiedergabe';
    window.ergebnis.drm = p.drmInfo() ? (p.drmInfo().keySystem + ', Robustheit: ' + (p.drmInfo().audioRobustness || '-')) : 'keine DRM-Info';
  } catch (e) {
    window.ergebnis.fehler = (e && (e.code ? 'Shaka-Code ' + e.code : e.message)) || String(e);
  }
})();
</script>`;

http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(SEITE); }).listen(9673, '127.0.0.1');

const kind = spawn(bin, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ziel = null;
  for (let i = 0; i < 40 && !ziel; i++) { await warte(500); try { ziel = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json())).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) {} }
  if (!ziel) { console.log('  kein DevTools-Ziel'); kind.kill(); process.exit(1); }
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map(); let id = 0;
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  const cdp = (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Page.enable', {});
  await cdp('Page.navigate', { url: 'http://127.0.0.1:9673/' });

  let letzte = null;
  for (let i = 0; i < 12; i++) {
    await warte(2500);
    const a = await cdp('Runtime.evaluate', { expression: `JSON.stringify(Object.assign({}, window.ergebnis || {}, { zeit: (document.getElementById('v')||{}).currentTime, schluessel: (window.ergebnis && window.ergebnis.drm) || '-' }))`, returnByValue: true });
    try { letzte = JSON.parse(a.result.result.value); } catch (e) { continue; }
    if (letzte.fehler || (letzte.zeit > 0.3)) break;
  }
  console.log('  Schritt:        ' + (letzte?.schritt || '?'));
  console.log('  DRM:            ' + (letzte?.drm || '-'));
  console.log('  Abspielzeit:    ' + (letzte?.zeit ?? '-') + ' s');
  console.log('  ' + (letzte?.fehler ? 'FEHLER:         ' + letzte.fehler
    : (letzte?.zeit > 0.3 ? 'ERGEBNIS:       geschuetztes Video laeuft - Widevine entschluesselt wirklich'
                          : 'ERGEBNIS:       keine Wiedergabe, aber auch kein Fehler')));
  ws.close(); kind.kill(); await warte(400); process.exit(0);
})();
