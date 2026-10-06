# Übergabe: Verti auf Chromium, Stand 01.10.2026

Für die nächste Sitzung. **Hier zuerst lesen**, dann `CHROMIUM-STATUS.md`
(Messungen, chronologisch) und `BACKLOG.md` (offene Punkte). Freddy fängt mit
dieser Datei einen frischen Chat an.

## Wo wir stehen, in drei Sätzen

Die Chromium-Fassung (1.2.x, Vorab-Releases) läuft bei Freddy als Testfassung
neben dem Electron-Verti, mit dem er und das Team täglich arbeiten. Installiert
und veröffentlicht ist **1.2.4**; **1.2.5 ist vorbereitet, aber NICHT
gebaut** - der Bau wurde am 11.09. abgebrochen und seither nicht neu gestartet.
Die große offene Frage ist nicht mehr „geht Funktion X", sondern **„ist die
Grundlage tragfähig"**: Stabilität und Geschwindigkeit.

## ENTSCHEIDUNG 06.10.2026 (gilt vor allem darunter)

**Verti geht zurück auf Electron. Die Chromium-Fassung ruht.** Freddy und
Claude sind sich einig („sehe ich 100 % wie du"). Gründe: Chromium heißt
Browser-Hersteller sein (Sicherheitsupdates etwa alle 4 Wochen, 33 Dateien
Patch nachziehen, 4-h-Bau, Signieren), die Grundlage ist ein Entwicklungsstand
ohne Produktionsbau, ~8 GB RAM, Windows fehlt, Spotify bräuchte die bezahlte
castLabs-Zertifizierung. Electron liefert Sicherheitsupdates mit, Spotify läuft
(EVS kostenlos), das Team arbeitet stabil damit.

Plan:
1. Electron 1.1.x ist die Hauptlinie. Chromium-Fassung ruht (Patch, Updater,
   Signierung bleiben im Repo, nichts löschen). Keine neuen 1.2.x-Releases.
2. Verti-Browser hinter einen Schalter, standardmäßig AUS (einfrieren, nicht
   löschen). Kern des Produkts ist die Leiste.
3. Backlog nach Verkaufswert ordnen: Leiste, Badges, Updates, Onboarding zuerst.
4. Danach Preis und Verkauf.

Alles unterhalb dieses Abschnitts beschreibt die Chromium-Zeit und ist
Nachschlagewerk.

## NACHTRAG 03.10.2026

- **1.2.6 veröffentlicht und bei Freddy installiert**: Spotify-Knopf öffnet die Mac-App (Patch external_protocol_handler.cc + MAC_APPS in sw.js).
- castLabs kann VMP für eigenes Chromium (3PL-Zertifizierung, kostenpflichtig, NDA nötig) - geparkt bis Verti verkauft wird (CASTLABS-ANFRAGE.md).
- siso-Zwischenspeicher repariert: Änderungsbau 1.2.6 dauerte Minuten statt Stunden.
- Offen im Backlog: rote Ungelesen-Zahl in der Leiste, sauberer Update-Ablauf. Nicht ungefragt anfangen.

## NACHTRAG 01.10.2026 abends

- **1.2.5 ist veroeffentlicht, bei Freddy installiert und gemessen**: Stackfield
  fluessiger, CPU gesamt 10 %, keine Abstuerze, RAM unveraendert ~8 GB
  (CHROMIUM-STATUS.md). Schritt 1 unten ist damit ERLEDIGT.
- Freddy will KEIN schnelles 1.2.6: „nach und nach weiterarbeiten". Der
  saubere Update-Ablauf (Bruecke zu VersionUpdater/AttemptRelaunch, Dialog
  in Verti statt Popup-Fenster) steht nur im BACKLOG, nicht anfangen ohne
  sein Wort.
- Grundlagen-Entscheidung (Produktionsbau/Release-Zweig) bleibt offen; erst
  ein paar Tage Alltag mit 1.2.5 abwarten.
- Apple wollte zwischendurch eine neue Vereinbarung (notarytool 403), Freddy
  hat zugestimmt. Supabase-Projekt war pausiert, Freddy hat auf Pro umgestellt.

## Freddys Regeln aus den letzten Sitzungen

- **Seine tägliche Arbeit läuft auf Electron und ist nicht betroffen.** Ihn
  nicht dorthin „zurückschicken" - das war ein Missverständnis am 11.09.
  Chromium ist die Testfassung, Electron bleibt bis auf Weiteres das Produkt.
- **Der Umbau ist gemacht und bleibt.** 31 geänderte Chromium-Dateien, 4.604
  Zeilen Patch (`chromium/patches/verti.patch`), Erweiterung, Updater,
  Signierung. Nichts davon ist verloren, egal was mit der Grundlage passiert.
  Nie so reden, als müsse „neu angefangen" werden.
- Erst messen, dann reden. Vermutungen als solche kennzeichnen. Zwei Mal in
  dieser Phase war die erste Vermutung falsch (Schlüsselbund, Reihenfolge der
  Ziehflächen) - beides steht in CHROMIUM-STATUS.md, damit es niemand
  nochmal verfolgt.

## 1. Die Grundlage: Abstürze und Langsamkeit (WICHTIGSTER PUNKT)

Freddy am 11.09.: Stackfield extrem träge (Klicks ohne Wirkung, Buchstaben
erscheinen verzögert, Markieren von Leuten geht nicht), regelmäßige Abstürze,
„bei Electron war das deutlich besser".

**Gemessen:**

- Alle vier Abstürze vom 09. bis 11.09. sind `DCheckLogMessage` → `abort()`:
  interne Prüfungen, die Google in Chrome gar nicht mitbaut. Unser Bau hatte
  sie an (`dcheck_always_on = true`, weil ohne `is_official_build` gebaut).
- Zwei Auslöser: (a) `indexed_db::Connection::IsHoldingLocks` - zweimal, das
  Speicherwerk von Stackfield/WhatsApp; (b) **unser Code** `ComponentLoader::
  AddVertiSidebar()` liest im Hauptthread von der Platte - zweimal.
- Im Betrieb: 7,1 GB RAM, 27 Prozesse, ein Renderer im Leerlauf bei 31 % CPU.
- Bau-Konfiguration: `is_official_build = false`, `chrome_pgo_phase = 0`,
  `use_thin_lto = false`. Quelltext ist Chromiums Entwicklungszweig vom
  01.09.2026 (155), kein Release-Zweig.

**1.2.5 ist vorbereitet (Commit dc5df54, im Patch und in args.gn):**

- `dcheck_always_on = false` - beendet diese Absturzsorte sicher. `bau.sh`
  weigert sich jetzt, ohne diese Zeile zu bauen.
- `AddVertiSidebar()` mit `base::ScopedAllowBlocking`, ComponentLoader in der
  Freundesliste (`base/threading/thread_restrictions.h`). Bewusst synchron -
  Begründung im Code.
- `package.json` 1.2.5, `chrome/VERSION` PATCH=5.

**Was 1.2.5 NICHT verspricht:** wie viel schneller Stackfield wird. Das ist
nach dem Bau zu MESSEN (Stackfield öffnen, tippen, Leute markieren; CPU/RAM
per `ps`). Die IndexedDB-Sperre ist nur stummgeschaltet, nicht behoben.

**Nächster Schritt, konkret:**

1. SSD dran, `./chromium/bau.sh` - **Vollbau, ~4 h**, weil der DCHECK-Wechsel
   fast jede Datei betrifft. Am 11.09. meldete siso „fs state is corrupted,
   unable to do incremental build" - das ist nur der Cache, kein Fehler.
   Im Hintergrund laufen lassen, Mac wach halten (bau.sh macht `caffeinate`).
2. `./scripts/mac-signieren.sh` (Mac entsperrt), dann
   `./scripts/signatur-pruefen.sh <App in der DMG>` (DMG mounten, die App
   steckt darin), dann `./scripts/crx3-paket.sh`.
3. Vorab-Release `v1.2.5` mit allen VIER Dateien (`--prerelease`).
4. **Messen**, dann erst Aussagen zur Geschwindigkeit.

**Danach entscheiden (noch offen, Freddys Entscheidung):** reicht das, oder
braucht es die „richtige" Grundlage - Produktionsbau (`is_official_build`,
PGO, ThinLTO) und/oder Umzug des Patches auf einen Chromium-Release-Zweig.
Beides ist nicht gemessen; Aufwand NICHT schätzen, sondern messen. Ein
Zweig-Umzug heißt: derselbe Patch auf anderen Stand, kein Neubau der Arbeit.

## 2. Spotify: nur mit Plattform-Signatur (ENTSCHEIDUNG OFFEN)

Seit 1.2.4 lädt der Entschlüssler (Entitlement
`disable-library-validation` im allgemeinen Helfer, Aperitif-Helfer fest aus),
ein echter Widevine-Stream läuft durch. Spotify spielt trotzdem nur Sekunden
an und hängt - es verlangt die VMP-Signatur, und die ist **bauartbedingt
nicht herstellbar** (bewiesen 11.09.: `enable_cdm_host_verification` hängt an
`is_chrome_branded`, das Signier-Skript kommt aus Googles privatem Speicher,
der Ordner ist bei uns leer). castLabs EVS kennt nur Electron-Pakete.

Vier Wege, alle außerhalb unseres Baus:

1. Widevine-Lizenz bei Google
2. castLabs fragen (Anfrage liegt als Entwurf in `CASTLABS-ANFRAGE.md`,
   Freddy schickt sie selbst)
3. Spotify-Knopf öffnet Spotifys native Mac-App - der einzige Weg ohne Dritte
4. Spotify als „geht nicht" kennzeichnen

Freddy hat noch nicht entschieden. **Nicht nochmal die Gegenprobe mit einem
normalen Chromium vorschlagen** - die bringen kein Widevine mit, der Test
wäre wertlos (steht in CHROMIUM-STATUS.md).

## 3. Was in 1.2.1 bis 1.2.4 behoben und BEWIESEN ist

Nicht nochmal prüfen, steht alles mit Messung in CHROMIUM-STATUS.md:

- Kopfzeilen-Knöpfe (Zahnrad, Verbesserung) reagieren auf echte Mausklicks
- Rechtsklick-Menü deckt Verti nicht mehr zu (Leisten-Seite ist durchsichtig)
- Update-Kette komplett: Server → Download → CRX3-Signatur → Austausch,
  einmal von selbst durchgelaufen (1.2.2 → 1.2.3)
- Update-Hinweis sieht Vorab-Fassungen (Liste statt `/releases/latest`)
- Meldungen: Verti erlaubt sie selbst für die Apps in der Leiste
- Browser-Knopf öffnet einen normalen Tab statt DNS-Fehlerseite
- Google-Anmeldung hält den Neustart (war nie ein Fehler: er war nur nie
  angemeldet gewesen)

## 4. Offen außerdem (Backlog, mit Datum)

Vermutete Lücken aus `QA-CHECKLISTE.md`, nicht in der laufenden App geprüft:
Stackfield-Badge (Favico-Haken war Electron-Code), Dock-Badge am Mac, Klick
auf Meldung → zur App, Zoom, Onboarding. Dazu: Update-Dialog zeigt
Adressleiste und bietet Download an, obwohl der Updater schon getauscht hat;
Admin-Zugang fehlt; Profilordner heißt noch `Chromium`, nicht `Verti` (vor
der echten Umstellung ändern, sonst stehen alle ohne Anmeldungen da).

Von Freddys QA-Liste noch nicht zurückgemeldet: Maus-Seitentasten, Fenster
schließen, Downloads/externe Links, Logins über längere Zeit.

## 5. Handwerk (die Fallen, die alle schon einmal zugeschlagen haben)

- **Bauplatte** `/Volumes/VertiBuild` (Sparsebundle auf „Extreme SSD").
  `bau.sh` und `mac-signieren.sh` hängen sie selbst an. Ohne SSD: nichts geht.
- **Immer `./chromium/bau.sh`**, nie `autoninja` von Hand. Nach Änderungen am
  Chromium-Quelltext **`./chromium/bau.sh --patch-neu` VOR dem Bauen**, sonst
  legt bau.sh den alten Patch über die Änderungen.
- **Nach jeder Änderung an `sidebar.html`: `node scripts/chromium-port.js`.**
  Die Erweiterung hat eine erzeugte Kopie.
- **Bei jedem Release `chrome/VERSION` PATCH erhöhen** - der Updater
  vergleicht Chromiums Nummer, nicht Vertis. Sonst „kein Update".
- **Release immer `--prerelease`**, `releases/latest` bleibt v1.1.18 (Electron).
- **Nach jedem Testlauf mit dem gebauten Binary die installierte App einmal
  öffnen** - sonst zeigt der Updater-Eintrag auf die Bauplatte.
- **Den Updater nie aus der Shell anstoßen** (`mkpath: Operation not
  permitted` - macOS' App-Verwaltung prüft den verantwortlichen Prozess).
  Über `launchctl submit` geht es, siehe CHROMIUM-STATUS.md.
- **Echte Mausklicks:** `scripts/maus-sonde.swift` (claude hat die
  Bedienungshilfen-Berechtigung). Die JS-Sonde `scripts/chromium-sonde.js`
  klickt am Fenster vorbei und beweist den Mausweg NICHT.
- **Testen ohne Freddys Profil:** `--user-data-dir=/tmp/… --use-mock-keychain
  --remote-debugging-port=…`. `--use-mock-keychain` ist Pflicht (sonst
  Passwortabfrage bei jedem Start).
- Bildschirmfotos und Notarisierung nur bei entsperrtem Mac.
- Zwei Chromium-Helfer-Fallen: Aperitif-Helfer dürfen `disable-library-
  validation` NICHT bekommen (dyld verweigert `@executable_path`, App startet
  nicht); absichtlich toter Code braucht `/* DISABLES CODE */ (false)`, sonst
  `-Werror=unreachable-code`.
