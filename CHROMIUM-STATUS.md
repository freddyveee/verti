# Chromium-Umbau: Stand und Messungen

Verti soll perspektivisch auf einem selbstgebauten Chromium laufen statt auf
Electron (castLabs ECS). Diese Datei haelt fest, was gemessen ist - nicht was
vermutet wird.

Bau liegt auf der externen SSD: `/Volumes/VertiBuild/chromium/src`

## Was laeuft

- Chromium 155.0.8038.0 gebaut, 02.09.2026. Erstbau 4h03min, Aenderungsbau 6 min
- Markenname gesetzt (`chrome/app/theme/chromium/BRANDING`): `PRODUCT_FULLNAME=Verti`,
  `MAC_BUNDLE_ID=rocks.imperio.verti` (identisch zur heutigen Verti-App, damit ein
  Update nahtlos druebergeht), `MAC_TEAM_ID=CHS9G483R4`
- Ergebnis: `out/Release/Verti.app`, 691 MB, meldet sich als "Verti 155.0.8038.0"
- Sidebar als Erweiterung (`spike-chromium/`) laeuft, oeffnet die Apps als
  angeheftete Tabs. ABER: 225 Zeilen gegenueber 1416 Zeilen in der echten
  `sidebar.html` - es fehlen Bibliothek, Einstellungen, Onboarding, Stoerungs-
  meldung, Erweiterungs-Verwaltung, Kompatibilitaets-Check, Maus-Seitentasten,
  Benachrichtigungs-Klicks, Stummschaltung, Zoom, Sortieren
- Anmeldungen aus dem heutigen Verti ziehen nachweislich mit um (gleiches
  Cookie-Schema)

## DRM und Codecs (gemessen 02.09.2026) - GELOEST

Sonden liegen unter `scripts/drm-*.js`. Sie fragen einen laufenden Browser ueber
das DevTools-Protokoll ab - genau die Abfragen, die Spotify und Netflix machen.

Zwei Fallen, die beim Messen Zeit gekostet haben:

- **EME gibt es nur im sicheren Kontext.** Auf `about:blank` ist
  `navigator.requestMediaKeySystemAccess` gar nicht vorhanden. Die Sonden messen
  deshalb ueber einen winzigen lokalen Server auf `127.0.0.1`.
- **Immer zwei Codec-Varianten pruefen** (H.264 und VP8/WebM). Sonst haelt man
  ein fehlendes H.264 faelschlich fuer fehlendes DRM - genau das ist beim ersten
  Durchgang passiert.

### Vorher / nachher

| | Widevine | H.264 | AAC |
|---|---|---|---|
| Rohbau | nein | nein | nein |
| **nach den drei Schaltern** | **ja** | **ja** | **ja** |
| Google Chrome (Gegenprobe) | ja | ja | ja |

Die drei Schalter in `out/Release/args.gn`:

```
proprietary_codecs = true
ffmpeg_branding = "Chrome"
enable_widevine = true
```

Neu bauen dauerte 1h07min (09:55 bis 11:02), weil die Codec-Umstellung ffmpeg und
den gesamten Medienteil anfasst.

### Widevine kommt zur Laufzeit, nicht aus dem Bau

Der Entschluessler ist **nicht** Teil unseres Pakets - er wird beim ersten Start
ueber den Komponenten-Updater nachgeladen. Gemessen mit
`scripts/drm-cdm-probe.js`:

- nach 0,5 min: noch nicht da
- nach 1 min: noch nicht da
- **nach 2 min: da** (Version 4.10.3050.0, `chrome://components` meldet
  "Aktualisiert")

Das ist rechtlich der entscheidende Punkt: `third_party/widevine/LICENSE`
verbietet, den Entschluessler selbst weiterzugeben. Wir geben ihn nicht weiter -
er kommt bei jedem Nutzer direkt von Google. Genau so macht es castLabs auch.
**Folge fuer die Nutzer:** In den ersten ein bis zwei Minuten nach der
Installation spielt Spotify noch nicht. Das gehoert ins Onboarding.

### DRM-Stufen: gleichauf mit Chrome

`scripts/drm-stufen-probe.js`, beide Spalten identisch:

| Abfrage | unser Verti | Google Chrome |
|---|---|---|
| Ton, Robustheit egal | ja | ja |
| Ton, `SW_SECURE_CRYPTO` | ja | ja |
| Ton, `SW_SECURE_DECODE` | nein | nein |
| Ton, `HW_SECURE_ALL` | nein | nein |
| dauerhafter Zustand | ja | ja |
| Geraetekennung (Storage ID) | nein | nein |

`SW_SECURE_CRYPTO` ist die Stufe, die Spotify fuer Ton verlangt - die haben wir.

### Echter Abspieltest

`scripts/drm-abspielen-probe.js` laedt Googles oeffentlichen, Widevine-
geschuetzten Shaka-Testinhalt, holt eine echte Lizenz und misst die Abspielzeit:

```
DRM:         com.widevine.alpha
Abspielzeit: 2,68 s
```

Geschuetztes Video laeuft. Der Entschluessler arbeitet wirklich, es ist nicht nur
eine Faehigkeitsmeldung.

### Was noch offen ist

- `enable_cdm_host_verification` und `enable_cdm_storage_id` sind aus; beide
  haengen in Chromium an `is_chrome_branded`. Chrome meldet die Geraetekennung in
  unserer Messung ebenfalls mit "nein", der Unterschied faellt also vermutlich
  nicht ins Gewicht - **geprueft ist das aber nur mit dem Shaka-Testinhalt, nicht
  mit Spotify.**
- **Spotify selbst braucht ein Konto und muss von Freddy getestet werden**, sobald
  die Sidebar so weit ist. Das ist die letzte offene Frage beim Thema DRM.
- H.264/AAC bringen Patentlizenzen mit sich. Electron liefert dieselben Codecs
  mit, Verti gibt sie also heute schon aus - neu ist die Frage nicht, aber vor
  dem Verkauf einmal sauber anschauen.

## Sidebar: portiert und geprueft (02.09.2026)

Die Sidebar laeuft in unserem Chromium. Nicht der 225-Zeilen-Machbarkeits-
nachweis von heute Morgen, sondern die **echte** Sidebar mit allen 1416 Zeilen.

### Erzeugt, nicht abgeschrieben

Das ist der wichtigste Punkt am Aufbau. Eine Handkopie von `sidebar.html` waere
nach dem naechsten Release veraltet - genau der Fehler, der schon einmal
Farbaenderungen verschluckt hat. Stattdessen:

| Erzeuger | macht daraus |
|---|---|
| `scripts/katalog-export.js` | `apps.json` (214 Apps, Kategorien, Pruefstufen, Feedback-Zugang) aus `main.js` und `app-status.json` |
| `scripts/chromium-port.js` | `sidebar.html` + `sidebar.js` aus der echten `sidebar.html` |

Beide nach jeder Aenderung an main.js/sidebar.html erneut laufen lassen.
`main.js` und `sidebar.html` bleiben die einzige Wahrheit.

Von Hand geschrieben sind nur zwei Dateien:

- `chromium/extension/verti-shim.js` - stellt exakt das `window.verti`-API aus
  `preload.js` bereit, nur auf Chrome-APIs. **Deshalb bleibt sidebar.html
  unveraendert** und es gibt keine zweite Fassung zu pflegen.
- `chromium/extension/sw.js` - der Hintergrunddienst, also das Gegenstueck zu
  `main.js`: Zustand, App-Tabs, Ungelesen-Zaehler, Farbwelt.

Eine Falle bei Erweiterungen der Stufe 3: Skripte **im** Dokument sind
verboten. Deshalb trennt der Erzeuger den `<script>`-Block heraus. Ausserdem
wird der Dienst jederzeit beendet und neu gestartet - nichts darf nur im
Arbeitsspeicher stehen, jeder Zustand liegt in `chrome.storage`, und statt
`setInterval` laeuft ein `chrome.alarms`-Wecker.

### Selbst geprueft (Treiber im Scratchpad, Bilder angesehen)

- Erweiterung laedt fehlerfrei, `window.verti` ist da
- App-Leiste rendert, Verti-Browser oben angeheftet, Apps darunter
- App-Bibliothek: alle 214 Apps mit Kategorien, Suche, Hinzufuegen/Entfernen
- Einstellungen: Hell/Dunkel, sechs Farbwelten, externe Links, Erweiterungen,
  Benachrichtigungen pro App
- Farbwelt umschalten geht durch den ganzen Rundlauf (Sidebar → Bruecke →
  Dienst → Speicher → zurueck)
- Klick auf eine App oeffnet sie wirklich als angehefteten Tab (mit WhatsApp
  nachgewiesen)

Einzige Meldungen in der Konsole sind 404er von Googles Favicon-Dienst fuer
einige Adressen. Das passiert in der Electron-Fassung genauso, die Sidebar
faellt dann auf den Anfangsbuchstaben zurueck.

### Noch nicht uebersetzt (in verti-shim.js benannt, nicht still weggelassen)

Updater, Onboarding, Erweiterungen von der Platte laden, Verti-Browser-
Seitenkarte. Der Rechtsklick auf ein App-Symbol oeffnet jetzt ein selbst
gebautes Menue - Erweiterungen duerfen kein natives oeffnen.

## Vertis Oberflaeche (03.09.2026)

Verti bringt seine EIGENE Leiste mit, nicht Chromiums. Zwischenzeitlich war
Chromiums eingebaute vertikale Tableiste im Einsatz - nach dem ersten Blick
darauf verworfen: Apps wachsen von oben statt von unten, Symbole zu klein,
falsche Farbe, fremde Knoepfe, dazu eine Adressleiste. Vertis Aussehen steckt
in `sidebar.html` und soll dort bleiben, wo es ohne Chromium-Bau aenderbar ist.

**Aufbau, genau wie in der Electron-Fassung:** `sidebar.html` nimmt das ganze
Fenster ein und bringt Kopfzeile, Leiste und die Ueberlagerungen fuer
Bibliothek und Einstellungen mit. Der Seiteninhalt liegt darueber, eingerueckt
um **68 px links** und **44 px oben**. Die Zahlen stehen in
`browser_view_layout_impl.cc` und muessen zu `sidebar.html` passen.

Chromiums Tableiste, Adressleiste, Willkommensseite und der Hinweis
"Continue where you left off" sind aus.

### Fallen, die dabei Zeit gekostet haben

- **Die Positionierung darf nicht in `DoPostLayoutVisualAdjustments()`.** Fuer
  normale Fenster ueberschreibt `BrowserViewTabbedLayoutImpl` diesen Haken ohne
  die Basis zu rufen - die Leiste war geladen, wurde aber nie positioniert.
  Sie haengt jetzt fest in `Layout()`.
- **Hinweisleisten muessen mit eingerueckt werden**, sonst legen sie sich ueber
  Vertis Kopfzeile.
- **`raw_ptr` auf Kindansichten im Abbau nullen.** Sonst meldet Chromiums
  Zeiger-Schutz beim Schliessen einen haengenden Zeiger und beendet das
  Programm mit SIGTRAP ("Verti wurde unerwartet beendet").
- **Titelleistenhoehe selbst melden.** Chromium rechnet sie aus Tableiste und
  Adressleiste zusammen; ohne beide bleibt fast nichts, und die Ampel-Knoepfe
  kleben angeschnitten am Fensterrand. `browser_native_widget_mac.mm` meldet
  jetzt 44 px.
- **Dreimal `-Werror,-Wunreachable-code`.** Ein vorangestelltes `return` laesst
  den Rest der Funktion unerreichbar und bricht den Bau ab. Funktionsruempfe
  ersetzen, nicht ein return davorsetzen.
- **Das Symbol steckt nicht im Patch.** `git diff` speichert keine Bilder;
  `scripts/chromium-symbole.sh` setzt es aus `build/` in den Chromium-Baum.
- **`CFBundleIconName` musste raus.** Es zeigt auf `Assets.car`, und macOS zieht
  den Katalog dem `app.icns` vor - unser `actool`-Lauf bekam dort aber nur leere
  Bilder hinein (jede Groesse 330 Bytes, mit `assetutil` nachgemessen). Im Dock
  blieb sonst Chromiums blaue Kugel.

## Installationsfenster

Chromium koppelt die ganze DMG-Gestaltung an Googles Marke - ohne Patch kommt
ein nacktes weisses Fenster heraus. Jetzt gilt sie immer, mit Vertis
Hintergrund (540 x 380), fester Fenstergroesse und den Symbolen links und
rechts vom Pfeil. `scripts/dmg-vorlage.sh` erzeugt die Fenstervorlage
(`.DS_Store`) einmalig ueber den Finder.

Zwei Fallen:

- Die Verknuepfung zum Programme-Ordner heisst in Chromiums Packskript nicht
  "Applications", sondern **ein einzelnes Leerzeichen**. Mit falschem Namen
  findet der Finder keine Position und legt sie oben links ab.
- **`bau.sh` muss auch `chrome/installer/mac` bauen.** Die Signier- und
  Packskripte liegen als KOPIE in `out/Release/Verti Packaging` - sonst wird mit
  veralteten Skripten signiert, obwohl der Quelltext stimmt.

Und beim Kommentieren: **in XML-Kommentaren sind zwei Bindestriche verboten.**
Ein Kommentar mit einem Schalter darin bricht den Bau.

### Ungelesen-Zahlen: ins Favicon gemalt

Vertis Badges sassen bisher am Symbol in der eigenen Sidebar. Chromiums
Tableiste zeigt aber nur das Favicon. Statt Chromium umzubauen malt
`chromium/extension/badge-content.js` die Zahl ins Favicon - genau das, was
Favico.js in vielen Web-Apps ohnehin tut. Gemessen: **Chromium uebernimmt ein
per Skript gesetztes Favicon.**

Damit keine doppelten Zahlen entstehen, malen wir NUR, wenn die Zahl im
Seitentitel steht. Apps, die ihr Favicon selbst bemalen (Stackfield ueber
Favico.js), schreiben nichts in den Titel - deren Favicon bleibt unberuehrt.

`scripts/badge-test.js` prueft beides:

```
Titel "(7) WhatsApp": data:image/png;…   <- Zahl im Favicon
Titel "WhatsApp":     /icon.png          <- beim Lesen wieder zurueckgesetzt
```

### Bibliothek und Einstellungen als Tab, nicht als Seitenpanel

Ein Erweiterungs-Seitenpanel ist nur etwa 450 px breit. Vertis Bibliothek und
Einstellungen sind aber ganzflaechige Ueberlagerungen (`sidebar.html` rechnet mit
`100vw`) - im Panel waeren sie gequetscht. Deshalb oeffnet ein Klick auf das
Verti-Symbol `sidebar.html` als **angehefteten Tab** mit voller Breite.

Die App-Leiste aus `sidebar.html` waere dann doppelt da (einmal von Chromium).
`scripts/chromium-port.js` legt fuer die Chromium-Fassung deshalb eine kleine
CSS-Ergaenzung darueber, die sie ausblendet. `sidebar.html` selbst bleibt
unangetastet - fuer Electron ist die Leiste dort ja richtig.

## Updater (02.09.2026)

Vertis Regel bleibt: **nichts still im Hintergrund.** Erst fragen, Release-Notes
zeigen, dann laden - genau wie in der Electron-Fassung. Deshalb ist es auch
derselbe Dialog: `update.html` wird von `scripts/chromium-port.js` mitportiert,
`update-shim.js` stellt `window.vertiUpdate` auf Chrome-APIs nach.

Geprueft wird gegen **GitHub Releases**, also denselben Kanal wie heute.

### Was laeuft (mit `scripts/update-test.js` gemessen)

- Echte Abfrage bei GitHub: `{"ok":true,"aktuell":true,"version":"1.1.18"}`
- Dialog erscheint mit Ueberschrift, Version, "Jetzt aktualisieren"/"Spaeter"
  und den Release-Notes als Aufzaehlung
- Download laeuft samt Fortschritt bis `installing` durch (mit einer kleinen
  echten Release-Datei gemessen, nicht mit 400 MB)
- Keine Konsolenfehler

Beim Testen einmal reingefallen: die Notizen direkt in den Zustand geschrieben
und damit an `notizenText()` vorbeigetestet - der Dialog erwartet Zeilen mit
"•". Der Test geht jetzt durch dieselbe Aufbereitung wie ein echtes Release.

### Das Austauschen: Chromiums eigener Updater (Freddys Entscheidung, Weg A)

Der entscheidende Fund: **Chromium liefert das Mac-Installationsskript mit** -
`chrome/installer/mac/keystone_install.sh`, Googles eigenes, erprobtes Skript.
Es macht den atomaren Tausch, prueft die Signatur, setzt Rechte und Quarantaene.
Genau den heiklen Teil schreiben wir also NICHT selbst - das war der Grund gegen
Weg B.

**Gemessen am 02.09.2026:**

- `chrome/updater:updater` baut in unserem Baum, fehlerfrei, in unter 3 Minuten
- Auf Verti umbenannt (`chrome/updater/branding.gni`, im Patch): eigene
  Kennungen, `rocks.imperio.verti.Updater`, Team CHS9G483R4, Ordner
  `~/Library/Application Support/IMPERIO/VertiUpdater`
- **Absturzberichte und Nutzungsprotokoll gehen nicht mehr an Google.** Beide
  Adressen zeigten auf Googles Server und sind abgeklemmt. In der gebauten
  Binaerdatei: 1 Treffer fuer unseren Server, **0 Treffer** fuer Googles Omaha
- Die ganze Kette lokal durchgespielt (`scripts/updater-test.js`): Verti wird
  per ksadmin angemeldet, der Updater fragt an, unser Server antwortet mit
  "Update 999.0.0.0 verfuegbar", der Updater nimmt die Antwort an

Zwei Dinge, die beim Messen Zeit gekostet haben und im Skript stehen:

- Die App-Liste steckt in der Anfrage unter **`request.apps`**, nicht unter
  `request.app` (aeltere Beschreibungen sagen etwas anderes).
- `execSync` blockiert Nodes Ereignisschleife - der eigene Testserver kann dann
  nicht antworten, und es sieht so aus, als kaeme keine Anfrage an. Der Test
  startet den Updater deshalb asynchron.
- Die **ausgelieferte** Fassung ignoriert `overrides.json` absichtlich (sonst
  koennte jeder die Update-Adresse umbiegen). Zum Testen nimmt man
  `VertiUpdater_test.app`.

### Der komplette Durchlauf ist bewiesen (02.09.2026)

`scripts/updater-test.js --update --echtes-paket` spielt alles durch. Damit das
kein Selbstbetrug ist, wird NICHT in die gebaute App hineininstalliert (Quelle
und Ziel waeren dieselbe Datei), sondern in eine Kopie, die vorher auf Version
1.0.0.0 gesetzt wird:

```
Version in der Zielkopie: 1.0.0.0  ->  155.0.8038.0
AUSGETAUSCHT. Der Updater hat die App wirklich ersetzt.
```

Alle Schritte: Anmeldung per ksadmin, Anfrage beim Server, Antwort "Update
verfuegbar", Download von 234 MB, Signaturpruefung gegen Vertis Schluessel,
Auspacken, Installationsskript, Austausch der App, Ticket neu geschrieben.

### Vier Huerden auf dem Weg, alle im Protokoll gefunden

Keine davon war an der Oberflaeche sichtbar - jede stand nur im `updater.log`.

1. **`RESPONSE_NOT_TRUSTED` (-10000).** Der Updater verlangt CUP, eine zusaetzliche
   Signatur ueber die Antwort. Abgeschaltet, Begruendung steht im Code:
   HTTPS plus der festgenagelte CRX3-Schluessel decken den wichtigen Teil ab.
   Offen bleibt nur eine moegliche Rueckstufung auf eine aeltere, von uns
   signierte Fassung.
2. **`no handler for .keystone_install`.** Der Updater waehlt den Installations-Weg
   nach der DATEIENDUNG. Im Feld `path` gehoert deshalb `"."` (das ausgepackte
   Verzeichnis), nicht der Name des Skripts - das Skript sucht er selbst.
3. **`couldn't determine update_version_ks`.** Vertis Info.plist hatte keine
   Keystone-Schluessel. Chromium setzt sie ab Werk nur fuer Googles Marke, und
   die Update-Adresse war fest auf Google verdrahtet. Beides im Patch geloest,
   `KSProductID` ist bewusst `browser_appid` und nicht die Bundle-Kennung.
4. **`enable_updater = false`.** Der Schalter stand aus, deshalb blieb Punkt 3
   wirkungslos, obwohl die Aenderung stimmte. Steht jetzt in `args.gn` und wird
   von `chromium/bau.sh` geprueft.

Ausserdem: Der Signierschluessel muss **PKCS#8** sein. `openssl genpkey -outform
DER` liefert auf dem Mac PKCS#1, der Packer bricht dann mit "Malformed
PrivateKeyInfo" ab. Der zweite Schritt mit `openssl pkcs8 -topk8` steht in
`scripts/crx3-paket.sh`.

### Verti meldet sich selbst an (02.09.2026)

Der Updater liegt bereits im Verti-Paket - das macht der Bau von selbst, seit
`enable_updater = true` gesetzt ist
(`Verti Framework.framework/.../Helpers/VertiUpdater.app`).

Gefehlt hat die Anmeldung. Chromium ruft `EnsureUpdater()` **nur, wenn jemand
die "Ueber"-Seite oeffnet** - das wuerde bei Vertis Nutzern nie passieren. Der
Patch haengt den Aufruf deshalb an `ChromeBrowserMainPartsMac::PostProfileInit`,
20 Sekunden nach dem Start und mit niedrigster Prioritaet, damit der Start nicht
langsamer wird. Ist alles schon angemeldet, tut der Aufruf nichts.

Gemessen mit `scripts/selbstanmeldung-test.js` (frisches Profil, kein Updater,
nichts angeklickt):

```
Updater taucht auf nach etwa 20 s
productID=rocks.imperio.verti  version=155.0.8038.0
Verti hat sich VON ALLEIN angemeldet. Der Nutzer muss nichts tun.
```

### Der Absturz, der fast durchgerutscht waere

Die Anmeldung liess Verti **20 Sekunden nach dem Start abstuerzen**. Drei
Anlaeufe, jeder mit einer eigenen Fehlermeldung:

| Versuch | Ergebnis |
|---|---|
| `base::ThreadPool::PostDelayedTask` | `SIGSEGV` - gar kein Arbeitsstrang gesetzt |
| eigener sequenzierter Strang | `SIGABRT`, `DCHECK failed: checker.CalledOnValidSequence` - falscher Strang |
| **Oberflaechen-Strang** (`SequencedTaskRunner::GetCurrentDefault()`) | laeuft |

Richtig ist der Oberflaechen-Strang, weil Chromium `EnsureUpdater()` selbst von
dort ruft (`version_updater_mac.mm`, aus der "Ueber"-Seite).

**Zwei Lehren, beide teuer bezahlt:**

1. **Einmal testen reicht nicht.** Nach dem zweiten Versuch war der erste Lauf
   sauber und der zweite abgestuerzt. Ein einzelner Lauf haette "behoben"
   gemeldet. `scripts/selbstanmeldung-test.js` wird deshalb mehrfach laufen
   gelassen, und dabei wird die ZAHL der Absturzberichte in
   `~/Library/Logs/DiagnosticReports` vorher/nachher verglichen.
2. **Die Ausgabe des Testskripts sagt nichts ueber Abstuerze.** Der Test meldete
   jedes Mal brav "Verti hat sich VON ALLEIN angemeldet" - waehrend das Programm
   danach abstuerzte. Absturzberichte muss man getrennt anschauen.

**Wichtig, beim ersten Versuch falsch gemacht:** Die Kennung ist die
**Bundle-Kennung** `rocks.imperio.verti`, NICHT `browser_appid` aus
`branding.gni`. `BrowserUpdaterClient::GetAppId()` gibt auf dem Mac die
Bundle-Kennung zurueck; Chrome meldet sich dort ebenfalls als
"com.google.chrome" an. Server, Info.plist und Anmeldung muessen dieselbe
Kennung benutzen, sonst fragt der Updater brav und bekommt nie eine Antwort.

## Signierung und Notarisierung (02.09.2026) - LAEUFT

Verwendet werden **Chromiums eigene Signier-Skripte**, nicht selbstgebaute
codesign-Aufrufe. Vertis Paket enthaelt verschachtelte Programme (Framework,
vier Helfer-Varianten, den Updater), die von innen nach aussen und mit je
eigenen Berechtigungen signiert werden muessen.

```
python3 "out/Release/Verti Packaging/sign_chrome.py" \
  --input out/Release --output out/Release/signed \
  --identity "Developer ID Application: Freddy Henrich-Held (CHS9G483R4)" \
  --notarize staple \
  --notary-arg=--keychain-profile --notary-arg=verti-notary
```

Ergebnis: `Verti-155.0.8038.0.dmg`, 161 MB, signiert und notarisiert.
Geprueft mit `scripts/signatur-pruefen.sh`:

```
2. Developer ID Application: Freddy Henrich-Held (CHS9G483R4)
3. Gehaertete Laufzeit: ok
4. Notarisierung angeheftet: ok
5. Gatekeeper: accepted, source=Notarized Developer ID
```

### Drei Fallen auf dem Weg

1. **Der mitgelieferte Updater war nur adhoc signiert** ("Sealed Resources=none").
   Bei Google kommt er fertig signiert aus CIPD, bei uns nicht.
   `sign_chrome.py` signiert ihn NICHT mit. Loesung: vorher mit Chromiums
   eigenem Updater-Werkzeug signieren und ins Framework zuruecklegen:
   `python3 "out/Release/Updater Packaging/sign_updater.py" --input out/Release
   --output out/Release/updater-signed --identity "..." --notarize none`,
   dann das Ergebnis nach
   `Verti.app/Contents/Frameworks/Verti Framework.framework/Versions/<v>/Helpers/`.
2. **Der Gatekeeper-Test lief VOR der Notarisierung** und konnte deshalb nie
   bestehen ("source=Unnotarized Developer ID"). Der ganze Lauf brach ab, bevor
   notarytool ueberhaupt aufgerufen wurde - im Protokoll null Treffer. Der Patch
   schaltet `run_spctl_assess` in `chromium_config.py` ab; gefragt wird jetzt am
   Ende mit `scripts/signatur-pruefen.sh`, wo die Antwort auch aussagekraeftig
   ist.
3. **`--disable-packaging` legt nichts ab.** Die Beschreibung im Skript sagt,
   die App werde nach `--output` kopiert; der Code tut es nicht (nur der
   Packaging-Zweig schreibt dorthin). Ohne den Schalter entsteht die DMG.

Und eine Falle beim PRUEFEN: `codesign --deep --strict` meldet an einer App IN
einer DMG "resource fork, Finder information, or similar detritus not allowed".
Das ist kein Mangel - das Dateisystem der DMG haengt jeder Datei ein
`com.apple.FinderInfo` an (im Bau steht dort `com.apple.provenance`). Apple
notarisiert solche Pakete anstandslos. Massstab ist Gatekeeper, nicht dieser
Test.

## Der Kreis ist geschlossen (02.09.2026)

Das CRX3-Paket wird jetzt aus der **signierten und notarisierten** App gebaut,
nicht aus dem Rohbau. `scripts/crx3-paket.sh` holt sie dafuer aus der DMG des
Signierlaufs und bricht ab, wenn dort keine Developer-ID-Signatur steht.

**Warum das wichtig ist:** Googles Installationsskript prueft beim Austausch die
Signatur der neuen App. Ein nur "adhoc" signiertes Paket wuerde abgelehnt - die
Nutzer bekaemen nie ein Update, ohne dass jemand merkt warum.

Kompletter Durchlauf mit dem signierten Paket:

```
-> Updater holt das Paket (230 MB)
Version in der Zielkopie: 1.0.0.0  ->  155.0.8038.0
AUSGETAUSCHT. Der Updater hat die App wirklich ersetzt.
```

Und die ausgetauschte App danach:

```
4. Notarisierung angeheftet: ok
5. Gatekeeper: accepted, source=Notarized Developer ID
```

Also: **nach dem Update ist Verti immer noch notarisiert und startet ohne
Warnung.** Damit ist die Kette vom Bau bis zum Nutzer vollstaendig.

## Offener Punkt: das Chromium-Verti startet mit LEEREM Profil

Am 03.09.2026 nachgesehen: Vertis Info.plist hat **kein** `CrProductDirName`.
Chromium faellt dann laut `chrome/common/chrome_paths_mac.mm` auf den festen
Namen **"Chromium"** zurueck. Das Chromium-Verti legt sein Profil also unter
`~/Library/Application Support/Chromium` an - NICHT unter
`~/Library/Application Support/Verti`, wo die 1,3 GB des Electron-Vertis mit
allen Anmeldungen liegen.

**Fuer die Testfassung ist das genau richtig:** beide Fassungen stoeren sich
nicht, und Freddys echtes Profil bleibt unberuehrt. Er kann Chromium-Verti in
Ruhe ausprobieren und danach das alte weiterbenutzen.

**Fuer die echte Umstellung muss das geaendert werden**, sonst stehen alle
Nutzer ploetzlich ohne ihre Anmeldungen da. Zu tun:

1. `CrProductDirName = Verti` ins Info.plist (ueber `tweak_info_plist.py`,
   analog zu den Keystone-Schluesseln).
2. **Vorher das Profil sichern.** Chromium 155 ist neuer als Electrons
   Chromium 150 und wertet das Profil beim ersten Start auf. Danach ist ein
   Rueckschritt auf das alte Verti nicht mehr verlaesslich moeglich.
3. Erst mit einem gesicherten Profil messen, ob die Anmeldungen wirklich
   uebernommen werden.

### Was noch fehlt

1. Der erste echte Release: DMG, `Verti-Mac.crx3`, `Verti-Mac.crx3.sha256` und
   `Verti-Mac.crx3.version` ins GitHub-Release legen (als Vorab-Release, damit
   die bestehenden Nutzer es NICHT automatisch bekommen).
2. Profilordner umstellen (siehe oben), bevor umgestellt wird.
3. Kompletter Windows-Zweig.

Der **einmalige Umstieg** von Electron auf Chromium ist davon unberuehrt: den
liefert die heutige Electron-Fassung ueber electron-updater aus, mit einem
`Verti-Mac.zip`, in dem das Chromium-Verti steckt. Die Bundle-Kennung ist
absichtlich dieselbe (`rocks.imperio.verti`).

## Ueberlagerungen: Bibliothek, Einstellungen, Verbesserung (07.09.2026)

Freddy meldete drei Fehler, die alle DIESELBE Ursache hatten: "Zahnrad geht
nicht, Verbesserung geht nicht, und wenn ich eine App hinzufuegen moechte, dann
oeffnet sich die App-Bibliothek im Hintergrund."

Die Knoepfe funktionierten in Wirklichkeit die ganze Zeit. Nur liegt alles, was
Verti einblendet, IN `sidebar.html` - und Vertis Leiste liegt hinter dem
App-Inhalt, sonst wuerde sie die Apps verdecken. Die Bibliothek oeffnete sich
also unsichtbar hinter ChatGPT. Genau die Falle, die in CLAUDE.md steht.

In Electron blendete `window.verti.openLibrary()` dafuer die App-Ansichten aus.
In der Bruecke `verti-shim.js` war das ein leerer Aufruf geblieben.

**Wie es jetzt geht:** die Leiste meldet ueber den Seitentitel
(`verti:overlay:an` / `:aus`), Chromium schiebt sie daraufhin in der
Reihenfolge der Ansichten nach vorn und wieder zurueck
(`VertiUeberlagerungsWaechter` in `browser_view.cc`). Der Titel ist der einzige
Weg von einer Erweiterungsseite zum Fenster, der ohne eine neue
Mojo-Schnittstelle auskommt; `sidebar.html` benutzt ihn sonst fuer nichts.

**Zwei Sackgassen, beide gemessen:**

1. **Den Inhalt ausblenden geht nicht.** `multi_contents_view_->SetVisible(false)`
   laesst Verti beim naechsten Neuberechnen abstuerzen:
   `Check failed: IsParentedToAndVisible(views().multi_contents_view, ...)` in
   `browser_view_tabbed_layout_impl.cc`. Deshalb Umsortieren statt Ausblenden.
2. **Auf die Aufrufe hoeren reicht nicht.** `sidebar.html` schliesst die
   Bibliothek beim App-Wechsel absichtlich ohne Meldung (`closeLibrary(false)`,
   weil in Electron der Hauptprozess die Ansichten schon selbst wieder
   eingeblendet hatte). Die Bruecke beobachtet deshalb den ZUSTAND der drei
   Elemente (`MutationObserver` auf die Klasse `open`), nicht die Aufrufe.

**Nachmessbar:** `VLOG(1)` in `browser_view.cc` schreibt bei jedem Umschalten
die Plaetze mit. Sichtbar mit `--enable-logging=stderr --v=1`:

```
Verti: Ueberlagerung an  - Leiste an Stelle 14, Inhalt an Stelle 2 von 15
Verti: Ueberlagerung aus - Leiste an Stelle 2,  Inhalt an Stelle 3 von 15
```

Das ist noetig, weil Chromiums UI-DevTools im Release-Bau keine Klassennamen
liefert (alles heisst "View") und `screencapture` hier nur Schwarz gibt.

Geprueft wurden elf Wege mit `scripts/chromium-sonde.js`: Plus, ✕, Zahnrad,
Escape, Verbesserung, Klick auf den Hintergrund, Zurueck-Pfeil und - der
wichtigste - eine App in der Leiste anklicken, waehrend die Bibliothek offen
ist. Alle richtig, kein Absturz.

**Nebenbei behoben:** in den Einstellungen stand als Version dauerhaft 1.1.18,
die Nummer der Electron-Fassung aus dem Erweiterungs-Manifest. `bau.sh`
stempelt jetzt beim Einlegen die echte Nummer der gebauten App hinein.
Chromiums Kennung taugt dafuer nicht, die ist gekuerzt ("Chrome/155.0.0.0").

## Der Update-Server sah Vorab-Fassungen nicht (08.09.2026)

Nach dem Veroeffentlichen von v1.2.1 antwortete der Server jedem Verti "kein
Update", obwohl das Release fertig oben lag. Ursache: er fragte
`/releases/latest`, und GitHub laesst dort Vorab-Fassungen weg.

Die Chromium-Fassung ist aber genau eine Vorab-Fassung - absichtlich, damit die
Kollegen auf der Electron-Fassung sie nicht angeboten bekommen. Der Server sah
deshalb v1.1.18 (Electron, ohne CRX3-Paket) und gab auf.

Jetzt holt er die Liste (`/releases?per_page=15`, neueste zuerst) und nimmt das
erste Release, das ein CRX3-Paket UND einen Pruefwert mitbringt. Electron-
Releases werden dadurch uebersprungen, ohne dass irgendwo eine Fassung fest
eingetragen werden muss.

Gemessen nach dem Ausrollen:

```
installiert 155.0.8038.0  ->  nextversion 155.0.8038.1, richtige URL und sha256
installiert 155.0.8038.1  ->  noupdate
```

**Lehre:** den Update-Server erst NACH dem Veroeffentlichen pruefen, mit einer
echten Anfrage. Vorher sieht alles richtig aus.

## Kopfzeile schluckte die Klicks (08.09.2026) - GELOEST

Zahnrad und Verbesserung reagierten auf keinen echten Mausklick, das Plus
unten in der Leiste schon. Ueber das DevTools-Protokoll ging beides - 13 von
13 Wegen liefen richtig. Genau das war die Falle: die JS-Sonde klickt am
Fenster vorbei direkt in die Seite und umgeht `NonClientHitTest` komplett.

### Was NICHT die Ursache war

Vermutet worden war, die Seite melde ihre Ziehflaechen in einer Reihenfolge,
bei der die volle Kopfzeile NACH den Knoepfen kommt und sie wieder zudeckt
(Chromes Ein-Durchlauf-Weg in `AppBrowserController::DraggableRegionsChanged`
haengt daran). Gemessen und widerlegt:

```
Verti: 13 gemeldete Flaechen, in Listenreihenfolge:
Verti:   ZIEHEN    x 0..1200 y 0..44      <- zuerst, nicht zuletzt
Verti:   aussparen x 1144..1174 y 9..39   <- Zahnrad
Verti:   aussparen x 1013..1138 y 9..39   <- Verbesserung
Verti:   aussparen x 84..182 y 7..37      <- Navigation
Verti:   Knopf-Mitte 1159,24 -> neu frei, alter Weg frei
```

Blink sammelt die Flaechen in Dokumentreihenfolge ein
(`LocalFrameView::CollectDraggableRegions`, `push_back` beim Vorwaertslauf
durch den Layout-Baum), und in `sidebar.html` steht `.drag-region` als erstes
im `body`. Die Reihenfolge war also von Anfang an richtig, und die Mitte jedes
Knopfes lag schon vorher AUSSERHALB der Ziehflaeche.

Zweiter Verdacht, ebenfalls widerlegt: der Versatz zwischen Fensterrahmen und
`BrowserView` ist auf dem Mac 0. Umgerechnet wird trotzdem ausdruecklich, damit
das nicht mehr angenommen werden muss.

### Was es wirklich war

Sagte `VertiZiehbereichTrifft()` "nein", reichte
`BrowserFrameViewMac::NonClientHitTest` den Punkt weiter an
`BrowserView::NonClientHitTest`. Das gibt fuer JEDEN Punkt oberhalb der
Werkzeugleiste `HTNOWHERE` zurueck:

```cpp
gfx::Rect tabstrip_background_bounds = bounds();
tabstrip_background_bounds.set_height(toolbar_origin.y());
if (tabstrip_background_bounds.Contains(point)) return HTNOWHERE;
```

und die letzte Zeile in `BrowserFrameViewMac::NonClientHitTest` macht daraus
`HTCAPTION`. Vertis Kopfzeile liegt genau dort, wo bei Chromium die Tableiste
sitzt - sie war damit KOMPLETT Fenstergriff, unabhaengig von allem, was die
Seite gemeldet hatte. Das Plus lag unterhalb der Werkzeugleiste und ging
deshalb.

Behoben: sobald die Seite ihre Flaechen gemeldet hat, antwortet die Pruefung
endgueltig und reicht nichts mehr weiter - drin `HTCAPTION`, sonst `HTCLIENT`.
Vertis Leiste deckt das ganze Fenster ab, etwas Drittes gibt es nicht.

Nachgemessen mit `--v=2` und echten Mausklicks:

| Punkt | Ergebnis |
|---|---|
| Zahnrad 1159,24 | HTCLIENT (Seite) |
| Verbesserung 1075,24 | HTCLIENT (Seite) |
| Navigation 99,22 | HTCLIENT (Seite) |
| leere Kopfzeile 600,20 / 583,36 | HTCAPTION (Fenster ziehen) |

Fenster laesst sich weiterhin an der Kopfzeile ziehen (waagerecht Punkt fuer
Punkt; senkrecht klemmt es, weil das Fenster hoeher ist als der Bildschirm -
das ist macOS und kein Fehler).

**Lehre:** Chromiums Fernsteuerung beweist die Logik, nicht den Mausweg. Fuer
alles, was am Fensterrand oder in der Kopfzeile sitzt, braucht es einen echten
Klick - `scripts/maus-sonde.swift`.

## Rechtsklick-Menue deckte Verti zu (08.09.2026) - GELOEST

Das Menue kam, aber die ganze App verschwand hinter einer dunklen Flaeche.

Die Leisten-Seite deckt das ganze Fenster ab, gezeichnet wird davon aber nur
das "L" aus Kopfzeile und Leiste; den Rest fuellt der App-Inhalt, der davor
liegt. Solange die Seite undurchsichtig war, fiel das nicht auf - sobald sie
aber fuer eine Ueberlagerung nach vorn geholt wird
(`VertiUeberlagerungZeigen`), lag ihr `body`-Hintergrund ueber allem. Bei
Bibliothek und Einstellungen war das egal, die fuellen ohnehin das ganze
Fenster. Beim kleinen Menue war es falsch.

Die Seite ist jetzt durchsichtig. Drei Teile, alle drei noetig:

1. `BrowserView`: `verti_sidebar_->SetBackground(nullptr)` und
   `SetPageBaseBackgroundColor(SK_ColorTRANSPARENT)` (dasselbe Rezept wie in
   `drive_picker_host_view.cc`)
2. `sidebar.html`: `.drag-region` und `.sidebar` bekommen `background:
   var(--bg)` - vorher kam die Farbe vom `body`
3. `verti-shim.js`: nimmt dem `body` den Hintergrund - nur in der
   Chromium-Fassung, Electron bleibt unveraendert

Nachgesehen (Bildschirmfotos): normaler Zustand unveraendert, Menue steht ueber
der sichtbaren App, Bibliothek und Einstellungen decken wie vorher alles ab,
und das Verbesserungs-Formular liegt jetzt als richtiger Dialog ueber der
abgedunkelten App - das ist besser als vorher, nicht schlechter.

## Update-Kette einmal ganz durchgelaufen (08.09.2026) - BEWIESEN

Erstmals ist ein Update bei einem echten Nutzer angekommen, nicht nur in einer
Sonde: `/Applications/Verti.app` 155.0.8038.1 -> 155.0.8038.2 (Verti 1.2.1 ->
1.2.2), auf Freddys MacBook.

Jedes Glied nachgewiesen, aus `updater.log`:

| Schritt | Beleg |
|---|---|
| Anmeldung | `RegisterApp: app version 155.0.8038.1`, Ticket zeigt auf `/Applications/Verti.app` |
| Anfrage | POST an die Supabase-Funktion, `version: 155.0.8038.1` |
| Antwort | `nextversion 155.0.8038.2`, URL und sha256 des Release |
| Herunterladen | `downloaded: 244110565`, `download_time_ms: 16579`, `eventresult: 1` |
| CRX3-Signatur | angenommen (sonst liefe `.keystone_install` nicht an) |
| Austausch | neuer Ordner `Versions/155.0.8038.2`, `Current` zeigt darauf |
| danach | Gatekeeper `accepted / Notarized Developer ID`, Manifest 1.2.2 |

### Die Falle: aus der Shell angestossen schlaegt der Austausch IMMER fehl

Der erste Versuch lief bis zum letzten Schritt und brach ab:

```
Output from .keystone_install: rsync: /Applications/Verti.app/Contents/Frameworks/
  Verti Framework.framework/Versions/155.0.8038.2: mkpath: Operation not permitted
.keystone_install: rsync of versioned directory failed, status 11
errorcode 74103, extracode1 7
```

Das ist **kein Fehler in Verti**. Seit macOS Sonoma schuetzt die App-Verwaltung
(TCC) fremde Programmpakete in `/Applications`, und geprueft wird der
*verantwortliche* Prozess - bei einem Start aus dem Terminal also das Terminal,
nicht der Updater. Gegenprobe: ein schlichtes `mkdir` in denselben Ordner
scheitert genauso, obwohl die Rechte (`freddy:staff`, `rwxr-xr-x`) es erlauben.

Wird derselbe Befehl von launchd gestartet, ist der Updater sein eigener
Absender, und macOS laesst den Austausch zu (gleiche Team-ID wie die Ziel-App -
derselbe Weg, den Chrome benutzt):

```bash
U=~/Library/Application\ Support/IMPERIO/VertiUpdater/Current/VertiUpdater.app/Contents/MacOS/VertiUpdater
launchctl submit -l verti-update-probe -- "$U" --update-apps --enable-logging
# danach aufraeumen:
launchctl remove verti-update-probe
```

`launchctl kickstart -k gui/$UID/rocks.imperio.verti.Updater.wake` reicht dafuer
NICHT: der Weck-Auftrag ruft nur `--wake-all`, und der Updater haelt einen
Mindestabstand zwischen zwei Pruefungen ein - kurz nach einer Pruefung tut er
gar nichts.

### Wer sich beim Updater eintraegt, entscheidet der letzte Start

Das Ticket traegt den Pfad der App, die sich zuletzt gemeldet hat. Jeder Start
des gebauten Binaries (`out/Release/Verti.app`) schreibt sich selbst hinein -
danach zeigt der Updater auf die Bauplatte, und die installierte App bekommt
nie wieder ein Update. Am 08.09.2026 genau so passiert, ausgeloest von
Testlaeufen.

**Nach jedem Testlauf mit dem gebauten Binary die installierte App einmal
oeffnen.** Sie traegt sich beim Start selbst wieder ein (im Log:
`RegisterApp`). Das dauert ein paar Sekunden - direkt nach dem Start gelesen,
steht im Ticket noch der alte Pfad.

## Offen ausser DRM

Signierung, Notarisierung, das Austauschen beim Update (siehe oben), Onboarding,
Verti-Browser, kompletter Windows-Zweig.

Ausserdem zu Bildschirmfotos: `screencapture` liefert hier zeitweise ein
komplett schwarzes Bild. Die Ursache ist am 07.09.2026 gemessen worden - der
Bildschirm war gesperrt:

```
ioreg -n Root -d1 -r | grep CGSSessionScreenIsLocked   ->   =Yes
```

Bei gesperrtem Bildschirm gibt macOS nichts heraus, und aus demselben Grund
findet `notarytool` das Schluesselbund-Profil nicht (siehe CLAUDE.md). Vor
jedem Bildschirmfoto und vor jedem Signierlauf also erst nachsehen, ob der Mac
entsperrt ist, statt gleich auf eine fehlende Berechtigung zu schliessen.

Unabhaengig davon laesst sich Vertis Leiste immer ueber das DevTools-Protokoll
abfotografieren, auch bei gesperrtem Bildschirm:

```bash
"/Volumes/VertiBuild/chromium/src/out/Release/Verti.app/Contents/MacOS/Verti" \
  --user-data-dir=/tmp/verti-sonde --remote-debugging-port=9222 &
node scripts/chromium-sonde.js "document.getElementById('plus').click()"
```

Danach `Page.captureScreenshot` auf dem Ziel `sidebar.html`. Das zeigt die
Leiste selbst, aber nicht, was davor oder dahinter liegt - dafuer braucht es
ein echtes Bildschirmfoto.
