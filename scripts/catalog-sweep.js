// Katalog-Durchlauf: laedt ALLE Apps aus Vertis Katalog nacheinander und
// meldet, welche kaputt sind - ohne dass jemand klicken muss.
//
//   npx electron scripts/catalog-sweep.js            alle Apps
//   ONLY=chatgpt,canva npx electron ...              nur bestimmte
//   LIMIT=20 npx electron ...                        nur die ersten 20
//   PAR=3 npx electron ...                           wie viele parallel (Standard 3)
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

const PAR = Number(process.env.PAR || 3);
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

// WICHTIG: Fenster werden WIEDERVERWENDET, nicht pro App neu erzeugt.
// Die erste Fassung legte fuer jede der 209 Apps ein eigenes Fenster mit
// eigenem Renderer-Prozess an. Bei 6 parallel hat das Freddys Mac den
// Arbeitsspeicher leergeraeumt (macOS meldete "kein Programmspeicher mehr"),
// und ab etwa App 150 lief alles in die Zeitueberschreitung - die Ergebnisse
// danach waren komplett wertlos. Ein Arbeiter = ein Fenster, das nur noch
// navigiert wird.
function baueArbeitsplatz(ses) {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false });
  const view = new WebContentsView({ webPreferences: { session: ses, preload: path.join(__dirname, '..', 'view-preload.js'), additionalArguments: ['--verti-firefox-ua=x'] } });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });
  view.webContents.setUserAgent(chromeUA);
  return { win, view };
}

async function pruefe(appDef, platz) {
  const wc = platz.view.webContents;
  const r = { id: appDef.id, name: appDef.name, url: appDef.url, start: Date.now() };
  const ab = [];
  const on = (ev, fn) => { wc.on(ev, fn); ab.push([ev, fn]); };
  on('did-navigate', (_e, url, code) => { if (code) r.httpStatus = code; });
  // Fehlercode -3 (ABORTED) ist KEIN Fehler: der feuert bei jeder normalen
  // Umleitung, z.B. wenn die App sofort auf ihre Anmeldeseite schickt.
  on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) r.failed = code + ' ' + desc;
  });
  on('render-process-gone', (_e, d) => { r.crashed = d.reason; });

  try {
    try {
      await Promise.race([
        wc.loadURL(appDef.url),
        new Promise((_, rej) => setTimeout(() => rej(new Error('__zeit__')), TIMEOUT)),
      ]);
    } catch (e) {
      // ERR_ABORTED (-3) heisst NICHT kaputt: loadURL bricht mit diesem Fehler
      // ab, sobald die Seite selbst weiterleitet (Anmeldeseite, Zustimmungs-
      // dialog, OAuth). Das ist der Normalfall, nicht der Ausnahmefall.
      // Und auch nach Zeitueberschreitung schauen wir nach, ob die Seite
      // inzwischen etwas anzeigt - viele grosse Web-Apps rendern laengst,
      // waehrend im Hintergrund noch Werbung/Zaehlpixel laden.
      if (/__zeit__/.test(e.message)) r.langsam = true;
      else if (!/ERR_ABORTED/.test(e.message)) throw e;
    }
    // Warten, bis die Seite wirklich Inhalt hat (SPAs wie YouTube, Teams und
    // Discord brauchen deutlich laenger als ein fester Moment). Bis zu 12s,
    // frueher Ausstieg, sobald Text da ist.
    let info = null;
    for (let versuch = 0; versuch < 12; versuch++) {
      await new Promise((res) => setTimeout(res, versuch === 0 ? 1200 : 900));
      try {
        info = JSON.parse(await wc.executeJavaScript(
          'JSON.stringify({u: location.href, t: (document.body ? document.body.innerText : "").slice(0, 4000), title: document.title, ready: document.readyState})'
        ));
      } catch (e) { continue; }
      const len = (info.t || '').replace(/\s+/g, ' ').trim().length;
      if (len >= 60) break;
    }
    if (info) {
      r.endUrl = info.u;
      r.textLen = (info.t || '').replace(/\s+/g, ' ').trim().length;
      r.title = info.title;
      const treffer = (info.t || '').match(BLOCK_MARKER);
      if (treffer) {
        const i = Math.max(0, treffer.index - 30);
        r.blockMarker = (info.t || '').slice(i, i + 100).replace(/\s+/g, ' ').trim();
      }
    } else if (r.langsam) {
      r.timedOut = true;
    }
  } catch (e) {
    if (!r.failed) r.failed = e.message;
  }
  r.dauer = Date.now() - r.start;
  // Zuhoerer wieder abnehmen (sonst sammeln sie sich pro App an) und die
  // Seite entladen, damit ihr Speicher zurueckgegeben wird.
  for (const [ev, fn] of ab) { try { wc.off(ev, fn); } catch (e) {} }
  try { await wc.loadURL('about:blank'); } catch (e) {}
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
  const anzahl = Math.min(PAR, apps.length);
  const plaetze = Array.from({ length: anzahl }, () => baueArbeitsplatz(ses));
  async function arbeiter(platz) {
    while (i < apps.length) {
      const a = apps[i++];
      const r = await pruefe(a, platz);
      results.push(r);
      fertig++;
      const zeichen = r.status === 'OK' ? 'ok      ' : r.status.padEnd(8);
      const mb = Math.round(process.memoryUsage().rss / 1048576);
      console.log(`[${String(fertig).padStart(3)}/${apps.length}] ${zeichen} ${r.name.padEnd(22).slice(0, 22)} ${(r.dauer / 1000).toFixed(1)}s ${r.grund}`);
      if (fertig % 25 === 0) console.log(`        (Zwischenstand: Hauptprozess ${mb} MB)`);
    }
  }
  await Promise.all(plaetze.map(arbeiter));
  for (const p of plaetze) { try { p.win.destroy(); } catch (e) {} }

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
