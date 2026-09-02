// Prueft das fertige Inhaltsskript: steht eine Zahl im Titel, muss sie im
// Favicon landen - und beim Lesen wieder verschwinden.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const BIN = '/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti';
const EXT = '/Users/freddy/Projekte/verti/chromium/extension';
const PORT = 9697;
const PROFIL = '/tmp/verti-badge2';
fs.rmSync(PROFIL, { recursive: true, force: true });

http.createServer((q, r) => {
  if (q.url === '/icon.png') {
    r.writeHead(200, { 'Content-Type': 'image/png' });
    r.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    return;
  }
  r.writeHead(200, { 'Content-Type': 'text/html' });
  r.end('<title>(7) WhatsApp</title><link rel="icon" href="/icon.png">Testseite');
}).listen(9698, '127.0.0.1');

const kind = spawn(BIN, [
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFIL,
  '--load-extension=' + EXT, '--disable-extensions-except=' + EXT,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const ziele = () => fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());

async function verbinde(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map(); let id = 0;
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  return { ws, cdp: (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
}

(async () => {
  let swZiel = null;
  for (let i = 0; i < 60 && !swZiel; i++) {
    await warte(500);
    try { swZiel = (await ziele()).find((t) => t.url.endsWith('sw.js')); } catch (e) {}
  }
  if (!swZiel) { console.log('  Dienst nicht erreichbar'); kind.kill(); process.exit(1); }
  const sw = await verbinde(swZiel.webSocketDebuggerUrl);

  // Testseite als App-Tab eintragen - so, als waere sie ueber die Sidebar
  // geoeffnet worden. "whatsapp" steht in titleBadge, die Zahl darf also
  // ueberall im Titel stehen.
  const auf = await sw.cdp('Runtime.evaluate', {
    expression: `(async () => {
      const tab = await chrome.tabs.create({ url: 'http://127.0.0.1:9698/', active: true, pinned: true });
      const d = (await chrome.storage.local.get('verti')).verti || {};
      d.tabs = Object.assign({}, d.tabs, { whatsapp: tab.id });
      await chrome.storage.local.set({ verti: d });
      await chrome.tabs.reload(tab.id);   // damit das Inhaltsskript die Regel neu holt
      return tab.id;
    })()`, awaitPromise: true, returnByValue: true,
  });
  const tabId = auf.result?.result?.value;
  if (!tabId) { console.log('  Tab konnte nicht angelegt werden: ' + JSON.stringify(auf.result).slice(0, 200)); kind.kill(); process.exit(1); }
  await warte(5000);

  const frage = `(async () => { const t = await chrome.tabs.get(${tabId}); return (t.favIconUrl || 'keins').slice(0, 30) + ' | ' + t.title; })()`;
  const mit = await sw.cdp('Runtime.evaluate', { expression: frage, awaitPromise: true, returnByValue: true });
  console.log('  Titel "(7) WhatsApp": ' + mit.result.result.value);

  // Jetzt Titel auf "gelesen" stellen - das Badge muss verschwinden
  const seite = (await ziele()).find((t) => t.url.includes('9698'));
  const p = await verbinde(seite.webSocketDebuggerUrl);
  await p.cdp('Runtime.evaluate', { expression: `document.title = 'WhatsApp'` });
  await warte(4000);
  const ohne = await sw.cdp('Runtime.evaluate', { expression: frage, awaitPromise: true, returnByValue: true });
  console.log('  Titel "WhatsApp":     ' + ohne.result.result.value);

  const a = String(mit.result.result.value), b = String(ohne.result.result.value);
  console.log('\n  ' + (a.startsWith('data:image') && !b.startsWith('data:image')
    ? 'Zahl erscheint im Favicon und verschwindet beim Lesen wieder.'
    : a.startsWith('data:image') ? 'Zahl erscheint, wird aber beim Lesen NICHT zurueckgesetzt.'
    : 'Zahl erscheint NICHT im Favicon.'));

  p.ws.close(); sw.ws.close(); kind.kill();
  await warte(400);
  process.exit(0);
})();
