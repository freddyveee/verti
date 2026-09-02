# Verti auf Chromium

Hier liegt alles, was Verti aus einem blanken Chromium macht. Der Chromium-
Quelltext selbst liegt NICHT im Repo (er ist ueber 100 GB gross), sondern auf
der externen SSD unter `/Volumes/VertiBuild/chromium/src`.

Deshalb gilt: **jede Aenderung am Chromium-Quelltext gehoert sofort in
`patches/verti.patch`.** Sonst ist sie weg, sobald die Platte ausfaellt oder
Chromium neu geholt wird.

## Aufbau

```
chromium/
  patches/verti.patch   Aenderungen am Chromium-Quelltext
  extension/            Vertis Sidebar als Erweiterung (grossteils erzeugt)
  bau.sh                Patch anwenden, bauen, Erweiterung einlegen
```

## Was der Patch aendert

| Datei | Aenderung |
|---|---|
| `chrome/app/theme/chromium/BRANDING` | Produktname "Verti", Bundle-Kennung `rocks.imperio.verti` (identisch zur heutigen Verti-App, damit ein Update nahtlos druebergeht), Team-Kennung |
| `chrome/browser/ui/tabs/tab_strip_prefs.cc` | Vertikale Tableiste von Anfang an an und eingeklappt - das IST Vertis App-Leiste |

## Die Erweiterung

`extension/` ist zum groessten Teil **erzeugt**, nicht von Hand geschrieben.
Nach jeder Aenderung an `main.js`, `app-status.json` oder `sidebar.html`:

```bash
node scripts/katalog-export.js
node scripts/chromium-port.js
```

Von Hand gepflegt werden nur `manifest.json`, `sw.js` (Gegenstueck zu
`main.js`), `badge-content.js` und die beiden Bruecken `verti-shim.js`
(`window.verti`) und `update-shim.js` (`window.vertiUpdate`).

## Bauen

```bash
./chromium/bau.sh
```

Erstbau dauert etwa vier Stunden, ein Aenderungsbau je nach Umfang sechs
Minuten bis gut eine Stunde.

## Bau-Schalter

In `out/Release/args.gn`. Drei davon sind nicht selbstverstaendlich:

```
proprietary_codecs = true      # H.264
ffmpeg_branding = "Chrome"     # AAC
enable_widevine = true         # DRM, sonst spielt Spotify nicht
```

Messungen dazu stehen in `CHROMIUM-STATUS.md` im Projektwurzel-Verzeichnis.
