#!/bin/bash
# Packt Verti.app in ein CRX3-Paket, wie Vertis Updater es erwartet.
#
#   ./scripts/crx3-paket.sh [ziel-ordner]
#
# Ergebnis (beides gehoert ins GitHub-Release):
#   Verti-Mac.crx3          das Paket
#   Verti-Mac.crx3.sha256   der Pruefwert, den der Server ausliefert
#
# Aufbau des Pakets:
#   Verti.app/            die neue Fassung
#   .keystone_install     Googles Installationsskript, auf Verti angepasst
#                         (liegt im Chromium-Baum, wird vom Patch angepasst)
#
# Der Updater packt das aus, ruft `.keystone_install <auspackpfad> <app-pfad>
# <version>` auf, und das Skript tauscht die App atomar aus - mit Signatur-
# pruefung, Rechten und Quarantaene. Diesen heiklen Teil schreiben wir bewusst
# NICHT selbst.
#
# Der Signierschluessel liegt NUR in ~/Verti-Signing/verti-crx3.der und gehoert
# nicht ins Repo. Sein Fingerabdruck steht als crx_pkhash im Chromium-Patch;
# der Updater nimmt nur Pakete an, die damit signiert sind.
set -euo pipefail

SRC=/Volumes/VertiBuild/chromium/src
DEPOT=/Volumes/VertiBuild/depot_tools
KEY="${HOME}/Verti-Signing/verti-crx3.der"
ZIEL="${1:-${SRC}/out/Release}"
APP="${SRC}/out/Release/Verti.app"
SKRIPT="${SRC}/chrome/installer/mac/keystone_install.sh"
PACKER="${SRC}/out/Release/crx3_build_action"

for pfad in "$APP" "$SKRIPT"; do
  [ -e "$pfad" ] || { echo "Fehlt: $pfad"; exit 1; }
done
[ -f "$KEY" ] || { echo "Signierschluessel fehlt: $KEY

Einmalig erzeugen (ZWEI Schritte, siehe unten):
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out \"\$KEY.tmp\"
  openssl pkcs8 -topk8 -nocrypt -in \"\$KEY.tmp\" -outform DER -out \"\$KEY\"
  rm \"\$KEY.tmp\"

Der Packer braucht PKCS#8. Ein blosses 'genpkey -outform DER' liefert auf dem
Mac PKCS#1, damit bricht er mit 'Malformed PrivateKeyInfo' ab.

ACHTUNG: Danach den Fingerabdruck in chromium/patches/verti.patch (crx_pkhash)
anpassen und den Updater neu bauen - sonst lehnt er die Pakete ab."; exit 1; }

# Packer bauen, falls noch nicht da
if [ ! -x "$PACKER" ]; then
  echo "Baue den CRX3-Packer …"
  export PATH="$DEPOT:$PATH"; export DEPOT_TOOLS_UPDATE=0
  (cd "$SRC" && autoninja -C out/Release components/crx_file:crx3_build_action >/dev/null)
fi

VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Packe Verti $VERSION …"
# ditto statt cp: erhaelt Symlinks, Rechte und erweiterte Attribute des Bundles.
# Mit cp -R waere die Signatur der App kaputt.
ditto "$APP" "$TMP/Verti.app"
cp "$SKRIPT" "$TMP/.keystone_install"
chmod +x "$TMP/.keystone_install"

# Der Packer nimmt ein ZIP entgegen
(cd "$TMP" && zip -q -r --symlinks payload.zip Verti.app .keystone_install)

mkdir -p "$ZIEL"
"$PACKER" "$ZIEL/Verti-Mac.crx3" "$TMP/payload.zip" "$KEY"
shasum -a 256 "$ZIEL/Verti-Mac.crx3" | awk '{print $1}' > "$ZIEL/Verti-Mac.crx3.sha256"

echo
echo "Fertig:"
ls -lh "$ZIEL/Verti-Mac.crx3" | awk '{print "  " $NF "  " $5}'
echo "  Pruefwert: $(cat "$ZIEL/Verti-Mac.crx3.sha256")"
echo
echo "Beide Dateien gehoeren ins GitHub-Release, sonst findet der Server sie nicht."
