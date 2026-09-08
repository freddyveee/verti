# Übergabe: Verti auf Chromium, Stand 08.09.2026 (nachmittags)

Diese Datei ist für die nächste Sitzung. Alles Erledigte steht in
`CHROMIUM-STATUS.md` und in der Git-Historie.

## Die zwei Fehler aus der letzten Übergabe sind weg

Freddy hatte vier Sachen geprüft, zwei gingen nicht. Beide sind behoben und
mit **echten Mausklicks** nachgeprüft, nicht nur über die Fernsteuerung:

| | Was | vorher | jetzt |
|---|---|---|---|
| 1 | Zahnrad (Einstellungen) | tot | geht |
| 2 | Verbesserung | tot | geht |
| 3 | Plus unten links | geht | geht |
| 4 | Rechtsklick auf ein App-Symbol | dunkles Fenster über allem | Menü steht über der sichtbaren App |

Dazu geprüft: Navigations-Pfeile, Fenster-Ziehen an der Kopfzeile,
Bibliothek, Einstellungen, Verbesserungs-Formular. Alles in Ordnung.

Die Ursache war **nicht** die in der letzten Übergabe vermutete Reihenfolge
der Ziehflächen — die ist gemessen und widerlegt. Was es wirklich war, steht
in `CHROMIUM-STATUS.md` unter „Kopfzeile schluckte die Klicks" und
ausführlich in der Commit-Nachricht von `4974742`.

## Das Wichtigste zuerst: es muss neu gebaut werden

Die Korrekturen stecken im Chromium-Patch. Das veröffentlichte Vorab-Release
**1.2.1 hat sie noch nicht** — auch die App in Freddys `/Applications` nicht.

Damit Freddy sie sieht:

1. `./chromium/bau.sh`
2. `./scripts/mac-signieren.sh` (Mac muss entsperrt sein)
3. Vorab-Release veröffentlichen — **`--prerelease`**, sonst bekommen die
   Kollegen auf der Electron-Fassung es angeboten. `releases/latest` muss auf
   v1.1.18 zeigen bleiben.

## Was jetzt offen ist

- **Admin-Zugang der Chromium-Fassung fehlt** (steht in `BACKLOG.md`).
- **Profilordner heißt noch `Chromium`, nicht `Verti`.** Vor der echten
  Umstellung ändern, sonst stehen alle ohne ihre Anmeldungen da. Details in
  `CHROMIUM-STATUS.md`.
- **Freddys altes Electron-Verti ist nicht mehr in `/Applications`** (vom
  Chromium-Bau überschrieben). Sein Profil dafür ist vollständig da, 1,6 GB
  unter `~/Library/Application Support/Verti`. Er kann es als zweite App
  zurückbekommen, wenn er will.
- Die QA-Checkliste ist noch nicht auf der Chromium-Fassung durchgeklickt.

## Was man wissen muss, um weiterzuarbeiten

- **Bauplatte:** `/Volumes/VertiBuild` (Sparsebundle auf der externen SSD).
  Meldet sich von allein ab; `chromium/bau.sh` und `scripts/mac-signieren.sh`
  hängen sie selbst wieder an.
- **Bauen:** immer `./chromium/bau.sh`, nie `autoninja` von Hand. Nach
  Quelltext-Änderungen `./chromium/bau.sh --patch-neu`, sonst sind sie weg,
  wenn die Platte ausfällt — und `bau.sh` würde beim nächsten Lauf den alten
  Patch über die Änderungen legen.
- **Nach jeder Änderung an `sidebar.html`: `node scripts/chromium-port.js`.**
  Die Erweiterung hat eine ERZEUGTE Kopie (`chromium/extension/sidebar.html`),
  in die der eingebettete `<script>`-Block ausgelagert ist. Ohne diesen Schritt
  ändert sich in der Chromium-Fassung nichts, und man sucht am falschen Ende.
- **Testen ohne Freddy zu stören:**
  ```bash
  "/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti" \
    --user-data-dir=/tmp/verti-sonde --remote-debugging-port=9222 \
    --use-mock-keychain --enable-logging=stderr --v=1 &
  node scripts/chromium-sonde.js "document.getElementById('plus').click()"
  ```
  `--use-mock-keychain` ist Pflicht: sonst fragt macOS bei jedem Start nach
  dem Passwort für „Verti Safe Storage", weil jeder Bau anders signiert ist.
- **Echte Mausklicks gehen — und sind manchmal Pflicht.** „claude" hat die
  Bedienungshilfen-Berechtigung (am 08.09.2026 bestätigt):
  ```bash
  xcrun swiftc -O scripts/maus-sonde.swift -o /tmp/maus
  /tmp/maus --pruefen
  /tmp/maus klick 1181 76
  ```
  Bildschirmpunkt = `screenX`/`screenY` der Seite + Punkt in der Seite.
  Die JS-Sonde allein reicht NICHT: sie klickt am Fenster vorbei direkt in die
  Seite. Genau daran ist der Kopfzeilen-Fehler vorbeigerutscht — er bestand
  alle 13 JS-Tests und war für die Maus trotzdem tot.
- **Bildschirmfotos** gehen nur bei entsperrtem Mac (`ioreg -n Root -d1 -r |
  grep CGSSessionScreenIsLocked`), sonst kommt ein schwarzes Bild. Dasselbe
  gilt für die Notarisierung.
