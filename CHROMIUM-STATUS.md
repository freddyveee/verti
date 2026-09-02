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

## DRM und Codecs (gemessen 02.09.2026)

Sonde: `scratchpad/eme-probe.js` fragt einen laufenden Browser ueber das
DevTools-Protokoll, welche Schluesselsysteme er kann - genau die Abfrage, die
Spotify macht. WICHTIG: EME gibt es nur im sicheren Kontext, deshalb misst die
Sonde ueber einen lokalen Server auf 127.0.0.1, nicht auf `about:blank`.
Und immer in zwei Codec-Varianten pruefen, sonst verwechselt man
"Codec fehlt" mit "DRM fehlt".

| | Widevine | ClearKey | H.264 | AAC | VP8 |
|---|---|---|---|---|---|
| unser Chromium 155 | **nein** | nur WebM | **nein** | **nein** | ja |
| Google Chrome (Gegenprobe) | ja | ja | ja | ja | ja |

Zwei getrennte Luecken:

1. **Widevine ist aus.** `third_party/widevine/cdm/widevine.gni` setzt
   `enable_widevine` nur fuer `is_chrome_branded`/`is_chrome_for_testing_branded`.
   Unser Bau: `BUILDFLAG_INTERNAL_ENABLE_WIDEVINE() (0)`.
   Der Schalter laesst sich per `args.gn` umlegen, aber:
   - Der CDM selbst ist **nicht quelloffen**. `third_party/widevine/LICENSE`:
     ohne eigenen Vertrag mit Google darf man ihn nicht verwenden, veraendern,
     verkaufen oder weitergeben.
   - Ausgeliefert wird er ueber den Komponenten-Updater. Unser `args.gn` hat
     **keine Google-API-Schluessel** - ob der CDM ueberhaupt ankommt, ist
     ungeprueft.
   - Spotify verlangt zusaetzlich eine **VMP-Produktionssignatur**. Genau
     deshalb laeuft Verti heute auf castLabs: entwicklungs-signiert spielt
     Spotify ~2 s an und springt weiter (siehe CLAUDE.md).
2. **H.264 und AAC fehlen.** Blankes Chromium baut ohne
   `proprietary_codecs = true` / `ffmpeg_branding = "Chrome"`. Das trifft weit
   mehr als Spotify: alles mit MP4-Video oder AAC-Ton. Electron liefert diese
   Codecs mit, deshalb faellt es heute in Verti nicht auf.

**Naechster Messschritt:** `args.gn` um `proprietary_codecs = true`,
`ffmpeg_branding = "Chrome"` und `enable_widevine = true` ergaenzen, neu bauen,
Sonde erneut laufen lassen. Damit ist beantwortet, ob es an den Schaltern liegt
oder an der Lizenz.

## Offen ausser DRM

Signierung, Notarisierung, Updater, kompletter Windows-Zweig.
