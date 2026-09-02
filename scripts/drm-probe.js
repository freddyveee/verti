// Fragt einen laufenden Chromium/Electron ueber das DevTools-Protokoll, welche
// DRM-Systeme er kann. Kein Rätselraten: das ist genau die Abfrage, die
// Spotify im Browser macht, bevor es einen Song freischaltet.
//
//   node eme-probe.js "<pfad/zur/binary>" [weitere --schalter]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const bin = process.argv[2];
const extra = process.argv.slice(3);
const PORT = 9666;
const profil = '/tmp/verti-eme-probe';
fs.rmSync(profil, { recursive: true, force: true });

const kind = spawn(bin, [
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profil,
  '--no-first-run', '--no-default-browser-check',
  'http://127.0.0.1:9667/',
  ...extra,
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
kind.stderr.on('data', (d) => { stderr += d; });

// EME gibt es NUR im sicheren Kontext. about:blank/file:// zaehlen nicht,
// http://127.0.0.1 schon - deshalb ein winziger lokaler Server.
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>eme</title>'); }).listen(9667, '127.0.0.1');

const CHECK = `(async () => {
  const out = {};
  // Zwei Codec-Varianten: H.264 (lizenzpflichtig, in blankem Chromium aus) und
  // VP8/WebM (frei). Sonst verwechselt man "Codec fehlt" mit "DRM fehlt".
  const varianten = {
    'h264': [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }],
    'webm': [{ initDataTypes: ['webm'], videoCapabilities: [{ contentType: 'video/webm; codecs="vp8"' }] }],
  };
  for (const ks of ['org.w3.clearkey', 'com.widevine.alpha']) {
    for (const [v, cfg] of Object.entries(varianten)) {
      try { const a = await navigator.requestMediaKeySystemAccess(ks, cfg); out[ks + ' / ' + v] = 'JA'; }
      catch (e) { out[ks + ' / ' + v] = 'nein - ' + e.name; }
    }
  }
  // Codecs unabhaengig von DRM
  const v = document.createElement('video');
  out['__codecs'] = 'H.264: ' + (v.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'nein')
    + ' | AAC: ' + (v.canPlayType('audio/mp4; codecs="mp4a.40.2"') || 'nein')
    + ' | VP8: ' + (v.canPlayType('video/webm; codecs="vp8"') || 'nein');
  out['__ua'] = navigator.userAgent;
  out['__origin'] = location.origin + ' | sicherer Kontext: ' + window.isSecureContext + ' | EME-API: ' + (typeof navigator.requestMediaKeySystemAccess);
  return JSON.stringify(out);
})()`;

async function warte(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  let ziel = null;
  for (let i = 0; i < 40 && !ziel; i++) {
    await warte(500);
    try {
      const liste = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
      ziel = liste.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch (e) {}
  }
  if (!ziel) { console.log('KEIN DevTools-Ziel erreichbar.\n' + stderr.slice(-800)); kind.kill(); process.exit(1); }

  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  // Selbst navigieren: das beim Start uebergebene Ziel landet nicht immer im
  // ersten DevTools-Ziel, und auf about:blank gibt es EME grundsaetzlich nicht.
  const offen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  const cdp = (id, method, params) => new Promise((res) => { offen.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp(10, 'Page.enable', {});
  await cdp(11, 'Page.navigate', { url: 'http://127.0.0.1:9667/' });
  await warte(2500);
  const antwort = await cdp(1, 'Runtime.evaluate', { expression: CHECK, awaitPromise: true, returnByValue: true });
  const wert = antwort.result?.result?.value;
  if (!wert) { console.log('Fehler:', JSON.stringify(antwort).slice(0, 400)); }
  else {
    const o = JSON.parse(wert);
    for (const k of Object.keys(o)) {
      if (k === '__ua') continue;
      if (k === '__codecs') { console.log('  (' + o[k] + ')'); continue; }
      if (k === '__origin') { console.log('  (' + o[k] + ')'); continue; }
      console.log('  ' + k.padEnd(30) + o[k]);
    }
  }
  ws.close(); kind.kill();
  await warte(400);
  process.exit(0);
})();
