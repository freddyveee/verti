#!/bin/bash
# Erzeugt die Fenstervorlage fuer Vertis Installations-DMG.
#
#   ./scripts/dmg-vorlage.sh
#
# Ergebnis: build/dmg-dsstore
#
# Was das ist: macOS merkt sich Fenstergroesse, Hintergrundbild und die
# Position der Symbole in einer versteckten Datei namens .DS_Store. Chromiums
# Packskript kopiert so eine Datei in die DMG - bei Google liegt sie fertig im
# internen Depot, bei uns muessen wir sie selbst anlegen.
#
# Gemacht wird das einmal ueber den Finder: eine Probe-DMG bauen, das Fenster
# einrichten, und die entstandene .DS_Store herausholen. Danach liegt sie im
# Repo und wird bei jedem Bau mitverwendet.
#
# Die Zahlen richten sich nach build/dmg-bg.png (540 x 380): der Pfeil im
# Hintergrund liegt auf Hoehe 225, links davon gehoert Verti, rechts der
# Programme-Ordner.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HG="$REPO/build/dmg-bg.png"
ZIEL="$REPO/build/dmg-dsstore"
NAME="Verti"
BREITE=540
HOEHE=380
SYMBOLGROESSE=96
Y=225
X_APP=140
X_ORDNER=400

[ -f "$HG" ] || { echo "Hintergrundbild fehlt: $HG"; exit 1; }

TMP=$(mktemp -d)
aufraeumen() {
  hdiutil detach "/Volumes/$NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap aufraeumen EXIT

echo "Baue eine Probe-DMG …"
mkdir -p "$TMP/inhalt/.background"
cp "$HG" "$TMP/inhalt/.background/background.png"
# Platzhalter statt der echten App - fuer die Vorlage zaehlt nur der Name
mkdir -p "$TMP/inhalt/Verti.app"
ln -s /Applications "$TMP/inhalt/Applications"

hdiutil create -srcfolder "$TMP/inhalt" -volname "$NAME" -fs HFS+ \
  -format UDRW -size 50m "$TMP/vorlage.dmg" >/dev/null
hdiutil attach "$TMP/vorlage.dmg" -nobrowse >/dev/null
sleep 2

echo "Richte das Fenster ein …"
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 200, 200 + $BREITE, 200 + $HOEHE}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to $SYMBOLGROESSE
    set background picture of viewOptions to file ".background:background.png"
    set position of item "Verti.app" of container window to {$X_APP, $Y}
    set position of item "Applications" of container window to {$X_ORDNER, $Y}
    update without registering applications
    close
  end tell
end tell
APPLESCRIPT

sleep 2
[ -f "/Volumes/$NAME/.DS_Store" ] || { echo "Der Finder hat keine .DS_Store angelegt.

Wahrscheinlich fehlt die Berechtigung, den Finder zu steuern:
Systemeinstellungen -> Datenschutz & Sicherheit -> Automation -> claude -> Finder."; exit 1; }

cp "/Volumes/$NAME/.DS_Store" "$ZIEL"
echo
echo "Fertig: $ZIEL ($(wc -c < "$ZIEL") Bytes)"
echo "Wird von chromium/bau.sh in den Packordner gelegt und beim Signieren mitverwendet."
