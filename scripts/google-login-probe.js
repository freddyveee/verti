// Google-Login-Sonde: Misst in Sekunden, ob Googles Anmeldeseite Vertis
// Browser-Tarnung akzeptiert — ohne echtes Konto, ohne Passwort. Die Sonde
// baut Vertis Setup nach (Session persist:apps, Chrome-UA, Firefox-Tarnung
// per webRequest + view-preload.js), öffnet die Anmeldeseite von Google
// Kalender, tippt eine Fantasie-Adresse ein und liest die Antwort:
//   „Dieses Konto wurde nicht gefunden"   → Tarnung akzeptiert
//   „Anmeldung nicht möglich … nicht sicher" (URL …/signin/rejected?…rrk=46)
//                                          → Tarnung abgelehnt
// Den Passwort-Schritt kann nur ein Mensch mit echtem Konto prüfen.
//
//   npx electron scripts/google-login-probe.js            Vertis Tarnung (Standard)
//   MODE=chrome npx electron scripts/google-login-probe.js  nackter Chrome-UA (Vergleich, wird abgelehnt)
//   MODE=timing npx electron scripts/google-login-probe.js  lokal: greift der JS-Override vor dem ersten Seitenskript?
//   NO_SUBMIT=1 … nur Seite laden, nichts eintippen
//
// Messwerte vom 22.08.2026 (Electron 43 / Chromium 150): Chrome-UA → abgelehnt
// (auch mit voller Versionsnummer wie bei Ferdium), Firefox-Tarnung → akzeptiert.
// Sparsam einsetzen: jeder Lauf ist ein Anmeldeversuch bei Google.
const { app, BrowserWindow, WebContentsView, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MODE = process.env.MODE || 'verti';
const EMAIL = process.env.EMAIL || 'nobody.verti.probe.4711@gmail.com';
const LOGIN_URL = 'https://accounts.google.com/ServiceLogin?service=cl&continue=https%3A%2F%2Fcalendar.google.com%2Fcalendar%2Fu%2F0%2Fr&hl=de';
const PROBE_URL = 'https://accounts.google.com/__verti_probe';
const workDir = path.join(os.tmpdir(), 'verti-google-probe');
const profile = path.join(workDir, 'profile-' + MODE);
if (!process.env.KEEP_PROFILE) fs.rmSync(profile, { recursive: true, force: true });
app.setPath('userData', profile);

const isMac = process.platform === 'darwin';
const chromeUserAgent = () => `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
// Wie firefoxUserAgent() in main.js
const major = 143 + Math.floor((Date.now() - Date.UTC(2025, 9, 14)) / (28 * 864e5));
const FIREFOX_UA = `Mozilla/5.0 (${isMac ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64'}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
const isGoogleAuthUrl = (url) => { try { return ['accounts.google.com', 'accounts.youtube.com'].includes(new URL(url).host); } catch { return false; } };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
const disguise = MODE !== 'chrome';

setTimeout(() => { log('Zeitüberschreitung, Abbruch'); app.exit(2); }, 75000);

app.whenReady().then(async () => {
  app.userAgentFallback = chromeUserAgent();
  const ses = session.fromPartition('persist:apps');
  ses.setUserAgent(chromeUserAgent());
  if (disguise) {
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      const headers = details.requestHeaders;
      if (isGoogleAuthUrl(details.url)) {
        headers['User-Agent'] = FIREFOX_UA;
        for (const key of Object.keys(headers)) if (key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
      }
      cb({ requestHeaders: headers });
    });
  }
  ses.webRequest.onSendHeaders((d) => {
    if (d.resourceType === 'mainFrame') log('→', d.url.slice(0, 90), '| UA:', d.requestHeaders['User-Agent']);
  });
  if (MODE === 'timing') {
    // Lokale Sondenseite: ihr erstes Skript hält fest, was es von navigator sieht
    ses.protocol.handle('https', (req) => {
      if (req.url.startsWith(PROBE_URL)) {
        return new Response('<!doctype html><html><head><script>window.__first={ua:navigator.userAgent,vendor:navigator.vendor,uad:String(navigator.userAgentData)};</script></head><body>probe</body></html>', { headers: { 'content-type': 'text/html' } });
      }
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
  }

  const win = new BrowserWindow({ width: 1100, height: 800, title: 'Verti Google-Sonde: ' + MODE });
  const webPreferences = { partition: 'persist:apps' };
  if (disguise) {
    webPreferences.preload = path.join(__dirname, '..', 'view-preload.js');
    webPreferences.additionalArguments = ['--verti-firefox-ua=' + FIREFOX_UA];
  }
  const view = new WebContentsView({ webPreferences });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1100, height: 800 });
  const wc = view.webContents;
  wc.setUserAgent(chromeUserAgent());
  wc.on('did-navigate', (_e, url) => log('Seite:', url.slice(0, 120)));

  // WARM=1: Profil erst "einlaufen" lassen (google.com besuchen, NID-Cookie holen),
  // bevor die Anmeldung startet. Grund: Die Sonde loescht ihr Profil sonst bei jedem
  // Lauf und tritt Google als voellig unbeschriebenes Blatt gegenueber — Freddys
  // erfolgreiche Anmeldung am 22.08.2026 lief dagegen in einem seit Tagen benutzten
  // Profil. Zusammen mit KEEP_PROFILE=1 laesst sich so testen, ob die Profil-Frische
  // der Ablehnungsgrund ist.
  if (process.env.WARM) {
    log('Waerme das Profil auf (google.com)…');
    await wc.loadURL('https://www.google.com/?hl=de').catch(() => {});
    await sleep(rnd(3000, 5000));
    const n = await wc.executeJavaScript('document.cookie.length').catch(() => 0);
    log('Profil aufgewaermt, Cookie-Zeichen sichtbar:', n);
  }
  await wc.loadURL(MODE === 'timing' ? PROBE_URL : LOGIN_URL).catch((e) => log('Laden fehlgeschlagen:', e.message));
  await sleep(MODE === 'timing' ? 500 : 3500);
  log('JS-Kennung:', await wc.executeJavaScript('JSON.stringify({ua: navigator.userAgent, vendor: navigator.vendor, productSub: navigator.productSub, oscpu: navigator.oscpu, buildID: navigator.buildID, chrome: (("chrome" in window) ? typeof window.chrome : "weg"), userAgentData: String(navigator.userAgentData)})'));

  if (MODE !== 'timing') {
    const field = `document.querySelector('#identifierId, input[type=email]')`;
    if (await wc.executeJavaScript(`!!${field}`) && !process.env.NO_SUBMIT) {
      // WICHTIG: menschlich eingeben, nicht per insertText. Ein Schlag-auf-einmal
      // eingefuegter Text ohne Mausbewegung und ohne Tipprhythmus ist fuer Googles
      // Bot-Erkennung ein eigenes Warnsignal — die Sonde wuerde dann ablehnen, wo
      // ein echter Mensch in der App durchkommt (Messfehler statt Messung).
      const box = JSON.parse(await wc.executeJavaScript(
        `(() => { const r = ${field}.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)}); })()`));
      log('Tippe wie ein Mensch in das Feld bei', box.x + ',' + box.y);
      // Maus hinbewegen und klicken (erzeugt echte Nutzer-Geste)
      for (let i = 1; i <= 10; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: box.x - 120 + i * 12, y: box.y - 60 + i * 6 });
        await sleep(rnd(12, 35));
      }
      wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(rnd(45, 95));
      wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(rnd(250, 500));
      // Zeichen fuer Zeichen mit unregelmaessigem Rhythmus
      for (const ch of EMAIL) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
        wc.sendInputEvent({ type: 'char', keyCode: ch });
        wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
        await sleep(rnd(55, 190));
      }
      await sleep(rnd(500, 1100));
      for (const type of ['keyDown', 'char', 'keyUp']) wc.sendInputEvent({ type, keyCode: 'Return' });
      await sleep(7000);
    } else {
      log('Kein E-Mail-Feld oder NO_SUBMIT gesetzt');
    }
    const result = await wc.executeJavaScript(`JSON.stringify({url: location.href, text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160)})`);
    log('Ergebnis:', result);
    log('Bewertung:', /signin\/rejected/.test(result) ? '❌ ABGELEHNT (Browser gilt als unsicher)' : /nicht gefunden|Couldn.t find/.test(result) ? '✅ AKZEPTIERT (Google hat das Konto geprüft)' : '❓ unklar, Screenshot ansehen');
    fs.mkdirSync(workDir, { recursive: true });
    const shot = path.join(workDir, `ergebnis-${MODE}.png`);
    fs.writeFileSync(shot, (await wc.capturePage()).toPNG());
    log('Screenshot:', shot);
  }
  app.exit(0);
});
