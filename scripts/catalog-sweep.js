// Katalog-Durchlauf: laedt ALLE Apps aus Vertis Katalog nacheinander und
// meldet, welche kaputt sind - ohne dass jemand klicken muss.
//
//   npx electron scripts/catalog-sweep.js            alle Apps
//   ONLY=chatgpt,canva npx electron ...              nur bestimmte
//   LIMIT=20 npx electron ...                        nur die ersten 20
//   PAR=4 npx electron ...                           wie viele parallel (Standard 4)
//   TIMEOUT=20000 npx electron ...                   Zeitlimit je App (Standard 20s)
//
// Laeuft OHNE Login in einem frischen Profil. Dass eine App auf ihre
// Anmeldeseite umleitet, ist deshalb NORMAL und kein Fehler - genau das ist
// der Trick: wir pruefen nicht die App, sondern ob Verti sie ueberhaupt
// sauber anzeigen darf.
//
// Bewusst NICHT als Alarm gewertet: Konsolenfehler und unbehandelte
// Promise-Ablehnungen. Die wirft jede grosse Web-App im Normalbetrieb
// dutzendweise - als Alarmquelle waere der Bericht am ersten Tag unbrauchbar.
//
// Bericht: /tmp/verti-catalog-sweep/bericht-<zeit>.txt (+ .json)
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PAR = Number(process.env.PAR || 4);
const TIMEOUT = Number(process.env.TIMEOUT || 20000);
const workDir = path.join(os.tmpdir(), 'verti-catalog-sweep');
fs.mkdirSync(workDir, { recursive: true });
app.setPath('userData', path.join(workDir, 'profil'));

// Katalog aus main.js lesen, ohne main.js auszufuehren (das wuerde Verti starten)
function ladeKatalog() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const block = src.match(/const CATALOG\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('CATALOG in main.js nicht gefunden');
  const apps = [];
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'([^']*)'\s*,\s*url:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block[1]))) apps.push({ id: m[1], name: m[2], url: m[3] });
  return apps;
}

const isMac = process.platform === 'darwin';
const chromeUA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;

// Texte, die "dieser Browser geht hier nicht" bedeuten. Mehrsprachig, weil die
// Apps je nach Standort unterschiedlich antworten.
const BLOCK_MARKER = /(nicht unterst[uü]tzt|wird nicht unterst|unsupported browser|browser is not supported|update your browser|browser veraltet|nicht sicher|may not be secure|use a (different|supported) browser|verwenden sie einen anderen browser|open in (the )?app|in der app [oö]ffnen)/i;

const results = [];

function bewerte(r) {
  // Reihenfolge = Verlaesslichkeit. Der erste Treffer gewinnt.
  if (r.crashed) return { status: 'KAPUTT', grund: 'Renderer abgestuerzt (' + r.crashed + ')' };
  if (r.failed) return { status: 'KAPUTT', grund: 'Laden fehlgeschlagen: ' + r.failed };
  if (r.timedOut) return { status: 'KAPUTT', grund: 'Zeitlimit ueberschritten (' + TIMEOUT / 1000 + 's)' };
  if (r.httpStatus >= 400) return { status: 'KAPUTT', grund: 'HTTP ' + r.httpStatus };
  if (r.blockMarker) return { status: 'BLOCKIERT', grund: 'Seite sagt: "' + r.blockMarker.slice(0, 70) + '"' };
  if ((r.textLen || 0) < 60) return { status: 'LEER', grund: 'fast kein Text (' + (r.textLen || 0) + ' Zeichen)' };
  return { status: 'OK', grund: '' };
}

async function pruefe(appDef, ses) {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false });
  const view = new WebContentsView({ webPreferences: { session: ses, preload: path.join(__dirname, '..', 'view-preload.js'), additionalArguments: ['--verti-firefox-ua=x'] } });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });
  const wc = view.webContents;
  wc.setUserAgent(chromeUA);

  const r = { id: appDef.id, name: appDef.name, url: appDef.url, start: Date.now() };
  wc.on('did-navigate', (_e, url, code) => { if (code) r.httpStatus = code; });
  // Fehlercode -3 (ABORTED) ist KEIN Fehler: der feuert bei jeder normalen
  // Umleitung, z.B. wenn die App sofort auf ihre Anmeldeseite schickt.
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) r.failed = code + ' ' + desc;
  });
  wc.on('render-process-gone', (_e, d) => { r.crashed = d.reason; });

  try {
    await Promise.race([
      wc.loadURL(appDef.url),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT)),
    ]);
    await new Promise((res) => setTimeout(res, 2500)); // kurz setzen lassen
    const info = JSON.parse(await wc.executeJavaScript(
      'JSON.stringify({u: location.href, t: (document.body ? document.body.innerText : "").slice(0, 4000), title: document.title})'
    ));
    r.endUrl = info.u;
    r.textLen = (info.t || '').replace(/\s+/g, ' ').trim().length;
    r.title = info.title;
    const treffer = (info.t || '').match(BLOCK_MARKER);
    if (treffer) {
      // Kontext um den Treffer, damit der Bericht lesbar ist
      const i = Math.max(0, treffer.index - 30);
      r.blockMarker = (info.t || '').slice(i, i + 100).replace(/\s+/g, ' ').trim();
    }
  } catch (e) {
    if (/timeout/.test(e.message)) r.timedOut = true;
    else if (!r.failed) r.failed = e.message;
  }
  r.dauer = Date.now() - r.start;
  try { win.destroy(); } catch (e) {}
  Object.assign(r, bewerte(r));
  return r;
}

app.whenReady().then(async () => {
  app.userAgentFallback = chromeUA;
  let apps = ladeKatalog();
  if (process.env.ONLY) {
    const ids = process.env.ONLY.split(',').map((s) => s.trim());
    apps = apps.filter((a) => ids.includes(a.id));
  }
  if (process.env.LIMIT) apps = apps.slice(0, Number(process.env.LIMIT));

  const ses = session.fromPartition('sweep-' + Date.now()); // frisch, kein Login
  ses.setUserAgent(chromeUA);

  const t0 = Date.now();
  console.log(`Katalog-Durchlauf: ${apps.length} Apps, ${PAR} parallel, Zeitlimit ${TIMEOUT / 1000}s je App`);
  console.log('');

  let i = 0, fertig = 0;
  async function arbeiter() {
    while (i < apps.length) {
      const a = apps[i++];
      const r = await pruefe(a, ses);
      results.push(r);
      fertig++;
      const zeichen = r.status === 'OK' ? 'ok      ' : r.status.padEnd(8);
      console.log(`[${String(fertig).padStart(3)}/${apps.length}] ${zeichen} ${r.name.padEnd(22).slice(0, 22)} ${(r.dauer / 1000).toFixed(1)}s ${r.grund}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAR, apps.length) }, arbeiter));

  const dauer = (Date.now() - t0) / 1000;
  const nachStatus = (s) => results.filter((r) => r.status === s);
  const zeit = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const txt = path.join(workDir, 'bericht-' + zeit + '.txt');
  const zeilen = [
    `Verti Katalog-Durchlauf, ${new Date().toLocaleString('de-DE')}`,
    `${apps.length} Apps in ${dauer.toFixed(0)}s (${PAR} parallel)`,
    '',
    `OK: ${nachStatus('OK').length} | BLOCKIERT: ${nachStatus('BLOCKIERT').length} | KAPUTT: ${nachStatus('KAPUTT').length} | LEER: ${nachStatus('LEER').length}`,
    '',
  ];
  for (const s of ['KAPUTT', 'BLOCKIERT', 'LEER']) {
    const l = nachStatus(s);
    if (!l.length) continue;
    zeilen.push(`--- ${s} (${l.length}) ---`);
    for (const r of l) zeilen.push(`  ${r.name} (${r.id})  ${r.grund}\n      ${r.url}${r.endUrl && r.endUrl !== r.url ? '\n      -> ' + r.endUrl.slice(0, 110) : ''}`);
    zeilen.push('');
  }
  fs.writeFileSync(txt, zeilen.join('\n'));
  fs.writeFileSync(txt.replace(/\.txt$/, '.json'), JSON.stringify(results, null, 2));

  console.log('');
  console.log(zeilen.slice(0, 5).join('\n'));
  console.log('Bericht:', txt);
  app.exit(nachStatus('KAPUTT').length ? 1 : 0);
});
