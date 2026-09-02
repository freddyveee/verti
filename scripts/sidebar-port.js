// Erzeugt aus Vertis echter sidebar.html die Fassung fuer die Chromium-
// Erweiterung.
//
//   node scripts/sidebar-port.js
//
// Warum erzeugt und nicht kopiert: sidebar.html hat 1400+ Zeilen und aendert
// sich mit jedem Release. Eine Handkopie waere nach zwei Wochen veraltet -
// genau der Fehler, der schon einmal Farbaenderungen verschluckt hat.
//
// Zwei Dinge muessen sich aendern:
//  1. Erweiterungen der Stufe 3 verbieten Skripte IM Dokument. Der eingebaute
//     <script>-Block wandert deshalb in eine eigene Datei.
//  2. Statt Electrons preload.js liefert verti-shim.js das window.verti-API.
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const quelle = fs.readFileSync(path.join(wurzel, 'sidebar.html'), 'utf8');
const zielOrdner = path.join(wurzel, 'chromium', 'extension');

// Alle <script>-Bloecke OHNE src einsammeln
const bloecke = [];
const html = quelle.replace(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g, (_treffer, inhalt) => {
  bloecke.push(inhalt);
  return '@@SKRIPT@@';
});
if (!bloecke.length) throw new Error('kein eingebauter <script>-Block in sidebar.html gefunden');

// Der erste Platzhalter bekommt die Verweise, weitere fallen weg
let ersterErsetzt = false;
const htmlFertig = html.replace(/@@SKRIPT@@/g, () => {
  if (ersterErsetzt) return '';
  ersterErsetzt = true;
  return '<script src="verti-shim.js"></script>\n  <script src="sidebar.js"></script>';
});

// In Chromium zeichnet die eingebaute vertikale Tableiste Vertis App-Leiste.
// Die Leiste aus sidebar.html waere sonst doppelt da. Statt sidebar.html zu
// aendern (dort ist sie fuer Electron richtig) legen wir hier eine kleine
// Ergaenzung darueber - eine Quelle bleibt eine Quelle.
const CHROMIUM_CSS = `
  <style>
  /* --- von scripts/sidebar-port.js ergaenzt, nur fuer die Chromium-Fassung --- */
  /* Die App-Leiste zeichnet Chromiums vertikale Tableiste. */
  .sidebar { display: none !important; }
  /* Bibliothek und Einstellungen bekommen dadurch den Platz ganz links. */
  .library, .settings { left: 0 !important; }
  </style>`;

const kopf = [
  '// ERZEUGT von scripts/sidebar-port.js aus sidebar.html - NICHT von Hand aendern.',
  '// Aenderungen gehoeren in sidebar.html im Projektwurzel-Verzeichnis, danach',
  '// "node scripts/sidebar-port.js" laufen lassen.',
  '',
].join('\n');

const js = kopf + bloecke.join('\n');
// Ergaenzung ans Ende des <head>, damit sie die Regeln aus sidebar.html schlaegt
const mitCss = htmlFertig.replace('</head>', CHROMIUM_CSS + '\n</head>');
fs.writeFileSync(path.join(zielOrdner, 'sidebar.html'), mitCss);
fs.writeFileSync(path.join(zielOrdner, 'sidebar.js'), js);

const zeilen = (s) => s.split('\n').length;
console.log('sidebar.html: ' + zeilen(mitCss) + ' Zeilen | sidebar.js: ' + zeilen(js) + ' Zeilen (aus ' + bloecke.length + ' Block/Bloecken)');
