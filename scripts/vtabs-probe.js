// Misst, ob Chromiums eingebaute VERTIKALE Tableiste greift.
//
// Beweis ohne Bildschirmfoto: liegt links eine vertikale Tableiste, wird die
// Seitenflaeche schmaler. Wir starten also zweimal mit gleich grossem Fenster -
// einmal ohne, einmal mit der Einstellung - und vergleichen innerWidth.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BIN = '/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function messe(profil, port, vertikal) {
  fs.rmSync(profil, { recursive: true, force: true });
  if (vertikal) {
    // Einstellung vorab ins Profil schreiben, damit sie ab dem ersten Start gilt
    const dir = path.join(profil, 'Default');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Preferences'), JSON.stringify({ vertical_tabs: { enabled: true } }));
  }
  const kind = spawn(BIN, [
    '--remote-debugging-port=' + port, '--user-data-dir=' + profil,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1200,800', '--window-position=30,30',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let ziel = null;
  for (let i = 0; i < 40 && !ziel; i++) {
    await warte(500);
    try { ziel = (await fetch('http://127.0.0.1:' + port + '/json/list').then((r) => r.json())).find((t) => t.type === 'page'); } catch (e) {}
  }
  if (!ziel) { kind.kill(); return null; }
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map(); let id = 0;
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  const cdp = (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await warte(2500);
  const a = await cdp('Runtime.evaluate', { expression: 'JSON.stringify({b: innerWidth, h: innerHeight, x: screenX, y: screenY})', returnByValue: true });
  ws.close(); kind.kill();
  await warte(1200);
  // Wurde die Einstellung uebernommen?
  let pref = '?';
  try {
    const p = JSON.parse(fs.readFileSync(path.join(profil, 'Default', 'Preferences'), 'utf8'));
    pref = JSON.stringify(p.vertical_tabs || null);
  } catch (e) {}
  return { masse: a.result?.result?.value, pref };
}

(async () => {
  // Frisches Profil OHNE vorgeschriebene Einstellung: greift jetzt der neue
  // Standard aus tab_strip_prefs.cc?
  const werk = await messe('/tmp/verti-vt-werk', 9692, false);
  console.log('  frisches Profil, nichts eingestellt: ' + (werk ? werk.masse + '  Einstellung: ' + werk.pref : 'Messung fehlgeschlagen'));
  const ohne = werk, mit = werk;
  if (werk) {
    const a = JSON.parse(werk.masse);
    // Fenster ist 1200 breit. Alles, was rechts weniger ankommt, zeichnet die
    // vertikale Leiste links.
    const leiste = 1200 - a.b;
    console.log('\n  Breite der Leiste links: ' + leiste + ' px');
    console.log('  Seitenhoehe: ' + a.h + ' px (ohne vertikale Tabs waren es 713)');
    console.log('  ' + (leiste > 20
      ? 'Die vertikale Tableiste ist ab Werk da.'
      : 'Sie greift NICHT - der Standard kommt nicht an.'));
  }
  process.exit(0);
})();
