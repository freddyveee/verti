// Prueft, ob Verti sich beim Start VON ALLEIN beim Updater anmeldet.
//
//   node scripts/selbstanmeldung-test.js
//
// Vorgehen: mit frischem Profil starten, nichts anklicken, warten, und dann
// nachsehen, ob der Updater installiert wurde und ein Ticket fuer Verti da ist.
// Genau das erlebt ein Nutzer, der Verti zum ersten Mal oeffnet.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = '/Volumes/VertiBuild/chromium/src';
const BIN = path.join(SRC, 'out/Release/Verti.app/Contents/MacOS/Verti');
const PROFIL = '/tmp/verti-selbstanmeldung';
const IMPERIO = path.join(os.homedir(), 'Library/Application Support/IMPERIO');
const VERTI_APPID = 'rocks.imperio.verti';  // Bundle-Kennung, siehe Serverdatei

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Sauber anfangen: kein Updater, kein Profil
  try {
    const u = execSync(`find "${IMPERIO}" -name VertiUpdater -type f -perm +111 2>/dev/null | head -1`).toString().trim();
    if (u) execSync(`"${u}" --uninstall`, { stdio: 'ignore', timeout: 60000 });
  } catch (e) {}
  try { execSync('pkill -f VertiUpdater', { stdio: 'ignore' }); } catch (e) {}
  fs.rmSync(IMPERIO, { recursive: true, force: true });
  fs.rmSync(PROFIL, { recursive: true, force: true });
  console.log('  Ausgangslage: kein Updater installiert, frisches Profil');

  // Mit Fernsteuerungs-Anschluss starten, damit der Test das Fenster am Ende
  // SAUBER schliessen kann. Ein simples kill() beendet Chromium hart, und
  // macOS meldet danach "Verti wurde unerwartet beendet" - ein Schreck fuer
  // jeden, der zufaellig davorsitzt.
  const PORT = 9720;
  const kind = spawn(BIN, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFIL,
    '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  // Sauber beenden ueber das DevTools-Protokoll
  async function sauberBeenden() {
    try {
      const ziel = await fetch('http://127.0.0.1:' + PORT + '/json/version').then((r) => r.json());
      if (ziel && ziel.webSocketDebuggerUrl) {
        const ws = new WebSocket(ziel.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await warte(3000);
        try { ws.close(); } catch (e) {}
      }
    } catch (e) { /* Rueckfall unten */ }
    await warte(1500);
    try { kind.kill(); } catch (e) {}
  }

  // Die Anmeldung ist absichtlich auf 20 s nach dem Start gelegt, damit der
  // Start nicht langsamer wird. Also mit Reserve warten.
  console.log('  Verti laeuft. Warte 45 s, ohne irgendetwas anzuklicken …');
  for (let i = 0; i < 9; i++) {
    await warte(5000);
    if (fs.existsSync(IMPERIO)) { console.log('  Updater taucht auf nach etwa ' + ((i + 1) * 5) + ' s'); break; }
  }
  await warte(20000);

  await sauberBeenden();
  await warte(2000);

  console.log('');
  if (!fs.existsSync(IMPERIO)) {
    console.log('  Kein Updater installiert - die Selbstanmeldung greift NICHT.');
    process.exit(1);
  }

  let ks = '';
  try { ks = execSync(`find "${IMPERIO}" -name ksadmin -type f -perm +111 2>/dev/null | head -1`).toString().trim(); } catch (e) {}
  if (!ks) { console.log('  Updater da, aber kein ksadmin gefunden.'); process.exit(1); }

  const tickets = execSync(`"${ks}" --print-tickets 2>/dev/null || true`).toString();
  const hatVerti = tickets.toLowerCase().includes(VERTI_APPID.toLowerCase());
  const zeilen = tickets.split('\n').filter((z) => /productID|version=|path=/.test(z)).slice(0, 8);
  console.log('  Tickets beim Updater:');
  for (const z of zeilen) console.log('    ' + z.trim().slice(0, 120));

  console.log('');
  console.log('  ' + (hatVerti
    ? 'Verti hat sich VON ALLEIN angemeldet. Der Nutzer muss nichts tun.'
    : 'Updater ist da, aber Verti ist NICHT angemeldet.'));
  process.exit(hatVerti ? 0 : 1);
})();
