// Prueft, ob Verti beim Start wirklich wie VERTI aussieht - ohne dass jemand
// etwas von Hand dazuladen muss.
//
//   node scripts/oberflaeche-pruefen.js
//
// Am 03.09.2026 startete Verti als nacktes Chromium: die Sidebar lag im Paket,
// aber nichts hat sie geladen. In den Tests wurde immer --load-extension von
// Hand mitgegeben - deshalb ist es nie aufgefallen. Dieser Test gibt bewusst
// KEINE Schalter mit.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = '/Volumes/VertiBuild/chromium/src';
const BIN = path.join(SRC, 'out/Release/Verti.app/Contents/MacOS/Verti');
const PORT = 9740;
const PROFIL = '/tmp/verti-oberflaeche';
const BILD = '/tmp/verti-oberflaeche.png';

fs.rmSync(PROFIL, { recursive: true, force: true });

// KEIN --load-extension, KEIN --no-first-run: genau so startet es beim Nutzer.
const kind = spawn(BIN, [
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFIL,
  '--window-size=1400,900',
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
  let liste = null;
  for (let i = 0; i < 60 && !liste; i++) {
    await warte(500);
    try { liste = await ziele(); } catch (e) {}
  }
  if (!liste) { console.log('  Verti nicht erreichbar'); kind.kill(); process.exit(1); }
  await warte(6000);
  liste = await ziele();

  // 1. Laedt sich die Sidebar von allein?
  const sw = liste.find((t) => t.url && t.url.includes('/sw.js'));
  console.log('  Sidebar laedt sich selbst:   ' + (sw ? 'JA (' + sw.url.split('/')[2] + ')' : 'NEIN'));

  // 2. Welche Seite steht beim Start da?
  const seiten = liste.filter((t) => t.type === 'page');
  console.log('  Seiten beim Start:           ' + (seiten.length ? seiten.map((t) => t.url.slice(0, 55)).join(', ') : 'keine'));

  // 3. Steht irgendwo noch "Chromium"?
  let chromiumTexte = '?';
  const seite = seiten[0];
  if (seite) {
    try {
      const p = await verbinde(seite.webSocketDebuggerUrl);
      const a = await p.cdp('Runtime.evaluate', {
        expression: `(document.body ? document.body.innerText : '').slice(0, 4000)`, returnByValue: true,
      });
      const txt = String(a.result?.result?.value || '');
      chromiumTexte = txt.includes('Chromium') ? 'JA - noch vorhanden' : 'nein';
      p.ws.close();
    } catch (e) {}
  }
  console.log('  "Chromium" auf der Seite:    ' + chromiumTexte);

  // 4. Bildschirmfoto der Sidebar
  const sb = liste.find((t) => t.url && t.url.includes('/sidebar.html'));
  const zielSeite = sb || seiten[0];
  if (zielSeite) {
    const p = await verbinde(zielSeite.webSocketDebuggerUrl);
    await p.cdp('Page.enable', {});
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
    await warte(1500);
    const foto = await p.cdp('Page.captureScreenshot', { format: 'png' });
    if (foto.result?.data) { fs.writeFileSync(BILD, Buffer.from(foto.result.data, 'base64')); console.log('  Bild: ' + BILD); }
    p.ws.close();
  }

  // Sauber beenden, sonst meldet macOS einen Absturz
  try {
    const v = await fetch('http://127.0.0.1:' + PORT + '/json/version').then((r) => r.json());
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await warte(3000);
  } catch (e) {}
  try { kind.kill(); } catch (e) {}
  process.exit(0);
})();
