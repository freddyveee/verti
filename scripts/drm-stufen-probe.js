// Fragt die DRM-Stufen ab, die Streaming-Dienste tatsaechlich verlangen:
// Robustheit, dauerhafter Zustand und die eindeutige Geraetekennung.
// Profil bleibt bestehen, damit der schon geladene CDM wiederverwendet wird.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const bin = process.argv[2];
const profil = process.argv[3] || '/tmp/verti-cdm-probe';
const PORT = 9670;
http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<title>drm</title>'); }).listen(9671, '127.0.0.1');

const kind = spawn(bin, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const CHECK = `(async () => {
  const out = {};
  const audio = (rob) => [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: rob }] }];
  for (const rob of ['', 'SW_SECURE_CRYPTO', 'SW_SECURE_DECODE', 'HW_SECURE_ALL']) {
    try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', audio(rob)); out['Ton, Robustheit ' + (rob || '(egal)')] = 'JA'; }
    catch (e) { out['Ton, Robustheit ' + (rob || '(egal)')] = 'nein'; }
  }
  const mit = (extra) => [Object.assign({ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' }] }, extra)];
  try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', mit({ persistentState: 'required' })); out['dauerhafter Zustand'] = 'JA'; }
  catch (e) { out['dauerhafter Zustand'] = 'nein'; }
  try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', mit({ distinctiveIdentifier: 'required' })); out['Geraetekennung (Storage ID)'] = 'JA'; }
  catch (e) { out['Geraetekennung (Storage ID)'] = 'nein'; }
  return JSON.stringify(out);
})()`;

(async () => {
  let ziel = null;
  for (let i = 0; i < 40 && !ziel; i++) { await warte(500); try { ziel = (await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json())).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) {} }
  if (!ziel) { console.log('  kein DevTools-Ziel'); kind.kill(); process.exit(1); }
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const offen = new Map(); let id = 0;
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  const cdp = (method, params) => new Promise((res) => { const i = ++id; offen.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Page.enable', {});
  await cdp('Page.navigate', { url: 'http://127.0.0.1:9671/' });
  await warte(2500);
  const a = await cdp('Runtime.evaluate', { expression: CHECK, awaitPromise: true, returnByValue: true });
  const v = a.result?.result?.value;
  if (!v) console.log('  Fehler: ' + JSON.stringify(a).slice(0, 300));
  else { const o = JSON.parse(v); for (const k of Object.keys(o)) console.log('  ' + k.padEnd(32) + o[k]); }
  ws.close(); kind.kill(); await warte(400); process.exit(0);
})();
