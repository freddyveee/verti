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

# Aenderungen zurueck in den Patch schreiben
if [ "${1:-}" = "--patch-neu" ]; then
  (cd "$SRC" && git diff) > "$PATCH"
  echo "Patch aufgefrischt: $PATCH"
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
caffeinate -i autoninja -C out/Release chrome

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
echo "Fertig: $SRC/out/Release/Verti.app"
