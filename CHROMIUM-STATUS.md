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
| `scripts/sidebar-port.js` | `sidebar.html` + `sidebar.js` aus der echten `sidebar.html` |

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

## Der Rahmen: Chromiums vertikale Tableiste IST Vertis App-Leiste

Freddys Entscheidung am 02.09.2026. Statt eine eigene Leiste danebenzubauen,
uebernimmt Chromiums eingebaute vertikale Tableiste die Rolle - Vertis Apps sind
ohnehin angeheftete Tabs.

Der Patch setzt in `chrome/browser/ui/tabs/tab_strip_prefs.cc` zwei Standards:

```
kVerticalTabsEnabled        false -> true    (Leiste von Anfang an da)
kVerticalTabsCollapsedState false -> true    (eingeklappt = schmale Symbolleiste)
```

Gemessen mit `scripts/vtabs-probe.js`, frisches Profil, nichts eingestellt,
Fenster 1200 x 800:

| | Seitenbreite | Seitenhoehe |
|---|---|---|
| Chromium ohne Aenderung | 1200 px | 713 px |
| Verti, aufgeklappt | 960 px | 753 px |
| **Verti, wie ausgeliefert** | **1144 px** | **753 px** |

Also **56 px Leiste links** (Vertis bisherige Leiste war 68 px breit) und
40 px mehr Hoehe, weil die waagerechte Tableiste wegfaellt. Genau Vertis
Aufteilung, ohne eigenen Unterbau.

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
`scripts/sidebar-port.js` legt fuer die Chromium-Fassung deshalb eine kleine
CSS-Ergaenzung darueber, die sie ausblendet. `sidebar.html` selbst bleibt
unangetastet - fuer Electron ist die Leiste dort ja richtig.

## Offen ausser DRM

Signierung, Notarisierung, Updater, kompletter Windows-Zweig.

Ausserdem: `screencapture` liefert auf diesem Mac gerade "could not create image
from display" - Bildschirmfotos des ganzen Fensters gehen deshalb nicht. Die
Sidebar selbst laesst sich ueber das DevTools-Protokoll trotzdem abfotografieren,
fuer den Gesamteindruck fehlt aber die Bildschirmaufnahme-Berechtigung.
