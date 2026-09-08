#!/bin/bash
# Signiert und notarisiert Verti fuer den Mac - der komplette Ablauf.
#
#   ./scripts/mac-signieren.sh
#
# Reihenfolge ist WICHTIG und war die Quelle mehrerer verlorener Stunden:
#
#  1. Erst den Updater signieren. Er liegt im Verti-Paket, ist aus dem Bau aber
#     nur "adhoc" signiert (ohne versiegelte Ressourcen). sign_chrome.py fasst
#     ihn NICHT an - bei Google kommt er fertig signiert aus deren internem
#     Depot. Ohne diesen Schritt bricht die Pruefung ab mit
#     "code has no resources but signature indicates they must be present".
#  2. Den signierten Updater zurueck ins Framework legen.
#  3. Erst dann Verti signieren und notarisieren.
#
# Voraussetzungen: Zertifikat im Schluesselbund, Notar-Zugang "verti-notary",
# und der Mac muss ENTSPERRT sein - bei gesperrtem Bildschirm findet
# notarytool den Schluesselbund nicht.
set -euo pipefail

# Den Bildschirm waehrend des ganzen Laufs wachhalten.
#
# Geht der Mac in die Sperre, findet notarytool das Schluesselbund-Profil nicht
# mehr ("No Keychain password item found") und die Notarisierung bricht ab -
# am 07.09.2026 zweimal passiert, beim zweiten Mal erst NACH dem Hochladen zu
# Apple. Die Notarisierung dauert 5 bis 15 Minuten, so lange liegt der Rechner
# sonst leicht still.
#
# caffeinate -d verhindert Bildschirmschoner und Ruhezustand des Bildschirms,
# solange dieses Skript laeuft. Gegen ein Zuklappen oder manuelles Sperren
# hilft es nicht - deshalb steht die Pruefung darunter.
if [ -z "${VERTI_WACH:-}" ]; then
  export VERTI_WACH=1
  exec caffeinate -d "$0" "$@"
fi

if ioreg -n Root -d1 -r 2>/dev/null | grep -q '"CGSSessionScreenIsLocked"=Yes'; then
  echo "Der Bildschirm ist gesperrt. notarytool kaeme nicht an den Schluesselbund."
  echo "Bitte den Mac entsperren und noch einmal starten."
  exit 1
fi


SRC=/Volumes/VertiBuild/chromium/src
IDENT="Developer ID Application: Freddy Henrich-Held (CHS9G483R4)"
NOTAR_PROFIL=verti-notary
OUT="$SRC/out/Release/signed"

# Erst die Bauplatte sicherstellen. Ohne das meldet die Zeile darunter
# "Verti.app fehlt - erst bauen", obwohl in Wirklichkeit nur das Sparsebundle
# abgemeldet war (am 08.09.2026 passiert, kostete einen ganzen Anlauf).
"$(cd "$(dirname "$0")/.." && pwd)/scripts/bauplatte-anhaengen.sh"

[ -d "$SRC/out/Release/Verti.app" ] || { echo "Verti.app fehlt - erst bauen (./chromium/bau.sh)"; exit 1; }
security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENT" \
  || { echo "Zertifikat nicht im Schluesselbund: $IDENT"; exit 1; }

cd "$SRC"

echo "1/3  Updater signieren …"
rm -rf out/Release/updater-signed
python3 "out/Release/Updater Packaging/sign_updater.py" \
  --input out/Release --output out/Release/updater-signed \
  --identity "$IDENT" --notarize none --disable-packaging >/dev/null 2>&1

ZIP=$(ls -t out/Release/updater-signed/*.zip 2>/dev/null | head -1)
[ -n "$ZIP" ] || { echo "Der signierte Updater ist nicht entstanden."; exit 1; }

echo "2/3  Signierten Updater ins Verti-Paket legen …"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
ditto -x -k "$ZIP" "$TMP"
QUELLE=$(find "$TMP" -maxdepth 2 -name "VertiUpdater.app" | head -1)
[ -n "$QUELLE" ] || { echo "VertiUpdater.app nicht im Paket gefunden."; exit 1; }
ZIEL=$(find "out/Release/Verti.app/Contents/Frameworks" -maxdepth 5 -type d -name "VertiUpdater.app" | head -1)
[ -n "$ZIEL" ] || { echo "Kein Platz fuer den Updater im Framework gefunden."; exit 1; }
rm -rf "$ZIEL"; ditto "$QUELLE" "$ZIEL"
# Erst einfangen, dann pruefen: codesign schreibt auf den FEHLERKANAL, und mit
# `set -o pipefail` reisst das eine Pipe-Pruefung mit, obwohl alles stimmt.
SIGINFO=$(codesign -dv --verbose=2 "$ZIEL" 2>&1 || true)
printf '%s' "$SIGINFO" | grep -q "Authority=Developer ID Application" || {
  echo "Der eingelegte Updater ist nicht richtig signiert. codesign meldet:"
  printf '%s\n' "$SIGINFO" | head -6 | sed 's/^/  /'
  exit 1
}

echo "3/3  Verti signieren, notarisieren und verpacken (dauert, Mac wach lassen) …"
rm -rf "$OUT"
caffeinate -i python3 "out/Release/Verti Packaging/sign_chrome.py" \
  --input out/Release --output "$OUT" \
  --identity "$IDENT" \
  --notarize staple \
  --notary-arg=--keychain-profile --notary-arg="$NOTAR_PROFIL"

DMG=$(ls -t "$OUT"/*.dmg 2>/dev/null | head -1)
[ -n "$DMG" ] || { echo "Es ist keine DMG entstanden - siehe Ausgabe oben."; exit 1; }
echo
echo "Fertig: $DMG"
echo "Jetzt pruefen mit: ./scripts/signatur-pruefen.sh"
