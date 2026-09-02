// Spielt die GANZE Update-Kette lokal durch, bevor irgendetwas veroeffentlicht
// wird: Vertis Updater fragt bei einem lokalen Server nach, der genau das
// antwortet, was die Supabase-Funktion antworten wuerde.
//
//   node scripts/updater-test.js            "kein Update" pruefen
//   node scripts/updater-test.js --update   "Update da" pruefen
//
// Der Updater nimmt die Adresse aus einer Entwickler-Datei (overrides.json)
// neben seinem Installationsordner - deshalb muss dafuer nichts neu gebaut
// werden.
const { spawn, execSync } = require('child_process');

// WICHTIG: execSync blockiert Nodes Ereignisschleife. Waehrend der Updater
// laeuft, koennte unser eigener Testserver dann nicht antworten - die Anfragen
// liefen ins Leere. Also alles asynchron starten.
function laufe(befehl, args, zeit = 120000) {
  return new Promise((fertig) => {
    const k = spawn(befehl, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let aus = '';
    k.stdout.on('data', (d) => (aus += d));
    k.stderr.on('data', (d) => (aus += d));
    const uhr = setTimeout(() => { try { k.kill(); } catch (e) {} }, zeit);
    k.on('close', (code) => { clearTimeout(uhr); fertig({ code, aus }); });
  });
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SRC = '/Volumes/VertiBuild/chromium/src';
// Die Testfassung ist dieselbe Anwendung, kennt aber overrides.json. Die
// ausgelieferte Fassung ignoriert die Datei absichtlich - sonst koennte jeder
// die Update-Adresse umbiegen.
const UPDATER = path.join(SRC, 'out/Release/VertiUpdater_test.app/Contents/MacOS/VertiUpdater_test');
const PORT = 9710;
const VERTI_APPID = '{b8ea4abe-da0c-4994-a8a5-a66cc7e21ccd}';
const mitUpdate = process.argv.includes('--update');

// Muss zu GetInstallDirectory() passen: der Updater sucht overrides.json eine
// Ebene UEBER seinem Installationsordner.
// Auch die Testfassung installiert sich in denselben Ordner - nur die
// Binaerdatei heisst anders.
const INSTALL = path.join(os.homedir(), 'Library/Application Support/IMPERIO/VertiUpdater');
const OVERRIDES = path.join(path.dirname(INSTALL), 'overrides.json');

const anfragen = [];

const server = http.createServer((req, res) => {
  let roh = '';
  req.on('data', (c) => (roh += c));
  req.on('end', () => {
    let anfrage = {};
    try { anfrage = JSON.parse(roh.replace(/^\)\]\}'\n/, '')); } catch (e) {}
    anfragen.push(anfrage);

    // Der Updater schickt die Liste unter "apps" (am 02.09.2026 nachgesehen),
    // aeltere Beschreibungen nennen "app" - deshalb beide.
    const apps = anfrage?.request?.apps || anfrage?.request?.app || [];
    const ergebnis = (Array.isArray(apps) ? apps : []).map((app) => {
      const id = String(app?.appid || '').toLowerCase();
      if (!mitUpdate || id !== VERTI_APPID.toLowerCase()) {
        return { appid: id, status: 'ok', updatecheck: { status: 'noupdate' } };
      }
      return {
        appid: id, status: 'ok',
        updatecheck: {
          status: 'ok',
          nextversion: '999.0.0.0',
          pipelines: [{
            operations: [
              { type: 'download', urls: [{ url: 'http://127.0.0.1:' + PORT + '/Verti-Mac.crx3' }],
                out: { sha256: '0'.repeat(64) }, size: 1234 },
              { type: 'crx3', path: '.keystone_install', arguments: '', in: { sha256: '0'.repeat(64) } },
            ],
          }],
        },
      };
    });
    const koerper = ")]}'\n" + JSON.stringify({ response: { protocol: '4.0', apps: ergebnis } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(koerper);
  });
});

(async () => {
  if (!fs.existsSync(UPDATER)) { console.log('  VertiUpdater_test.app fehlt - erst bauen'); process.exit(1); }
  // Alten Stand wegraeumen, damit der Test wirklich von vorn laeuft
  fs.rmSync(INSTALL, { recursive: true, force: true });
  server.listen(PORT, '127.0.0.1');

  fs.mkdirSync(path.dirname(OVERRIDES), { recursive: true });
  fs.writeFileSync(OVERRIDES, JSON.stringify({ url: ['http://127.0.0.1:' + PORT + '/'] }, null, 2));
  console.log('  Adresse umgebogen auf 127.0.0.1:' + PORT);

  // Updater installieren (legt sich in ~/Library/Application Support/IMPERIO)
  const inst = await laufe(UPDATER, ['--install', '--enable-logging']);
  console.log('  Updater installiert (Rueckgabe ' + inst.code + ')');

  // Verti als betreute App anmelden. Das macht ksadmin - dasselbe Werkzeug,
  // mit dem Chrome sich bei Keystone anmeldet.
  const ks = execSync(`find "${INSTALL}" -name ksadmin -type f -perm +111 | head -1`).toString().trim();  // nur Dateisuche, blockiert kaum
  if (!ks) { console.log('  ksadmin nicht gefunden'); server.close(); process.exit(1); }
  // Eine echte App-Kennung braucht einen Pfad, den es gibt - wir nehmen das
  // gebaute Verti.app.
  const VERTI_APP = path.join(SRC, 'out/Release/Verti.app');
  const reg = await laufe(ks, ['--register', '--productid', VERTI_APPID, '--version', '1.0.0.0',
    '--xcpath', VERTI_APP, '--url', 'http://127.0.0.1:' + PORT + '/'], 60000);
  console.log('  Verti angemeldet, Version 1.0.0.0 (Rueckgabe ' + reg.code + ')');

  // Pruefung ausloesen
  const pruef = await laufe(UPDATER, ['--update-apps', '--enable-logging']);
  console.log('  Pruefung gelaufen (Rueckgabe ' + pruef.code + ')');

  await new Promise((r) => setTimeout(r, 2500));

  console.log('\n  Anfragen beim Server: ' + anfragen.length);
  // Roh anschauen: nur so ist sicher, dass der Server die richtigen Felder liest
  const erste = anfragen.find((a) => JSON.stringify(a).includes('updatecheck')) || anfragen[0];
  if (erste) {
    console.log('  Aufbau der Anfrage: ' + JSON.stringify(Object.keys(erste.request || erste)));
    const apps = erste?.request?.app || erste?.request?.apps || [];
    console.log('  App-Liste steckt unter: ' + (erste?.request?.app ? 'request.app' : erste?.request?.apps ? 'request.apps' : 'NICHT GEFUNDEN'));
    if (apps[0]) console.log('  Erste App: ' + JSON.stringify(apps[0]).slice(0, 260));
  }
  for (const a of anfragen) {
    const apps = a?.request?.apps || a?.request?.app || [];
    for (const app of apps) {
      console.log('    App ' + app.appid + '  Version ' + (app.version || '-')
        + '  Aktion: ' + Object.keys(app).filter((k) => ['updatecheck', 'ping', 'event'].includes(k)).join(','));
    }
  }
  console.log('\n  ' + (anfragen.length
    ? 'Vertis Updater spricht mit unserem Server - die Kette steht.'
    : 'KEINE Anfrage angekommen. Der Updater erreicht den Server nicht.'));

  server.close();
  process.exit(0);
})();
