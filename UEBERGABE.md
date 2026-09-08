# Übergabe: Verti auf Chromium, Stand 08.09.2026

Diese Datei ist für die nächste Sitzung. Sie beschreibt **nur den offenen Punkt**;
alles Erledigte steht in `CHROMIUM-STATUS.md` und in der Git-Historie.

## Wo wir stehen

Verti **1.2.1** (Chromium 155.0.8038.1) ist gebaut, signiert, notarisiert, als
Vorab-Release veröffentlicht und bei Freddy in `/Applications/Verti.app`
installiert. Der Update-Server liefert es korrekt aus.

Freddy hat es geöffnet und vier Sachen geprüft:

| | Was | Ergebnis |
|---|---|---|
| 1 | Zahnrad (Einstellungen) | **geht nicht** |
| 2 | Verbesserung | **geht nicht** |
| 3 | Plus unten links (App-Bibliothek) | geht |
| 4 | Rechtsklick auf ein App-Symbol | Menü kommt, aber **ein dunkles Fenster legt sich komplett über Verti** |

## Fehler A: Zahnrad und Verbesserung reagieren nicht auf echte Mausklicks

### Was schon feststeht

Der Unterschied zwischen 1/2 und 3 ist die **Lage**, nicht die Funktion:
Zahnrad und Verbesserung sitzen in der 44 px hohen Kopfzeile, das Plus sitzt
unten in der Leiste. Alles unterhalb der Kopfzeile funktioniert.

Die Umschaltlogik selbst ist in Ordnung — 13 von 13 Wegen laufen richtig
(`scripts/chromium-sonde.js`, siehe unten). **Aber dieser Test ist blind für
genau diesen Fehler:** er klickt über das DevTools-Protokoll direkt in die
Seite und umgeht damit `NonClientHitTest` komplett. Er beweist die Logik,
nicht den Mausweg.

Es ist also die Treffer-Prüfung des Fensters, die die Klicks schluckt:
`BrowserFrameViewMac::NonClientHitTest` gibt für die Kopfzeile `HTCAPTION`
zurück (= „hier wird das Fenster gezogen"), und dann sieht die Seite den Klick
nie.

### Wahrscheinlichste Ursache (NICHT bewiesen — bitte erst messen)

`VertiLeisteView::DraggableRegionsChanged` in
`chrome/browser/ui/views/frame/browser_view.cc` baut aus den gemeldeten
Flächen eine `SkRegion`:

```cpp
for (const blink::mojom::DraggableRegionPtr& r : regions) {
  bereich.op(SkIRect::MakeLTRB(...),
             r->draggable ? SkRegion::kUnion_Op : SkRegion::kDifference_Op);
}
```

Das ist wörtlich aus Chromes `AppBrowserController::DraggableRegionsChanged`
übernommen und **hängt von der Reihenfolge ab**. Kommt die große
`.drag-region` (volle Breite × 44 px) in der Liste NACH den `no-drag`-Knöpfen,
werden erst die Knöpfe herausgeschnitten und danach das ganze Band wieder
hinzugefügt — dann ist die komplette Kopfzeile ziehbar und jeder Knopf darin
tot. Das passt exakt zum Bild.

Gemessen wurde bisher nur, dass die Aussparungen **existieren** und dass ihre
Koordinaten stimmen (Fenster 1300 breit):

```
Navigation    x=84..182     ausgespart [84..182]
Verbesserung  x=1113..1238  ausgespart [1113..1238]
Zahnrad       x=1244..1274  ausgespart [1244..1274]
Update-Pille  x=973..1100   ausgespart [973..1100]
```

**Die Reihenfolge wurde nie geprüft.** Das ist der nächste Schritt.

Zweiter, unabhängiger Verdacht im selben Codepfad:

```cpp
bool BrowserView::VertiZiehbereichTrifft(const gfx::Point& punkt) const {
  gfx::Point in_leiste = punkt;
  views::View::ConvertPointToTarget(this, verti_sidebar_, &in_leiste);
```

`punkt` kommt aus `BrowserFrameViewMac::NonClientHitTest` und steht damit in
Koordinaten der **Rahmen-Ansicht**, nicht der `BrowserView`. Umgerechnet wird
aber ab `BrowserView`. Auf dem Mac liegen die beiden vermutlich deckungsgleich,
sicher ist das nicht — bitte mitprüfen.

### So misst man es

1. In `DraggableRegionsChanged` die Flächen **in Listenreihenfolge mit ihrem
   `draggable`-Wert** protokollieren (heute wird nur `!draggable` ausgegeben,
   Reihenfolge geht verloren):

   ```cpp
   VLOG(1) << (r->draggable ? "ZIEHEN  " : "aussparen ")
           << r->bounds.x() << ".." << r->bounds.right()
           << " y " << r->bounds.y() << ".." << r->bounds.bottom();
   ```

2. Bauen (`./chromium/bau.sh`), starten mit
   `--enable-logging=stderr --v=1 --use-mock-keychain`, Log lesen.
   Steht die volle Breite (`0..<Fensterbreite>`) am ENDE der Liste, ist die
   Ursache bestätigt.

3. Behebung dann: erst alle `draggable`-Flächen vereinigen, danach in einem
   zweiten Durchlauf alle `no-drag`-Flächen abziehen. (Chromes Reihenfolge-
   Annahme gilt für Web-Apps, deren Layout anders entsteht — sie ist hier
   offenbar nicht haltbar.)

4. **Prüfen mit einem echten Mausklick, nicht über CDP.** Dafür braucht
   „claude" die Bedienungshilfen-Berechtigung (Systemeinstellungen →
   Datenschutz & Sicherheit → Bedienungshilfen). Ohne die bleibt nur, Freddy
   klicken zu lassen — und genau das soll laut `CLAUDE.md` vermieden werden.
   Diese Berechtigung ist der einzige Weg, den Fehler selbst zu sehen.
   **Freddy bitte einmal darum bitten.**

## Fehler B: Rechtsklick-Menü verdeckt Verti mit einer dunklen Fläche

Der Mechanismus greift richtig — die Leiste kommt nach vorn. Nur ist die
Leisten-Seite **deckend**: sie füllt das ganze Fenster, also verschwindet die
App dahinter. Bei Bibliothek, Einstellungen und Verbesserung fällt das nicht
auf, weil die ohnehin das ganze Fenster füllen. Beim kleinen Kontextmenü ist
es falsch.

Zwei Wege, beide ungeprüft:

- **A: Menü nativ zeichnen.** In der Electron-Fassung war es ein echtes
  `Menu.popup` und lag damit immer obenauf. Das Menü in `verti-shim.js`
  (`appMenue`, Zeile 42–86) ist eine Erfindung des Chromium-Umbaus. Ein
  natives Menü über die Browser-Seite umgeht das Problem vollständig.
- **B: Leisten-Seite durchsichtig machen.** `SetPageBackgroundColor`
  transparent, `body` ohne Hintergrund, nur Leiste/Kopfzeile/Menü zeichnen.
  Dann darf die Leiste dauerhaft vorn liegen und das ganze Umsortieren
  entfällt. Achtung: Mausklicks in durchsichtigen Bereichen landen trotzdem in
  der Leiste, nicht in der App.

A ist näher an dem, was Verti vorher war. B wäre die sauberere Grundlage.

## Was man wissen muss, um weiterzuarbeiten

- **Bauplatte:** `/Volumes/VertiBuild` (Sparsebundle auf der externen SSD).
  Meldet sich von allein ab; `chromium/bau.sh` und `scripts/mac-signieren.sh`
  hängen sie selbst wieder an.
- **Bauen:** immer `./chromium/bau.sh`, nie `autoninja` von Hand. Nach
  Quelltext-Änderungen `./chromium/bau.sh --patch-neu`, sonst sind sie weg,
  wenn die Platte ausfällt.
- **Testen ohne Freddy zu stören:**
  ```bash
  "/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti" \
    --user-data-dir=/tmp/verti-sonde --remote-debugging-port=9222 \
    --use-mock-keychain --enable-logging=stderr --v=1 &
  node scripts/chromium-sonde.js "document.getElementById('plus').click()"
  ```
  `--use-mock-keychain` ist Pflicht: sonst fragt macOS bei jedem Start nach
  dem Passwort für „Verti Safe Storage", weil jeder Bau anders signiert ist.
  Freddy hat den Dialog am 08.09. mehrfach bekommen, ausgelöst von diesen
  Läufen.
- **Bildschirmfotos** gehen nur bei entsperrtem Mac (`ioreg -n Root -d1 -r |
  grep CGSSessionScreenIsLocked`), sonst kommt ein schwarzes Bild. Dasselbe
  gilt für die Notarisierung.
- **Veröffentlichen:** Vorab-Release (`--prerelease`), sonst bekommen die
  Kollegen auf der Electron-Fassung es angeboten. `releases/latest` muss auf
  v1.1.18 zeigen bleiben.

## Offene Punkte, die nichts mit den zwei Fehlern zu tun haben

- Admin-Zugang der Chromium-Fassung fehlt (steht in `BACKLOG.md`).
- Profilordner heißt noch `Chromium`, nicht `Verti` — vor der echten
  Umstellung ändern, sonst stehen alle ohne ihre Anmeldungen da. Details in
  `CHROMIUM-STATUS.md`.
- Freddys altes Electron-Verti ist nicht mehr in `/Applications` (vom
  Chromium-Bau überschrieben). Sein Profil dafür ist vollständig da,
  1,6 GB unter `~/Library/Application Support/Verti`. Er kann es als zweite
  App zurückbekommen, wenn er will.
