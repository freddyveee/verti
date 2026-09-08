#!/bin/bash
# Sorgt dafuer, dass die Bauplatte /Volumes/VertiBuild da ist.
#
#   ./scripts/bauplatte-anhaengen.sh
#
# Der Chromium-Quelltext (ueber 100 GB) liegt nicht im Repo, sondern in einem
# APFS-Sparsebundle auf Freddys externer SSD. Das Sparsebundle meldet sich von
# allein ab - beim Ruhezustand, beim Abziehen der SSD, manchmal ueber Nacht.
#
# Die Folge ist jedes Mal eine irrefuehrende Meldung an ganz anderer Stelle
# ("Verti.app fehlt - erst bauen", "Chromium-Quelltext nicht gefunden"), und
# man sucht den Fehler im Bau statt an der Platte. Am 03.09. und am 08.09.2026
# ist genau das passiert. Deshalb haengen bau.sh und mac-signieren.sh die
# Platte jetzt selbst wieder an, statt sich zu beschweren.
set -euo pipefail

PLATTE=/Volumes/VertiBuild
BUNDLE="/Volumes/Extreme SSD/VertiBuild.sparsebundle"

if [ -d "$PLATTE/chromium/src" ]; then
  exit 0
fi

if [ ! -d "$BUNDLE" ]; then
  echo "Die Bauplatte fehlt und das Sparsebundle ist auch nicht da:"
  echo "  $BUNDLE"
  echo
  echo "Haengt die externe SSD (\"Extreme SSD\") am Mac?"
  exit 1
fi

echo "Bauplatte war abgemeldet - haenge sie wieder an …"
hdiutil attach "$BUNDLE" -nobrowse >/dev/null

# Der Ordner steht nicht immer sofort bereit, wenn hdiutil zurueckkommt.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -d "$PLATTE/chromium/src" ] && { echo "Bauplatte ist da: $PLATTE"; exit 0; }
  perl -e 'select(undef,undef,undef,1)'
done

echo "Das Sparsebundle liess sich anhaengen, aber $PLATTE/chromium/src fehlt."
echo "Bitte einmal nachsehen, ob die Platte in Ordnung ist."
exit 1
