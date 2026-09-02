// Prueft, ob Chromium den Widevine-Entschluessler zur Laufzeit nachlaedt.
// Der CDM ist nicht Teil des Baus - er kommt ueber den Komponenten-Updater.
// Deshalb: App starten, Zeit lassen, chrome://components lesen und EME erneut
// fragen.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const bin = process.argv[2];
const PORT = 9668;
const profil = '/tmp/verti-cdm-probe';
fs.rmSync(profil, { recursive: true, force: true });

http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<title>cdm</title>'); }).listen(9669, '127.0.0.1');

const kind = spawn(bin, [
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profil,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = ''; kind.stderr.on('data', (d) => { stderr += d; });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const EME = `navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]).then(() => 'JA').catch(e => 'nein (' + e.name + ')')`;

(async () => {
  let ziel = null;
  for (let i = 0; i < 40 && !ziel; i++) {
    await warte(500);
    try { ziel = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json())).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) {}
  }
  if (!ziel) { console.log('  kein DevTools-Ziel\n' + stderr.slice(-500)); kind.kill(); process.exit(1); }
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  let id = 0;
  const cdp = (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Page.enable', {});

  // Bis zu 3 Minuten Zeit geben - der Komponenten-Updater fragt nicht sofort
  for (const min of [0.5, 1, 2, 3]) {
    await warte(min === 0.5 ? 30000 : 30000);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:9669/' });
    await warte(2000);
    const a = await cdp('Runtime.evaluate', { expression: EME, awaitPromise: true, returnByValue: true });
    const cdmDir = fs.existsSync(profil + '/WidevineCdm') ? fs.readdirSync(profil + '/WidevineCdm').join(',') : '-';
    console.log(`  nach ${String(min).padStart(3)} min: Widevine ${String(a.result?.result?.value).padEnd(16)} CDM-Ordner im Profil: ${cdmDir}`);
    if (a.result?.result?.value === 'JA') break;
  }

  // chrome://components lesen - dort steht, ob die Komponente ueberhaupt bekannt ist
  await cdp('Page.navigate', { url: 'chrome://components' });
  await warte(3000);
  const c = await cdp('Runtime.evaluate', { expression: `(document.body.innerText.match(/Widevine[^\\n]*\\n[^\\n]*\\n?[^\\n]*/i) || ['Widevine taucht in chrome://components NICHT auf'])[0]`, returnByValue: true });
  console.log('\n  chrome://components sagt:');
  console.log('    ' + String(c.result?.result?.value).replace(/\n/g, '\n    '));

  ws.close(); kind.kill(); await warte(400); process.exit(0);
})();
