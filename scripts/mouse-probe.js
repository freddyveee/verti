// Sonde: Was kommt in Verti an, wenn man die Seitentasten der Maus drückt?
// Öffnet ein Fenster mit einer WebContentsView (wie die App-Views in Verti)
// und zeigt im Fenster selbst, was der Hauptprozess sieht: Maustasten
// (before-mouse-event / input-event), Tastendrücke mit Modifiern
// (before-input-event), Windows-App-Commands und Trackpad-Swipes. Dazu, was
// die Seite als DOM-Event bekommt. Start: npx electron scripts/mouse-probe.js
// Eigenes Wegwerfprofil, stört die installierte App nicht; wird nicht mitgepackt.
const { app, BrowserWindow, WebContentsView } = require('electron');
const path = require('path');

app.setPath('userData', path.join(app.getPath('temp'), 'verti-mouse-probe'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 620, title: 'Verti Maus-Sonde' });
  const view = new WebContentsView();
  win.contentView.addChildView(view);
  const layout = () => {
    const [w, h] = win.getContentSize();
    view.setBounds({ x: 0, y: 0, width: w, height: h });
  };
  win.on('resize', layout);
  layout();
  const wc = view.webContents;

  const log = (line) => {
    const stamped = `${new Date().toISOString().slice(11, 23)}  ${line}`;
    console.log(stamped);
    wc.executeJavaScript(`window.__log(${JSON.stringify(stamped)})`).catch(() => {});
  };

  wc.on('before-mouse-event', (e, m) => {
    if (m.type === 'mouseDown' || m.type === 'mouseUp') log(`main  before-mouse-event ${m.type} button=${m.button}`);
  });
  wc.on('input-event', (e, i) => {
    if (i.type === 'mouseDown' || i.type === 'mouseUp') log(`main  input-event ${i.type} button=${i.button}`);
  });
  wc.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown') {
      const mods = ['meta', 'control', 'alt', 'shift'].filter((k) => i[k]).join('+');
      log(`main  keyDown key=${JSON.stringify(i.key)} code=${i.code}${mods ? ' mods=' + mods : ''}`);
    }
  });
  win.on('app-command', (e, cmd) => log(`main  app-command ${cmd}`));
  win.on('swipe', (e, dir) => log(`main  swipe ${dir}`));
  win.webContents.on('before-mouse-event', (e, m) => {
    if (m.type === 'mouseDown' || m.type === 'mouseUp') log(`main  (Fenster) before-mouse-event ${m.type} button=${m.button}`);
  });

  const html = `<!doctype html><meta charset="utf-8"><title>Verti Maus-Sonde</title>
<body style="font:15px -apple-system,Segoe UI,sans-serif;margin:0;display:flex;flex-direction:column;height:100vh">
<div style="padding:14px 18px;background:#22242c;color:#fff;line-height:1.45">
  <b>Verti Maus-Sonde.</b> Einmal hier hineinklicken, dann die beiden Seitentasten der Maus drücken
  (zum Vergleich auch Cmd+[ bzw. Strg+[). Unten steht, was in Verti ankommt. Nichts drin? Dann kommt bei Verti nichts an.
</div>
<pre id="log" style="flex:1;margin:0;padding:14px 18px;overflow:auto;background:#f6f6f8;color:#222;font:13px/1.5 Menlo,Consolas,monospace"></pre>
<script>
  window.__log = (l) => { const el = document.getElementById('log'); el.textContent += l + '\\n'; el.scrollTop = el.scrollHeight; };
  const stamp = () => new Date().toISOString().slice(11, 23);
  for (const n of ['mousedown', 'mouseup', 'auxclick']) addEventListener(n, (e) => window.__log(stamp() + '  page  DOM ' + n + ' button=' + e.button));
  addEventListener('keydown', (e) => window.__log(stamp() + '  page  DOM keydown key=' + JSON.stringify(e.key) + ' meta=' + e.metaKey + ' ctrl=' + e.ctrlKey + ' alt=' + e.altKey));
</script></body>`;
  await wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  console.log('Sonde läuft. Ins Fenster klicken und die Seitentasten drücken; Fenster schließen beendet die Sonde.');
});

app.on('window-all-closed', () => app.quit());
