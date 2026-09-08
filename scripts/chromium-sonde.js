// Sonde fuer das gebaute Chromium-Verti: fuehrt JavaScript in Vertis Leiste
// aus, ohne dass jemand klicken muss.
//
//   node scripts/chromium-sonde.js "document.getElementById('plus').click()"
//   node scripts/chromium-sonde.js --liste
//
// Wozu: Oberflaechen-Aenderungen muessen bis zum Bildschirmfoto selbst
// geprueft werden (siehe CLAUDE.md). Ohne Bedienungshilfen-Rechte laesst sich
// aber nicht klicken - ueber Chromiums Fernsteuerung geht es trotzdem.
//
// Verti muss dafuer mit --remote-debugging-port=9222 laufen:
//   "/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti" \
//     --user-data-dir=/tmp/verti-sonde --remote-debugging-port=9222 \
//     --use-mock-keychain &
//
// --use-mock-keychain ist PFLICHT und nicht bloss Kosmetik: ohne ihn fragt
// macOS bei JEDEM Start nach dem Passwort fuer "Verti Safe Storage". Jeder
// neue Bau traegt eine andere Signatur und gilt dem System als fremdes
// Programm. Am 08.09.2026 hat Freddy den Dialog mehrfach hintereinander
// bekommen, ausgeloest von genau diesen Testlaeufen.
//
// Wird nicht mitgepackt.
const PORT = process.env.VERTI_SONDE_PORT || 9222;
const args = process.argv.slice(2);

async function ziele() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return r.json();
}

function ruf(ws, id, method, params) {
  return new Promise((fertig, fehler) => {
    const hoerer = (ev) => {
      const n = JSON.parse(ev.data);
      if (n.id !== id) return;
      ws.removeEventListener('message', hoerer);
      n.error ? fehler(new Error(JSON.stringify(n.error))) : fertig(n.result);
    };
    ws.addEventListener('message', hoerer);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  let liste;
  try {
    liste = await ziele();
  } catch {
    console.error(`Keine Fernsteuerung auf Port ${PORT}. Laeuft Verti mit --remote-debugging-port=${PORT}?`);
    process.exit(1);
  }

  if (args[0] === '--liste' || !args.length) {
    for (const z of liste) console.log(z.type.padEnd(12), z.url.slice(0, 100));
    return;
  }

  const leiste = liste.find((z) => z.url.endsWith('/sidebar.html'));
  if (!leiste) {
    console.error('Vertis Leiste ist nicht offen. Gefunden:');
    for (const z of liste) console.error('  ' + z.url.slice(0, 100));
    process.exit(1);
  }

  const ws = new WebSocket(leiste.webSocketDebuggerUrl);
  await new Promise((f) => ws.addEventListener('open', f, { once: true }));
  const r = await ruf(ws, 1, 'Runtime.evaluate', {
    expression: args[0],
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(r.result?.value ?? r.result?.description ?? null));
  ws.close();
})();
