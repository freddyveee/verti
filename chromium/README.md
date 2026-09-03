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
| `chrome/browser/extensions/component_loader.*` | Verti laedt seine Sidebar selbst aus den Framework-Resources |
| `chrome/browser/ui/startup/first_run_service.cc` | Chromiums Willkommensseite aus (Animation mit Musik, Standardbrowser-Frage) |
| `chrome/app/chromium_strings.grd` | Alle sichtbaren Texte sagen "Verti" statt "Chromium" |
| `components/os_crypt/common/keychain_password_mac.mm` | Schluesselbund heisst "Verti Safe Storage" - genau wie beim Electron-Verti, sonst waeren die Anmeldungen weg |
| `chrome/updater/branding.gni` | Updater heisst Verti, eigene Kennungen, eigener Update-Server; Absturzberichte und Nutzungsprotokoll NICHT mehr an Google |
| `chrome/updater/external_constants_default.cc` | CUP aus (Begruendung im Code), CRX3 statt Google-Herausgeberbeweis |
| `chrome/installer/mac/keystone_install.sh` | Googles Installationsskript auf Verti umgestellt (App-Name, Framework, drei Pfade) |
| `chrome/BUILD.gn` + `build/apple/tweak_info_plist.py` | Keystone-Schluessel ins Info.plist, mit Vertis Update-Adresse statt Googles |

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

`bau.sh` spielt den Patch ein, setzt Vertis Symbol
(`scripts/chromium-symbole.sh`), prueft die Bau-Schalter, baut und legt die
Sidebar in die Framework-Resources.

**Das Symbol steckt bewusst NICHT im Patch:** `git diff` speichert Bilder nicht
mit - am 03.09.2026 nachgesehen, der Patch enthielt null Binaerbloecke. Die
Bilder kommen aus `build/` in diesem Repo.

Erstbau dauert etwa vier Stunden, ein Aenderungsbau je nach Umfang sechs
Minuten bis gut eine Stunde.

## Bau-Schalter

In `out/Release/args.gn`. Drei davon sind nicht selbstverstaendlich:

```
proprietary_codecs = true      # H.264
ffmpeg_branding = "Chrome"     # AAC
enable_widevine = true         # DRM, sonst spielt Spotify nicht
enable_updater = true          # ohne ihn fehlen die Keystone-Schluessel
```

Messungen dazu stehen in `CHROMIUM-STATUS.md` im Projektwurzel-Verzeichnis.
