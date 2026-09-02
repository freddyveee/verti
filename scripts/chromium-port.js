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

// In Chromium zeichnet die eingebaute vertikale Tableiste Vertis App-Leiste.
// Die Leiste aus sidebar.html waere sonst doppelt da. Statt sidebar.html zu
// aendern (dort ist sie fuer Electron richtig) legen wir hier eine kleine
// Ergaenzung darueber - eine Quelle bleibt eine Quelle.
const SIDEBAR_CSS = `
  <style>
  /* --- von scripts/chromium-port.js ergaenzt, nur fuer die Chromium-Fassung --- */
  /* Die App-Leiste zeichnet Chromiums vertikale Tableiste. */
  .sidebar { display: none !important; }
  /* Bibliothek und Einstellungen bekommen dadurch den Platz ganz links. */
  .library, .settings { left: 0 !important; }
  </style>`;

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
