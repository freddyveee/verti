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

# Die App MUSS die signierte und notarisierte sein. Googles Installationsskript
# prueft beim Austausch die Signatur - eine nur "adhoc" signierte App wird
# abgelehnt, und der Nutzer bekaeme das Update nie.
# Die signierte App steckt in der DMG aus dem Signierlauf.
DMG=$(ls -t "${SRC}/out/Release/signed/"*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "Keine signierte DMG in ${SRC}/out/Release/signed/ gefunden.

Erst signieren und notarisieren:
  python3 \"${SRC}/out/Release/Verti Packaging/sign_chrome.py\" \\
    --input out/Release --output out/Release/signed \\
    --identity \"Developer ID Application: Freddy Henrich-Held (CHS9G483R4)\" \\
    --notarize staple \\
    --notary-arg=--keychain-profile --notary-arg=verti-notary

Vorher den Updater signieren, sonst bricht der Lauf ab - siehe CHROMIUM-STATUS.md."
  exit 1
fi

MOUNT=$(hdiutil attach "$DMG" -nobrowse -readonly 2>/dev/null | grep -oE "/Volumes/.*" | head -1)
[ -n "$MOUNT" ] || { echo "DMG liess sich nicht oeffnen: $DMG"; exit 1; }
aufraeumen() {
  [ -n "${MOUNT:-}" ] && hdiutil detach "$MOUNT" >/dev/null 2>&1
  [ -n "${TMP:-}" ] && rm -rf "$TMP"
  return 0
}
trap aufraeumen EXIT
APP="${MOUNT}/Verti.app"
echo "Nehme die signierte App aus: $(basename "$DMG")"
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

SIGINFO=$(codesign -dv --verbose=2 "$APP" 2>&1 || true)
if ! printf '%s' "$SIGINFO" | grep -q "Authority=Developer ID Application"; then
  echo "Die App in der DMG ist NICHT mit der Developer ID signiert. Abbruch."
  echo "Was codesign meldet:"
  printf '%s\n' "$SIGINFO" | head -8 | sed 's/^/  /'
  exit 1
fi
echo "Packe Verti $VERSION (signiert und notarisiert) …"
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
