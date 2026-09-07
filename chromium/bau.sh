#!/bin/bash
# Baut Verti auf Chromium: Patch anwenden, bauen, Erweiterung einlegen.
#
#   ./chromium/bau.sh              bauen
#   ./chromium/bau.sh --nur-patch  nur den Patch anwenden
#   ./chromium/bau.sh --patch-neu  aktuelle Quelltext-Aenderungen in den Patch
#                                  zurueckschreiben (nach eigenen Aenderungen)
set -euo pipefail

SRC=/Volumes/VertiBuild/chromium/src
DEPOT=/Volumes/VertiBuild/depot_tools
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="$REPO/chromium/patches/verti.patch"

if [ ! -d "$SRC" ]; then
  echo "Chromium-Quelltext nicht gefunden: $SRC"
  echo "Haengt die externe SSD (VertiBuild) dran?"
  exit 1
fi

export PATH="$DEPOT:$PATH"
export DEPOT_TOOLS_UPDATE=0

# Aenderungen zurueck in den Patch schreiben.
#
# Die Symbol-Dateien bleiben AUSSEN VOR. git diff schreibt fuer Bilder nur
# "Binary files a/... and b/... differ" ohne die Daten - ein Patch mit so einer
# Zeile laesst sich hinterher nicht mehr anwenden, git apply bricht ab. Die
# Bilder kommen ohnehin aus build/ in diesem Repo (scripts/chromium-symbole.sh).
if [ "${1:-}" = "--patch-neu" ]; then
  (cd "$SRC" && git diff -- . ':(exclude)chrome/app/theme/chromium/mac') > "$PATCH"
  if grep -q "^Binary files" "$PATCH"; then
    echo "ACHTUNG: Der Patch enthaelt Binaerzeilen ohne Daten und waere unbrauchbar."
    grep -n "^Binary files" "$PATCH"
    exit 1
  fi
  echo "Patch aufgefrischt: $PATCH ($(grep -c '^diff --git' "$PATCH") Dateien)"
  exit 0
fi

# Patch anwenden - schon angewendete Teile werden uebersprungen, nicht doppelt
# eingespielt. Deshalb erst pruefen, ob ueberhaupt etwas fehlt.
cd "$SRC"
if git apply --check --reverse "$PATCH" 2>/dev/null; then
  echo "Patch ist bereits drin."
else
  echo "Patch wird angewendet …"
  git apply --3way "$PATCH"
fi

# Die drei Dateien fuer die Gestaltung des Installationsfensters bereitlegen.
# pipeline.py erwartet sie im Packordner; im offenen Chromium gibt es nur
# Googles interne Fassungen, die bei uns fehlen.
DMG_ZIEL="$SRC/out/Release/Verti Packaging"
if [ -d "$DMG_ZIEL" ]; then
  cp "$REPO/build/dmg-bg.png"    "$DMG_ZIEL/verti_dmg_background.png"
  cp "$REPO/build/icon.icns"     "$DMG_ZIEL/verti_dmg_icon.icns"
  cp "$REPO/build/dmg-dsstore"   "$DMG_ZIEL/verti_dmg_dsstore"
fi

# Vertis Symbol setzen. Das gehoert NICHT in den Patch: git diff speichert
# Bilder nicht mit (am 03.09.2026 nachgesehen, null Binaerbloecke). Ohne diesen
# Schritt traegt Verti Chromiums blaue Kugel.
"$REPO/scripts/chromium-symbole.sh"

if [ "${1:-}" = "--nur-patch" ]; then exit 0; fi

# Die Bau-Schalter muessen stehen, sonst fehlen Widevine und H.264/AAC
for schalter in "proprietary_codecs = true" 'ffmpeg_branding = "Chrome"' "enable_widevine = true" "enable_updater = true"; do
  if ! grep -qF "$schalter" out/Release/args.gn; then
    echo "ACHTUNG: '$schalter' fehlt in out/Release/args.gn"
    echo "Ohne diese Schalter spielt Spotify nicht, fehlt MP4-Video, oder Verti"
    echo "kann sich nicht beim Updater anmelden."
    exit 1
  fi
done

echo "Baue … (Erstbau ~4 h, Aenderungsbau 6 min bis gut 1 h)"
# "chrome" allein reicht NICHT: die Signier- und Packskripte liegen als KOPIE
# in out/Release/Verti Packaging und werden nur von diesem Ziel aufgefrischt.
# Ohne das signiert man mit veralteten Skripten - am 03.09.2026 kam deshalb
# eine DMG ohne Gestaltung heraus, obwohl der Quelltext stimmte.
caffeinate -i autoninja -C out/Release chrome chrome/installer/mac

# Die Sidebar-Erweiterung in die fertige App legen.
#
# WICHTIG: in die Resources des FRAMEWORKS, nicht in die der aeusseren App.
# Chromiums DIR_RESOURCES zeigt auf dem Mac dorthin, und genau von dort laedt
# component_loader.cc sie beim Start. Liegt sie woanders, startet Verti als
# nacktes Chromium.
FW=$(find "$SRC/out/Release/Verti.app/Contents/Frameworks" -maxdepth 4 -type d -name "Resources" -path "*Verti Framework.framework*" | head -1)
[ -n "$FW" ] || { echo "Framework-Resources nicht gefunden"; exit 1; }
ZIEL="$FW/verti-sidebar"
rm -rf "$ZIEL"
mkdir -p "$ZIEL"
cp -R "$REPO/chromium/extension/." "$ZIEL/"

# Die echte Versionsnummer der gebauten App ins Manifest stempeln.
#
# In chromium/extension/manifest.json steht nur ein Platzhalter. Ohne diesen
# Schritt zeigt Verti unter Einstellungen -> Version die alte Nummer der
# Electron-Fassung an (1.1.18), waehrend "Nach Updates suchen" gegen die
# echte prueft. Chromiums Kennung hilft nicht weiter: die ist gekuerzt
# ("Chrome/155.0.0.0", am 07.09.2026 gemessen).
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$SRC/out/Release/Verti.app/Contents/Info.plist")
python3 - "$ZIEL/manifest.json" "$VERSION" <<'PYTHON'
import json, sys
pfad, version = sys.argv[1], sys.argv[2]
m = json.load(open(pfad))
m['version'] = version
json.dump(m, open(pfad, 'w'), indent=2, ensure_ascii=False)
PYTHON
echo "Erweiterung eingelegt, Version $VERSION"

echo "Fertig: $SRC/out/Release/Verti.app"
