// Startet das selbstgebaute Verti-Chromium mit der Verti-Erweiterung, oeffnet
// die Sidebar, sammelt ALLE Konsolenfehler ein und macht ein Bildschirmfoto.
// Ziel: Oberflaechen-Aenderungen selbst pruefen, nicht "probier mal" sagen.
const { spawn } = require('child_process');
const fs = require('fs');

const BIN = '/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti';
const EXT = '/Users/freddy/Projekte/verti/chromium/extension';
const PORT = 9680;
const PROFIL = '/tmp/verti-ext-test';
const bildArg = process.argv.indexOf('--bild');
const BILD = bildArg > -1 ? process.argv[bildArg + 1] : '/tmp/verti-sidebar.png';

const frisch = process.argv.includes('--frisch');
if (frisch) fs.rmSync(PROFIL, { recursive: true, force: true });

const kind = spawn(BIN, [
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFIL,
  '--load-extension=' + EXT,
  '--disable-extensions-except=' + EXT,
  '--no-first-run', '--no-default-browser-check',
  '--window-size=1400,900',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
kind.stderr.on('data', (d) => { stderr += d; });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function ziele() { return fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json()); }

async function verbinde(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map(); let id = 0; const ereignisse = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); }
    else if (d.method) ereignisse.push(d);
  };
  const cdp = (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, cdp, ereignisse };
}

(async () => {
  // 1. auf den Browser warten
  let liste = null;
  for (let i = 0; i < 40 && !liste; i++) {
    await warte(500);
    try { liste = await ziele(); } catch (e) {}
  }
  if (!liste) { console.log('Browser nicht erreichbar\n' + stderr.slice(-800)); kind.kill(); process.exit(1); }

  // 2. Erweiterung finden - der Hintergrunddienst taucht als eigenes Ziel auf
  let extId = null;
  for (let i = 0; i < 30 && !extId; i++) {
    const l = await ziele();
    const sw = l.find((t) => t.url && t.url.startsWith('chrome-extension://') && t.url.endsWith('sw.js'));
    if (sw) extId = sw.url.split('/')[2];
    else await warte(500);
  }
  if (!extId) {
    console.log('Erweiterung wurde NICHT geladen.');
    console.log((await ziele()).map((t) => '  ' + t.type + ' ' + t.url).join('\n'));
    console.log(stderr.slice(-1200));
    kind.kill(); process.exit(1);
  }
  console.log('Erweiterung geladen, Kennung ' + extId);

  // 3. Fehler des Hintergrunddienstes einsammeln
  const swZiel = (await ziele()).find((t) => t.url.endsWith('sw.js'));
  const sw = await verbinde(swZiel.webSocketDebuggerUrl);
  await sw.cdp('Runtime.enable', {});
  await sw.cdp('Log.enable', {});

  // 4. Sidebar in einem Tab oeffnen (das Seitenpanel laesst sich von aussen
  //    nicht anklicken; der Inhalt ist derselbe)
  const seite = (await ziele()).find((t) => t.type === 'page');
  const p = await verbinde(seite.webSocketDebuggerUrl);
  await p.cdp('Page.enable', {});
  await p.cdp('Runtime.enable', {});
  await p.cdp('Log.enable', {});
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
  await p.cdp('Page.navigate', { url: 'chrome-extension://' + extId + '/sidebar.html' });
  await warte(5000);

  // Optional: eine Aktion ausloesen, bevor das Bild gemacht wird
  const tuArg = process.argv.indexOf('--tu');
  if (tuArg > -1 && process.argv[tuArg + 1]) {
    await p.cdp('Runtime.evaluate', { expression: process.argv[tuArg + 1], awaitPromise: true });
    await warte(2500);
  }

  // 5. Fehler auswerten
  const fehler = [];
  for (const q of [p, sw]) {
    for (const e of q.ereignisse) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        fehler.push((q === sw ? '[Dienst] ' : '[Sidebar] ') + (d.exception?.description || d.text));
      }
      // Favicon-404er von Googles Dienst sind KEIN Fehler: die Sidebar faellt
      // dann auf den Anfangsbuchstaben zurueck, in Electron genauso. Als
      // Alarmquelle wuerden sie echte Fehler zudecken.
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'
          && !/faviconV2|gstatic\.com|s2\/favicons/.test(e.params.entry.text + (e.params.entry.url || ''))) {
        fehler.push((q === sw ? '[Dienst] ' : '[Sidebar] ') + e.params.entry.text + ' ' + (e.params.entry.url || ''));
      }
    }
  }

  // 6. Was ist tatsaechlich gerendert?
  const stand = await p.cdp('Runtime.evaluate', {
    expression: `JSON.stringify({
      apps: document.querySelectorAll('#apps .app, #apps button').length,
      pinned: document.querySelectorAll('#pinned button').length,
      katalog: document.querySelectorAll('#catalog .card, #catalog > *').length,
      titel: document.title,
      hoehe: document.body.scrollHeight,
      verti: typeof window.verti,
    })`, returnByValue: true,
  });

  console.log('Zustand: ' + stand.result.result.value);

  // Welche Tabs sind offen? So sieht man, ob ein App-Klick wirklich einen Tab
  // geoeffnet hat - der eigentliche Zweck des Hintergrunddienstes.
  const offeneTabs = (await ziele()).filter((t) => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
  console.log('Offene App-Tabs: ' + (offeneTabs.length ? offeneTabs.map((t) => t.url.slice(0, 60)).join(', ') : 'keine'));
  if (fehler.length) {
    console.log('\nFEHLER (' + fehler.length + '):');
    for (const f of [...new Set(fehler)].slice(0, 15)) console.log('  ' + f.slice(0, 220));
  } else {
    console.log('\nKeine Konsolenfehler.');
  }

  // 7. Bildschirmfoto
  const foto = await p.cdp('Page.captureScreenshot', { format: 'png' });
  if (foto.result?.data) { fs.writeFileSync(BILD, Buffer.from(foto.result.data, 'base64')); console.log('Bild: ' + BILD); }

  p.ws.close(); sw.ws.close(); kind.kill();
  await warte(500);
  process.exit(fehler.length ? 1 : 0);
})();
