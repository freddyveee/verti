// Prueft den Updater der Chromium-Fassung, ohne auf ein echtes neues Release
// zu warten: der Zustand wird direkt gesetzt und der Dialog abfotografiert.
//
//   node scripts/update-test.js [--echt]
//
// Mit --echt wird stattdessen wirklich bei GitHub nachgefragt. Das zeigt, ob
// die Abfrage geht - meldet aber "aktuell", solange es kein neueres Release
// gibt.
const { spawn } = require('child_process');
const fs = require('fs');

const BIN = '/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti';
const EXT = '/Users/freddy/Projekte/verti/chromium/extension';
const PORT = 9700;
const PROFIL = '/tmp/verti-update-test';
const BILD = '/tmp/verti-update.png';
const echt = process.argv.includes('--echt');

fs.rmSync(PROFIL, { recursive: true, force: true });

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
  const offen = new Map(); let id = 0; const ereignisse = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); }
    else if (d.method) ereignisse.push(d);
  };
  return { ws, ereignisse, cdp: (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
}

const NOTIZEN = [
  '- Verti laeuft jetzt auf eigenem Chromium',
  '- Spotify und MP4-Video funktionieren wieder',
  '- App-Leiste ist Chromiums vertikale Tableiste',
].join('\n');

(async () => {
  let swZiel = null;
  for (let i = 0; i < 60 && !swZiel; i++) {
    await warte(500);
    try { swZiel = (await ziele()).find((t) => t.url.endsWith('sw.js')); } catch (e) {}
  }
  if (!swZiel) { console.log('  Dienst nicht erreichbar'); kind.kill(); process.exit(1); }
  const sw = await verbinde(swZiel.webSocketDebuggerUrl);
  await sw.cdp('Runtime.enable', {});
  await sw.cdp('Log.enable', {});

  if (echt) {
    const a = await sw.cdp('Runtime.evaluate', {
      // Direkt die Funktion rufen: sendMessage an den eigenen Dienst liefert
      // nichts Brauchbares zurueck.
      expression: `updatePruefen(true).then(r => JSON.stringify(r))`,
      awaitPromise: true, returnByValue: true,
    });
    console.log('  echte Abfrage bei GitHub: ' + (a.result?.result?.value || JSON.stringify(a.result).slice(0, 300)));
    if (!a.result?.result?.value || JSON.parse(a.result.result.value).aktuell) {
      console.log('  (kein neueres Release - der Dialog erscheint dann zu Recht nicht)');
      sw.ws.close(); kind.kill(); await warte(400); process.exit(0);
    }
  } else {
    // Zustand direkt setzen, so als haette die Abfrage ein neues Release gefunden
    await sw.cdp('Runtime.evaluate', {
      expression: `(async () => {
        await chrome.storage.local.set({ vertiUpdate: {
          mode: 'available', version: '1.2.0',
          // durch dieselbe Aufbereitung wie bei einem echten Release, sonst
          // testet man an notizenText() vorbei
          notes: notizenText(${JSON.stringify(NOTIZEN)}),
          datei: { name: 'Verti-Mac.zip', url: 'https://example.invalid/Verti-Mac.zip', groesse: 123 },
          forced: false,
        }});
        await chrome.windows.create({ url: chrome.runtime.getURL('update.html'), type: 'popup', width: 520, height: 620 });
        return 'gesetzt';
      })()`, awaitPromise: true, returnByValue: true,
    });
  }
  await warte(3500);

  const dlg = (await ziele()).find((t) => t.url.includes('update.html'));
  if (!dlg) { console.log('  Update-Dialog nicht gefunden'); kind.kill(); process.exit(1); }
  const p = await verbinde(dlg.webSocketDebuggerUrl);
  await p.cdp('Page.enable', {});
  await p.cdp('Runtime.enable', {});
  await p.cdp('Log.enable', {});
  await warte(1500);

  const inhalt = await p.cdp('Runtime.evaluate', {
    expression: `JSON.stringify({
      ueberschrift: (document.querySelector('h1') || {}).textContent || '',
      knoepfe: [...document.querySelectorAll('button')].map(b => b.textContent.trim()),
      notizen: [...document.querySelectorAll('.notes li')].map(l => l.textContent.trim()),
      absaetze: [...document.querySelectorAll('.notes p')].map(l => l.textContent.trim()),
    })`, returnByValue: true,
  });
  console.log('  Dialog: ' + inhalt.result.result.value);

  const fehler = [];
  for (const q of [p, sw]) {
    for (const e of q.ereignisse) {
      if (e.method === 'Runtime.exceptionThrown') fehler.push((e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text));
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') fehler.push(e.params.entry.text);
    }
  }
  console.log(fehler.length ? '\n  FEHLER:\n    ' + [...new Set(fehler)].slice(0, 8).join('\n    ') : '\n  Keine Konsolenfehler.');

  const foto = await p.cdp('Page.captureScreenshot', { format: 'png' });
  if (foto.result?.data) { fs.writeFileSync(BILD, Buffer.from(foto.result.data, 'base64')); console.log('  Bild: ' + BILD); }

  p.ws.close(); sw.ws.close(); kind.kill();
  await warte(400);
  process.exit(0);
})();
