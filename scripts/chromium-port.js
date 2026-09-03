// Erzeugt aus Vertis echten Oberflaechen die Fassungen fuer die Chromium-
// Erweiterung.
//
//   node scripts/chromium-port.js
//
// Warum erzeugt und nicht kopiert: sidebar.html allein hat 1400+ Zeilen und
// aendert sich mit jedem Release. Eine Handkopie waere nach zwei Wochen
// veraltet - genau der Fehler, der schon einmal Farbaenderungen verschluckt
// hat. main.js und die HTML-Dateien im Projektwurzel-Verzeichnis bleiben die
// einzige Wahrheit.
//
// Zwei Dinge muessen sich bei jeder Seite aendern:
//  1. Erweiterungen der Stufe 3 verbieten Skripte IM Dokument. Der eingebaute
//     <script>-Block wandert deshalb in eine eigene Datei.
//  2. Statt Electrons preload.js liefert eine Bruecke das jeweilige API.
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const zielOrdner = path.join(wurzel, 'chromium', 'extension');

// Vertis Leiste bleibt, wie sie ist.
//
// Zwischenzeitlich stand hier eine Ergaenzung, die sie ausgeblendet hat - damals
// sollte Chromiums eingebaute vertikale Tableiste ihre Rolle uebernehmen. Das
// ist am 03.09.2026 verworfen worden (falsche Richtung, zu kleine Symbole,
// falsche Farbe, fremde Knoepfe). Chromium zeigt jetzt gar keine Tableiste mehr,
// und sidebar.html bringt Kopfzeile und Leiste wieder selbst mit - genau wie in
// der Electron-Fassung.
//
// Der Chromium-Patch rueckt den Seiteninhalt passend ein: 68 px links fuer die
// Leiste, 44 px oben fuer die Kopfzeile. Diese Zahlen stehen in
// browser_view_layout_impl.cc und muessen zu den Werten in sidebar.html passen.
const SIDEBAR_CSS = '';

const SEITEN = [
  { quelle: 'sidebar.html', js: 'sidebar.js', bruecke: 'verti-shim.js', css: SIDEBAR_CSS },
  { quelle: 'update.html', js: 'update.js', bruecke: 'update-shim.js', css: '' },
];

function porte(seite) {
  const roh = fs.readFileSync(path.join(wurzel, seite.quelle), 'utf8');

  // Alle <script>-Bloecke OHNE src einsammeln
  const bloecke = [];
  const html = roh.replace(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g, (_t, inhalt) => {
    bloecke.push(inhalt);
    return '@@SKRIPT@@';
  });
  if (!bloecke.length) throw new Error(seite.quelle + ': kein eingebauter <script>-Block gefunden');

  // Der erste Platzhalter bekommt die Verweise, weitere fallen weg
  let ersterErsetzt = false;
  let fertig = html.replace(/@@SKRIPT@@/g, () => {
    if (ersterErsetzt) return '';
    ersterErsetzt = true;
    return `<script src="${seite.bruecke}"></script>\n  <script src="${seite.js}"></script>`;
  });
  // Ergaenzung ans Ende des <head>, damit sie die Regeln der Seite schlaegt
  if (seite.css) fertig = fertig.replace('</head>', seite.css + '\n</head>');

  const kopf = [
    '// ERZEUGT von scripts/chromium-port.js aus ' + seite.quelle + ' - NICHT von Hand aendern.',
    '// Aenderungen gehoeren in ' + seite.quelle + ' im Projektwurzel-Verzeichnis,',
    '// danach "node scripts/chromium-port.js" laufen lassen.',
    '',
  ].join('\n');
  const js = kopf + bloecke.join('\n');

  fs.writeFileSync(path.join(zielOrdner, seite.quelle), fertig);
  fs.writeFileSync(path.join(zielOrdner, seite.js), js);

  const zeilen = (s) => s.split('\n').length;
  console.log('  ' + seite.quelle.padEnd(14) + zeilen(fertig) + ' Zeilen  +  '
    + seite.js.padEnd(12) + zeilen(js) + ' Zeilen');
}

for (const s of SEITEN) porte(s);
