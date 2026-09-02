// Holt Vertis Katalog und die zugehoerigen Tabellen aus main.js und schreibt
// sie als apps.json fuer die Chromium-Erweiterung.
//
//   node scripts/katalog-export.js
//
// Absichtlich KEINE Kopie von Hand: der Katalog aendert sich staendig, und
// zwei Quellen wuerden sofort auseinanderlaufen. main.js bleibt die einzige
// Wahrheit; diese Datei liest sie nur aus.
//
// main.js laesst sich nicht einfach einbinden - es wuerde Electron starten.
// Deshalb schneiden wir die Konstanten heraus und werten NUR diese aus.
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(wurzel, 'main.js'), 'utf8');

// Schneidet `const NAME = <literal>;` heraus, indem Klammern gezaehlt werden.
// Verlaesslicher als ein regulaerer Ausdruck, weil im Katalog Klammern und
// Anfuehrungszeichen in Namen und Adressen vorkommen.
function literal(name) {
  const start = src.indexOf('const ' + name);
  if (start < 0) throw new Error(name + ' nicht in main.js gefunden');
  const gleich = src.indexOf('=', start);
  let i = gleich + 1;
  while (/\s/.test(src[i])) i++;
  const auf = { '[': ']', '{': '}', '(': ')' };
  const zu = auf[src[i]];
  if (!zu) throw new Error(name + ': unerwarteter Anfang ' + src[i]);
  let tiefe = 0, imText = null, escape = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (escape) { escape = false; continue; }
    if (imText) {
      if (c === '\\') escape = true;
      else if (c === imText) imText = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { imText = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (auf[c]) tiefe++;
    else if (c === ']' || c === '}' || c === ')') { tiefe--; if (tiefe === 0) return src.slice(src.indexOf(zu === ']' ? '[' : zu === '}' ? '{' : '(', gleich), i + 1); }
  }
  throw new Error(name + ': Ende nicht gefunden');
}

// DEFAULT_APPS wird in CATALOG hineingestreut, muss also mit ausgewertet werden.
const werte = new Function(
  'return (() => {\n'
  + '  const DEFAULT_APPS = ' + literal('DEFAULT_APPS') + ';\n'
  + '  const CATALOG = ' + literal('CATALOG') + ';\n'
  + '  const IMPERIO_IDS = ' + literal('IMPERIO_IDS') + ';\n'
  + '  const CATEGORY_ORDER = ' + literal('CATEGORY_ORDER') + ';\n'
  + '  const CATEGORIES = ' + literal('CATEGORIES') + ';\n'
  + '  const FARBWELTEN = ' + literal('FARBWELTEN') + ';\n'
  + '  const FENSTER_BG = ' + literal('FENSTER_BG') + ';\n'
  + '  return { DEFAULT_APPS, CATALOG, IMPERIO_IDS, CATEGORY_ORDER, CATEGORIES, FARBWELTEN, FENSTER_BG };\n'
  + '})()'
)();

// TITLE_BADGE_APPS ist ein Set, das faellt aus dem Schema oben heraus
// Pruefstufen der Apps (geprueft / experimentell). Eigene Datei, damit sich die
// Liste ohne Code-Aenderung pflegen laesst - genau wie in main.js.
let appStatus = { geprueft: {}, experimentell: [] };
try {
  const roh = JSON.parse(fs.readFileSync(path.join(wurzel, 'app-status.json'), 'utf8'));
  appStatus = { geprueft: roh.geprueft || {}, experimentell: roh.experimentell || [] };
} catch (e) {}

// Feedback-Zugang (anon-Schluessel, darf nur INSERT) - ebenfalls aus main.js,
// damit er nicht an zwei Stellen gepflegt werden muss.
const supaUrl = (src.match(/const SUPABASE_URL = '([^']*)'/) || [])[1] || '';
const supaKey = (src.match(/const SUPABASE_ANON_KEY = '([^']*)'/) || [])[1] || '';

const badgeRoh = src.match(/const TITLE_BADGE_APPS = new Set\((\[[^\]]*\])\)/);
if (!badgeRoh) throw new Error('TITLE_BADGE_APPS nicht gefunden');
const titleBadge = new Function('return ' + badgeRoh[1])();

const raus = {
  erzeugtAus: 'main.js',
  apps: werte.CATALOG,
  standardApps: werte.DEFAULT_APPS.map((a) => a.id),
  imperio: werte.IMPERIO_IDS,
  kategorien: werte.CATEGORIES,
  kategorieReihenfolge: werte.CATEGORY_ORDER,
  titleBadge,
  farbwelten: werte.FARBWELTEN,
  fensterBg: werte.FENSTER_BG,
  appStatus,
  feedback: { url: supaUrl, key: supaKey },
};

const ziel = path.join(wurzel, 'chromium', 'extension', 'apps.json');
fs.writeFileSync(ziel, JSON.stringify(raus, null, 2));
console.log(`apps.json geschrieben: ${raus.apps.length} Apps, ${werte.CATEGORY_ORDER.length} Kategorien, ${titleBadge.length} Titel-Badge-Apps, Feedback ${supaUrl ? 'ja' : 'nein'}`);
