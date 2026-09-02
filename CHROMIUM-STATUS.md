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

## Offen ausser DRM

Signierung, Notarisierung, Updater, kompletter Windows-Zweig.
