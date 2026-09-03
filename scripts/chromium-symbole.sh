#!/bin/bash
# Setzt Vertis Symbol im Chromium-Quelltext.
#
#   ./scripts/chromium-symbole.sh
#
# Warum ein eigenes Skript und nicht der Patch: `git diff` speichert Bilder
# nicht mit. Am 03.09.2026 nachgesehen - der Patch enthielt NULL Binaerbloecke.
# Auf einem frischen Chromium waere Chromiums blaue Kugel also zurueck gewesen.
# Die Bilder kommen deshalb aus `build/` in diesem Repo, und chromium/bau.sh
# ruft dieses Skript vor jedem Bau auf.
set -euo pipefail

SRC=/Volumes/VertiBuild/chromium/src
REPO="$(cd "$(dirname "$0")/.." && pwd)"
T="$SRC/chrome/app/theme/chromium/mac"
ICON_PNG="$REPO/build/icon.png"
ICON_ICNS="$REPO/build/icon.icns"

[ -d "$T" ] || { echo "Chromium-Quelltext nicht gefunden: $T"; exit 1; }
for f in "$ICON_PNG" "$ICON_ICNS"; do
  [ -f "$f" ] || { echo "Fehlt: $f"; exit 1; }
done

echo "Setze Vertis Symbol …"

# 1. Das klassische Symbol
cp "$ICON_ICNS" "$T/app.icns"

# 2. Der Katalog, aus dem macOS das Symbol in Dock und Finder nimmt
for g in 16 32 64 128 256 512 1024; do
  sips -z "$g" "$g" "$ICON_PNG" --out "$T/Assets.xcassets/AppIcon.appiconset/appicon_$g.png" >/dev/null
done
sips -z 256 256 "$ICON_PNG" --out "$T/Assets.xcassets/Icon.iconset/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_PNG" --out "$T/Assets.xcassets/Icon.iconset/icon_256x256@2x.png" >/dev/null

# 3. Chromiums neues Symbolformat (macOS 26, mehrere SVG-Ebenen) muss weg.
#    actool zieht es sonst dem Katalog vor, und die blaue Kugel bliebe stehen.
rm -rf "$T/AppIcon.icon"

# 4. Katalog uebersetzen. Assets.car liegt bei Chromium FERTIG im Quelltext,
#    wird also beim Bauen nicht neu erzeugt - wir muessen das selbst tun.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
actool --compile "$TMP" --platform macosx --minimum-deployment-target 11.0 \
  --app-icon AppIcon --output-partial-info-plist "$TMP/partial.plist" \
  "$T/Assets.xcassets" >/dev/null 2>&1
[ -f "$TMP/Assets.car" ] || { echo "actool hat keine Assets.car erzeugt"; exit 1; }
cp "$TMP/Assets.car" "$T/Assets.car"

echo "  app.icns, Assets.car und alle Katalogbilder gesetzt."
