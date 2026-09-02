#!/bin/bash
# Prueft ein fertiges Verti-Paket so, wie macOS es beim Nutzer pruefen wuerde.
#
#   ./scripts/signatur-pruefen.sh [pfad/zu/Verti.app]
#
# Diese Pruefung gehoert NACH die Notarisierung. Chromiums Signier-Skript fragt
# Gatekeeper von sich aus schon waehrend des Signierens - dort kann die Antwort
# nur "nicht notarisiert" lauten, weil das Paket zu dem Zeitpunkt tatsaechlich
# noch nicht notarisiert IST. Deshalb ist die Frage dort abgeschaltet
# (chromium_config.py im Patch) und wird hier gestellt.
set -uo pipefail

APP="${1:-/Volumes/VertiBuild/chromium/src/out/Release/signed/Verti.app}"
[ -d "$APP" ] || { echo "Nicht gefunden: $APP"; exit 1; }

echo "Pruefe: $APP"
echo

fehler=0

echo "1. Signatur vollstaendig und unveraendert"
AUSG=$(codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | grep -vE "^--(prepared|validated)")
if echo "$AUSG" | grep -q "satisfies its Designated Requirement"; then
  echo "   ok"
elif echo "$AUSG" | grep -q "resource fork, Finder information, or similar detritus"; then
  # Kein echter Mangel: das Dateisystem IN einer DMG haengt jeder Datei ein
  # com.apple.FinderInfo an. Im Bau ist es nicht da (dort steht
  # com.apple.provenance). Apple notarisiert solche Pakete anstandslos, und
  # Gatekeeper nimmt sie an - Punkt 5 ist der Massstab, nicht das hier.
  echo "   ok (nur Finder-Angaben aus der DMG, kein Mangel - siehe Punkt 5)"
else
  echo "$AUSG" | head -4 | sed 's/^/   /'
  fehler=1
fi

echo "2. Wer hat signiert"
AUT=$(codesign -dv --verbose=2 "$APP" 2>&1 | grep -m1 "^Authority=" | cut -d= -f2-)
TEAM=$(codesign -dv --verbose=2 "$APP" 2>&1 | grep -m1 "^TeamIdentifier=" | cut -d= -f2-)
echo "   $AUT (Team $TEAM)"
[ "$TEAM" = "CHS9G483R4" ] || { echo "   FALSCHES Team!"; fehler=1; }

echo "3. Gehaertete Laufzeit (verlangt Apple fuer die Notarisierung)"
# Die Flags stehen in der CodeDirectory-Zeile, z.B.
# flags=0x12a00(kill,restrict,library-validation,runtime)
if codesign -dv --verbose=2 "$APP" 2>&1 | grep -E "^CodeDirectory" | grep -q "runtime"; then
  echo "   ok"
else
  echo "   FEHLT"
  fehler=1
fi

echo "4. Notarisierung angeheftet"
if xcrun stapler validate "$APP" >/dev/null 2>&1; then
  echo "   ok"
else
  echo "   NICHT angeheftet - macOS muesste online nachfragen"
  fehler=1
fi

echo "5. Gatekeeper (das, was der Nutzer merkt)"
ERG=$(spctl --assess --type execute -vv "$APP" 2>&1)
echo "$ERG" | sed 's/^/   /'
echo "$ERG" | grep -q "accepted" || fehler=1

echo
if [ "$fehler" -eq 0 ]; then
  echo "Alles in Ordnung: das Paket startet beim Nutzer ohne Warnung."
else
  echo "Es gibt Beanstandungen - siehe oben."
fi
exit "$fehler"
