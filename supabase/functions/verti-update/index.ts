// Verti-Update-Server (Supabase Edge Function).
//
// Chromiums Updater spricht das Omaha-Protokoll: er schickt per POST, welche
// Version er hat, und erwartet als Antwort entweder "noupdate" oder ein Paket
// zum Herunterladen. Diese Funktion uebersetzt das auf Vertis GitHub-Releases -
// derselbe Kanal, den die Electron-Fassung schon benutzt.
//
// Warum ueberhaupt ein Server: eine Erweiterung darf das Programm nicht selbst
// austauschen. Chromiums eigener Updater kann das - er kuemmert sich um Rechte,
// Signaturpruefung und Neustart. Er braucht dafuer nur jemanden, der ihm sagt,
// wo das neue Paket liegt. Genau das ist diese Datei.
//
// Deployen (macht Freddy, aus dem Projektwurzel-Verzeichnis):
//   supabase functions deploy verti-update --project-ref dganalwiakzgrskkvrvs
//
// verify_jwt = false steht in supabase/config.toml: Vertis Updater schickt
// keinen Supabase-Schluessel mit. Die Funktion gibt nur oeffentliche
// Release-Daten heraus, deshalb ist das in Ordnung.

const RELEASES = 'https://api.github.com/repos/freddyveee/verti/releases/latest';

// Vertis Kennung beim Updater. Auf dem Mac ist das die BUNDLE-Kennung, nicht
// browser_appid aus branding.gni - der Browser meldet sich unter
// BrowserUpdaterClient::GetAppId() an, und das ist die Bundle-Kennung
// (Chrome benutzt dort ebenfalls "com.google.chrome").
const VERTI_APPID = 'rocks.imperio.verti';

// Antworten kurz zwischenspeichern, damit nicht jeder Start eine GitHub-Abfrage
// ausloest (GitHub begrenzt anonyme Abfragen auf 60 pro Stunde und IP).
let cache: { zeit: number; daten: Release | null } = { zeit: 0, daten: null };
const CACHE_MS = 5 * 60 * 1000;

type Release = { version: string; url: string; groesse: number; sha256: string };

function versionNeuer(neu: string, alt: string): boolean {
  const z = (v: string) => String(v || '').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const a = z(neu), b = z(alt);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

async function neuestesRelease(): Promise<Release | null> {
  if (cache.daten && Date.now() - cache.zeit < CACHE_MS) return cache.daten;
  const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'verti-update' } });
  if (!r.ok) return cache.daten;
  const rel = await r.json();

  // Der Updater erwartet ein CRX3-Paket, keine ZIP-Datei. Das Release braucht
  // deshalb drei Dateien, die scripts/crx3-paket.sh alle anlegt:
  //   Verti-Mac.crx3          das Paket
  //   Verti-Mac.crx3.sha256   der Pruefwert
  //   Verti-Mac.crx3.version  die Version der App darin
  const paket = (rel.assets || []).find((a: any) => /Verti-Mac\.crx3$/i.test(a.name));
  const pruef = (rel.assets || []).find((a: any) => /Verti-Mac\.crx3\.sha256$/i.test(a.name));
  const versDatei = (rel.assets || []).find((a: any) => /Verti-Mac\.crx3\.version$/i.test(a.name));
  if (!paket || !pruef) { cache = { zeit: Date.now(), daten: null }; return null; }

  const sha = (await fetch(pruef.browser_download_url).then((x) => x.text())).trim().split(/\s+/)[0];

  // Die Version kommt aus einer eigenen Datei, NICHT aus dem Release-Tag.
  //
  // Grund: das Chromium-Verti traegt Chromiums Versionsnummer (z.B.
  // 155.0.8038.0, vier Teile). Der Release-Tag muss aber weiter eine
  // Verti-Zahl sein - zum einen fuer Menschen, zum anderen weil der alte
  // Electron-Updater ihn als Semver liest und mit vier Teilen nichts anfangen
  // kann. Beide Welten kommen so ohne Verrenkung aus.
  const version = versDatei
    ? (await fetch(versDatei.browser_download_url).then((x) => x.text())).trim()
    : String(rel.tag_name || '').replace(/^v/, '');

  const daten: Release = {
    version,
    url: paket.browser_download_url,
    groesse: paket.size,
    sha256: sha,
  };
  cache = { zeit: Date.now(), daten };
  return daten;
}

function antwort(koerper: unknown) {
  // Omaha-Antworten beginnen mit einem Schutz-Praefix gegen JSON-Hijacking.
  return new Response(")]}'\n" + JSON.stringify(koerper), {
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Verti-Update-Server. Erwartet POST im Omaha-Format.', { status: 405 });
  }

  let anfrage: any = {};
  try { anfrage = await req.json(); } catch { /* leere Anfrage ist auch eine Anfrage */ }
  const apps = anfrage?.request?.app || anfrage?.request?.apps || [];

  const rel = await neuestesRelease();

  const ergebnis = (Array.isArray(apps) ? apps : []).map((app: any) => {
    const id = String(app?.appid || '').toLowerCase();
    const hier = String(app?.version || '0.0.0.0');

    // Nur Verti selbst beantworten. Fuer alles andere (der Updater fragt auch
    // nach sich selbst) sagen wir ehrlich "kein Update" statt zu raten.
    const istVerti = id === VERTI_APPID.toLowerCase();
    if (!istVerti || !rel || !versionNeuer(rel.version, hier)) {
      return { appid: id, status: 'ok', updatecheck: { status: 'noupdate' } };
    }

    return {
      appid: id,
      status: 'ok',
      updatecheck: {
        status: 'ok',
        nextversion: rel.version,
        pipelines: [{
          operations: [
            { type: 'download', urls: [{ url: rel.url }], out: { sha256: rel.sha256 }, size: rel.groesse },
            // "." ist das ausgepackte Verzeichnis. Der Updater sucht darin
            // selbst nach .keystone_install. Gibt man das Skript direkt an,
            // bricht er mit "no handler for .keystone_install" ab - er waehlt
            // den Handler naemlich nach der Dateiendung.
            { type: 'crx3', path: '.', arguments: '', in: { sha256: rel.sha256 } },
          ],
        }],
      },
    };
  });

  return antwort({ response: { protocol: '4.0', apps: ergebnis } });
});
